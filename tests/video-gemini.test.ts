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

test("Static fallback gives the first five seconds 5 FPS and the remainder 1 FPS in the same structured call", async () => {
  const fixture = await input();
  const mock = transport();
  try {
    const result = await analyser(mock.fetcher).analyse({ ...fixture.value, processingMode: "static-high-fps-hook" });
    const body = JSON.parse(String(interactions(mock.calls)[0].init.body));
    assert.deepEqual(body.input.slice(0, 2).map((part: any) => part.processing), [
      { type: "static", start_offset: "0s", end_offset: "5s", fps: 5 },
      { type: "static", start_offset: "5s", end_offset: "12s", fps: 1 },
    ]);
    assert.equal(interactions(mock.calls).length, 1);
    assert.equal(result.coverage.fullVideo, true);
    assert.equal(result.processingMode, "static-high-fps-hook");
    const short = await input(2.5);
    try {
      const shortMock = transport();
      await analyser(shortMock.fetcher).analyse({ ...short.value, processingMode: "static-high-fps-hook" });
      const shortBody = JSON.parse(String(interactions(shortMock.calls)[0].init.body));
      assert.equal(shortBody.input.length, 2, "one short native video segment plus the prompt");
      assert.equal(shortBody.input[0].processing.end_offset, "2.5s");
    } finally { await short.cleanup(); }
  } finally { await fixture.cleanup(); }
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
      assert.equal(interactions(mock.calls).length, 1, "the provider never silently retries paid inference");
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
    assert.equal(sleeps, 2);
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
