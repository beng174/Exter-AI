import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GeminiVideoAnalyser } from "../server/video/gemini.js";
import { TwelveLabsPegasusAnalyser } from "../server/video/twelvelabs.js";
import { VideoProviderError, type VideoAnalyserInput } from "../server/video/types.js";

const SECRET = "unit-test-api-key-never-exposed";
const HOST = "https://generativelanguage.googleapis.com";
const file = { name: "files/test-video", uri: `${HOST}/v1beta/files/test-video`, state: "ACTIVE" };
const fields = { hook: { value: "A reed diffuser gift is unboxed", confidence: 0.9, timestamps: [{ startSeconds: 0, endSeconds: 2 }] } };
const response = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
async function input(durationSeconds = 12) {
  const dir = await mkdtemp(join(tmpdir(), "exter-gemini-test-"));
  const bytes = Buffer.from("stored fixture bytes; provider transport is mocked, not a real video");
  const path = join(dir, "video.mp4");
  await writeFile(path, bytes);
  const value: VideoAnalyserInput = {
    adId: "ad-one", brandId: "brand-one", processingMode: "agentic",
    media: {
      mediaId: "media-one", absolutePath: path, relativePath: "brand-one/video.mp4",
      sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length,
      mimeType: "video/mp4", durationSeconds, storedAt: new Date().toISOString(),
      sourceAdId: "ad-one", brandId: "brand-one", sourceUrl: "https://example.com/expired-video.mp4",
    },
    context: { brandName: "Valentte", adCopy: "An untrusted source caption", creatorEvidence: [] },
  };
  return { value, bytes, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
interface Call { url: URL; init: RequestInit }
function transport(override?: (call: Call) => Response | undefined | Promise<Response | undefined>) {
  const calls: Call[] = [];
  const fetcher = async (url: URL | RequestInfo, init?: RequestInit) => {
    const call = { url: new URL(String(url)), init: init || {} };
    calls.push(call);
    assert.equal(call.url.origin, HOST, "no request or credential may leave the official host");
    assert.equal(call.init.redirect, "manual");
    assert.equal(call.url.searchParams.has("key"), false, "credential belongs in a header, never query strings");
    const special = await override?.(call);
    if (special) return special;
    if (call.url.pathname.endsWith(":generateContent"))
      return response({ modelVersion: "gemini-3.8-flash", candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(fields) }] } }] });
    if (call.url.pathname.startsWith("/v1beta/models/"))
      return response({ name: "models/gemini-3.8-flash", version: "3.8" });
    if (call.url.pathname === "/upload/v1beta/files" && !call.url.search)
      return response({}, 200, { "x-goog-upload-url": `${HOST}/upload/v1beta/files?upload_id=ephemeral-upload-token` });
    if (call.url.pathname === "/upload/v1beta/files" && call.url.search) {
      const chunks: Buffer[] = [];
      for await (const chunk of call.init.body as any) chunks.push(Buffer.from(chunk));
      assert.ok(Buffer.concat(chunks).length > 0, "stored file bytes are uploaded, never the source URL");
      return response({ file });
    }
    if (call.url.pathname === "/v1beta/files/test-video" && call.init.method === "DELETE")
      return new Response(null, { status: 200 });
    if (call.url.pathname === "/v1beta/files/test-video") return response(file);
    if (call.url.pathname === "/v1beta/interactions")
      return response({ id: "interaction-one", status: "completed", model: "gemini-3.8-flash", steps: [
        { type: "thought", content: [{ type: "text", text: "This is not a result." }] },
        { type: "model_output", content: [{ type: "text", text: JSON.stringify(fields) }] },
      ] });
    throw new Error(`Unexpected test path ${call.url.pathname}`);
  };
  return { calls, fetcher: fetcher as typeof fetch };
}
function analyser(fetcher: typeof fetch, extra: Record<string, unknown> = {}) {
  return new GeminiVideoAnalyser({ apiKey: SECRET, fetch: fetcher, sleep: async () => {}, ...extra });
}
const interactions = (calls: Call[]) => calls.filter((call) => call.url.pathname === "/v1beta/interactions");
const staticGenerations = (calls: Call[]) => calls.filter(call => call.url.pathname.endsWith(":generateContent"));
const deletions = (calls: Call[]) => calls.filter((call) => call.init.method === "DELETE");

test("Gemini uploads retained video and performs one genuine agentic Interactions request with version metadata", async () => {
  const fixture = await input();
  const mock = transport();
  try {
    const result = await analyser(mock.fetcher).analyse(fixture.value);
    assert.deepEqual(result.fields, fields);
    assert.equal(result.providerRequestId, "interaction-one");
    assert.equal(result.model, "gemini-3.8-flash");
    assert.equal(result.modelVersion, "3.8");
    assert.equal(result.processingMode, "agentic");
    assert.match(result.promptVersion, /native-video/);
    assert.equal(interactions(mock.calls).length, 1);
    const body = JSON.parse(String(interactions(mock.calls)[0].init.body));
    assert.equal(body.input[0].uri, file.uri);
    assert.equal(body.input[0].processing, "agentic", "a prompt alone must not masquerade as native agentic video");
    assert.equal(body.response_format.mime_type, "application/json");
    assert.ok(body.response_format.schema);
    assert.equal(body.store, false);
    assert.equal(body.background, false);
    assert.ok(!String(interactions(mock.calls)[0].init.body).includes(fixture.value.media.sourceUrl));
    assert.equal(new Headers(interactions(mock.calls)[0].init.headers).get("x-goog-api-key"), SECRET);
    assert.equal(deletions(mock.calls).length, 1);
    assert.deepEqual(result.coverage.segments, [{ startSeconds: 0, endSeconds: 12, processing: "agentic" }]);
  } finally { await fixture.cleanup(); }
});

test("Static mode uses stable GenerateContent with 3 FPS throughout short ads and no preview Agentic flag", async () => {
  const fixture = await input(); const mock = transport();
  try {
    const result = await analyser(mock.fetcher).analyse({ ...fixture.value, processingMode: "static-high-fps-hook" });
    const body = JSON.parse(String(staticGenerations(mock.calls)[0].init.body));
    assert.equal(interactions(mock.calls).length,0);
    assert.deepEqual(body.contents[0].parts.filter((part:any)=>part.fileData).map((part:any)=>part.videoMetadata), [{startOffset:"0s",endOffset:"12s",fps:3}]);
    assert.ok(body.contents[0].parts[0].fileData.fileUri === file.uri);
    assert.ok(!JSON.stringify(body).toLowerCase().includes('agentic'));
    assert.equal(body.generationConfig.responseMimeType,"application/json");
    assert.equal(result.processingMode,"static-high-fps-hook"); assert.equal(result.coverage.fullVideo,true);
    assert.deepEqual(result.fields,fields);
    for (const duration of [2.5,61]) {
      const clip=await input(duration); const calls=transport();
      try {
        const output=await analyser(calls.fetcher).analyse({...clip.value,processingMode:"static-high-fps-hook"});
        const parts=JSON.parse(String(staticGenerations(calls.calls)[0].init.body)).contents[0].parts.filter((part:any)=>part.fileData);
        assert.deepEqual(parts.map((part:any)=>part.videoMetadata),duration<=60 ? [{startOffset:"0s",endOffset:`${duration}s`,fps:3}] : [{startOffset:"0s",endOffset:"5s",fps:5},{startOffset:"5s",endOffset:"61s",fps:1}]);
        assert.equal(interactions(calls.calls).length,0); assert.equal(output.coverage.fullVideo,true);
      } finally {await clip.cleanup();}
    }
  } finally {await fixture.cleanup();}
});

test("Only explicit agentic unsupported errors allow the orchestration layer to select a fallback", async () => {
  const fixture = await input();
  try {
    for (const [status, payload, code] of [
      [400, { error: { message: `Agentic processing is not supported for this model ${SECRET}` } }, "unsupported_mode"],
      [400, { error: { message: `Schema invalid ${SECRET}` } }, "unavailable"],
      [401, { error: { message: SECRET } }, "authentication"],
      [403, { error: { message: SECRET } }, "authentication"],
      [429, { error: { message: SECRET } }, "rate_limit"],
      [503, { error: { message: SECRET } }, "unavailable"],
    ] as const) {
      const mock = transport((call) => call.url.pathname === "/v1beta/interactions" ? response(payload, status) : undefined);
      await assert.rejects(analyser(mock.fetcher).analyse(fixture.value), (error: unknown) =>
        error instanceof VideoProviderError && error.code === code && !error.message.includes(SECRET));
      assert.equal(interactions(mock.calls).length, status === 429 || status >= 500 ? 3 : 1, "only transient failures receive bounded retries");
      assert.equal(deletions(mock.calls).length, 1, "temporary Files uploads are cleaned up after failure");
    }
  } finally { await fixture.cleanup(); }
});

test("Processing files are polled with bounded waits and failed files never start inference", async () => {
  const fixture = await input();
  try {
    let polls = 0, sleeps = 0;
    const mock = transport((call) => {
      if (call.url.pathname === "/upload/v1beta/files" && call.url.search)
        return response({ file: { ...file, state: "PROCESSING" } });
      if (call.url.pathname === "/v1beta/files/test-video" && call.init.method !== "DELETE") {
        polls++;
        return response({ ...file, state: polls > 1 ? "ACTIVE" : "PROCESSING" });
      }
      return undefined;
    });
    await analyser(mock.fetcher, { sleep: async () => { sleeps++; } }).analyse(fixture.value);
    assert.equal(polls, 2);
    assert.equal(sleeps, 1);
    assert.equal(interactions(mock.calls).length, 1);
    const failed = transport((call) => call.url.pathname === "/upload/v1beta/files" && call.url.search
      ? response({ file: { ...file, state: "FAILED" } }) : undefined);
    await assert.rejects(analyser(failed.fetcher).analyse(fixture.value), /could not process/);
    assert.equal(interactions(failed.calls).length, 0);
    assert.equal(deletions(failed.calls).length, 1);
    const stuck = transport((call) =>
      (call.url.pathname === "/upload/v1beta/files" && call.url.search) ||
      (call.url.pathname === "/v1beta/files/test-video" && call.init.method !== "DELETE")
        ? response(call.url.pathname.includes("upload") ? { file: { ...file, state: "PROCESSING" } } : { ...file, state: "PROCESSING" }) : undefined);
    await assert.rejects(analyser(stuck.fetcher, { maxFilePolls: 2 }).analyse(fixture.value), /timed out/);
    assert.equal(interactions(stuck.calls).length, 0);
  } finally { await fixture.cleanup(); }
});

test("Local file, checksum and workspace validation precede provider network calls", async () => {
  const fixture = await input();
  const mock = transport();
  try {
    await assert.rejects(analyser(mock.fetcher).analyse({ ...fixture.value, brandId: "another-brand" }), /another ad or workspace/);
    await assert.rejects(analyser(mock.fetcher).analyse({ ...fixture.value, media: { ...fixture.value.media, sha256: "a".repeat(64) } }), /checksum/);
    await assert.rejects(analyser(mock.fetcher).analyse({ ...fixture.value, media: { ...fixture.value.media, absolutePath: join(fixture.value.media.absolutePath, "missing") } }), /Stored video is missing/);
    assert.equal(mock.calls.length, 0);
  } finally { await fixture.cleanup(); }
});

test("Untrusted upload destinations and redirects cannot receive credentials or video bytes", async () => {
  const fixture = await input();
  try {
    const malicious = transport((call) => call.url.pathname === "/upload/v1beta/files"
      ? response({}, 200, { "x-goog-upload-url": "https://evil.example/upload" }) : undefined);
    await assert.rejects(analyser(malicious.fetcher).analyse(fixture.value), /unsupported resource destination/);
    assert.equal(malicious.calls.length, 2);
    const redirect = transport(() => new Response(null, { status: 302, headers: { Location: "https://evil.example/" } }));
    await assert.rejects(analyser(redirect.fetcher).analyse(fixture.value), /credentials were not forwarded/);
    assert.equal(redirect.calls.length, 1);
  } finally { await fixture.cleanup(); }
});

test("Malformed structured responses fail, missing versions stay null and cleanup failures do not discard valid output", async () => {
  const fixture = await input();
  try {
    const malformed = transport((call) => call.url.pathname === "/v1beta/interactions"
      ? response({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "not JSON" }] }] }) : undefined);
    await assert.rejects(analyser(malformed.fetcher).analyse(fixture.value), (error: unknown) => error instanceof VideoProviderError && error.code === "invalid_output");
    assert.equal(deletions(malformed.calls).length, 1);
    let warnings = 0;
    const unreported = transport((call) => call.url.pathname.startsWith("/v1beta/models/") ? response({ name: "models/gemini-3.8-flash" })
      : call.init.method === "DELETE" ? response({ error: { message: SECRET } }, 503) : undefined);
    const result = await analyser(unreported.fetcher, { onCleanupFailure: () => { warnings++; } }).analyse(fixture.value);
    assert.equal(result.modelVersion, null, "a provider alias must not be presented as an immutable model revision");
    assert.deepEqual(result.fields, fields);
    assert.equal(warnings, 1);
  } finally { await fixture.cleanup(); }
});

test("Pegasus remains a clearly unimplemented swappable provider, never a fabricated benchmark", async () => {
  const fixture = await input();
  try {
    const pegasus = new TwelveLabsPegasusAnalyser();
    assert.equal(pegasus.provider, "twelvelabs");
    await assert.rejects(pegasus.analyse(fixture.value), (error: unknown) => error instanceof VideoProviderError && error.code === "not_implemented");
  } finally { await fixture.cleanup(); }
});

test("explicit transient rejections reuse one reservation and settle the successful generation estimate", async () => {
  const fixture = await input();
  let generationAttempts = 0, reservationCount = 0;
  const settlements: { id: string; value: number }[] = [];
  const sleeps: number[] = [];
  const payload = { id: "accounting-result", status: "completed", model: "gemini-3.8-flash", usage: { total_input_tokens: 1200, total_output_tokens: 300, total_tokens: 1500 }, outputs: [{ type: "text", text: JSON.stringify({ ...fields, echoed: SECRET }) }], echoedHeader: SECRET };
  const mock = transport(call => {
    if (call.url.pathname !== "/v1beta/interactions") return;
    generationAttempts++;
    return generationAttempts < 3 ? response({ error: { message: SECRET } }, generationAttempts === 1 ? 429 : 503) : response(payload);
  });
  try {
    const result = await analyser(mock.fetcher, {
      inputGbpPerMillion: 0.5, outputGbpPerMillion: 2,
      sleep: async (ms: number) => { sleeps.push(ms); },
      reserveCost: async () => ({ reservationId: `reserve-${++reservationCount}`, reservedGbp: 0.2 }),
      settleCost: async (id: string, value: number) => { settlements.push({ id, value }); },
    }).analyse(fixture.value);
    assert.equal(reservationCount, 1, "HTTP429/503 rejections retry the same reserved logical request");
    assert.deepEqual(sleeps, [500, 1000]);
    assert.deepEqual(result.accounting?.usage, { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 });
    assert.equal(result.accounting?.requestAttempts, 3);
    assert.equal(result.accounting?.costBasis, "token_estimate");
    assert.equal(result.accounting?.tokenCostGbp, 0.0012);
    assert.equal(result.accounting?.reservedCostGbp, 0);
    assert.equal(result.accounting?.estimatedCostGbp, 0.0012);
    assert.equal(result.accounting?.billedCostGbp,null);
    assert.equal(result.accounting?.rejectedAttempts,2);
    assert.deepEqual(settlements, [{ id: "reserve-1", value: 0.0012 }]);
    assert.ok(result.accounting?.rawResponse);
    assert.ok(!JSON.stringify(result).includes(SECRET), "a credential echoed by the provider is scrubbed before persistence");
    assert.equal(deletions(mock.calls).length, 1);
  } finally { await fixture.cleanup(); }
});

test("budget pause stops an ambiguous timeout retry while allowing temporary file cleanup", async () => {
  const fixture = await input();
  let reserves = 0;
  const mock = transport(call => {if(call.url.pathname === "/v1beta/interactions") throw new DOMException("Fixture timed out","TimeoutError");return undefined;});
  try {
    await assert.rejects(analyser(mock.fetcher, {
      reserveCost: async () => {
        if (++reserves > 1) throw new Error("budget threshold reached");
        return { reservationId: "first-reserve", reservedGbp: 0.2 };
      },
    }).analyse(fixture.value), (error: unknown) => {
      assert.ok(error instanceof VideoProviderError);
      assert.equal(error.code, "budget_paused");
      assert.equal(error.accounting?.requestAttempts, 1);
      assert.equal(error.accounting?.estimatedCostGbp, 0.2);
      assert.equal(error.accounting?.usage.inputTokens, null);
      assert.ok(!JSON.stringify(error).includes(SECRET));
      return true;
    });
    assert.equal(interactions(mock.calls).length, 1);
    assert.equal(deletions(mock.calls).length, 1);
  } finally { await fixture.cleanup(); }
});

test("invalid structured output retains sanitised raw response and billed usage for the failed ad", async () => {
  const fixture = await input();
  const mock = transport(call => call.url.pathname === "/v1beta/interactions"
    ? response({ status: "completed", usage: { total_input_tokens: 100, total_output_tokens: 50 }, outputs: [{ type: "text", text: `not JSON ${SECRET}` }] }) : undefined);
  try {
    await assert.rejects(analyser(mock.fetcher, { inputGbpPerMillion: 1, outputGbpPerMillion: 2 }).analyse(fixture.value), (error: unknown) => {
      assert.ok(error instanceof VideoProviderError);
      assert.equal(error.code, "invalid_output");
      assert.deepEqual(error.accounting?.usage, { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
      assert.equal(error.accounting?.tokenCostGbp, 0.0002);
      assert.ok(error.accounting?.rawResponse);
      assert.ok(!JSON.stringify(error.accounting).includes(SECRET));
      return true;
    });
  } finally { await fixture.cleanup(); }
});

test("missing usage and pricing remain unavailable rather than invented zero tokens or cost", async () => {
  const fixture = await input();
  const mock = transport();
  try {
    const result = await analyser(mock.fetcher).analyse(fixture.value);
    assert.deepEqual(result.accounting?.usage, { inputTokens: null, outputTokens: null, totalTokens: null });
    assert.equal(result.accounting?.estimatedCostGbp, null);
    assert.equal(result.accounting?.costBasis, "unavailable");
  } finally { await fixture.cleanup(); }
});

test("failed ledger settlement counts one successful attempt once using the larger token estimate or retained reserve", async () => {
  const fixture = await input();
  try {
    for (const [inputTokens, outputTokens, expectedTokenCost, expectedCombined] of [
      [100, 50, 0.0002, 0.2],
      [2_000_000, 1_000_000, 4, 4],
    ]) {
      let settlements = 0;
      const mock = transport(call => call.url.pathname === "/v1beta/interactions"
        ? response({ status: "completed", usage: { total_input_tokens: inputTokens, total_output_tokens: outputTokens }, outputs: [{ type: "text", text: JSON.stringify(fields) }] }) : undefined);
      const result = await analyser(mock.fetcher, {
        inputGbpPerMillion: 1, outputGbpPerMillion: 2,
        reserveCost: async () => ({ reservationId: "retained-reserve", reservedGbp: 0.2 }),
        settleCost: async () => { settlements++; throw new Error("fixture ledger unavailable"); },
      }).analyse(fixture.value);
      assert.equal(settlements, 1);
      assert.equal(result.accounting?.requestAttempts, 1);
      assert.equal(result.accounting?.tokenCostGbp, expectedTokenCost);
      assert.equal(result.accounting?.reservedCostGbp, 0.2, "failed settlement retains the ledger reservation");
      assert.equal(result.accounting?.estimatedCostGbp, expectedCombined, "token usage and the same attempt's reserve must never be added together");
      assert.equal(result.accounting?.costBasis, "token_and_reservation_estimate");
      assert.deepEqual(result.fields, fields, "ledger unavailability preserves the valid provider output");
    }
  } finally { await fixture.cleanup(); }
});

test("every generation retry rechecks ACTIVE and a processing file cannot dispatch a retry early", async () => {
  const fixture=await input(); let polls=0,posts=0,reserves=0; const events:string[]=[];
  const mock=transport(call=>{
    if(call.url.pathname===file.uri.replace(HOST,"") && call.init.method!=="DELETE") {
      polls++; const state=polls===2?"PROCESSING":"ACTIVE"; events.push(state); return response({...file,state});
    }
    if(call.url.pathname==="/v1beta/interactions") {posts++;events.push("generate");if(posts===1)return response({error:{message:"Temporary server rejection"}},503);}
    return undefined;
  });
  try {
    await analyser(mock.fetcher,{reserveCost:async()=>({reservationId:`hold-${++reserves}`,reservedGbp:0.1})}).analyse(fixture.value);
    assert.deepEqual(events,["ACTIVE","generate","PROCESSING","ACTIVE","generate"]);
    assert.equal(reserves,1,"the explicit503 retry reuses the original hold");
  } finally {await fixture.cleanup();}
});

test("terminal Google rejections release one hold and expose the full sanitised diagnostic without claiming billed spend", async () => {
  const fixture=await input(); let reserves=0,releases=0; const waits:number[]=[];
  const mock=transport(call=>call.url.pathname==="/v1beta/interactions" ? response({error:{code:503,status:"UNAVAILABLE",message:`Backend rejected input for project test. API key: ${SECRET}; Bearer hidden-bearer; https://user:password@example.com/video?signature=hidden-signature`,details:[{"@type":"type.googleapis.com/google.rpc.RetryInfo",retryDelay:"2s"}]}},503,{"retry-after":"2","x-request-id":"fixture-request"}) : undefined);
  try {
    await assert.rejects(analyser(mock.fetcher,{sleep:async(ms:number)=>{waits.push(ms);},reserveCost:async()=>({reservationId:`held-${++reserves}`,reservedGbp:0.1}),releaseCost:async(id:string)=>{assert.equal(id,"held-1");releases++;}}).analyse(fixture.value),(error:unknown)=>{
      assert.ok(error instanceof VideoProviderError); assert.equal(error.diagnostic?.stage,"agentic_generation");
      assert.equal(error.diagnostic?.httpStatus,503); assert.equal(error.diagnostic?.providerStatus,"UNAVAILABLE");
      assert.equal(error.diagnostic?.requestId,"fixture-request"); assert.match(error.message,/Backend rejected input for project test/);
      assert.match(JSON.stringify(error.diagnostic?.details),/RetryInfo/);
      for(const privateValue of [SECRET,"hidden-bearer","hidden-signature","user:password"]) assert.ok(!JSON.stringify(error).includes(privateValue));
      assert.equal(error.accounting?.requestAttempts,3);assert.equal(error.accounting?.rejectedAttempts,3);
      assert.equal(error.accounting?.initialReservedCostGbp,0.1);assert.equal(error.accounting?.reservedCostGbp,0);
      assert.equal(error.accounting?.estimatedCostGbp,0);assert.equal(error.accounting?.billedCostGbp,null);
      return true;
    });
    assert.equal(reserves,1);assert.equal(releases,1);assert.deepEqual(waits,[2000,2000]);
  }finally{await fixture.cleanup();}
});

test("a file that becomes FAILED before retry stops generation and releases only its explicitly rejected hold",async()=>{
  const fixture=await input();let polls=0,posts=0,releases=0;
  const mock=transport(call=>{
    if(call.url.pathname===file.uri.replace(HOST,"") && call.init.method!=="DELETE")return response({...file,state:++polls===1?"ACTIVE":"FAILED"});
    if(call.url.pathname==="/v1beta/interactions"){posts++;return response({error:{message:"Temporary rejection"}},503);}
    return undefined;
  });
  try{
    await assert.rejects(analyser(mock.fetcher,{reserveCost:async()=>({reservationId:"file-failed-hold",reservedGbp:0.1}),releaseCost:async()=>{releases++;}}).analyse(fixture.value),(error:unknown)=>{
      assert.ok(error instanceof VideoProviderError);assert.equal(error.diagnostic?.stage,"file_ready");assert.equal(error.accounting?.reservedCostGbp,0);return true;
    });
    assert.equal(posts,1);assert.equal(releases,1);
  }finally{await fixture.cleanup();}
});

test("cancellation during rejected-request backoff releases the known rejected hold and never retries",async()=>{
  const fixture=await input();const signal=new AbortController();let releases=0;
  const mock=transport(call=>call.url.pathname==="/v1beta/interactions"?response({error:{message:"Temporary rejection"}},503):undefined);
  try{
    await assert.rejects(analyser(mock.fetcher,{reserveCost:async()=>({reservationId:"cancelled-hold",reservedGbp:0.1}),releaseCost:async()=>{releases++;},sleep:async()=>{signal.abort();throw new VideoProviderError("unavailable","Gemini request was cancelled.");}}).analyse({...fixture.value,signal:signal.signal}),(error:unknown)=>{
      assert.ok(error instanceof VideoProviderError);assert.equal(error.accounting?.reservedCostGbp,0);return true;
    });
    assert.equal(interactions(mock.calls).length,1);assert.equal(releases,1);
  }finally{await fixture.cleanup();}
});

test("FAILED file payloads preserve the complete sanitised processing diagnostic without generation charges",async()=>{
  const fixture=await input();let reserves=0;
  const mock=transport(call=>call.url.pathname==="/upload/v1beta/files"&&call.url.search?response({file:{...file,state:"FAILED",error:{status:"INVALID_ARGUMENT",message:`Unsupported input audio codec ${SECRET}`,details:[{reason:"UNSUPPORTED_CODEC"}]}}}):undefined);
  try{
    await assert.rejects(analyser(mock.fetcher,{reserveCost:async()=>{reserves++;return{reservationId:"unused",reservedGbp:0.1};}}).analyse(fixture.value),(error:unknown)=>{
      assert.ok(error instanceof VideoProviderError);assert.equal(error.diagnostic?.stage,"file_ready");assert.equal(error.diagnostic?.providerStatus,"INVALID_ARGUMENT");assert.match(error.message,/Unsupported input audio codec/);assert.match(JSON.stringify(error.diagnostic?.details),/UNSUPPORTED_CODEC/);assert.ok(!JSON.stringify(error).includes(SECRET));return true;
    });
    assert.equal(reserves,0);assert.equal(interactions(mock.calls).length,0);
  }finally{await fixture.cleanup();}
});
