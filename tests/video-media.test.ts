import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { LocalVideoMediaStore, MediaStorageError, type VideoMediaOptions } from "../server/video/media.js";

const video = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(100)]);
const remote = "https://video.example.com/ad.mp4?signature=SECRET-DO-NOT-PERSIST";
const dns: NonNullable<VideoMediaOptions["resolve"]> = async () => [{ address: "8.8.8.8", family: 4 }];
const validProbe: NonNullable<VideoMediaOptions["probe"]> = async () => ({ hasVideo: true, durationSeconds: 8 });
const response = (body: Uint8Array = video, headers: Record<string, string> = {}) => new Response(new Uint8Array(body), { headers: { "Content-Type": "video/mp4", ...headers } });
function options(root: string, extra: VideoMediaOptions = {}): VideoMediaOptions {
  return { root, allowedHosts: ["video.example.com"], resolve: dns, fetch: async () => response(), probe: validProbe, now: () => new Date("2026-10-30T00:00:00Z"), ...extra };
}
const request = { adId: "ad-native-123", brandId: "brand-one", sourceUrl: remote };
async function temporary() { return mkdtemp(join(tmpdir(), "exter-video-media-")); }

test("downloaded video is immutable, hashed and reusable after restart without a remote URL", async () => {
  const root = await temporary();
  let calls = 0;
  try {
    const store = new LocalVideoMediaStore(options(root, { fetch: async () => { calls++; return response(); } }));
    const saved = await store.store(request);
    assert.equal(saved.sha256, createHash("sha256").update(video).digest("hex"));
    assert.equal(saved.bytes, video.length);
    assert.equal(saved.durationSeconds, 8);
    assert.equal(saved.sourceAdId, request.adId);
    assert.equal(saved.brandId, request.brandId);
    assert.equal(saved.sourceUrl, "https://video.example.com/ad.mp4");
    assert.equal(saved.storedAt, "2026-10-30T00:00:00.000Z");
    assert.deepEqual(await readFile(saved.absolutePath), video);
    const manifest = await readFile(join(root, "records", saved.mediaId + ".json"), "utf8");
    assert.ok(!manifest.includes("SECRET"));
    const restarted = new LocalVideoMediaStore(options(root, {
      fetch: async () => { throw new Error("Must not fetch an expired source"); },
      resolve: async () => { throw new Error("No DNS needed for verified local media"); },
    }));
    assert.deepEqual(await restarted.store({ adId: request.adId, brandId: request.brandId }), saved);
    assert.deepEqual(await restarted.load(saved.mediaId), saved);
    assert.equal(calls, 1);
    assert.equal((await readdir(join(root, "objects"))).length, 1);
    assert.equal((await readdir(join(root, "records"))).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the same immutable bytes keep separate media ownership for different workspaces", async () => {
  const root = await temporary();
  try {
    const store = new LocalVideoMediaStore(options(root));
    const first = await store.store(request);
    const second = await store.store({ ...request, brandId: "brand-two" });
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.absolutePath, second.absolutePath);
    assert.notEqual(first.mediaId, second.mediaId);
    assert.equal((await store.load(first.mediaId))!.brandId, "brand-one");
    assert.equal((await store.load(second.mediaId))!.brandId, "brand-two");
    assert.equal((await readdir(join(root, "objects"))).length, 1);
    assert.equal((await readdir(join(root, "records"))).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unapproved, credentialed and mixed public/private hosts are rejected before download", async () => {
  const root = await temporary();
  let calls = 0;
  try {
    const store = new LocalVideoMediaStore(options(root, { fetch: async () => { calls++; return response(); } }));
    for (const sourceUrl of ["http://video.example.com/ad.mp4", "https://video.example.com.evil.com/ad.mp4", "https://user:pass@video.example.com/ad.mp4", "https://127.0.0.1/ad.mp4", "https://video.example.com:444/ad.mp4"])
      await assert.rejects(() => store.store({ ...request, sourceUrl }), /approved public HTTPS/);
    const mixed = new LocalVideoMediaStore(options(root, { fetch: async () => { calls++; return response(); }, resolve: async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }] }));
    await assert.rejects(() => mixed.store(request), /private, local/);
    const ipv6 = new LocalVideoMediaStore(options(root, { resolve: async () => [{ address: "::ffff:127.0.0.1", family: 6 }] }));
    await assert.rejects(() => ipv6.store(request), /private, local/);
    assert.equal(calls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("redirects are revalidated and cannot reach an unapproved or private host", async () => {
  const root = await temporary();
  let calls = 0;
  try {
    const store = new LocalVideoMediaStore(options(root, { fetch: async (_url, init) => {
      calls++;
      assert.equal(init?.redirect, "manual");
      assert.equal(new Headers(init?.headers).has("Authorization"), false);
      return new Response(null, { status: 302, headers: { Location: "https://private.example.com/ad.mp4" } });
    } }));
    await assert.rejects(() => store.store(request), /approved public HTTPS/);
    assert.equal(calls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("HTML, oversized streams, invalid containers and invalid durations leave no partial objects", async () => {
  const root = await temporary();
  try {
    const cases: { extra: VideoMediaOptions; match: RegExp }[] = [
      { extra: { fetch: async () => new Response("<html>not video</html>", { headers: { "Content-Type": "text/html" } }) }, match: /accepted video content type/ },
      { extra: { maxBytes: 20 }, match: /size limit/ },
      { extra: { maxBytes: 20, fetch: async () => response(video, { "Content-Length": "100000" }) }, match: /size limit/ },
      { extra: { fetch: async () => response(Buffer.from("<html>fake mp4</html>")) }, match: /supported video container/ },
      { extra: { probe: async () => ({ hasVideo: false, durationSeconds: 8 }) }, match: /verifiable video stream/ },
      { extra: { probe: async () => ({ hasVideo: true, durationSeconds: NaN }) }, match: /verifiable video stream/ },
      { extra: { maxDurationSeconds: 5 }, match: /duration limit/ },
    ];
    for (const { extra, match } of cases) {
      await assert.rejects(() => new LocalVideoMediaStore(options(root, extra)).store(request), match);
      for (const dir of ["objects", "records", "refs"])
        assert.deepEqual(await readdir(join(root, dir)).catch(() => []), []);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed source refresh retains the original media and source errors never reveal signed URLs", async () => {
  const root = await temporary();
  try {
    const original = await new LocalVideoMediaStore(options(root)).store(request);
    const failing = new LocalVideoMediaStore(options(root, { fetch: async () => { throw new Error(remote); } }));
    await assert.rejects(() => failing.store({ ...request, forceDownload: true }), (error: unknown) => {
      assert.ok(error instanceof MediaStorageError);
      assert.ok(!error.message.includes("SECRET"));
      assert.ok(!error.message.includes("https://"));
      return true;
    });
    assert.deepEqual(await failing.load(original.mediaId), original);
    assert.deepEqual(await failing.store({ adId: request.adId, brandId: request.brandId }), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stored bytes and scoped manifests are integrity-checked before reuse", async () => {
  const root = await temporary();
  try {
    const store = new LocalVideoMediaStore(options(root));
    const original = await store.store(request);
    await writeFile(original.absolutePath, Buffer.alloc(video.length));
    await assert.rejects(() => store.load(original.mediaId), /integrity verification/);
    await assert.rejects(() => store.store({ adId: request.adId, brandId: request.brandId }), /integrity verification/);
    await assert.rejects(() => store.load("../../other"), /SHA-256/);
    await writeFile(original.absolutePath, video);
    const manifestPath = join(root, "records", original.mediaId + ".json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, relativePath: "../../private" }));
    await assert.rejects(() => store.load(original.mediaId), /metadata could not be verified/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("actual ffprobe verifies a generated local MP4 before storage", async (t) => {
  const available = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  const probeAvailable = spawnSync("ffprobe", ["-version"], { encoding: "utf8" });
  if (available.error?.message.includes("EPERM") || probeAvailable.error?.message.includes("EPERM"))
    throw new Error("Subprocess permission is required for the real media verification test.");
  if (available.status !== 0 || probeAvailable.status !== 0) { t.skip("ffmpeg and ffprobe are required for this integration check"); return; }
  const root = await temporary();
  try {
    const sample = join(root, "fixture.mp4");
    const generated = spawnSync("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.4:r=5", "-an", "-c:v", "mpeg4", "-y", sample], { encoding: "utf8" });
    if (generated.error) throw generated.error;
    assert.equal(generated.status, 0, generated.stderr);
    const bytes = await readFile(sample);
    const store = new LocalVideoMediaStore({ root: join(root, "media"), allowedHosts: ["video.example.com"], resolve: dns, fetch: async () => response(bytes) });
    const saved = await store.store(request);
    assert.ok(saved.durationSeconds >= 0.39 && saved.durationSeconds <= 0.41);
    assert.deepEqual(await readFile(saved.absolutePath), bytes);
    assert.equal(saved.bytes, bytes.length);
  } finally { await rm(root, { recursive: true, force: true }); }
});
