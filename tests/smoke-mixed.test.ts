import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import source from "../shared/cases/valentte-ads.json";
import caseData from "../shared/cases/valentte.json";
import type { Ad, Brand } from "../shared/types.js";
import type { SmokeRun } from "../shared/gemini-smoke.js";
import { IMAGE_PROMPT_VERSION, type ImageAnalysisFields, type StoredImageCreative } from "../shared/image-analysis.js";
import { VIDEO_PROMPT_VERSION, type VideoAnalysisAccounting } from "../shared/video-analysis.js";
import { openDatabase } from "../server/db.js";
import { VideoAnalysisService } from "../server/video/service.js";
import { MediaStorageError } from "../server/video/media.js";
import { VideoProviderError, type StoredVideo, type VideoAnalyserInput } from "../server/video/types.js";
import { ImageAnalysisService } from "../server/image/service.js";
import type { ImageAnalyserInput } from "../server/image/gemini.js";
import { GeminiSmokeService, SmokeRequestError } from "../server/smoke/service.js";
import { SmokeSourceError, type SmokeCreative, type SmokeSourceResolveOptions } from "../server/smoke/source.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const videoField = (value: string | boolean) => ({ value, confidence: 0.95, timestamps: [{ startSeconds: 0, endSeconds: 2 }] });
const imageField = (value: string) => ({ value, confidence: 0.95, imageIndices: [1] });
function accounted(attempts = 1, reserved = false): VideoAnalysisAccounting {
  return {
    usage: { inputTokens: attempts ? 100 : null, outputTokens: attempts ? 20 : null, totalTokens: attempts ? 120 : null },
    tokenCostGbp: reserved || !attempts ? null : 0.02,
    reservedCostGbp: reserved ? 0.05 : 0,
    estimatedCostGbp: !attempts ? null : reserved ? 0.05 : 0.02,
    costBasis: !attempts ? "unavailable" : reserved ? "reservation_estimate" : "token_estimate",
    pricing: { inputGbpPerMillion: 1, outputGbpPerMillion: 2 }, requestAttempts: attempts,
    rawResponse: { fixture: "Saved native creative output" },
  };
}
function imageFields(kind: "image" | "carousel"): ImageAnalysisFields {
  return {
    format: imageField(kind === "image" ? "static" : "carousel"), hook: imageField("Fragrance gifting"),
    headline: imageField("A gift for the home"), angle: imageField("Gifting"),
    keyClaims: [imageField("Publisher says long lasting")], onScreenText: [imageField("Gift set")],
    offer: imageField("Bundle"), cta: imageField("Shop now"),
  };
}
interface FixtureOptions {
  resolve?: (nativeId: string, options: SmokeSourceResolveOptions) => Promise<SmokeCreative>;
  imageAnalyse?: (input: ImageAnalyserInput, call: number) => Promise<void>;
  videoDownload?: (sourceUrl: string, adId: string) => Promise<void>;
}
function fixture(options: FixtureOptions = {}) {
  const db = openDatabase(":memory:", false);
  const brand = caseData.brand as Brand;
  const ads = source.ads as Ad[];
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  const insert = db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)");
  for (const ad of ads) insert.run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
  const videos = new Map<string, StoredVideo>();
  const imageSets = new Map<string, StoredImageCreative>();
  const sourceReads: { nativeId: string; refresh: boolean }[] = [];
  const videoInputs: VideoAnalyserInput[] = [];
  const imageInputs: ImageAnalyserInput[] = [];
  let videoDownloads = 0, imageDownloads = 0;
  const video = new VideoAnalysisService(db, {
    concurrency: 1,
    mediaStore: {
      async store(input) {
        const previous = videos.get(input.adId);
        if (previous) return previous;
        if (!input.sourceUrl) throw new MediaStorageError("No verified local video is stored.");
        await options.videoDownload?.(input.sourceUrl, input.adId);
        videoDownloads++;
        const sha256 = hash(input.adId);
        const saved: StoredVideo = { mediaId: sha256, sha256, brandId: input.brandId, sourceAdId: input.adId,
          absolutePath: "/tmp/fixture-video-not-read.mp4", relativePath: "objects/fixture.mp4", bytes: 1,
          mimeType: "video/mp4", durationSeconds: 5, storedAt: "2026-11-01T12:00:00Z", sourceUrl: "https://fixture.fbcdn.net/video.mp4" };
        videos.set(input.adId, saved); return saved;
      },
      async load(mediaId) { return [...videos.values()].find(media => media.mediaId === mediaId) || null; },
    },
    analyserFactory: () => ({ provider: "gemini", model: "fixture-flash", async analyse(input) {
      videoInputs.push(input);
      return {
        model: "fixture-flash", modelVersion: "fixture-1", processingMode: input.processingMode,
        promptVersion: VIDEO_PROMPT_VERSION, coverage: { durationSeconds: 5, fullVideo: true,
          segments: [{ startSeconds: 0, endSeconds: 5, processing: input.processingMode === "agentic" ? "agentic" as const : "static" as const,
            ...(input.processingMode === "agentic" ? {} : { fps: 3 }) }] },
        fields: { hook: videoField("Product opening"), format: videoField("studio"), angle: videoField("Gifting"),
          keyClaims: [], spokenTranscript: [], onScreenText: [], cta: videoField("Shop now"),
          personTalkingToCamera: videoField(false), creatorEvidence: [] }, accounting: accounted(),
      };
    } }),
  });
  const images = new ImageAnalysisService(db, {
    mediaStore: {
      async store(input) {
        imageDownloads++;
        const sha256 = hash(JSON.stringify([input.adId, input.kind, input.sourceUrls.length]));
        const saved: StoredImageCreative = { mediaId: sha256, sha256, kind: input.kind, brandId: input.brandId,
          adId: input.adId, storedAt: "2026-11-01T12:00:00Z", images: input.sourceUrls.map((_url, index) => ({
            absolutePath: `/tmp/fixture-image-${index}-not-read.png`, relativePath: `images/fixture-${index}.png`,
            mimeType: "image/png", sha256: hash(`${input.adId}:${index}`), bytes: 1,
          })) };
        imageSets.set(saved.mediaId, saved); return saved;
      },
      async load(mediaId) { return imageSets.get(mediaId) || null; },
    },
    analyserFactory: () => ({ model: "fixture-flash", async analyse(input) {
      imageInputs.push(input); await options.imageAnalyse?.(input, imageInputs.length);
      return { model: "fixture-flash", modelVersion: "fixture-1", promptVersion: IMAGE_PROMPT_VERSION,
        fields: imageFields(input.media.kind), accounting: accounted() };
    } }),
  });
  const runner = new GeminiSmokeService(db, video, {
    concurrency: 1, imageService: images, readiness: async () => ({ hosted: true, errors: [] }),
    sourceFactory: () => ({
      async resolveCreative(nativeId, resolveOptions = {}) {
        sourceReads.push({ nativeId, refresh: resolveOptions.refresh === true });
        return options.resolve ? options.resolve(nativeId, resolveOptions) : { kind: "unknown", reason: "No public creative URL is exposed." };
      },
      async resolve() { throw new Error("Native creative dispatch must use the descriptor, not the video-only projection."); },
      async close() {},
    }),
  });
  async function seedVideos(count: number) {
    const selected = [...ads.filter(ad => ad.format === "Video"), ...ads.filter(ad => ad.format === "Dynamic creative")].slice(0, count);
    for (const ad of selected) await video.storeMedia(brand.id, ad.id, "https://fixture.fbcdn.net/video.mp4?signature=PRIVATE_SOURCE_MARKER");
    return selected;
  }
  async function seedImages(count: number, excluded: Set<string> = new Set(), carousel = false) {
    const selected = ads.filter(ad => ad.format !== "Video" && !excluded.has(ad.id)).slice(0, count);
    for (const ad of selected) await images.storeMedia(brand.id, ad.id,
      carousel ? ["https://fixture.fbcdn.net/one.png", "https://fixture.fbcdn.net/two.png"] : ["https://fixture.fbcdn.net/one.png"], carousel ? "carousel" : "image");
    return selected;
  }
  return { db, ads, brand, video, images, runner, sourceReads, videoInputs, imageInputs, seedVideos, seedImages,
    counts: () => ({ videoDownloads, imageDownloads }), close: () => db.close() };
}

test("a retained mixed sample preserves 12 legacy videos and dispatches images/carousels through native inputs with the selected Static video mode", async () => {
  const f = fixture();
  try {
    const videos = await f.seedVideos(12);
    const stills = await f.seedImages(2, new Set(videos.map(ad => ad.id)));
    await f.seedImages(1, new Set([...videos, ...stills].map(ad => ad.id)), true);
    const legacy: SmokeRun = { id: "old-failed-preparation", kind: "prepare", status: "failed", requestedMode: "agentic",
      createdAt: "2026-10-31T12:00:00Z", updatedAt: "2026-10-31T13:00:00Z", message: "Retained 12 of 25; public media unavailable.", items: [] };
    const oldData = JSON.stringify(legacy);
    f.db.prepare("INSERT INTO gemini_smoke_runs VALUES (?,?,?,?)").run(legacy.id, legacy.status, legacy.createdAt, oldData);
    const before = f.counts();
    const status = await f.runner.status();
    assert.equal(status.storedCount, 15); assert.deepEqual(status.storedCounts, { video: 12, image: 2, carousel: 1 });
    const run = await f.runner.start("smoke", "static-high-fps-hook"); await f.runner.idle();
    const saved = f.runner.run(run.id)!;
    assert.equal(saved.status, "complete"); assert.equal(saved.sampleSize, 15);
    assert.deepEqual(saved.sampleCounts, { video: 12, image: 2, carousel: 1 });
    assert.equal(saved.items.filter(item => item.status === "complete").length, 15);
    assert.equal(f.videoInputs.length, 12); assert.ok(f.videoInputs.every(input => input.processingMode === "static-high-fps-hook"));
    assert.equal(f.imageInputs.length, 3); assert.deepEqual(f.imageInputs.map(input => input.media.images.length).sort(), [1, 1, 2]);
    assert.equal(saved.items.find(item => item.mediaKind === "image")?.processingMode, "image");
    assert.equal(saved.items.find(item => item.mediaKind === "carousel")?.processingMode, "carousel");
    assert.deepEqual(f.counts(), before); assert.equal(f.sourceReads.length, 0, "a live action must not refetch retained source media");
    const report = f.runner.report(run.id);
    assert.match(report, /Actual sample size: 15 ads/); assert.match(report, /12 videos, 2 static images, 1 carousels/);
    assert.match(report, /Successful outputs: 15\/15/); assert.match(report, /exploratory partial or mixed-media sample/);
    assert.match(report, /Original Phase 1 video success acceptance: not established/);
    assert.match(report, /static-high-fps-hook/); assert.match(report, /\(image\)/); assert.match(report, /\(carousel\)/);
    assert.ok(!JSON.stringify(saved).includes("PRIVATE_SOURCE_MARKER"));
    assert.equal((f.db.prepare("SELECT data FROM gemini_smoke_runs WHERE id=?").get(legacy.id) as { data: string }).data, oldData);
  } finally { f.close(); }
});

test("fewer than ten verified retained inputs cannot start paid inference or trigger source downloads", async () => {
  const f = fixture();
  try {
    await f.seedVideos(9); const before = f.counts();
    await assert.rejects(() => f.runner.start("smoke", "static-high-fps-hook"), error => error instanceof SmokeRequestError && /Only 9 verified/.test(error.message));
    await f.runner.idle();
    assert.equal(f.runner.latest(), null); assert.equal(f.videoInputs.length, 0); assert.equal(f.imageInputs.length, 0);
    assert.equal(f.sourceReads.length, 0); assert.deepEqual(f.counts(), before);
  } finally { f.close(); }
});

test("exactly ten retained videos form a runnable exploratory sample with a ten-ad report denominator", async () => {
  const f = fixture();
  try {
    await f.seedVideos(10);
    const run = await f.runner.start("smoke", "static-high-fps-hook"); await f.runner.idle();
    const saved = f.runner.run(run.id)!;
    assert.equal(saved.sampleSize, 10); assert.equal(saved.items.filter(item => item.status === "complete").length, 10);
    assert.equal(f.videoInputs.length, 10); assert.equal(f.sourceReads.length, 0);
    assert.match(f.runner.report(run.id), /Successful outputs: 10\/10/);
    assert.match(f.runner.report(run.id), /Original Phase 1 video success acceptance: not established/);
  } finally { f.close(); }
});

test("preparation continues across all candidates after restricted sources and keeps precise per-ad reasons while accepting images and carousels", async () => {
  const roles = new Map<string, number>();
  const f = fixture({ resolve: async nativeId => {
    if (!roles.has(nativeId)) roles.set(nativeId, roles.size);
    const role = roles.get(nativeId)!;
    if (role === 0) throw new SmokeSourceError("source_restricted", "Meta requires a login or access challenge.");
    if (role === 1) throw new SmokeSourceError("source_forbidden", "Meta refused access (HTTP 403).", 403);
    if (role === 2) throw new SmokeSourceError("source_timeout", "Reading the ad snapshot timed out.");
    if (role === 3) throw new MediaStorageError("The supplied media link has an explicitly expired signature.", 502, "media_expired");
    if (role === 4) return { kind: "image", imageUrls: ["https://fixture.fbcdn.net/image.png?signature=PRIVATE_SOURCE_MARKER"] };
    if (role === 5) return { kind: "carousel", imageUrls: ["https://fixture.fbcdn.net/one.png", "https://fixture.fbcdn.net/two.png"] };
    if (role < 16) return { kind: "video", videoUrl: "https://fixture.fbcdn.net/video.mp4?signature=PRIVATE_SOURCE_MARKER" };
    return { kind: "unknown", reason: "No verified creative URL was exposed for this ad." };
  } });
  try {
    const prep = await f.runner.start("prepare", "static-high-fps-hook"); await f.runner.idle();
    const saved = f.runner.run(prep.id)!;
    assert.equal(saved.items.length, 58); assert.equal(new Set(f.sourceReads.map(read => read.nativeId)).size, 58);
    assert.ok(saved.items.every(item => item.status !== "pending" && item.status !== "preparing"));
    assert.equal(saved.sampleSize, 12); assert.equal(saved.status, "complete"); assert.equal(saved.requestedMode, "static-high-fps-hook");
    assert.deepEqual(saved.sampleCounts, { video: 10, image: 1, carousel: 1 });
    const byRole = (role: number) => saved.items.find(item => roles.get(item.nativeId) === role)!;
    assert.equal(byRole(0).failureCategory, "blocked_restricted"); assert.equal(byRole(1).sourceHttpStatus, 403);
    assert.match(byRole(1).error!, /403/); assert.equal(byRole(1).failureCategory, "blocked_restricted");
    assert.equal(byRole(2).errorCode, "source_timeout"); assert.equal(byRole(2).failureCategory, "other");
    assert.match(byRole(3).failureCategory!, /^expired_/);
    assert.equal(byRole(4).status, "stored"); assert.equal(byRole(5).status, "stored");
    assert.ok(byRole(0).preparationAttempts!.length >= 1); assert.ok(!JSON.stringify(saved).includes("PRIVATE_SOURCE_MARKER"));
    assert.equal(f.videoInputs.length, 0); assert.equal(f.imageInputs.length, 0);
    assert.match(f.runner.report(prep.id), /Source preparation attempts/);
  } finally { f.close(); }
});

test("refreshing unavailable links reopens snapshots, keeps the twelve retained videos and preserves previous failure history", async () => {
  const supplied = new Map<string, number>();
  const f = fixture({ resolve: async (nativeId, options) => {
    assert.equal(options.refresh, true, "the refresh action must bypass cached or already-checked source links");
    if (!supplied.has(nativeId)) supplied.set(nativeId, supplied.size);
    if (supplied.get(nativeId)! < 2) return { kind: "image", imageUrls: ["https://fixture.fbcdn.net/fresh.png?signature=PRIVATE_REFRESH_MARKER"] };
    return { kind: "unknown", reason: "This snapshot did not expose current creative media." };
  } });
  try {
    const retained = await f.seedVideos(12); const retainedIds = new Set(retained.map(ad => ad.id));
    const legacy: SmokeRun = { id: "previous-twelve-video-prep", kind: "prepare", status: "failed", requestedMode: "agentic",
      createdAt: "2026-10-31T12:00:00Z", updatedAt: "2026-10-31T13:00:00Z",
      items: f.ads.map(ad => ({ adId: ad.id, brandId: ad.brandId, nativeId: ad.providerAdId!, status: retainedIds.has(ad.id) ? "stored" : "failed",
        ...(!retainedIds.has(ad.id) ? { errorCode: "media_forbidden", error: "The video host refused the download (HTTP 403).", sourceHttpStatus: 403 } : {}) })) };
    const previousData = JSON.stringify(legacy);
    f.db.prepare("INSERT INTO gemini_smoke_runs VALUES (?,?,?,?)").run(legacy.id, legacy.status, legacy.createdAt, previousData);
    const before = f.counts();
    const refresh = await f.runner.start("prepare", "static-high-fps-hook", { refreshFailed: true }); await f.runner.idle();
    const saved = f.runner.run(refresh.id)!;
    assert.equal(saved.sampleSize, 14); assert.deepEqual(saved.sampleCounts, { video: 12, image: 2, carousel: 0 });
    assert.equal(f.counts().videoDownloads, before.videoDownloads); assert.equal(new Set(f.sourceReads.map(read => read.nativeId)).size, 46);
    const refreshedImage = saved.items.find(item => item.mediaKind === "image" && item.status === "stored")!;
    assert.ok(refreshedImage.preparationAttempts!.some(attempt => attempt.errorCode === "media_forbidden" && attempt.httpStatus === 403));
    assert.ok(refreshedImage.preparationAttempts!.some(attempt => attempt.source === "refreshed_snapshot" && !attempt.errorCode));
    assert.equal((f.db.prepare("SELECT data FROM gemini_smoke_runs WHERE id=?").get(legacy.id) as { data: string }).data, previousData);
    assert.equal(f.videoInputs.length + f.imageInputs.length, 0); assert.ok(!JSON.stringify(saved).includes("PRIVATE_REFRESH_MARKER"));
  } finally { f.close(); }
});

test("a stale CDN download gets one fresh snapshot retry and preserves the original HTTP reason after recovery", async () => {
  let selected = "";
  const f = fixture({
    resolve: async (nativeId, options) => {
      selected ||= nativeId;
      if (nativeId !== selected) return { kind: "unknown", reason: "No creative URL was exposed." };
      return { kind: "video", videoUrl: `https://fixture.fbcdn.net/${options.refresh ? "fresh" : "old"}.mp4?signature=PRIVATE_REFRESH_MARKER` };
    },
    videoDownload: async url => {
      if (new URL(url).pathname === "/old.mp4") throw new MediaStorageError("The video file was not found (HTTP 404). Refresh its source link.", 502, "media_not_found", 404);
    },
  });
  try {
    const prep = await f.runner.start("prepare", "static-high-fps-hook"); await f.runner.idle();
    const saved = f.runner.run(prep.id)!;
    const recovered = saved.items.find(item => item.nativeId === selected)!;
    assert.equal(recovered.status, "stored"); assert.equal(recovered.error, undefined);
    assert.deepEqual(f.sourceReads.filter(read => read.nativeId === selected).map(read => read.refresh), [false, true]);
    assert.ok(recovered.preparationAttempts!.some(attempt => attempt.source === "snapshot" && attempt.errorCode === "media_not_found" && attempt.httpStatus === 404));
    assert.ok(recovered.preparationAttempts!.some(attempt => attempt.source === "refreshed_snapshot" && !attempt.errorCode));
    assert.equal(f.videoInputs.length + f.imageInputs.length, 0);
    assert.ok(!f.runner.report(prep.id).includes("PRIVATE_REFRESH_MARKER"));
  } finally { f.close(); }
});

for (const charged of [false, true]) test(`image budget resume preserves the 12-ad sample and ${charged ? "skips a charged uncertain attempt" : "retries a zero-dispatch item with a new attempt identity"}`, async () => {
  let blocked = true;
  const f = fixture({ imageAnalyse: async (_input, call) => {
    if (blocked && call === 4) throw new VideoProviderError("budget_paused", "Inference budget paused.", accounted(charged ? 1 : 0, charged));
  } });
  try {
    await f.seedImages(12);
    const run = await f.runner.start("smoke", "static-high-fps-hook"); await f.runner.idle();
    const stopped = f.runner.run(run.id)!;
    assert.equal(stopped.status, "paused"); assert.equal(stopped.sampleSize, 12);
    assert.equal(stopped.items.filter(item => item.status === "complete").length, 3);
    const pausedItem = stopped.items.find(item => item.errorCode === "budget_paused")!;
    assert.equal(pausedItem.status, charged ? "interrupted" : "stored");
    const previousAttempt = pausedItem.jobId;
    blocked = false; await Promise.all([f.runner.resume(run.id), f.runner.resume(run.id)]); await f.runner.idle();
    const done = f.runner.run(run.id)!;
    assert.equal(done.sampleSize, 12); assert.equal(done.status, "complete");
    assert.equal(done.items.filter(item => item.status === "complete").length, charged ? 11 : 12);
    assert.equal(f.imageInputs.length, charged ? 12 : 13);
    const recovered = done.items.find(item => item.adId === pausedItem.adId)!;
    if (charged) { assert.equal(recovered.status, "interrupted"); assert.equal(recovered.jobId, previousAttempt); assert.equal(recovered.estimatedCostGbp, 0.05); }
    else { assert.equal(recovered.status, "complete"); assert.notEqual(recovered.jobId, previousAttempt); }
    assert.match(f.runner.report(run.id), charged ? /Successful outputs: 11\/12/ : /Successful outputs: 12\/12/);
  } finally { f.close(); }
});
