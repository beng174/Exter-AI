import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import source from "../shared/cases/valentte-ads.json";
import caseData from "../shared/cases/valentte.json";
import type { Ad, Brand } from "../shared/types.js";
import type { SmokeRun } from "../shared/gemini-smoke.js";
import { VIDEO_PROMPT_VERSION, type VideoAnalysisAccounting } from "../shared/video-analysis.js";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { VideoAnalysisService } from "../server/video/service.js";
import { VideoProviderError, type StoredVideo, type VideoAnalyserInput } from "../server/video/types.js";
import { attachGeminiSmoke } from "../server/smoke/api.js";

const accounting = (): VideoAnalysisAccounting => ({
  usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, tokenCostGbp: 0.0002,
  reservedCostGbp: 0, estimatedCostGbp: 0.0002, costBasis: "token_estimate",
  pricing: { inputGbpPerMillion: 1, outputGbpPerMillion: 2 }, requestAttempts: 1,
  initialReservedCostGbp: 0.1, billedCostGbp: null, retryAttempts: 0, rejectedAttempts: 0,
});
const field = (value: string | boolean) => ({ value, confidence: 0.95, timestamps: [{ startSeconds: 0, endSeconds: 2 }] });
function output(input: VideoAnalyserInput) {
  return {
    model: "fixture-flash", modelVersion: "fixture-1", processingMode: input.processingMode,
    promptVersion: VIDEO_PROMPT_VERSION, coverage: { durationSeconds: 8, fullVideo: true,
      segments: [{ startSeconds: 0, endSeconds: 8, processing: input.processingMode === "agentic" ? "agentic" as const : "static" as const,
        ...(input.processingMode === "agentic" ? {} : { fps: 3 }) }] },
    fields: { hook: field("Product opening"), format: field("studio"), angle: field("Gifting"), keyClaims: [],
      spokenTranscript: [], onScreenText: [], cta: field("Shop"), personTalkingToCamera: field(false), creatorEvidence: [] },
    accounting: accounting(),
  };
}
async function fixture(analyse?: (input: VideoAnalyserInput) => Promise<ReturnType<typeof output>>) {
  const db = openDatabase(":memory:", false);
  const brand = caseData.brand as Brand;
  const ads = (source.ads as Ad[]).filter(ad => ad.format === "Video").slice(0, 2);
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  const insert = db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)");
  for (const ad of ads) insert.run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
  const retained = new Map<string, StoredVideo>();
  const inputs: VideoAnalyserInput[] = [];
  let sourceReads = 0;
  const video = new VideoAnalysisService(db, {
    concurrency: 1,
    mediaStore: {
      async store(input) {
        const existing = retained.get(input.adId); if (existing) return existing;
        if (!input.sourceUrl) throw new Error("No local media; this fixture must not download.");
        const sha256 = createHash("sha256").update(input.adId).digest("hex");
        const media: StoredVideo = { mediaId: sha256, sha256, bytes: 1, mimeType: "video/mp4", durationSeconds: 8,
          brandId: input.brandId, sourceAdId: input.adId, absolutePath: "/tmp/diagnostic-fixture-not-read.mp4",
          relativePath: "objects/diagnostic-fixture.mp4", storedAt: "2026-11-01T12:00:00Z", sourceUrl: "https://fixture.fbcdn.net/video.mp4" };
        retained.set(input.adId, media); return media;
      },
      async load(mediaId) { return [...retained.values()].find(media => media.mediaId === mediaId) || null; },
    },
    analyserFactory: () => ({ provider: "gemini", model: "fixture-flash", async analyse(input) {
      inputs.push(input); return analyse ? analyse(input) : output(input);
    } }),
  });
  await video.storeMedia(brand.id, ads[0].id, "https://fixture.fbcdn.net/video.mp4");
  const app = express();
  app.use(basicAuth({ EXTER_ADMIN_USER: "diagnostic-fixture", EXTER_ADMIN_PASSWORD: "test-only-password" }));
  app.use(express.json());
  const runner = attachGeminiSmoke(app, db, video, {
    readiness: async () => ({ hosted: true, errors: [] }), concurrency: 1,
    sourceFactory: () => ({ async resolve() { sourceReads++; throw new Error("A one-ad diagnostic must not prepare sources."); }, async close() {} }),
  });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { authorization: `Basic ${Buffer.from("diagnostic-fixture:test-only-password").toString("base64")}`, "content-type": "application/json" };
  const post = (body: unknown, path = "/api/gemini-smoke/test-one") => fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  return { db, brand, ads, runner, inputs, base, headers, post, sourceReads: () => sourceReads,
    async close() { await runner.idle(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); db.close(); } };
}

test("one-ad diagnostics require authentication, list only retained inputs and default to Static below the ten-ad batch minimum", async () => {
  const f = await fixture();
  try {
    assert.equal((await fetch(f.base + "/api/gemini-smoke/creatives")).status, 401);
    assert.equal((await fetch(f.base + "/api/gemini-smoke/test-one", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
    const listed = await (await fetch(f.base + "/api/gemini-smoke/creatives", { headers: f.headers })).json();
    assert.equal(listed.defaultVideoMode, "static-high-fps-hook");
    assert.equal(listed.creatives.length, 1); assert.equal(listed.creatives[0].adId, f.ads[0].id);
    assert.ok(!JSON.stringify(listed).includes("absolutePath")); assert.equal(f.inputs.length, 0);
    const selected = { brandId: f.brand.id, adId: f.ads[0].id };
    const response = await f.post(selected); assert.equal(response.status, 202);
    const queued = await response.json() as SmokeRun; await f.runner.idle();
    const done = f.runner.run(queued.id)!;
    assert.equal(done.kind, "diagnostic"); assert.equal(done.sampleSize, 1); assert.equal(done.minimumSampleSize, 1);
    assert.equal(done.requestedMode, "static-high-fps-hook"); assert.equal(done.items.length, 1);
    assert.equal(done.items[0].status, "complete"); assert.equal(done.items[0].processingMode, "static-high-fps-hook");
    assert.equal(f.inputs.length, 1); assert.equal(f.inputs[0].adId, f.ads[0].id); assert.equal(f.inputs[0].processingMode, "static-high-fps-hook");
    assert.equal(done.items[0].reservedCostGbp, 0); assert.equal(done.items[0].tokenCostGbp, 0.0002); assert.equal(done.items[0].billedCostGbp, null);
    assert.match(f.runner.report(done.id), /1\/1/); assert.equal(f.sourceReads(), 0);
    const invalid = await f.post({ brandId: f.brand.id, adId: f.ads[1].id });
    assert.ok([400, 404, 409].includes(invalid.status)); assert.equal(f.inputs.length, 1);
    const wrongWorkspace = await f.post({ brandId: "not-this-workspace", adId: f.ads[0].id });
    assert.ok([400, 404, 409].includes(wrongWorkspace.status)); assert.equal(f.inputs.length, 1);
    const explicit = await f.post({ ...selected, processingMode: "agentic" }); assert.equal(explicit.status, 202);
    await f.runner.idle(); assert.equal(f.inputs.length, 2); assert.equal(f.inputs[1].processingMode, "agentic");
  } finally { await f.close(); }
});

test("diagnostics preserve full sanitised provider explanation and separate outstanding reservation from unknown actual billing", async () => {
  const details = [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generate_content_requests", description: "Project quota exhausted. Retry when quota resets." }] }];
  const message = "Gemini request failed: Resource exhausted. Project quota exhausted. Retry when quota resets.";
  const account = { ...accounting(), usage: { inputTokens: null, outputTokens: null, totalTokens: null }, tokenCostGbp: null, reservedCostGbp: 0.1, estimatedCostGbp: 0.1, costBasis: "reservation_estimate" as const };
  const f = await fixture(async () => {
    const error = new VideoProviderError("rate_limit", message, account);
    error.diagnostic = { stage: "generate_content", httpStatus: 429, providerStatus: "RESOURCE_EXHAUSTED", message, details, retryAfterMs: 60000 };
    throw error;
  });
  try {
    const response = await f.post({ brandId: f.brand.id, adId: f.ads[0].id, processingMode: "static-high-fps-hook" });
    assert.equal(response.status, 202); const queued = await response.json() as SmokeRun; await f.runner.idle();
    const saved = f.runner.run(queued.id)!; assert.equal(saved.items.length, 1); assert.equal(saved.items[0].status, "failed");
    const item = saved.items[0]; assert.equal(item.geminiDiagnostic?.message, message); assert.equal(item.geminiDiagnostic?.httpStatus, 429);
    assert.deepEqual(item.geminiDiagnostic?.details, details); assert.equal(item.geminiDiagnostic?.providerStatus, "RESOURCE_EXHAUSTED");
    assert.equal(item.reservedCostGbp, 0.1); assert.equal(item.tokenCostGbp, null); assert.equal(item.billedCostGbp, null);
    const report = await (await fetch(f.base + `/api/gemini-smoke/runs/${queued.id}/report`, { headers: f.headers })).text();
    assert.match(report, /Project quota exhausted/); assert.match(report, /RESOURCE_EXHAUSTED/); assert.match(report, /429/);
    assert.equal(f.inputs.length, 1); assert.equal(f.sourceReads(), 0);
  } finally { await f.close(); }
});

test("concurrent one-ad submissions cannot launch duplicate or conflicting paid work", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(async input => { await gate; return output(input); });
  try {
    const body = { brandId: f.brand.id, adId: f.ads[0].id, processingMode: "static-high-fps-hook" };
    const responses = await Promise.all([f.post(body), f.post(body)]);
    const payloads = await Promise.all(responses.map(response => response.json() as Promise<{ id?: string }>));
    assert.ok(responses.every(response => [202, 409].includes(response.status)));
    const ids = payloads.map(payload => payload.id).filter(Boolean); assert.equal(new Set(ids).size, 1);
    assert.equal(f.inputs.length, 1);
    const conflict = await f.post({ ...body, processingMode: "agentic" }); assert.equal(conflict.status, 409);
    release(); await f.runner.idle(); assert.equal(f.inputs.length, 1);
    const done = f.runner.run(ids[0]!)!; assert.equal(done.sampleSize, 1); assert.equal(done.items[0].status, "complete");
  } finally { release(); await f.close(); }
});

test("successful usage stays known after explicit rejected retries and remains separate from actual billing", async () => {
  const f = await fixture(async input => ({ ...output(input), accounting: {
    ...accounting(), requestAttempts: 3, rejectedAttempts: 2, retryAttempts: 2,
  } }));
  try {
    const response = await f.post({ brandId: f.brand.id, adId: f.ads[0].id }); assert.equal(response.status, 202);
    const queued = await response.json() as SmokeRun; await f.runner.idle();
    const saved = f.runner.run(queued.id)!; const item = saved.items[0];
    assert.equal(item.status, "complete"); assert.deepEqual(item.usage, { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    assert.equal(item.reservedCostGbp, 0); assert.equal(item.tokenCostGbp, 0.0002); assert.equal(item.estimatedCostGbp, 0.0002);
    assert.equal(item.billedCostGbp, null); assert.equal(item.retryAttempts, 2); assert.equal(item.rejectedAttempts, 2);
    assert.match(f.runner.report(queued.id), /Average total tokens per successful ad with complete usage: 150\.0/);
    assert.equal(f.inputs.length, 1, "one logical diagnostic consumes provider-reported retry accounting once");
  } finally { await f.close(); }
});

test("an old paused Agentic run cannot resume through the Static default without an explicit Agentic choice", async () => {
  let paused = true;
  const f = await fixture(async input => {
    if (paused) throw new VideoProviderError("budget_paused", "No inference reservation was available.", {
      ...accounting(), requestAttempts: 0, retryAttempts: 0, rejectedAttempts: 0,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null }, tokenCostGbp: null,
      estimatedCostGbp: null, reservedCostGbp: null, initialReservedCostGbp: null, costBasis: "unavailable",
    });
    return output(input);
  });
  try {
    const selected = { brandId: f.brand.id, adId: f.ads[0].id, processingMode: "agentic" };
    const response = await f.post(selected); assert.equal(response.status, 202);
    const queued = await response.json() as SmokeRun; await f.runner.idle();
    assert.equal(f.runner.run(queued.id)!.status, "paused"); assert.equal(f.inputs.length, 1);
    const resume = `/api/gemini-smoke/runs/${queued.id}/resume`;
    assert.equal((await f.post({}, resume)).status, 409, "omitted mode must default to Static, not replay historical Agentic");
    assert.equal((await f.post({ processingMode: "static-high-fps-hook" }, resume)).status, 409);
    assert.equal(f.runner.run(queued.id)!.requestedMode, "agentic", "historical mode is never silently rewritten");
    assert.equal(f.runner.run(queued.id)!.status, "paused"); assert.equal(f.inputs.length, 1);
    paused = false;
    assert.equal((await f.post({ processingMode: "agentic" }, resume)).status, 202);
    await f.runner.idle();
    const done = f.runner.run(queued.id)!;
    assert.equal(done.status, "complete"); assert.equal(done.requestedMode, "agentic");
    assert.deepEqual(f.inputs.map(input => input.processingMode), ["agentic", "agentic"]);
    assert.equal(done.items.length, 1); assert.equal(done.items[0].status, "complete");
  } finally { await f.close(); }
});
