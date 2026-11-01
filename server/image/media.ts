import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createReadStream } from "node:fs";
import { link, lstat, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertProxySupport } from "../connectors/http.js";
import { MediaStorageError } from "../video/media.js";
import type { StoredImage, StoredImageCreative } from "../../shared/image-analysis.js";

const HASH = /^[a-f0-9]{64}$/;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type Mime = keyof typeof TYPES;
const run = promisify(execFile);
const creativeHash = (kind: string, images: { sha256: string }[]) => createHash("sha256").update(JSON.stringify([kind, ...images.map(image => image.sha256)])).digest("hex");
const scopedId = (brandId: string, adId: string, sha256: string) => createHash("sha256").update(JSON.stringify([brandId, adId, "image-creative", sha256])).digest("hex");

export interface ImageMediaRequest {
  brandId: string;
  adId: string;
  sourceUrls: string[];
  kind: "image" | "carousel";
  signal?: AbortSignal;
}
export interface ImageMediaOptions {
  root?: string;
  allowedHosts?: string[];
  maxBytes?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
  resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  probe?: (path: string) => Promise<{ width: number; height: number }>;
  now?: () => Date;
}
export interface ImageMediaStore {
  store(input: ImageMediaRequest): Promise<StoredImageCreative>;
  load(mediaId: string): Promise<StoredImageCreative | null>;
}
function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{0,3}:/i.test(address) && !/^2001:db8:/i.test(address);
}
function sniff(bytes: Uint8Array): Mime | null {
  const value = Buffer.from(bytes);
  if (value.length >= 8 && value.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) return "image/jpeg";
  if (value.length >= 16 && value.toString("ascii",0,4) === "RIFF" && value.toString("ascii",8,12) === "WEBP" && ["VP8 ","VP8L","VP8X"].includes(value.toString("ascii",12,16))) return "image/webp";
  return null;
}
function httpError(status: number): MediaStorageError {
  const known: Record<number,[string,string]> = {
    401: ["media_unauthorized", "The image host requires authorization (HTTP 401)."],
    403: ["media_forbidden", "The image host refused the download (HTTP 403). Refresh the source link or retry when server access is permitted."],
    404: ["media_not_found", "The image file was not found (HTTP 404). Refresh the source link from its ad snapshot."],
    408: ["media_timeout", "The image host timed out (HTTP 408)."],
    410: ["media_expired", "The image link expired or the file was removed (HTTP 410). Refresh its source link."],
    429: ["media_rate_limited", "The image host rate-limited the download (HTTP 429). Retry later."],
  };
  const [code,message] = known[status] || ["media_source_http_error",`The image host returned HTTP ${status}.`];
  return new MediaStorageError(message,status === 408 ? 504 : 502,code,status);
}
export async function probeImageFile(path: string) {
  let stdout: string;
  try {
    ({stdout} = await run("ffprobe",["-v","error","-protocol_whitelist","file,pipe","-select_streams","v:0","-show_entries","stream=codec_name,width,height","-of","json",path],{encoding:"utf8",timeout:15000,maxBuffer:256*1024}));
  } catch (error) {
    throw new MediaStorageError((error as NodeJS.ErrnoException).code === "ENOENT" ? "ffprobe is required to verify retained images." : "Downloaded image could not be decoded.",503,"media_image_probe_failed");
  }
  try {
    const image = JSON.parse(stdout).streams?.[0];
    if (!image || !["png","mjpeg","webp"].includes(image.codec_name)) throw new Error();
    return {width:Number(image.width),height:Number(image.height)};
  } catch { throw new MediaStorageError("Downloaded media is not a supported decodable image.",422,"media_not_image"); }
}

/** Immutable ordered image sets; a carousel manifest exists only after every slide verifies. */
export class LocalImageMediaStore implements ImageMediaStore {
  readonly root: string;
  private readonly hosts: string[];
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  constructor(private readonly options: ImageMediaOptions = {}) {
    if (process.env.MEDIA_STORAGE_TYPE && process.env.MEDIA_STORAGE_TYPE !== "disk") throw new MediaStorageError("MEDIA_STORAGE_TYPE must be disk.");
    this.root = resolve(options.root || process.env.MEDIA_STORAGE_PATH || process.env.EXTER_MEDIA_ROOT || ".data/media");
    this.hosts = (options.allowedHosts || (process.env.EXTER_MEDIA_ALLOWED_HOSTS ? process.env.EXTER_MEDIA_ALLOWED_HOSTS.split(",").map(host=>host.trim()).filter(Boolean) : ["*.fbcdn.net"])).map(host=>host.toLowerCase());
    if (!this.hosts.length || this.hosts.some(host=>!/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host))) throw new MediaStorageError("Configure approved public image media hosts.");
    this.maxBytes = options.maxBytes ?? 8*1024*1024;
    this.timeoutMs = options.timeoutMs ?? 45000;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1 || this.maxBytes > 8*1024*1024 || !Number.isFinite(this.timeoutMs) || this.timeoutMs < 1) throw new MediaStorageError("Image size and timeout settings are invalid.");
  }
  private async checkedUrl(raw: string) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new MediaStorageError("Provide an approved public HTTPS image URL."); }
    if (raw.length > 20000 || url.protocol !== "https:" || url.username || url.password || url.port || isIP(url.hostname) ||
      !this.hosts.some(host=>host.startsWith("*.") ? url.hostname.endsWith(host.slice(1)) && url.hostname !== host.slice(2) : url.hostname === host) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|invalid)$/.test(url.hostname)) throw new MediaStorageError("Image downloads accept only approved public HTTPS media hosts without credentials.");
    let addresses: {address:string;family:number}[];
    try { addresses = await (this.options.resolve || (hostname=>lookup(hostname,{all:true,verbatim:true})))(url.hostname); }
    catch { throw new MediaStorageError("The image media host could not be resolved.",502,"media_source_unavailable"); }
    if (!addresses.length || addresses.some(({address})=>!publicAddress(address))) throw new MediaStorageError("The image host resolves to a private, local or unsupported address.");
    url.hash = "";
    return url;
  }
  private async digest(path: string) {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > this.maxBytes) throw new MediaStorageError("Stored image integrity verification failed.",409,"media_corrupt");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return {bytes:stat.size,sha256:hash.digest("hex")};
  }
  async load(mediaId: string): Promise<StoredImageCreative | null> {
    if (!HASH.test(mediaId)) throw new MediaStorageError("Image media identifier must be a SHA-256 digest.");
    const manifestPath = resolve(this.root,"image-creatives",`${mediaId}.json`);
    let raw: string;
    try {
      const stat = await lstat(manifestPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50000) throw new Error();
      raw = await readFile(manifestPath,"utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new MediaStorageError("Stored image manifest could not be verified.",409,"media_corrupt");
    }
    let saved: StoredImageCreative;
    try {
      saved = JSON.parse(raw);
      if (saved.mediaId !== mediaId || !HASH.test(saved.sha256) || !["image","carousel"].includes(saved.kind) || typeof saved.adId !== "string" || typeof saved.brandId !== "string" || !Number.isFinite(Date.parse(saved.storedAt)) ||
        !Array.isArray(saved.images) || (saved.kind === "image" ? saved.images.length !== 1 : saved.images.length < 2 || saved.images.length > 10) ||
        creativeHash(saved.kind,saved.images) !== saved.sha256 || scopedId(saved.brandId,saved.adId,saved.sha256) !== mediaId) throw new Error();
      for (const image of saved.images) {
        const extension = TYPES[image.mimeType as Mime];
        if (!extension || !HASH.test(image.sha256) || !Number.isSafeInteger(image.bytes) || image.bytes < 1 || image.bytes > this.maxBytes || image.relativePath !== `image-objects/${image.sha256}.${extension}`) throw new Error();
        image.absolutePath = resolve(this.root,image.relativePath);
        const verified = await this.digest(image.absolutePath);
        if (verified.bytes !== image.bytes || verified.sha256 !== image.sha256) throw new Error();
      }
    } catch { throw new MediaStorageError("Stored image integrity verification failed.",409,"media_corrupt"); }
    return saved;
  }
  private async download(raw: string, signal?: AbortSignal): Promise<StoredImage> {
    assertProxySupport(Boolean(this.options.fetch),process.env);
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = AbortSignal.any([timeout,...(signal ? [signal] : [])]);
    const timeoutError = () => new MediaStorageError(signal?.aborted ? "Image download was cancelled." : "Image download timed out.",signal?.aborted ? 409 : 504,signal?.aborted ? "media_cancelled" : "media_timeout");
    let url = await this.checkedUrl(raw);
    let response: Response | undefined;
    for (let redirects=0;redirects<=3;redirects++) {
      try { response = await (this.options.fetch || fetch)(url,{redirect:"manual",signal:combined,headers:{Accept:"image/jpeg,image/png,image/webp,application/octet-stream"}}); }
      catch { throw combined.aborted ? timeoutError() : new MediaStorageError("The public image source could not be reached.",502,"media_source_unavailable"); }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location"); await response.body?.cancel().catch(()=>{});
        if (!location || redirects === 3) throw new MediaStorageError("Image source returned too many or invalid redirects.",502,"media_source_unavailable");
        let next: string;
        try { next = new URL(location,url).href; } catch { throw new MediaStorageError("Image source returned an invalid redirect.",502,"media_source_unavailable"); }
        url = await this.checkedUrl(next); continue;
      }
      break;
    }
    if (!response?.ok) { await response?.body?.cancel().catch(()=>{}); throw httpError(response?.status || 502); }
    if (!response.body) throw new MediaStorageError("The image source returned no content.",422,"media_not_image");
    const declared = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (![...Object.keys(TYPES),"application/octet-stream"].includes(declared)) { await response.body.cancel().catch(()=>{}); throw new MediaStorageError("The source did not return an accepted image content type.",422,"media_not_image"); }
    if (Number(response.headers.get("content-length")) > this.maxBytes) { await response.body.cancel().catch(()=>{}); throw new MediaStorageError("Image exceeds the 8 MiB media limit.",413,"media_too_large"); }
    await mkdir(resolve(this.root,"image-objects"),{recursive:true,mode:0o700});
    const temporary = resolve(this.root,"image-objects",`.download-${randomUUID()}.tmp`);
    const reader = response.body.getReader();
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary,"wx",0o600);
      let bytes=0; const hash=createHash("sha256"); const prefix: Uint8Array[]=[]; let prefixBytes=0;
      while (true) {
        if (combined.aborted) throw timeoutError();
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > this.maxBytes) throw new MediaStorageError("Image exceeds the 8 MiB media limit.",413,"media_too_large");
        if (prefixBytes < 32) { prefix.push(part.value.subarray(0,32-prefixBytes)); prefixBytes += Math.min(part.value.byteLength,32-prefixBytes); }
        hash.update(part.value); await handle.writeFile(part.value);
      }
      await handle.sync(); await handle.close(); handle=undefined;
      const mimeType = sniff(Buffer.concat(prefix));
      if (!bytes || !mimeType || (declared !== "application/octet-stream" && declared !== mimeType)) throw new MediaStorageError("Downloaded content does not match a supported image container.",422,"media_not_image");
      const size = await (this.options.probe || probeImageFile)(temporary);
      if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || size.width < 1 || size.height < 1 || size.width*size.height > 40_000_000) throw new MediaStorageError("Image dimensions are invalid or exceed 40 million pixels.",422,"media_not_image");
      const sha256=hash.digest("hex"); const relativePath=`image-objects/${sha256}.${TYPES[mimeType]}`; const absolutePath=resolve(this.root,relativePath);
      try { await link(temporary,absolutePath); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing=await this.digest(absolutePath);
        if (existing.bytes !== bytes || existing.sha256 !== sha256) throw new MediaStorageError("Stored image integrity verification failed.",409,"media_corrupt");
      }
      return {absolutePath,relativePath,mimeType,sha256,bytes};
    } catch (error) {
      await reader.cancel().catch(()=>{});
      if (error instanceof MediaStorageError) throw error;
      throw combined.aborted ? timeoutError() : new MediaStorageError("The image could not be stored safely; previous media was preserved.",500,"media_storage_failed");
    } finally { await handle?.close().catch(()=>{}); reader.releaseLock(); await unlink(temporary).catch(()=>{}); }
  }
  async store(input: ImageMediaRequest): Promise<StoredImageCreative> {
    if (typeof input.brandId !== "string" || !input.brandId || input.brandId.length > 200 || typeof input.adId !== "string" || !input.adId || input.adId.length > 300 ||
      !["image","carousel"].includes(input.kind) || !Array.isArray(input.sourceUrls) || input.sourceUrls.some(url=>typeof url !== "string" || !url) ||
      (input.kind === "image" ? input.sourceUrls.length !== 1 : input.sourceUrls.length < 2 || input.sourceUrls.length > 10)) throw new MediaStorageError("Provide one image or all two to ten ordered carousel slides.");
    const images: StoredImage[]=[];
    for (const url of input.sourceUrls) images.push(await this.download(url,input.signal));
    const sha256=creativeHash(input.kind,images); const mediaId=scopedId(input.brandId,input.adId,sha256);
    const saved: StoredImageCreative={mediaId,sha256,kind:input.kind,brandId:input.brandId,adId:input.adId,storedAt:(this.options.now || (()=>new Date()))().toISOString(),images};
    await mkdir(resolve(this.root,"image-creatives"),{recursive:true,mode:0o700});
    const temporary=resolve(this.root,"image-creatives",`.manifest-${randomUUID()}.tmp`);
    try {
      // Persist only relative immutable paths and hashes; temporary source links are never saved.
      await writeFile(temporary,JSON.stringify({...saved,images:images.map(({absolutePath:_absolute,...image})=>image)})+"\n",{flag:"wx",mode:0o600});
      try { await link(temporary,resolve(this.root,"image-creatives",`${mediaId}.json`)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    } catch (error) {
      if (error instanceof MediaStorageError) throw error;
      throw new MediaStorageError("Image creative storage could not be completed.",500,"media_storage_failed");
    } finally { await unlink(temporary).catch(()=>{}); }
    const verified=await this.load(mediaId);
    if (!verified) throw new MediaStorageError("Image creative storage could not be completed.",500,"media_storage_failed");
    return verified;
  }
}
