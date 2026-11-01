import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { VideoAnalysisService } from "../server/video/service.js";
import { VideoProviderError, type StoredVideo, type VideoAnalyserInput } from "../server/video/types.js";
import { MediaStorageError } from "../server/video/media.js";
import { GeminiSmokeService, SmokeRequestError } from "../server/smoke/service.js";
import { attachGeminiSmoke } from "../server/smoke/api.js";
import { videoSourcesFromScripts, SmokeSourceError } from "../server/smoke/source.js";
import { VIDEO_PROMPT_VERSION, type VideoAnalysisAccounting } from "../shared/video-analysis.js";
import type { SmokeRun } from "../shared/gemini-smoke.js";
const field = (value: string | boolean) => ({ value, confidence: 0.9, timestamps: [{ startSeconds: 0, endSeconds: 2 }] });
function accounting(unknown = false): VideoAnalysisAccounting {
  return { usage: { inputTokens: unknown ? null : 100, outputTokens: unknown ? null : 20, totalTokens: unknown ? null : 120 }, tokenCostGbp: unknown ? null : 0.01, reservedCostGbp: unknown ? 0.05 : 0, estimatedCostGbp: unknown ? 0.05 : 0.01, costBasis: unknown ? "reservation_estimate" : "token_estimate", pricing: { inputGbpPerMillion: 1, outputGbpPerMillion: 2 }, requestAttempts: 1, rawResponse: { fixture: "complete output" } };
}
function output(input: VideoAnalyserInput) {
  return { model: "fixture-flash", modelVersion: "fixture-1", processingMode: input.processingMode, promptVersion: VIDEO_PROMPT_VERSION, coverage: { durationSeconds: 5, fullVideo: true, segments: [{ startSeconds: 0, endSeconds: 5, processing: "agentic" as const }] }, fields: { hook: field("Product opening"), format: field("studio"), angle: field("Product benefit"), keyClaims: [], spokenTranscript: [], onScreenText: [], cta: field("Shop"), personTalkingToCamera: field(false), creatorEvidence: [] }, accounting: accounting() };
}
function fixture(analyse?: (input: VideoAnalyserInput) => Promise<ReturnType<typeof output>>) {
  const db = openDatabase(":memory:", false);
  const media = new Map<string,StoredVideo>();
  let downloads = 0, sourceCalls = 0, analyses = 0, factoryCalls = 0;
  const video = new VideoAnalysisService(db, {
    concurrency: 3,
    mediaStore: {
      async store(input) {
        const previous = media.get(input.adId);
        if (previous) return previous;
        if (!input.sourceUrl) throw new MediaStorageError("Source URL required.");
        downloads++;
        const hash = createHash("sha256").update(input.adId).digest("hex");
        const stored = { mediaId: hash, brandId: input.brandId, sourceAdId: input.adId, absolutePath: "/tmp/not-read.mp4", relativePath: "not-read.mp4", sha256: hash, bytes: 1, mimeType: "video/mp4", durationSeconds: 5, storedAt: new Date().toISOString(), sourceUrl: "https://fixture.fbcdn.net/video.mp4" };
        media.set(input.adId, stored); return stored;
      },
      async load(id) { return [...media.values()].find(value => value.mediaId === id) || null; },
    },
    analyserFactory: () => {
      factoryCalls++;
      return { provider: "gemini", model: "fixture-flash", async analyse(input) { analyses++; return analyse ? analyse(input) : output(input); } };
    },
  });
  const options = { readiness: async () => ({ hosted: true, errors: [] as string[] }), sourceFactory: () => ({ async resolve(_id: string) { sourceCalls++; return "https://fixture.fbcdn.net/video.mp4"; }, async close() {} }) };
  return { db, video, options, counts: () => ({ downloads, sourceCalls, analyses, factoryCalls }) };
}
test("smoke preparation stores exactly 25 videos; live action produces real saved outputs and accounting without repeated download", async () => {
  const f = fixture();
  const runner = new GeminiSmokeService(f.db, f.video, f.options);
  try {
    const prep = await runner.start("prepare"); await runner.idle();
    const prepared = runner.run(prep.id)!;
    assert.equal(prepared.status,"complete"); assert.equal(prepared.items.length,58); assert.equal(prepared.sampleSize,25);
    assert.equal(prepared.items.filter(item => item.status === "stored" && item.mediaSha256).length,25);
    assert.deepEqual(f.counts(), { downloads:25, sourceCalls:25, analyses:0, factoryCalls:0 });
    const run = await runner.start("smoke", "agentic"); await runner.idle();
    const done = runner.run(run.id)!;
    assert.equal(done.status,"complete"); assert.equal(done.items.filter(item => item.status === "complete").length,25);
    assert.equal(f.counts().downloads,25); assert.equal(f.counts().analyses,25);
    assert.ok(done.items.every(item => item.model === "fixture-flash" && item.processingMode === "agentic" && item.estimatedCostGbp === 0.01 && item.usage?.totalTokens === 120));
    assert.ok(!JSON.stringify(done).includes("rawResponse"),"progress responses do not duplicate large raw provider payloads");
    const report = runner.report(run.id);
    assert.match(report,/Successful outputs: 25\/25/); assert.match(report,/£0\.250000/); assert.match(report,/120\.0 \(25\/25 outputs\)/);
    assert.equal((report.match(/### Ad /g) || []).length,5); assert.match(report,/fixture-flash/); assert.match(report,/complete output/);
  } finally { f.db.close(); }
});
test("budget pause after a paid attempt retains its charge and resume never replays the uncertain ad", async () => {
  let pause = true;
  let uncertainAd = "";
  const f = fixture(async input => {
    if (pause) { uncertainAd = input.adId; throw new VideoProviderError("budget_paused","Budget paused after a retried request.", accounting(true)); }
    assert.notEqual(input.adId,uncertainAd); return output(input);
  });
  const runner = new GeminiSmokeService(f.db,f.video,{ ...f.options, concurrency:1 });
  try {
    await runner.start("prepare"); await runner.idle();
    const run = await runner.start("smoke"); await runner.idle();
    const stopped = runner.run(run.id)!;
    assert.equal(stopped.status,"paused"); assert.equal(stopped.items[0].status,"interrupted");
    assert.equal(stopped.items[0].estimatedCostGbp,0.05); assert.equal(stopped.items[0].model,"fixture-flash");
    pause = false; await Promise.all([runner.resume(run.id), runner.resume(run.id)]); await runner.idle();
    const done = runner.run(run.id)!;
    assert.equal(done.status,"complete"); assert.equal(done.items.filter(item => item.status === "complete").length,24);
    assert.equal(done.items.filter(item => item.status === "interrupted").length,1); assert.equal(f.counts().analyses,25);
    assert.match(runner.report(run.id),/£0\.290000/);
  } finally { f.db.close(); }
});
test("restart recovers saved state but inference continues only after explicit resume", async () => {
  const f = fixture(); const runner = new GeminiSmokeService(f.db,f.video,f.options);
  try {
    const prep = await runner.start("prepare"); await runner.idle();
    const saved = runner.run(prep.id)!;
    saved.kind="smoke"; saved.status="analysing"; saved.items=saved.items.filter(item => item.status === "stored"); saved.items[0].status="analysing";
    f.db.prepare("UPDATE gemini_smoke_runs SET status=?,data=? WHERE id=?").run(saved.status,JSON.stringify(saved),saved.id);
    const recovered = new GeminiSmokeService(f.db,f.video,f.options);
    assert.equal(recovered.run(saved.id)!.status,"interrupted");
    assert.equal(recovered.run(saved.id)!.items[0].status,"interrupted");
    await recovered.idle(); assert.equal(f.counts().analyses,0);
    await recovered.resume(saved.id); await recovered.idle();
    assert.equal(f.counts().analyses,24); assert.equal(recovered.run(saved.id)!.items[0].status,"interrupted");
  } finally { f.db.close(); }
});
test("insufficient retained inputs stop before paid inference and preserve all preparation diagnostics", async () => {
  const f = fixture(); const runner = new GeminiSmokeService(f.db,f.video,{ ...f.options, sourceFactory: () => ({ resolve: async () => null, close: async () => {} }) });
  try {
    const run = await runner.start("prepare"); await runner.idle();
    const done = runner.run(run.id)!;
    assert.equal(done.status,"failed"); assert.equal(done.sampleSize,0); assert.equal(done.items.length,58);
    assert.ok(done.items.every(item => item.errorCode === "source_media_unavailable"));
    await assert.rejects(runner.start("smoke"), /at least 10/);
    assert.equal(f.counts().analyses,0); assert.equal(f.counts().factoryCalls,0);
    assert.match(runner.report(run.id),/No Gemini inference was started during preparation/);
  } finally { f.db.close(); }
});
test("HTTP retry usage remains unavailable for the whole ad while final provider usage is retained", async () => {
  const f = fixture(async input => { const result = output(input); result.accounting.requestAttempts = 2; return result; });
  const runner = new GeminiSmokeService(f.db, f.video, f.options);
  try {
    await runner.start("prepare"); await runner.idle();
    const run = await runner.start("smoke"); await runner.idle();
    const saved = runner.run(run.id)!;
    assert.ok(saved.items.every(item => item.usage?.totalTokens === null));
    assert.equal(saved.items[0].accounting![0].usage.totalTokens,120);
    assert.match(runner.report(run.id),/Average total tokens per successful ad with complete usage: unavailable/);
    assert.match(runner.report(run.id),/retry has unknown usage/);
  } finally { f.db.close(); }
});
test("public snapshot extraction binds the video to both the requested ad and verified advertiser", () => {
  const row = { ad_archive_id:"1019959660919738",page_id:"172851066181411",snapshot:{page_id:"172851066181411",videos:[{video_hd_url:"https://video.fixture.fbcdn.net/video.mp4?temporary=1"}]}};
  const wanted = new Set([row.ad_archive_id]);
  assert.equal(videoSourcesFromScripts([JSON.stringify({payload:row})],wanted).size,1);
  assert.equal(videoSourcesFromScripts([JSON.stringify({...row,page_id:"other"})],wanted).size,0);
  assert.equal(videoSourcesFromScripts([JSON.stringify({...row,snapshot:{...row.snapshot,videos:[{video_hd_url:"https://other.example.com/video.mp4"}]}})],wanted).size,0);
  assert.throws(() => videoSourcesFromScripts([JSON.stringify({xfb_ad_library_is_captcha_required:true,payload:row})],wanted),SmokeSourceError);
});
test("all smoke routes and report download inherit authentication; GET never launches work", async () => {
  const f=fixture(); const app=express(); app.use(basicAuth({EXTER_ADMIN_USER:"fixture-user",EXTER_ADMIN_PASSWORD:"fixture-password"})); app.use(express.json());
  const runner=attachGeminiSmoke(app,f.db,f.video,f.options); const server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve)); const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const headers={authorization:`Basic ${Buffer.from("fixture-user:fixture-password").toString("base64")}`,"content-type":"application/json"};
  try {
    for(const path of ["/api/gemini-smoke/status","/api/gemini-smoke/runs/missing/report"] ) assert.equal((await fetch(base+path)).status,401);
    assert.equal((await fetch(base+"/api/gemini-smoke/prepare",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})).status,401);
    await fetch(base+"/api/gemini-smoke/status",{headers}); assert.equal(runner.latest(),null); assert.equal(f.counts().analyses,0);
    const prepResponse=await fetch(base+"/api/gemini-smoke/prepare",{method:"POST",headers,body:JSON.stringify({processingMode:"static-high-fps-hook"})});
    assert.equal(prepResponse.status,202); const prepared=await prepResponse.json() as SmokeRun;
    assert.equal(prepared.requestedMode,"static-high-fps-hook"); await runner.idle();
    const response=await fetch(base+"/api/gemini-smoke/runs",{method:"POST",headers,body:JSON.stringify({processingMode:"static-high-fps-hook"})}); assert.equal(response.status,202);
    const run=await response.json() as SmokeRun; await runner.idle();
    const report=await fetch(base+`/api/gemini-smoke/runs/${run.id}/report`,{headers}); assert.equal(report.status,200); assert.match(report.headers.get("content-disposition")!,/gemini-live-report\.md/);
    const reportText=await report.text(); assert.match(reportText,/25\/25/); assert.match(reportText,/Requested video processing mode: static-high-fps-hook/);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); f.db.close(); }
});
