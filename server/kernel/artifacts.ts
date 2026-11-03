import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, link, unlink } from "node:fs/promises";
import { isIP } from "node:net";
import { parse, resolve, sep } from "node:path";

const HASH = /^[a-f0-9]{64}$/;
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const DEFAULT_MAX_BYTES = 250 * 1024 * 1024;
const MIME_TYPES = new Set([
  "video/mp4", "video/webm", "video/quicktime", "image/jpeg", "image/png", "image/webp", "image/gif",
  "audio/wav", "audio/flac", "audio/mpeg", "application/json", "text/plain",
]);

/** An immutable, scope-bound transport reference. Paths and source URLs never cross services. */
export interface KernelArtifactRef {
  artifactId: string;
  workspaceId: string;
  sha256: string;
  bytes: number;
  mimeType: string;
}
export interface StoredKernelArtifact { ref: KernelArtifactRef; absolutePath: string }
export type KernelArtifactErrorCode = "configuration" | "invalid" | "not_found" | "corrupt" | "too_large" | "aborted" | "authentication" | "unavailable";
export class KernelArtifactError extends Error {
  constructor(public code: KernelArtifactErrorCode, message: string, public status = 400) { super(message); }
}
function artifactId(ref: Omit<KernelArtifactRef, "artifactId">) {
  return createHash("sha256").update(JSON.stringify([ref.workspaceId, ref.sha256, ref.bytes, ref.mimeType])).digest("hex");
}
export function createKernelArtifactRef(input: Omit<KernelArtifactRef, "artifactId">): KernelArtifactRef {
  return validateKernelArtifactRef({ ...input, artifactId: artifactId(input) });
}
export function validateKernelArtifactRef(value: unknown): KernelArtifactRef {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new KernelArtifactError("invalid", "A scoped artifact reference is required.");
  const ref = value as KernelArtifactRef;
  if (Object.keys(ref).sort().join(",") !== "artifactId,bytes,mimeType,sha256,workspaceId" ||
      typeof ref.workspaceId !== "string" || !SCOPE.test(ref.workspaceId) ||
      typeof ref.sha256 !== "string" || !HASH.test(ref.sha256) ||
      typeof ref.artifactId !== "string" || !HASH.test(ref.artifactId) ||
      !Number.isSafeInteger(ref.bytes) || ref.bytes <= 0 ||
      typeof ref.mimeType !== "string" || !MIME_TYPES.has(ref.mimeType) || ref.artifactId !== artifactId(ref))
    throw new KernelArtifactError("invalid", "Artifact scope, identity or metadata is invalid.");
  return { artifactId: ref.artifactId, workspaceId: ref.workspaceId, sha256: ref.sha256, bytes: ref.bytes, mimeType: ref.mimeType };
}
const aborted = () => new KernelArtifactError("aborted", "Artifact transfer was cancelled.", 499);
const integrity = () => new KernelArtifactError("corrupt", "Artifact integrity verification failed.", 409);

/** Verify every existing ancestor before reading/writing; directories remain private. */
async function safeDirectory(directory: string, create: boolean): Promise<boolean> {
  let current = parse(directory).root;
  for (const part of directory.slice(current.length).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!create) return false;
      try { await mkdir(current, { mode: 0o700 }); }
      catch (mkdirError) { if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") throw mkdirError; }
      stat = await lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw integrity();
  }
  return true;
}

/** Worker-owned disk cache. Its root is explicitly configured, never copied from a web path. */
export class DiskKernelArtifactStore {
  readonly root: string;
  readonly maxBytes: number;
  constructor(options: { root: string; maxBytes?: number }) {
    if (typeof options.root !== "string" || !options.root.trim())
      throw new KernelArtifactError("configuration", "Configure a worker artifact cache directory.", 503);
    this.root = resolve(options.root);
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    if (this.root === parse(this.root).root || !Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1 || this.maxBytes > 1024 * 1024 * 1024)
      throw new KernelArtifactError("configuration", "Artifact cache configuration is unsupported.", 503);
  }
  private directory(workspaceId: string) {
    return resolve(this.root, createHash("sha256").update(workspaceId).digest("hex"));
  }
  private checkedRef(value: unknown) {
    const ref = validateKernelArtifactRef(value);
    if (ref.bytes > this.maxBytes) throw new KernelArtifactError("too_large", "Artifact exceeds the configured byte limit.", 413);
    return ref;
  }
  async load(value: KernelArtifactRef): Promise<StoredKernelArtifact | null> {
    const ref = this.checkedRef(value), directory = this.directory(ref.workspaceId);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      if (!await safeDirectory(directory, false)) return null;
      const path = resolve(directory, ref.artifactId);
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== ref.bytes || stat.size > this.maxBytes) throw integrity();
      const hash = createHash("sha256");
      for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
      if (hash.digest("hex") !== ref.sha256) throw integrity();
      return { ref, absolutePath: path };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof KernelArtifactError) throw error;
      throw integrity();
    } finally { await handle?.close().catch(() => {}); }
  }
  async put(workspaceId: string, mimeType: string, source: AsyncIterable<Uint8Array>, options: { signal?: AbortSignal } = {}): Promise<StoredKernelArtifact> {
    if (typeof workspaceId !== "string" || !SCOPE.test(workspaceId) || typeof mimeType !== "string" || !MIME_TYPES.has(mimeType))
      throw new KernelArtifactError("invalid", "Artifact workspace or media type is unsupported.");
    return this.write(workspaceId, mimeType, source, options.signal);
  }
  async receive(value: KernelArtifactRef, source: AsyncIterable<Uint8Array>, options: { signal?: AbortSignal } = {}): Promise<StoredKernelArtifact> {
    const ref = this.checkedRef(value);
    return this.write(ref.workspaceId, ref.mimeType, source, options.signal, ref);
  }
  private async write(workspaceId: string, mimeType: string, source: AsyncIterable<Uint8Array>, signal?: AbortSignal, expected?: KernelArtifactRef): Promise<StoredKernelArtifact> {
    if (signal?.aborted) throw aborted();
    const temporary = resolve(this.root, `.partial-${randomUUID()}`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await safeDirectory(this.root, true);
      handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of source) {
        if (signal?.aborted) throw aborted();
        if (!(chunk instanceof Uint8Array)) throw new KernelArtifactError("invalid", "Artifact chunks must contain bytes.");
        bytes += chunk.byteLength;
        if (bytes > this.maxBytes || expected && bytes > expected.bytes)
          throw new KernelArtifactError("too_large", "Artifact exceeds its declared or configured byte limit.", 413);
        hash.update(chunk);
        await handle.writeFile(chunk);
      }
      if (signal?.aborted) throw aborted();
      if (!bytes) throw integrity();
      const ref = createKernelArtifactRef({ workspaceId, mimeType, bytes, sha256: hash.digest("hex") });
      if (expected && ref.artifactId !== expected.artifactId) throw integrity();
      await handle.sync();
      await handle.close();
      handle = undefined;
      const directory = this.directory(workspaceId), path = resolve(directory, ref.artifactId);
      await safeDirectory(directory, true);
      try { await link(temporary, path); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const saved = await this.load(ref);
        if (!saved) throw integrity();
        return saved;
      }
      const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await parent.sync(); } finally { await parent.close(); }
      return { ref, absolutePath: path };
    } catch (error) {
      if (error instanceof KernelArtifactError) throw error;
      if (signal?.aborted) throw aborted();
      throw new KernelArtifactError("unavailable", "Artifact could not be stored safely; previous data was preserved.", 503);
    } finally {
      await handle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  }
}

function brokerOrigin(value: string) {
  try {
    const url = new URL(value);
    if (value !== value.trim() || url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash ||
        isIP(url.hostname) || !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|lan|home|invalid)$/.test(url.hostname)) throw new Error();
    return url.origin;
  } catch { throw new KernelArtifactError("configuration", "Configure one public HTTPS artifact broker origin without credentials or a path.", 503); }
}
export function validateArtifactBrokerToken(value: unknown): string {
  if (typeof value !== "string" || value.length < 32 || value.length > 4096 || /\s|[\u0000-\u001f\u007f]/.test(value))
    throw new KernelArtifactError("configuration", "Configure a dedicated artifact broker token of at least 32 characters.", 503);
  return value;
}

async function* responseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let complete = false;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) { complete = true; break; }
      yield item.value;
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Fixed-origin authenticated transport, never a general URL fetcher. */
export class KernelArtifactBrokerClient {
  #origin: string;
  #token: string;
  #store: DiskKernelArtifactStore;
  #fetch: typeof fetch;
  #timeoutMs: number;
  constructor(options: { origin: string; token: string; store: DiskKernelArtifactStore; fetch?: typeof fetch; timeoutMs?: number }) {
    this.#origin = brokerOrigin(options.origin);
    this.#token = validateArtifactBrokerToken(options.token);
    this.#store = options.store;
    this.#fetch = options.fetch || fetch;
    this.#timeoutMs = options.timeoutMs ?? 120000;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1 || this.#timeoutMs > 600000)
      throw new KernelArtifactError("configuration", "Artifact timeout configuration is unsupported.", 503);
  }
  async retrieve(value: KernelArtifactRef, options: { signal?: AbortSignal } = {}): Promise<StoredKernelArtifact> {
    const ref = validateKernelArtifactRef(value);
    if (options.signal?.aborted) throw aborted();
    const cached = await this.#store.load(ref);
    if (cached) return cached;
    const timeout = AbortSignal.timeout(this.#timeoutMs), signal = AbortSignal.any([timeout, ...(options.signal ? [options.signal] : [])]);
    let response: Response | undefined;
    try {
      const url = `${this.#origin}/api/kernel/artifacts/${encodeURIComponent(ref.workspaceId)}/${ref.artifactId}`;
      response = await this.#fetch(url, { redirect: "error", signal, headers: { "X-Exter-Artifact-Token": this.#token, "Accept-Encoding": "identity" } });
      if (!response.ok) {
        const code = [401, 403].includes(response.status) ? "authentication" : response.status === 404 ? "not_found" : response.status === 409 ? "corrupt" : response.status === 413 ? "too_large" : "unavailable";
        throw new KernelArtifactError(code, `Artifact broker request failed (HTTP ${response.status}).`, response.status);
      }
      if (!response.body) throw integrity();
      const length = response.headers.get("content-length"), type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (length !== null && (!/^\d+$/.test(length) || Number(length) !== ref.bytes) || type && type !== ref.mimeType && type !== "application/octet-stream") throw integrity();
      return await this.#store.receive(ref, responseChunks(response.body), { signal });
    } catch (error) {
      if (options.signal?.aborted) throw aborted();
      if (timeout.aborted) throw new KernelArtifactError("unavailable", "Artifact broker transfer timed out.", 504);
      if (error instanceof KernelArtifactError) throw error;
      throw new KernelArtifactError("unavailable", "Artifact broker transfer could not complete.", 503);
    } finally { await response?.body?.cancel().catch(() => {}); }
  }
}
