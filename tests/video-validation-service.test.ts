import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/db.js";
import { VideoAnalysisService } from "../server/video/service.js";
import { normalizeVideoAnalysisFields } from "../server/video/validation.js";
import { VideoProviderError, type StoredVideo, type VideoAnalyser, type VideoMediaStore } from "../server/video/types.js";
import { VIDEO_PROMPT_VERSION, type VideoAnalysisFields, type VideoCoverage } from "../shared/video-analysis.js";
import type { Ad, Brand } from "../shared/types.js";
import { classifyCreativeFormats } from "../shared/formats.js";

const coverage: VideoCoverage = { durationSeconds: 12, fullVideo: true, segments: [{ startSeconds: 0, endSeconds: 12, processing: "agentic" }] };
const field = <T>(value: T, confidence = 0.95, startSeconds = 0, endSeconds = 3) => ({ value, confidence, timestamps: [{ startSeconds, endSeconds }] });
function fields(): VideoAnalysisFields {
  return { hook: field("A product opens on a desk"), format: field("studio"), angle: field("Ease of use"), keyClaims: [field("Advertiser claims a long-lasting scent")], spokenTranscript: [field("Try it today", 0.95, 4, 6)], onScreenText: [field("Try it today", 0.95, 4, 6)], cta: field("Shop now", 0.95, 10, 12), personTalkingToCamera: field(false), creatorEvidence: [] };
}
test("video validation preserves false, abstains below threshold and requires timestamps", () => {
  const raw = fields(); raw.angle.confidence = 0.4; raw.cta.timestamps = [];
  const result = normalizeVideoAnalysisFields(raw, { coverage });
  assert.equal(result.personTalkingToCamera.value, false);
  assert.equal(result.angle.value, "unknown");
  assert.equal(result.cta.value, "unknown");
  assert.deepEqual(result.angle.timestamps, []);
  assert.equal(result.angle.confidence, 0.4);
});
test("UGC requires source-grounded creator evidence and excludes the brand watermark", () => {
  const raw = fields(); raw.format = field("UGC");
  assert.equal(normalizeVideoAnalysisFields(raw, { coverage }).format.value, "unknown");
  raw.creatorEvidence = [{ kind: "paid-partnership-label", source: "ad-library", value: "Invented partnership", confidence: 1, timestamps: [], sourceUrl: "https://example.com/fake" }];
  assert.equal(normalizeVideoAnalysisFields(raw, { coverage }).format.value, "unknown");
  raw.creatorEvidence = [{ kind: "visible-creator-handle", source: "video", value: "@valentte_london", confidence: 0.95, timestamps: [{ startSeconds: 1, endSeconds: 2 }] }];
  assert.equal(normalizeVideoAnalysisFields(raw, { coverage, brandName: "Valentte" }).format.value, "unknown");
  raw.creatorEvidence[0].value = "@real_creator";
  const valid = normalizeVideoAnalysisFields(raw, { coverage, brandName: "Valentte" });
  assert.equal(valid.format.value, "UGC");
  assert.equal(valid.creatorEvidence[0].value, "@real_creator");
});
test("hook and source coverage bounds are enforced, including adjacent static clips", () => {
  const raw = fields(); raw.hook = field("Late hook", 0.9, 3, 7);
  assert.throws(() => normalizeVideoAnalysisFields(raw, { coverage }), /timestamp/);
  const clips: VideoCoverage = { durationSeconds: 12, fullVideo: true, segments: [{ startSeconds: 0, endSeconds: 5, processing: "static", fps: 5 }, { startSeconds: 5, endSeconds: 12, processing: "static", fps: 1 }] };
  const valid = fields(); valid.format.timestamps = [{ startSeconds: 0, endSeconds: 12 }];
  assert.equal(normalizeVideoAnalysisFields(valid, { coverage: clips }).format.value, "studio");
  valid.cta.timestamps = [{ startSeconds: 11, endSeconds: 13 }];
  assert.throws(() => normalizeVideoAnalysisFields(valid, { coverage: clips }), /timestamp/);
});
test("invalid provider coverage and unsupported influencer descriptions are rejected or abstained", () => {
  assert.throws(() => normalizeVideoAnalysisFields(fields(), { coverage: { ...coverage, segments: [{ startSeconds: -1, endSeconds: 12, processing: "agentic" }] } }), /coverage/);
  assert.throws(() => normalizeVideoAnalysisFields(fields(), { coverage: { ...coverage, segments: [{ startSeconds: 0, endSeconds: Infinity, processing: "static", fps: 5 }] } }), /coverage/);
  assert.throws(() => normalizeVideoAnalysisFields(fields(), { coverage: { ...coverage, segments: [{ startSeconds: 0, endSeconds: 4, processing: "agentic" }, { startSeconds: 6, endSeconds: 12, processing: "agentic" }] } }), /coverage/);
  const raw = fields(); raw.angle = field("Influencer endorsement");
  assert.equal(normalizeVideoAnalysisFields(raw, { coverage }).angle.value, "unknown");
});
const brand: Brand = { id: "video-brand", name: "Video Brand", domain: "brand.example", category: "Home fragrance & gifting", color: "#555", initials: "V", voice: [], competitors: [], mode: "imported", createdAt: "2026-01-01T00:00:00.000Z" };
const sourceAd: Ad = { id: "video-ad", brandId: brand.id, brand: brand.name, platform: "Meta", category: brand.category, title: "Test fixture video", copy: "Test fixture ad copy", angle: "Not analysed", audience: "Not inferred", format: "Video", image: "", color: brand.color, active: true, publishedAt: "2026-01-01T00:00:00.000Z", impressions: 0, engagements: 0, metricsAvailable: false, engagementRateBasis: "unavailable", spend: null, conversions: null, revenue: null, owned: false, source: "public", sourceUrl: "https://www.facebook.com/ads/library/?id=1234567890", analysis: { provenance: "provided", topic: "Earlier still-image annotation" } };
const media: StoredVideo = { mediaId: "a".repeat(64), brandId: brand.id, sourceAdId: sourceAd.id, sha256: "b".repeat(64), absolutePath: "/tmp/fixture.mp4", relativePath: "fixture.mp4", mimeType: "video/mp4", durationSeconds: 12, bytes: 100, storedAt: "2026-10-30T00:00:00.000Z", sourceUrl: "https://video.example.test/fixture.mp4" };
function fixture(path = ":memory:") {
  const db = openDatabase(path, false);
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(sourceAd.id, brand.id, sourceAd.source, sourceAd.platform, sourceAd.publishedAt, JSON.stringify(sourceAd));
  const events: string[] = [];
  const store: VideoMediaStore = { store: async () => { events.push("stored"); return media; }, load: async () => media };
  return { db, store, events };
}
const provider = (run: VideoAnalyser["analyse"]): VideoAnalyser => ({ provider: "gemini", model: "gemini-fixture-flash", analyse: run });
const output = (mode: "agentic" | "static-high-fps-hook" = "agentic") => ({ fields: fields(), model: "gemini-fixture-flash", modelVersion: "fixture-1", processingMode: mode, promptVersion: VIDEO_PROMPT_VERSION, coverage });
test("video service stores media before inference, deduplicates requests and preserves append-only history", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exter-video-history-"));
  const { db, store, events } = fixture(join(dir, "exter.db"));
  try {
    let calls = 0;
    const service = new VideoAnalysisService(db, { mediaStore: store, analyserFactory: () => provider(async () => { calls++; assert.equal(events.at(-1), "stored"); events.push("analysed"); return output(); }) });
    const first = service.enqueue({ brandId: brand.id, adId: sourceAd.id });
    assert.equal(service.enqueue({ brandId: brand.id, adId: sourceAd.id }).id, first.id);
    await service.idle();
    assert.equal(service.job(brand.id, first.id)!.status, "complete");
    const firstResult = service.history(brand.id, sourceAd.id)[0];
    assert.equal(firstResult.modelVersion, "fixture-1");
    assert.equal(firstResult.mediaSha256, media.sha256);
    assert.equal(firstResult.promptVersion, VIDEO_PROMPT_VERSION);
    assert.equal(service.job("another-workspace", first.id), null);
    assert.equal(await service.storedMedia(brand.id, sourceAd.id, "different-media"), null);
    const cached = service.enqueue({ brandId: brand.id, adId: sourceAd.id }); await service.idle();
    assert.equal(service.job(brand.id, cached.id)!.cached, true); assert.equal(calls, 1);
    service.enqueue({ brandId: brand.id, adId: sourceAd.id, force: true }); await service.idle();
    assert.equal(service.history(brand.id, sourceAd.id).length, 2); assert.equal(calls, 2);
    assert.deepEqual(service.history(brand.id, sourceAd.id)[1], firstResult);
    const ad = service.ad(brand.id, sourceAd.id);
    assert.deepEqual(ad.analysis, sourceAd.analysis); assert.equal(ad.metricsAvailable, false);
    assert.equal(ad.videoAnalysis?.fields.personTalkingToCamera.value, false);
    db.close();
    const reopened = openDatabase(join(dir, "exter.db"), false);
    try { assert.equal(new VideoAnalysisService(reopened, { mediaStore: store }).history(brand.id, sourceAd.id).length, 2); }
    finally { reopened.close(); }
  } finally { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); }
});
test("native capability failure alone triggers the recorded static fallback", async () => {
  const { db, store } = fixture();
  try {
    const modes: string[] = [];
    const service = new VideoAnalysisService(db, { mediaStore: store, analyserFactory: () => provider(async (input) => {
      modes.push(input.processingMode);
      if (input.processingMode === "agentic") throw new VideoProviderError("unsupported_mode", "Native mode unavailable");
      return output("static-high-fps-hook");
    }) });
    const job = service.enqueue({ brandId: brand.id, adId: sourceAd.id }); await service.idle();
    assert.deepEqual(modes, ["agentic", "static-high-fps-hook"]);
    assert.deepEqual(service.job(brand.id, job.id)!.attempts.map((attempt) => attempt.status), ["failed", "succeeded"]);
    assert.equal(service.history(brand.id, sourceAd.id)[0].processingMode, "static-high-fps-hook");
  } finally { db.close(); }
});
test("auth/quota errors never cause a second inference; existing results and media survive", async () => {
  const { db, store } = fixture();
  try {
    let calls = 0, fail = false;
    const service = new VideoAnalysisService(db, { mediaStore: store, analyserFactory: () => provider(async () => { calls++; if (fail) throw new VideoProviderError("rate_limit", "Provider rate limit"); return output(); }) });
    service.enqueue({ brandId: brand.id, adId: sourceAd.id }); await service.idle();
    const old = service.history(brand.id, sourceAd.id)[0]; fail = true;
    const next = service.enqueue({ brandId: brand.id, adId: sourceAd.id, force: true }); await service.idle();
    assert.equal(calls, 2); assert.equal(service.job(brand.id, next.id)!.attempts.length, 1);
    assert.equal(service.job(brand.id, next.id)!.status, "error");
    assert.deepEqual(service.history(brand.id, sourceAd.id), [old]);
    assert.equal(service.ad(brand.id, sourceAd.id).videoMediaId, media.mediaId);
  } finally { db.close(); }
});
test("invalid output is not saved and worker restart recovery never replays a paid call", async () => {
  const { db, store } = fixture();
  try {
    let calls = 0;
    const service = new VideoAnalysisService(db, { mediaStore: store, analyserFactory: () => provider(async () => { calls++; return { ...output(), fields: { unexpected: true } }; }) });
    const job = service.enqueue({ brandId: brand.id, adId: sourceAd.id }); await service.idle();
    assert.equal(service.job(brand.id, job.id)!.errorCode, "invalid_output");
    assert.equal(service.history(brand.id, sourceAd.id).length, 0);
    const current = service.job(brand.id, job.id)!; current.status = "analysing";
    db.prepare("UPDATE video_jobs SET status=?,data=? WHERE id=?").run(current.status, JSON.stringify(current), current.id);
    assert.equal(service.recoverInterruptedJobs(), 1);
    assert.equal(service.job(brand.id, job.id)!.status, "interrupted");
    assert.equal(calls, 1);
  } finally { db.close(); }
});
test("changed creator/copy context invalidates cached analysis and native formats reach analytics", async () => {
  const { db, store } = fixture();
  try {
    let calls = 0;
    const service = new VideoAnalysisService(db, { mediaStore: store, analyserFactory: () => provider(async () => { calls++; return output(); }) });
    service.enqueue({ brandId: brand.id, adId: sourceAd.id }); await service.idle();
    const original = service.history(brand.id, sourceAd.id)[0];
    assert.deepEqual(classifyCreativeFormats(service.ad(brand.id, sourceAd.id)), ["Studio"]);
    const edited = { ...service.ad(brand.id, sourceAd.id), copy: "Updated source context" };
    db.prepare("UPDATE ads SET data=? WHERE id=?").run(JSON.stringify(edited), edited.id);
    service.enqueue({ brandId: brand.id, adId: sourceAd.id }); await service.idle();
    assert.equal(calls, 2);
    assert.notEqual(service.history(brand.id, sourceAd.id)[0].inputContextSha256, original.inputContextSha256);
    const unverified: Ad = { ...edited, creativeFormats: ["Influencer", "UGC"], videoAnalysis: { ...original, fields: { ...original.fields, format: field("unknown" as const) } } };
    assert.deepEqual(classifyCreativeFormats(unverified), ["Unclassified"]);
  } finally { db.close(); }
});
