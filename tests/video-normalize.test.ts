import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { prepareGeminiVideo } from "../server/video/normalize.js";
import type { StoredVideo } from "../server/video/types.js";

const run = promisify(execFile);
async function fixture(format: "webm" | "mp4", audio = true) {
  const root = await mkdtemp(join(tmpdir(), "exter-normalize-"));
  const path = join(root, `original.${format}`);
  const args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:size=64x48:rate=10"];
  if (audio) args.push("-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000");
  args.push("-t", "1", "-threads", "1", "-filter_threads", "1", "-c:v", format === "webm" ? "libvpx-vp9" : "libx264", "-pix_fmt", "yuv420p");
  if (audio) args.push("-c:a", format === "webm" ? "libopus" : "aac");
  args.push("-y", path);
  try {
    await run("ffmpeg", args, { timeout: 15000, maxBuffer: 1024 * 1024 });
    const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]);
    const bytes = await readFile(path);
    const media: StoredVideo = { mediaId: "a".repeat(64), absolutePath: path, relativePath: `original.${format}`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, mimeType: `video/${format}`, durationSeconds: Number(JSON.parse(stdout).format.duration), storedAt: "2026-11-01T00:00:00.000Z", sourceAdId: "ad", brandId: "brand", sourceUrl: "https://fixture.fbcdn.net/video" };
    return { root, media, bytes, close: () => rm(root, { recursive: true, force: true }) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
test("VP9/Opus WebM becomes a verified H.264/AAC MP4 while the retained original stays immutable", async () => {
  const f = await fixture("webm");
  try {
    const prepared = await prepareGeminiVideo(f.media, { root: f.root });
    assert.equal(prepared.normalization?.applied, true);
    assert.equal(prepared.normalization?.originalSha256, f.media.sha256);
    assert.equal(prepared.normalization?.uploadSha256, prepared.media.sha256);
    assert.notEqual(prepared.media.sha256, f.media.sha256);
    assert.equal(prepared.media.mimeType, "video/mp4");
    assert.notEqual(prepared.media.absolutePath, f.media.absolutePath);
    assert.deepEqual(await readFile(f.media.absolutePath), f.bytes);
    const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", prepared.media.absolutePath]);
    const output = JSON.parse(stdout);
    assert.equal(output.streams.find((stream: any) => stream.codec_type === "video").codec_name, "h264");
    assert.equal(output.streams.find((stream: any) => stream.codec_type === "video").pix_fmt, "yuv420p");
    assert.equal(output.streams.find((stream: any) => stream.codec_type === "audio").codec_name, "aac");
    assert.ok(Math.abs(Number(output.format.duration) - f.media.durationSeconds) <= 0.15);
    const firstStat = await stat(prepared.media.absolutePath);
    await new Promise<void>(resolve => setImmediate(resolve));
    const cached = await prepareGeminiVideo(f.media, { root: f.root });
    assert.equal(cached.media.absolutePath, prepared.media.absolutePath);
    assert.equal((await stat(cached.media.absolutePath)).mtimeMs, firstStat.mtimeMs, "a restart-safe cache reuses verified output without transcoding");
    assert.deepEqual(cached.normalization, prepared.normalization);
  } finally { await f.close(); }
});
test("compatible H.264/AAC MP4 and silent MP4 pass through without copying or adding audio", async () => {
  for (const audio of [true, false]) {
    const f = await fixture("mp4", audio);
    try {
      const prepared = await prepareGeminiVideo(f.media, { root: f.root });
      assert.equal(prepared.media.absolutePath, f.media.absolutePath);
      assert.equal(prepared.media.sha256, f.media.sha256);
      assert.equal(prepared.normalization?.applied, false);
      assert.equal(prepared.normalization?.audioCodec, audio ? "aac" : null);
      assert.deepEqual(await readdir(f.root), ["original.mp4"]);
    } finally { await f.close(); }
  }
});
test("normalization rejects changed source or cached bytes before they can become Gemini input", async () => {
  const f = await fixture("webm");
  try {
    const prepared = await prepareGeminiVideo(f.media, { root: f.root });
    await writeFile(prepared.media.absolutePath, Buffer.alloc(prepared.media.bytes));
    await assert.rejects(prepareGeminiVideo(f.media, { root: f.root }), /cache failed integrity/);
    assert.deepEqual(await readFile(f.media.absolutePath), f.bytes);
    await writeFile(f.media.absolutePath, Buffer.alloc(f.media.bytes));
    await assert.rejects(prepareGeminiVideo(f.media, { root: f.root }), /source checksum changed/);
  } finally { await f.close(); }
});
test("bounded transcode failure leaves the original reusable and removes temporary upload files", async () => {
  const f = await fixture("webm");
  try {
    await assert.rejects(prepareGeminiVideo(f.media, { root: f.root, timeoutMs: 1 }), /normalization failed or timed out/);
    assert.deepEqual(await readFile(f.media.absolutePath), f.bytes);
    const files = await readdir(join(f.root, "normalized-videos", "exter-video-normalize-v1"));
    assert.deepEqual(files, []);
    const repaired = await prepareGeminiVideo(f.media, { root: f.root });
    assert.equal(repaired.normalization?.applied, true);
  } finally { await f.close(); }
});
test("a valid but truncated cached MP4 is rejected even when its saved checksum matches", async () => {
  const f = await fixture("webm");
  try {
    const prepared = await prepareGeminiVideo(f.media, { root: f.root });
    const shortened = join(f.root, "shortened.mp4");
    await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", prepared.media.absolutePath, "-t", "0.6", "-c:v", "libx264", "-c:a", "aac", "-threads", "1", "-filter_threads", "1", "-y", shortened]);
    const shortenedBytes = await readFile(shortened);
    const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", shortened]);
    const duration = Number(JSON.parse(stdout).format.duration);
    assert.ok(f.media.durationSeconds - duration > 0.15);
    await writeFile(prepared.media.absolutePath, shortenedBytes);
    const manifestPath = join(f.root, "normalized-videos", "exter-video-normalize-v1", `${f.media.sha256}.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, uploadSha256: createHash("sha256").update(shortenedBytes).digest("hex"), uploadBytes: shortenedBytes.length, durationSeconds: duration }));
    await assert.rejects(prepareGeminiVideo(f.media, { root: f.root }), /cache failed integrity/);
    assert.deepEqual(await readFile(f.media.absolutePath), f.bytes);
  } finally { await f.close(); }
});
