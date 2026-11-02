import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { DemoCollectionService } from "../server/demo/collection.js";
import { CompetitorSourceError, type CollectedCompetitorCreative } from "../server/demo/competitor-source.js";
import { ImageAnalysisService } from "../server/image/service.js";
import { MediaStorageError } from "../server/video/media.js";
import { VideoAnalysisService } from "../server/video/service.js";
import { VideoProviderError, type StoredVideo, type VideoAnalyserInput } from "../server/video/types.js";
import { IMAGE_PROMPT_VERSION, type StoredImageCreative } from "../shared/image-analysis.js";
import { VIDEO_PROMPT_VERSION, type VideoAnalysisAccounting } from "../shared/video-analysis.js";
import type { DemoCollectionRun } from "../shared/demo-collection.js";
import type { Brand } from "../shared/types.js";
import type { ImageAnalyserInput } from "../server/image/gemini.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const vf = (value: string | boolean) => ({ value, confidence: 0.7, timestamps: [{ startSeconds: 0, endSeconds: 1 }] });
const imf = (value: string) => ({ value, confidence: 0.7, imageIndices: [1] });
const accounting = (requestAttempts = 1): VideoAnalysisAccounting => ({ usage: { inputTokens: requestAttempts ? 100 : null, outputTokens: requestAttempts ? 20 : null, totalTokens: requestAttempts ? 120 : null }, tokenCostGbp: requestAttempts ? 0.01 : null, reservedCostGbp: 0, estimatedCostGbp: requestAttempts ? 0.01 : null, costBasis: requestAttempts ? "token_estimate" : "unavailable", pricing: null, requestAttempts, billedCostGbp: null });
interface FixtureOptions {
  count?: number;
  hosted?: boolean;
  inferenceErrors?: string[];
  videoError?: (call: number) => Error | undefined;
  imageError?: (call: number) => Error | undefined;
  downloadError?: boolean;
  sourceError?: boolean;
}
function fixture(options: FixtureOptions = {}) {
  const db = openDatabase(":memory:", false);
  const brand: Brand = { id: "valentte", name: "Valentte", domain: "valentte.com", category: "Home fragrance & gifting", color: "#0C1F96", initials: "V", voice: [], competitors: [], mode: "imported", createdAt: "2026-11-01T00:00:00Z" };
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  const videos = new Map<string, StoredVideo>(), imageSets = new Map<string, StoredImageCreative>();
  const videoInputs: VideoAnalyserInput[] = [], imageInputs: ImageAnalyserInput[] = [];
  const counts = { sourceReads: 0, refreshes: 0, downloads: 0 };
  const readiness = { hosted: options.hosted ?? true, inferenceErrors: options.inferenceErrors || [] };
  const video = new VideoAnalysisService(db, { concurrency: 1,
    mediaStore: {
      async store(input) {
        const previous = videos.get(input.adId); if (previous) return previous;
        if (options.downloadError) throw new MediaStorageError("The video link expired (HTTP 410).", 502, "media_expired", 410);
        if (!input.sourceUrl) throw new MediaStorageError("No retained source video.");
        counts.downloads++; const sha256 = hash(input.adId);
        const media: StoredVideo = { mediaId: sha256, sha256, brandId: input.brandId, sourceAdId: input.adId, absolutePath: "/tmp/fixture-unread.mp4", relativePath: "objects/fixture.mp4", bytes: 1, mimeType: "video/mp4", durationSeconds: 5, storedAt: "2026-11-02T10:00:00Z", sourceUrl: "https://fixture.fbcdn.net/video.mp4" };
        videos.set(input.adId, media); return media;
      }, async load(mediaId) { return [...videos.values()].find(item => item.mediaId === mediaId) || null; },
    },
    analyserFactory: () => ({ provider: "gemini", model: "fixture-flash", async analyse(input) {
      videoInputs.push(input); const error = options.videoError?.(videoInputs.length); if (error) throw error;
      return { model: "fixture-flash", modelVersion: "fixture-001", processingMode: input.processingMode, promptVersion: VIDEO_PROMPT_VERSION,
        coverage: { durationSeconds: 5, fullVideo: true, segments: [{ startSeconds: 0, endSeconds: 5, processing: "static", fps: 3 }] },
        fields: { hook: vf("Product opening"), format: vf("studio"), angle: vf("gifting"), keyClaims: [], spokenTranscript: [], onScreenText: [], cta: vf("Shop now"), personTalkingToCamera: vf(false), creatorEvidence: [] }, accounting: accounting() };
    } }),
  });
  const images = new ImageAnalysisService(db, {
    mediaStore: {
      async store(input) {
        if (options.downloadError) throw new MediaStorageError("The image link expired (HTTP 410).", 502, "media_expired", 410);
        counts.downloads++; const sha256 = hash(input.adId);
        const media: StoredImageCreative = { mediaId: sha256, sha256, kind: input.kind, brandId: input.brandId, adId: input.adId, storedAt: "2026-11-02T10:00:00Z", images: input.sourceUrls.map((_url, index) => ({ absolutePath: `/tmp/fixture-unread-${index}.png`, relativePath: `images/fixture-${index}.png`, mimeType: "image/png", sha256: hash(`${input.adId}:${index}`), bytes: 1 })) };
        imageSets.set(media.mediaId, media); return media;
      }, async load(mediaId) { return imageSets.get(mediaId) || null; },
    },
    analyserFactory: () => ({ model: "fixture-flash", async analyse(input) {
      imageInputs.push(input); const error = options.imageError?.(imageInputs.length); if (error) throw error;
      return { model: "fixture-flash", modelVersion: "fixture-001", promptVersion: IMAGE_PROMPT_VERSION,
        fields: { format: imf(input.media.kind === "image" ? "static" : "carousel"), hook: imf("Product headline"), headline: imf("Gift set"), angle: imf("gifting"), keyClaims: [], onScreenText: [], offer: imf("none"), cta: imf("Shop now") }, accounting: accounting() };
    } }),
  });
  const makeService = () => new DemoCollectionService(db, video, { imageService: images, readiness: () => readiness, sourceFactory: definition => ({
    async collect() {
      counts.sourceReads++; if (options.sourceError) throw new CompetitorSourceError("source_forbidden", "The public result returned HTTP 403.", 403);
      const creatives: CollectedCompetitorCreative[] = Array.from({ length: options.count ?? 3 }, (_, index) => ({ nativeId: String(123456789012345n + BigInt(index)), advertiserPageId: "111111111111111", advertiserName: definition.name,
        observedAt: "2026-11-02T10:00:00Z", sourceUrl: `https://www.facebook.com/ads/library/?id=${123456789012345n + BigInt(index)}`, title: `Source ad ${index}`, copy: "Real publisher copy", copyTruncated: false, format: index % 3 === 0 ? "Video" : index % 3 === 1 ? "Static image" : "Carousel", active: true, deliveryStartAt: "2026-11-01T10:00:00Z", publisherPlatforms: ["FACEBOOK", "INSTAGRAM"],
        creative: index % 3 === 0 ? { kind: "video", videoUrl: "https://fixture.fbcdn.net/video.mp4?signature=PRIVATE_SOURCE_MARKER" } : index % 3 === 1 ? { kind: "image", imageUrls: ["https://fixture.fbcdn.net/image.png?signature=PRIVATE_SOURCE_MARKER"] } : { kind: "carousel", imageUrls: ["https://fixture.fbcdn.net/one.png", "https://fixture.fbcdn.net/two.png"] } }));
      return { observedAt: "2026-11-02T10:00:00Z", sourceUrl: "https://www.facebook.com/ads/library/?q=verified-fixture", creatives };
    },
    async refresh() { counts.refreshes++; throw new CompetitorSourceError("source_expired", "The refreshed ad snapshot returned HTTP 410.", 410); },
    async close() {},
  }) });
  return { db, brand, video, images, readiness, counts, videoInputs, imageInputs, makeService, service: makeService(), close: () => db.close() };
}
const competitor = (service: DemoCollectionService) => service.snapshot("valentte").competitors.find(item => item.id === "neom")!;

test("read-only status never collects or analyses, and non-hosted action cannot dispatch work", async () => {
  const f = fixture({ hosted: false });
  try {
    for (let index = 0; index < 3; index++) assert.equal(competitor(f.service).collectedCount, 0);
    assert.equal(f.counts.sourceReads, 0); assert.equal(f.videoInputs.length + f.imageInputs.length, 0);
    await f.service.startAuthorizedOnce();
    await assert.rejects(f.service.start("valentte", "neom"), /deployed Render app/);
    assert.equal(f.counts.sourceReads, 0);
  } finally { f.close(); }
});

test("hosted collection imports real source rows, retains all media formats and analyses with Static default and fixed seed", async () => {
  const f = fixture();
  try {
    await f.service.start("valentte", "neom"); await f.service.idle();
    const result = competitor(f.service);
    assert.equal(result.status, "complete"); assert.equal(result.collectedCount, 3); assert.equal(result.storedCount, 3); assert.equal(result.analysedCount, 3);
    assert.deepEqual(result.lastRun!.items.map(item => item.mediaKind), ["video", "image", "carousel"]);
    assert.ok(result.lastRun!.items.every(item => item.status === "complete"));
    assert.equal(f.videoInputs[0].processingMode, "static-high-fps-hook");
    assert.equal(f.videoInputs[0].inferenceSettings?.generationSeed, 42);
    assert.ok(f.imageInputs.every(input => input.inferenceSettings?.generationSeed === 42));
    assert.deepEqual(f.imageInputs.map(input => input.media.images.length), [1, 2]);
    const savedAds = f.db.prepare("SELECT data FROM ads WHERE brand_id=?").all(result.brandId!) as { data: string }[];
    for (const saved of savedAds) {
      const ad = JSON.parse(saved.data); assert.equal(ad.source, "public"); assert.equal(ad.metricsAvailable, false); assert.equal(ad.spend, null); assert.match(ad.sourceUrl, /^https:\/\/www\.facebook\.com\/ads\/library\/\?id=\d+$/);
    }
    assert.ok(!JSON.stringify(result.lastRun).includes("PRIVATE_SOURCE_MARKER"));
  } finally { f.close(); }
});

test("one startup authorization is durable across redeploys and aliases, and caps each competitor at 25 source ads", async () => {
  const f = fixture({ count: 35 });
  try {
    const alias = { ...f.brand, id: "legacy-valentte" }; f.db.prepare("INSERT INTO brands VALUES (?,?)").run(alias.id, JSON.stringify(alias));
    await f.service.startAuthorizedOnce("legacy-valentte"); await f.service.idle();
    const first = f.service.snapshot("valentte");
    assert.ok(first.competitors.every(item => item.collectedCount === 25 && item.analysedCount === 25));
    assert.equal(f.counts.sourceReads, 3);
    const before = f.videoInputs.length + f.imageInputs.length;
    const redeployed = f.makeService(); await redeployed.startAuthorizedOnce(); await redeployed.start("legacy-valentte"); await redeployed.idle();
    assert.equal(f.counts.sourceReads, 3); assert.equal(f.videoInputs.length + f.imageInputs.length, before);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM demo_competitor_runs").get()!.count, 3);
  } finally { f.close(); }
});

test("missing inference configuration still retains source ads/media and resume requires an explicit action", async () => {
  const f = fixture({ inferenceErrors: ["Configure inference budget first."] });
  try {
    await f.service.start("valentte", "neom"); await f.service.idle();
    const paused = competitor(f.service); assert.equal(paused.status, "paused"); assert.equal(paused.storedCount, 3); assert.equal(paused.analysedCount, 0);
    assert.equal(f.videoInputs.length + f.imageInputs.length, 0);
    f.readiness.inferenceErrors = []; const redeployed = f.makeService(); await redeployed.startAuthorizedOnce(); await redeployed.idle();
    assert.equal(competitor(redeployed).analysedCount, 0, "redeploy does not grant a new attempt");
    await redeployed.start("valentte", "neom"); await redeployed.idle();
    assert.equal(competitor(redeployed).analysedCount, 3); assert.equal(f.counts.sourceReads, 3, "only other never-started competitors were collected on startup");
    assert.equal(competitor(redeployed).lastRun!.id, paused.lastRun!.id);
  } finally { f.close(); }
});

test("a zero-dispatch budget pause can resume safely while paid/uncertain failures remain explicit and are never replayed", async () => {
  let blocked = true;
  const f = fixture({ videoError: () => blocked ? new VideoProviderError("budget_paused", "Inference cap reached.", accounting(0)) : undefined,
    imageError: call => call === 1 ? new VideoProviderError("unavailable", "Gemini request timed out.", { ...accounting(), reservedCostGbp: 0.05 }) : undefined });
  try {
    await f.service.start("valentte", "neom"); await f.service.idle();
    const paused = competitor(f.service); assert.equal(paused.status, "paused"); assert.equal(paused.lastRun!.items[0].status, "stored");
    blocked = false; await f.service.start("valentte", "neom"); await f.service.idle();
    const complete = competitor(f.service); assert.equal(complete.analysedCount, 2); assert.equal(complete.lastRun!.items[1].status, "failed");
    assert.equal(complete.lastRun!.items[1].error, "Gemini request timed out."); assert.equal(f.imageInputs.length, 2);
    await f.service.start("valentte", "neom"); await f.service.idle(); assert.equal(f.imageInputs.length, 2);
  } finally { f.close(); }
});

test("restart recovery preserves completed results and never silently repeats a claimed image or video attempt", async () => {
  const f = fixture({ inferenceErrors: ["Budget configuration pending."] });
  try {
    await f.service.start("valentte", "neom"); await f.service.idle();
    const run = competitor(f.service).lastRun!;
    run.status = "analysing"; run.items[0].status = "analysing"; run.items[0].jobId = "uncertain-video";
    run.items[1].status = "analysing"; run.items[1].jobId = "uncertain-image";
    f.db.prepare("UPDATE demo_competitor_runs SET status=?,data=? WHERE id=?").run(run.status, JSON.stringify(run), run.id);
    const recovered = f.makeService(); assert.equal(competitor(recovered).status, "interrupted");
    f.readiness.inferenceErrors = []; await recovered.start("valentte", "neom"); await recovered.idle();
    const saved = competitor(recovered).lastRun!;
    assert.deepEqual(saved.items.map(item => item.status), ["interrupted", "interrupted", "complete"]);
    assert.equal(f.videoInputs.length, 0); assert.equal(f.imageInputs.length, 1); assert.equal(f.counts.sourceReads, 1);
    assert.ok(saved.items[0].error?.includes("not replayed automatically"));
  } finally { f.close(); }
});

test("source/download errors retain specific public failure reasons without inventing data or dispatching inference", async () => {
  const f = fixture({ downloadError: true });
  try {
    await f.service.start("valentte", "neom"); await f.service.idle();
    const saved = competitor(f.service); assert.equal(saved.collectedCount, 3); assert.equal(saved.storedCount, 0); assert.equal(saved.analysedCount, 0);
    assert.equal(f.counts.refreshes, 3);
    assert.ok(saved.lastRun!.items.every(item => item.status === "unavailable" && item.errorCode === "source_expired" && item.sourceHttpStatus === 410));
    assert.equal(f.videoInputs.length + f.imageInputs.length, 0);
    const bad = fixture({ sourceError: true });
    try {
      await bad.service.start("valentte", "neom"); await bad.service.idle();
      assert.equal(competitor(bad.service).status, "failed"); assert.equal(competitor(bad.service).collectedCount, 0);
      assert.match(competitor(bad.service).lastRun!.message!, /HTTP 403/);
    } finally { bad.close(); }
  } finally { f.close(); }
});
