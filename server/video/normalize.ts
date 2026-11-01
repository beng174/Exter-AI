import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { link, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { VideoNormalization } from "../../shared/video-analysis.js";
import { MediaStorageError } from "./media.js";
import type { StoredVideo } from "./types.js";

const run = promisify(execFile);
const VERSION = "exter-video-normalize-v1" as const;
const HASH = /^[a-f0-9]{64}$/;
const DEFAULT_MAX_BYTES = 250 * 1024 * 1024;
interface Encoding {
  durationSeconds: number;
  videoCodec: string;
  audioCodec: string | null;
  pixelFormat: string;
  mp4: boolean;
  videoTracks: number;
  audioTracks: number;
  frameRate: number | null;
}
interface CachedEncoding {
  version: typeof VERSION;
  originalSha256: string;
  uploadSha256: string;
  uploadBytes: number;
  durationSeconds: number;
  audioCodec: "aac" | null;
}
export interface PreparedGeminiVideo { media: StoredVideo; normalization?: VideoNormalization }
export interface VideoNormalizationOptions {
  root?: string;
  timeoutMs?: number;
  maxBytes?: number;
}
const inFlight = new Map<string, Promise<CachedEncoding>>();
// Render's web service also owns Gemini requests. Limit CPU/memory use to one
// ffmpeg transcode at a time while cached/pass-through inputs remain concurrent.
let transcodes: Promise<unknown> = Promise.resolve();

async function checksum(path: string, maxBytes: number) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxBytes)
    throw new MediaStorageError("Video normalization input or cache failed file/size verification.", 409, "media_normalization_invalid");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { bytes: stat.size, sha256: hash.digest("hex") };
}
async function probe(path: string): Promise<Encoding> {
  let stdout: string;
  try {
    ({ stdout } = await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-print_format", "json", "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate", path], { encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 }));
  } catch (error) {
    throw new MediaStorageError((error as NodeJS.ErrnoException).code === "ENOENT" ? "ffprobe is required to check the Gemini upload format." : "The stored video's codecs could not be verified before Gemini upload.", 503, "media_normalization_probe_failed");
  }
  try {
    const info = JSON.parse(stdout);
    const streams = Array.isArray(info.streams) ? info.streams : [];
    const videos = streams.filter((stream: Record<string, unknown>) => stream.codec_type === "video");
    const audios = streams.filter((stream: Record<string, unknown>) => stream.codec_type === "audio");
    const durationSeconds = Number(info.format?.duration);
    const video = videos[0];
    if (!video || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 601 || !Number.isInteger(video.width) || video.width <= 0 || !Number.isInteger(video.height) || video.height <= 0 || video.width * video.height > 40_000_000) throw new Error();
    const [rateNumerator, rateDenominator] = String(video.avg_frame_rate || video.r_frame_rate || "0/0").split("/").map(Number);
    const rate = rateNumerator / rateDenominator;
    const frameRate = Number.isFinite(rate) && rate > 0 ? rate : null;
    return { durationSeconds, frameRate, videoCodec: video.codec_name || "unknown", pixelFormat: video.pix_fmt || "unknown", audioCodec: audios[0]?.codec_name || null, mp4: String(info.format?.format_name || "").split(",").includes("mp4"), videoTracks: videos.length, audioTracks: audios.length };
  } catch {
    throw new MediaStorageError("The stored video has unsupported dimensions, duration or stream metadata.", 422, "media_normalization_invalid");
  }
}
const compatible = (encoding: Encoding) => encoding.mp4 && encoding.videoCodec === "h264" && encoding.pixelFormat === "yuv420p" && (encoding.audioCodec === null || encoding.audioCodec === "aac") && encoding.videoTracks === 1 && encoding.audioTracks <= 1;

async function cached(path: string, manifestPath: string, media: StoredVideo, maxBytes: number, durationTolerance: number): Promise<CachedEncoding | null> {
  try {
    const manifestStat = await lstat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 16000) throw new Error();
    const metadata = JSON.parse(await readFile(manifestPath, "utf8")) as CachedEncoding;
    if (metadata.version !== VERSION || metadata.originalSha256 !== media.sha256 || !HASH.test(metadata.uploadSha256) || !Number.isSafeInteger(metadata.uploadBytes) || metadata.uploadBytes <= 0 || !Number.isFinite(metadata.durationSeconds) || (metadata.audioCodec !== null && metadata.audioCodec !== "aac")) throw new Error();
    const actual = await checksum(path, maxBytes);
    if (actual.sha256 !== metadata.uploadSha256 || actual.bytes !== metadata.uploadBytes) throw new Error();
    const encoding = await probe(path);
    if (!compatible(encoding) || Math.abs(encoding.durationSeconds - metadata.durationSeconds) > 0.05 || Math.abs(encoding.durationSeconds - media.durationSeconds) > durationTolerance || encoding.audioCodec !== metadata.audioCodec) throw new Error();
    return metadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof MediaStorageError) throw error;
    throw new MediaStorageError("The normalized-video cache failed integrity verification; the original video is preserved.", 409, "media_normalization_corrupt");
  }
}
async function transcode(media: StoredVideo, path: string, manifestPath: string, root: string, maxBytes: number, timeoutMs: number, durationTolerance: number) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = resolve(root, `.normalize-${randomUUID()}.mp4`);
  const temporaryManifest = resolve(root, `.normalize-${randomUUID()}.json`);
  try {
    // Only the retained local file is an input. Network protocols, subtitles,
    // additional streams and identifying metadata are not copied into the upload.
    try {
      await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-i", media.absolutePath,
        "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-threads", "2", "-filter_threads", "1", "-max_muxing_queue_size", "1024", "-t", String(media.durationSeconds + 0.5), "-fs", String(maxBytes), "-y", temporary],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 });
    } catch (error) {
      throw new MediaStorageError((error as NodeJS.ErrnoException).code === "ENOENT" ? "ffmpeg is required to normalize this video before Gemini upload." : "Video normalization failed or timed out. The original retained video was preserved and no Gemini inference was started.", 503, "media_normalization_failed");
    }
    const encoding = await probe(temporary);
    const digest = await checksum(temporary, maxBytes);
    if (!compatible(encoding) || Math.abs(encoding.durationSeconds - media.durationSeconds) > durationTolerance)
      throw new MediaStorageError("Normalized video did not preserve a playable complete ad. No Gemini inference was started.", 422, "media_normalization_invalid");
    const metadata: CachedEncoding = { version: VERSION, originalSha256: media.sha256, uploadSha256: digest.sha256, uploadBytes: digest.bytes, durationSeconds: encoding.durationSeconds, audioCodec: encoding.audioCodec as "aac" | null };
    try { await link(temporary, path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await checksum(path, maxBytes);
      if (existing.sha256 !== digest.sha256 || existing.bytes !== digest.bytes) throw new MediaStorageError("Existing normalized video failed integrity verification; source media was preserved.", 409, "media_normalization_corrupt");
    }
    await writeFile(temporaryManifest, JSON.stringify(metadata) + "\n", { flag: "wx", mode: 0o600 });
    try { await link(temporaryManifest, manifestPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return (await cached(path, manifestPath, media, maxBytes, durationTolerance))!;
  } finally {
    await Promise.all([temporary, temporaryManifest].map(file => unlink(file).catch(() => {})));
  }
}

/** Prepare a verified MP4/H.264/AAC upload without changing the original input. */
export async function prepareGeminiVideo(media: StoredVideo, options: VideoNormalizationOptions = {}): Promise<PreparedGeminiVideo> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? 300000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600000 || !HASH.test(media.sha256) || !Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0 || media.durationSeconds > 600)
    throw new MediaStorageError("Video normalization settings or source metadata are invalid.", 400, "media_normalization_invalid");
  const source = await checksum(media.absolutePath, maxBytes);
  if (source.sha256 !== media.sha256 || source.bytes !== media.bytes)
    throw new MediaStorageError("The retained source checksum changed before normalization.", 409, "media_corrupt");
  const encoding = await probe(media.absolutePath);
  // Allow AAC/frame boundary padding, never the old half-second truncation.
  const durationTolerance = Math.min(0.15, Math.max(0.1, encoding.frameRate ? 2 / encoding.frameRate : 0.1));
  if (Math.abs(encoding.durationSeconds - media.durationSeconds) > durationTolerance)
    throw new MediaStorageError("The retained source duration changed before normalization.", 409, "media_corrupt");
  if (media.mimeType === "video/mp4" && compatible(encoding)) {
    return { media, normalization: { version: VERSION, applied: false, originalSha256: media.sha256, uploadSha256: media.sha256, originalMimeType: media.mimeType, uploadMimeType: "video/mp4", originalBytes: media.bytes, uploadBytes: media.bytes, videoCodec: "h264", audioCodec: encoding.audioCodec as "aac" | null, pixelFormat: "yuv420p", durationSeconds: media.durationSeconds } };
  }
  const root = resolve(options.root || process.env.MEDIA_STORAGE_PATH || process.env.EXTER_MEDIA_ROOT || ".data/media", "normalized-videos", VERSION);
  const path = resolve(root, `${media.sha256}.mp4`);
  const manifestPath = resolve(root, `${media.sha256}.json`);
  let normalized = await cached(path, manifestPath, media, maxBytes, durationTolerance);
  if (!normalized) {
    let pending = inFlight.get(path);
    if (!pending) {
      pending = transcodes.then(() => transcode(media, path, manifestPath, root, maxBytes, timeoutMs, durationTolerance));
      transcodes = pending.catch(() => {});
      inFlight.set(path, pending);
      void pending.finally(() => { if (inFlight.get(path) === pending) inFlight.delete(path); }).catch(() => {});
    }
    normalized = await pending;
  }
  const normalization: VideoNormalization = { version: VERSION, applied: true, originalSha256: media.sha256, uploadSha256: normalized.uploadSha256, originalMimeType: media.mimeType, uploadMimeType: "video/mp4", originalBytes: media.bytes, uploadBytes: normalized.uploadBytes, videoCodec: "h264", audioCodec: normalized.audioCodec, pixelFormat: "yuv420p", durationSeconds: normalized.durationSeconds };
  return { media: { ...media, absolutePath: path, relativePath: `normalized-videos/${VERSION}/${media.sha256}.mp4`, sha256: normalized.uploadSha256, bytes: normalized.uploadBytes, mimeType: "video/mp4", durationSeconds: normalized.durationSeconds }, normalization };
}
