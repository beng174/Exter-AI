import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import source from "../shared/cases/valentte-ads.json";
import caseData from "../shared/cases/valentte.json";
import type { Ad, Brand } from "../shared/types.js";
import type { SmokeRun } from "../shared/gemini-smoke.js";
import { VIDEO_PROMPT_VERSION, type VideoAnalysisAccounting, type VideoAnalysisFields } from "../shared/video-analysis.js";
import { IMAGE_PROMPT_VERSION, type ImageAnalysisFields, type StoredImageCreative } from "../shared/image-analysis.js";
import { CREATIVE_BOOLEAN_TAGS, type CreativeBooleanTag } from "../shared/creative-taxonomy.js";
import type { InferenceSettings } from "../shared/inference-config.js";
import { openDatabase } from "../server/db.js";
import { VideoAnalysisService } from "../server/video/service.js";
import { VideoProviderError, type StoredVideo, type VideoAnalyserInput } from "../server/video/types.js";
import { ImageAnalysisService } from "../server/image/service.js";
import type { ImageAnalyserInput } from "../server/image/gemini.js";
import { attachGeminiSmoke } from "../server/smoke/api.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const v = <T extends string | boolean>(value: T) => ({ value, confidence: 0.15, timestamps: [{ startSeconds: 0, endSeconds: 2 }] });
const i = <T extends string | boolean>(value: T) => ({ value, confidence: 0.15, imageIndices: [1] });
const account = (): VideoAnalysisAccounting => ({
  usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 }, tokenCostGbp: 0.00014,
  reservedCostGbp: 0, estimatedCostGbp: 0.00014, initialReservedCostGbp: 0.1, billedCostGbp: null,
  costBasis: "token_estimate", pricing: { inputGbpPerMillion: 1, outputGbpPerMillion: 2, model: "served-flash-001", source: "fixture served model price" },
  requestAttempts: 1, rejectedAttempts: 0, retryAttempts: 0,
});
const generation = (settings: InferenceSettings) => ({ temperature: 0 as const, seedRequested: settings.generationSeed, seedApplied: true,
  mediaResolutionRequested: settings.mediaResolution, mediaResolutionApplied: settings.mediaResolution === "low", providerMediaResolution: null });
function videoFields(): VideoAnalysisFields {
  return { hook: v("A gift for the home"), hook_type: v("offer-led"), format: v("studio"), angle: v("gifting"),
    angle_explanation: v("Presented as a gift"), offer_type: v("bundle"), offer_explanation: v("Three products together"),
    tags: Object.fromEntries(CREATIVE_BOOLEAN_TAGS.map(tag => [tag, v(false)])) as Record<CreativeBooleanTag, ReturnType<typeof v<boolean>>>,
    keyClaims: [], spokenTranscript: [], onScreenText: [], cta: v("Shop now"), personTalkingToCamera: v(false), creatorEvidence: [],
    audio_type: v("music-only"), music_lyrics_present: v(false), has_licensed_music_lyrics: v("unknown"), audio_segments: [] };
}
function imageFields(): ImageAnalysisFields {
  return { format: i("static"), hook: i("Gift set"), hook_type: i("offer-led"), headline: i("Gift set"), angle: i("gifting"),
    angle_explanation: i("Presented as a gift"), offer_type: i("bundle"), offer: i("Three products together"),
    tags: Object.fromEntries(CREATIVE_BOOLEAN_TAGS.map(tag => [tag, i(false)])) as Record<CreativeBooleanTag, ReturnType<typeof i<boolean>>>,
    keyClaims: [], onScreenText: [], cta: i("Shop now") };
}

async function fixture() {
  const db = openDatabase(":memory:", false);
  const brand = caseData.brand as Brand;
  const ads = source.ads as Ad[];
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  const insert = db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)");
  for (const ad of ads) insert.run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
  const videoInputs: VideoAnalyserInput[] = [], imageInputs: ImageAnalyserInput[] = [];
  const videos = new Map<string, StoredVideo>(), images = new Map<string, StoredImageCreative>();
  let paused = false;
  const video = new VideoAnalysisService(db, {
    concurrency: 1,
    mediaStore: {
      async store(input) {
        const existing = videos.get(input.adId); if (existing) return existing;
        const sha256 = hash(input.adId);
        const media: StoredVideo = { mediaId: sha256, sha256, brandId: input.brandId, sourceAdId: input.adId,
          absolutePath: "/tmp/smoke-settings-video-not-read.mp4", relativePath: "video.mp4", mimeType: "video/mp4", bytes: 1,
          durationSeconds: 8, storedAt: "2026-11-02T12:00:00Z", sourceUrl: "https://fixture.fbcdn.net/video.mp4" };
        videos.set(input.adId, media); return media;
      }, async load(id) { return [...videos.values()].find(media => media.mediaId === id) || null; },
    },
    analyserFactory: () => ({ provider: "gemini", model: "requested-flash", async analyse(input) {
      videoInputs.push(input);
      if (paused) throw new VideoProviderError("budget_paused", "No reservation available.", { ...account(), requestAttempts: 0,
        usage: { inputTokens: null, outputTokens: null, totalTokens: null }, tokenCostGbp: null, reservedCostGbp: null,
        initialReservedCostGbp: null, estimatedCostGbp: null, costBasis: "unavailable" });
      const settings = input.inferenceSettings!;
      return { model: "served-flash-001", requestedModel: "requested-flash", servedModel: "served-flash-001", modelVersion: "served-flash-001",
        processingMode: input.processingMode, promptVersion: VIDEO_PROMPT_VERSION, fields: videoFields(), accounting: account(), inferenceSettings: settings,
        generation: generation(settings), sampling: { requestedFps: [3], estimatedFrames: 24, actualFrames: null, videoInputTokens: null },
        coverage: { durationSeconds: 8, fullVideo: true, segments: [{ startSeconds: 0, endSeconds: 8, processing: "static" as const, fps: 3 }] } };
    } }),
  });
  const imageService = new ImageAnalysisService(db, {
    mediaStore: {
      async store(input) {
        const sha256 = hash(`image:${input.adId}`);
        const media: StoredImageCreative = { mediaId: sha256, sha256, brandId: input.brandId, adId: input.adId, kind: input.kind,
          storedAt: "2026-11-02T12:00:00Z", images: input.sourceUrls.map((_url, index) => ({ absolutePath: "/tmp/smoke-settings-image-not-read.png",
            relativePath: "image.png", mimeType: "image/png", bytes: 1, sha256: hash(`${input.adId}:${index}`) })) };
        images.set(sha256, media); return media;
      }, async load(id) { return images.get(id) || null; },
    },
    analyserFactory: () => ({ model: "requested-flash", async analyse(input) {
      imageInputs.push(input); const settings = input.inferenceSettings!;
      return { model: "served-flash-001", requestedModel: "requested-flash", servedModel: "served-flash-001", modelVersion: "served-flash-001",
        promptVersion: IMAGE_PROMPT_VERSION, fields: imageFields(), accounting: account(), inferenceSettings: settings, generation: generation(settings) };
    } }),
  });
  const selectedVideos = ads.filter(ad => ad.format === "Video").slice(0, 8);
  const selectedImages = ads.filter(ad => ad.format !== "Video").slice(0, 2);
  for (const ad of selectedVideos) await video.storeMedia(brand.id, ad.id, "https://fixture.fbcdn.net/video.mp4");
  for (const [index, ad] of selectedImages.entries()) await imageService.storeMedia(brand.id, ad.id,
    index ? ["https://fixture.fbcdn.net/one.png", "https://fixture.fbcdn.net/two.png"] : ["https://fixture.fbcdn.net/one.png"], index ? "carousel" : "image");
  const app = express(); app.use(express.json());
  const runner = attachGeminiSmoke(app, db, video, { concurrency: 1, imageService, readiness: async () => ({ hosted: true, errors: [] }) });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { db, brand, selectedVideos, selectedImages, videoInputs, imageInputs, runner, post, pause: (value: boolean) => { paused = value; },
    async close() { await runner.idle(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); db.close(); } };
}

test("one-ad and mixed batch preserve selected resolution and seed through video and native image dispatch", async () => {
  const f = await fixture();
  try {
    const one = await f.post("/api/gemini-smoke/test-one", { brandId: f.brand.id, adId: f.selectedVideos[0].id, mediaResolution: "low" });
    assert.equal(one.status, 202); const queued = await one.json() as SmokeRun; await f.runner.idle();
    assert.equal(f.runner.run(queued.id)!.mediaResolution, "low"); assert.equal(f.runner.run(queued.id)!.generationSeed, 42);
    assert.equal(f.videoInputs[0].inferenceSettings?.mediaResolution, "low"); assert.equal(f.videoInputs[0].inferenceSettings?.generationSeed, 42);
    const oneImage = await f.post("/api/gemini-smoke/test-one", { brandId: f.brand.id, adId: f.selectedImages[0].id, mediaResolution: "low" });
    assert.equal(oneImage.status, 202); await f.runner.idle();
    assert.equal(f.imageInputs[0].inferenceSettings?.mediaResolution, "low"); assert.equal(f.imageInputs[0].inferenceSettings?.generationSeed, 42);
    const batch = await f.runner.start("smoke", "static-high-fps-hook", { mediaResolution: "low", generationSeed: 73 }); await f.runner.idle();
    const saved = f.runner.run(batch.id)!;
    assert.equal(saved.status, "complete"); assert.equal(saved.mediaResolution, "low"); assert.equal(saved.generationSeed, 73);
    assert.deepEqual(saved.sampleCounts, { video: 8, image: 1, carousel: 1 });
    assert.equal(f.videoInputs.length, 9); assert.equal(f.imageInputs.length, 3);
    assert.ok(f.videoInputs.slice(1).every(input => input.inferenceSettings?.mediaResolution === "low" && input.inferenceSettings.generationSeed === 73));
    assert.ok(f.imageInputs.slice(1).every(input => input.inferenceSettings?.mediaResolution === "low" && input.inferenceSettings.generationSeed === 73));
    const stored = JSON.parse((f.db.prepare("SELECT data FROM gemini_smoke_runs WHERE id=?").get(batch.id) as { data: string }).data) as SmokeRun;
    assert.equal(stored.generationSeed, 73); assert.equal(stored.mediaResolution, "low");
    const report = f.runner.report(batch.id);
    assert.match(report, /requested-flash/); assert.match(report, /served-flash-001/);
    assert.match(report, /requested-flash \| served-flash-001 \| served-flash-001 \| 0; 73 \(applied\)/);
    assert.match(report, /24 \(estimated\) \| not reported/);
    assert.match(report, /priced model|pricing model/i); assert.match(report, /estimated.*frames|frames.*estimated/i);
    assert.match(report, /actual.*frames.*unavailable|actual.*frames.*unknown|actual.*frames.*not reported/i);
    assert.match(report, /uncalibrated/i); assert.match(report, /not.*filter|filter.*disabled/i);
  } finally { await f.close(); }
});

test("invalid resolution and Low Agentic combinations fail before any paid dispatch", async () => {
  const f = await fixture();
  try {
    for (const path of ["/api/gemini-smoke/test-one", "/api/gemini-smoke/runs"]) {
      const selected = { brandId: f.brand.id, adId: f.selectedVideos[0].id };
      assert.equal((await f.post(path, { ...selected, mediaResolution: "ultra" })).status, 400);
      assert.equal((await f.post(path, { ...selected, processingMode: "agentic", mediaResolution: "low" })).status, 400);
    }
    assert.equal(f.videoInputs.length, 0); assert.equal(f.imageInputs.length, 0); assert.equal(f.runner.latest(), null);
  } finally { await f.close(); }
});

test("resume rejects a changed mode or resolution and retains the saved seed for pending inference", async () => {
  const f = await fixture();
  try {
    f.pause(true);
    const run = await f.runner.testOne(f.brand.id, f.selectedVideos[0].id, "static-high-fps-hook", { mediaResolution: "low", generationSeed: 73 }); await f.runner.idle();
    assert.equal(f.runner.run(run.id)!.status, "paused"); assert.equal(f.videoInputs.length, 1);
    const path = `/api/gemini-smoke/runs/${run.id}/resume`;
    assert.equal((await f.post(path, { mediaResolution: "default" })).status, 409);
    assert.equal((await f.post(path, { mediaResolution: "low", processingMode: "agentic" })).status, 400);
    assert.equal((await f.post(path, { mediaResolution: "ultra" })).status, 400);
    assert.equal(f.videoInputs.length, 1); assert.equal(f.runner.run(run.id)!.generationSeed, 73);
    f.pause(false);
    assert.equal((await f.post(path, { mediaResolution: "low" })).status, 202); await f.runner.idle();
    assert.equal(f.runner.run(run.id)!.status, "complete"); assert.equal(f.videoInputs.length, 2);
    assert.ok(f.videoInputs.every(input => input.inferenceSettings?.generationSeed === 73 && input.inferenceSettings.mediaResolution === "low"));
  } finally { await f.close(); }
});
