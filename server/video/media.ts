import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createReadStream } from "node:fs";
import { link, lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertProxySupport } from "../connectors/http.js";
import type { StoredVideo, VideoMediaStore } from "./types.js";
export type { StoredVideo, VideoMediaStore } from "./types.js";
export interface VideoMediaRequest {
  adId: string;
  brandId: string;
  sourceUrl?: string;
  forceDownload?: boolean;
  signal?: AbortSignal;
}
export interface VideoProbe {
  durationSeconds: number;
  hasVideo: boolean;
}
export interface VideoMediaOptions {
  root?: string;
  allowedHosts?: string[];
  maxBytes?: number;
  maxDurationSeconds?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
  resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  probe?: (absolutePath: string) => Promise<VideoProbe>;
  now?: () => Date;
}
export class MediaStorageError extends Error {
  constructor(message: string, public status = 400, public code = "media_invalid") {
    super(message);
  }
}
const run = promisify(execFile);
const DEFAULT_BYTES = 250 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const MIME_EXTENSIONS = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" } as const;
type VideoMimeType = keyof typeof MIME_EXTENSIONS;
const scopedMediaId = (brandId: string, adId: string, sha256: string) => createHash("sha256").update(JSON.stringify([brandId, adId, sha256])).digest("hex");
const nativeResolve: NonNullable<VideoMediaOptions["resolve"]> = (hostname) => lookup(hostname, { all: true, verbatim: true });

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{0,3}:/i.test(address) && !/^2001:db8:/i.test(address);
}
function safeHosts(input: string[]) {
  if (!input.length || input.some((host) => !/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)))
    throw new MediaStorageError("Configure explicit public media hosts, optionally with a leading *. subdomain wildcard.");
  return input.map((host) => host.toLowerCase());
}
function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new MediaStorageError(`${label} must be positive.`);
  return value;
}
function sniff(bytes: Uint8Array): VideoMimeType | null {
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp")
    return buffer.toString("ascii", 8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3) return "video/webm";
  return null;
}
export async function probeVideoFile(absolutePath: string): Promise<VideoProbe> {
  let stdout: string;
  try {
    ({ stdout } = await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-print_format", "json", "-show_format", "-show_streams", absolutePath], {
      encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024,
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new MediaStorageError("ffprobe is required to verify stored video media.", 503, "media_probe_unavailable");
    throw new MediaStorageError("Downloaded media could not be verified as a playable video.", 422, "media_probe_failed");
  }
  try {
    const parsed = JSON.parse(stdout);
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const video = streams.find((stream: Record<string, unknown>) => stream.codec_type === "video");
    const durationSeconds = Number(parsed.format?.duration || video?.duration);
    return { hasVideo: Boolean(video), durationSeconds };
  } catch {
    throw new MediaStorageError("Video verification returned invalid metadata.", 422, "media_probe_failed");
  }
}

/** Durable local volume implementation; references retain media after provider URLs expire. */
export class LocalVideoMediaStore implements VideoMediaStore {
  readonly root: string;
  private readonly hosts: string[];
  private readonly maxBytes: number;
  private readonly maxDuration: number;
  private readonly timeoutMs: number;
  private readonly resolver: NonNullable<VideoMediaOptions["resolve"]>;
  constructor(private readonly options: VideoMediaOptions = {}) {
    this.root = resolve(options.root || process.env.EXTER_MEDIA_ROOT || ".data/media");
    this.hosts = safeHosts(options.allowedHosts || (process.env.EXTER_MEDIA_ALLOWED_HOSTS
      ? process.env.EXTER_MEDIA_ALLOWED_HOSTS.split(",").map((value) => value.trim()).filter(Boolean)
      : ["*.fbcdn.net"]));
    this.maxBytes = positive(options.maxBytes ?? DEFAULT_BYTES, "Maximum media size");
    this.maxDuration = positive(options.maxDurationSeconds ?? 600, "Maximum video duration");
    this.timeoutMs = positive(options.timeoutMs ?? 120000, "Media download timeout");
    this.resolver = options.resolve || nativeResolve;
  }
  private async checkedUrl(raw: string) {
    let url: URL;
    try { url = new URL(raw); }
    catch { throw new MediaStorageError("Provide a valid public HTTPS video URL."); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(host) ||
      !this.hosts.some((allowed) => allowed.startsWith("*.") ? host.endsWith(allowed.slice(1)) && host !== allowed.slice(2) : host === allowed) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|invalid)$/.test(host))
      throw new MediaStorageError("Video downloads accept only approved public HTTPS media hosts without credentials.");
    let addresses: { address: string; family: number }[];
    try { addresses = await this.resolver(host); }
    catch { throw new MediaStorageError("The video media host could not be resolved.", 502, "media_source_unavailable"); }
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
      throw new MediaStorageError("The media host resolves to a private, local or unsupported address.");
    url.hash = "";
    return url;
  }
  private async digest(path: string) {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > this.maxBytes)
      throw new MediaStorageError("Stored video integrity verification failed.", 409, "media_corrupt");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return { sha256: hash.digest("hex"), bytes: stat.size };
  }
  async load(mediaId: string): Promise<StoredVideo | null> {
    if (!HASH.test(mediaId)) throw new MediaStorageError("Media identifier must be a SHA-256 digest.");
    const manifestPath = resolve(this.root, "records", `${mediaId}.json`);
    let raw: string;
    try {
      const stat = await lstat(manifestPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20000) throw new Error();
      raw = await readFile(manifestPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new MediaStorageError("Stored media metadata could not be verified.", 409, "media_corrupt");
    }
    let manifest: Omit<StoredVideo, "absolutePath">;
    try {
      manifest = JSON.parse(raw);
      const extension = MIME_EXTENSIONS[manifest.mimeType as VideoMimeType];
      if (manifest.mediaId !== mediaId || !HASH.test(manifest.sha256) || !extension ||
        manifest.relativePath !== `objects/${manifest.sha256}.${extension}` ||
        !Number.isInteger(manifest.bytes) || manifest.bytes <= 0 ||
        !Number.isFinite(manifest.durationSeconds) || manifest.durationSeconds <= 0 || manifest.durationSeconds > this.maxDuration ||
        typeof manifest.storedAt !== "string" || !Number.isFinite(Date.parse(manifest.storedAt)) ||
        typeof manifest.sourceAdId !== "string" || typeof manifest.brandId !== "string" ||
        mediaId !== scopedMediaId(manifest.brandId, manifest.sourceAdId, manifest.sha256) ||
        typeof manifest.sourceUrl !== "string") throw new Error();
    } catch { throw new MediaStorageError("Stored media metadata could not be verified.", 409, "media_corrupt"); }
    const absolutePath = resolve(this.root, manifest.relativePath);
    try {
      const verified = await this.digest(absolutePath);
      if (verified.sha256 !== manifest.sha256 || verified.bytes !== manifest.bytes) throw new Error();
    } catch { throw new MediaStorageError("Stored video integrity verification failed.", 409, "media_corrupt"); }
    return { ...manifest, absolutePath };
  }
  async store(request: VideoMediaRequest): Promise<StoredVideo> {
    if (typeof request.adId !== "string" || !request.adId || request.adId.length > 300 ||
      typeof request.brandId !== "string" || !request.brandId || request.brandId.length > 200)
      throw new MediaStorageError("Choose an ad and brand workspace before storing its video.");
    const referenceId = createHash("sha256").update(JSON.stringify([request.brandId, request.adId])).digest("hex");
    const referencePath = resolve(this.root, "refs", `${referenceId}.json`);
    if (!request.forceDownload) {
      try {
        const ref = JSON.parse(await readFile(referencePath, "utf8"));
        if (ref.brandId !== request.brandId || ref.adId !== request.adId) throw new Error();
        const saved = await this.load(ref.mediaId);
        if (saved) {
          if (saved.sourceAdId !== request.adId || saved.brandId !== request.brandId) throw new Error();
          return saved;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          if (error instanceof MediaStorageError) throw error;
          throw new MediaStorageError("Stored ad media reference is invalid; previous media was preserved.", 409, "media_corrupt");
        }
      }
    }
    if (typeof request.sourceUrl !== "string" || !request.sourceUrl || request.sourceUrl.length > 20000)
      throw new MediaStorageError("A public video URL is required when no verified local video is stored.");
    assertProxySupport(Boolean(this.options.fetch), process.env);
    const signal = AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(request.signal ? [request.signal] : [])]);
    signal.throwIfAborted();
    let url = await this.checkedUrl(request.sourceUrl);
    let response: Response | undefined;
    for (let redirects = 0; redirects <= 3; redirects++) {
      try {
        response = await (this.options.fetch || fetch)(url, { redirect: "manual", signal, headers: { Accept: "video/mp4,video/webm,video/quicktime,application/octet-stream" } });
      } catch { throw new MediaStorageError(signal.aborted ? "Video download timed out or was cancelled." : "The public video source could not be reached.", signal.aborted ? 504 : 502, "media_source_unavailable"); }
      if (response.status >= 300 && response.status < 400) {
        const target = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!target || redirects === 3) throw new MediaStorageError("Video source returned too many or invalid redirects.", 502, "media_source_unavailable");
        let next: string;
        try { next = new URL(target, url).href; }
        catch { throw new MediaStorageError("Video source returned an invalid redirect.", 502, "media_source_unavailable"); }
        url = await this.checkedUrl(next);
        continue;
      }
      break;
    }
    if (!response?.ok || !response.body) {
      await response?.body?.cancel().catch(() => {});
      throw new MediaStorageError("The public video source is unavailable; any previously stored media was preserved.", 502, "media_source_unavailable");
    }
    const declared = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!["video/mp4", "video/webm", "video/quicktime", "application/octet-stream"].includes(declared)) {
      await response.body.cancel().catch(() => {});
      throw new MediaStorageError("The video source did not return an accepted video content type.", 422, "media_not_video");
    }
    const declaredBytes = Number(response.headers.get("content-length") || 0);
    if (declaredBytes > this.maxBytes) {
      await response.body.cancel().catch(() => {});
      throw new MediaStorageError("Video exceeds the configured media size limit.", 413, "media_too_large");
    }
    await mkdir(resolve(this.root, "objects"), { recursive: true, mode: 0o700 });
    await mkdir(resolve(this.root, "records"), { recursive: true, mode: 0o700 });
    await mkdir(resolve(this.root, "refs"), { recursive: true, mode: 0o700 });
    const temporary = resolve(this.root, "objects", `.download-${randomUUID()}.tmp`);
    const temporaries = new Set([temporary]);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    const reader = response.body.getReader();
    const hash = createHash("sha256");
    let bytes = 0;
    const prefix: Uint8Array[] = [];
    let prefixBytes = 0;
    try {
      handle = await open(temporary, "wx", 0o600);
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > this.maxBytes) throw new MediaStorageError("Video exceeds the configured media size limit.", 413, "media_too_large");
        if (prefixBytes < 32) { prefix.push(chunk.value.subarray(0, 32 - prefixBytes)); prefixBytes += Math.min(chunk.value.byteLength, 32 - prefixBytes); }
        hash.update(chunk.value);
        await handle.writeFile(chunk.value);
      }
      await handle.sync();
      await handle.close();
      handle = undefined;
      const mimeType = sniff(Buffer.concat(prefix));
      if (!bytes || !mimeType || (declared !== "application/octet-stream" && mimeType !== declared))
        throw new MediaStorageError("Downloaded content does not match a supported video container.", 422, "media_not_video");
      const probe = await (this.options.probe || probeVideoFile)(temporary);
      if (!probe.hasVideo || !Number.isFinite(probe.durationSeconds) || probe.durationSeconds <= 0)
        throw new MediaStorageError("Downloaded content has no verifiable video stream or duration.", 422, "media_not_video");
      if (probe.durationSeconds > this.maxDuration)
        throw new MediaStorageError("Video exceeds the configured duration limit.", 413, "media_too_long");
      const sha256 = hash.digest("hex");
      const mediaId = scopedMediaId(request.brandId, request.adId, sha256);
      const relativePath = `objects/${sha256}.${MIME_EXTENSIONS[mimeType]}`;
      const absolutePath = resolve(this.root, relativePath);
      try { await link(temporary, absolutePath); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const previous = await this.digest(absolutePath);
        if (previous.sha256 !== sha256 || previous.bytes !== bytes)
          throw new MediaStorageError("Existing content-addressed media failed integrity verification.", 409, "media_corrupt");
      }
      const sanitizedSource = new URL(url.origin + url.pathname).href;
      const manifest: Omit<StoredVideo, "absolutePath"> = {
        mediaId, relativePath, sha256, bytes, mimeType,
        durationSeconds: probe.durationSeconds,
        storedAt: (this.options.now || (() => new Date()))().toISOString(),
        sourceAdId: request.adId, brandId: request.brandId, sourceUrl: sanitizedSource,
      };
      const manifestPath = resolve(this.root, "records", `${mediaId}.json`);
      const manifestTemporary = resolve(this.root, "records", `.manifest-${randomUUID()}.tmp`);
      temporaries.add(manifestTemporary);
      await writeFile(manifestTemporary, JSON.stringify(manifest) + "\n", { flag: "wx", mode: 0o600 });
      try { await link(manifestTemporary, manifestPath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      const saved = await this.load(mediaId);
      if (!saved) throw new MediaStorageError("Video storage could not be completed.", 500, "media_storage_failed");
      const referenceTemporary = resolve(dirname(referencePath), `.reference-${randomUUID()}.tmp`);
      temporaries.add(referenceTemporary);
      await writeFile(referenceTemporary, JSON.stringify({ brandId: request.brandId, adId: request.adId, mediaId }) + "\n", { flag: "wx", mode: 0o600 });
      await rename(referenceTemporary, referencePath);
      return saved;
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (error instanceof MediaStorageError) throw error;
      throw new MediaStorageError(signal.aborted ? "Video download timed out or was cancelled." : "Video could not be stored safely; existing media was preserved.", signal.aborted ? 504 : 500, "media_storage_failed");
    } finally {
      await handle?.close().catch(() => {});
      reader.releaseLock();
      await Promise.all([...temporaries].map((path) => unlink(path).catch(() => {})));
    }
  }
}
