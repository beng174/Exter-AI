import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { StoredVideo } from "../video/types.js";

const run = promisify(execFile);
const VERSION = "exter-video-poster-v1";
const pending = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

async function validPoster(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 20 || stat.size > 2 * 1024 * 1024) return false;
    const file = await open(path, "r");
    try { const bytes = Buffer.alloc(3); await file.read(bytes, 0, 3, 0); return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; }
    finally { await file.close(); }
  } catch { return false; }
}

/** One cached, real frame. No network, model call or source mutation occurs. */
export async function videoPoster(media: StoredVideo, mediaRoot?: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(media.sha256) || !Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0)
    throw new Error("Stored video metadata is invalid.");
  const seconds = Math.min(1, media.durationSeconds / 2);
  const root = resolve(mediaRoot || process.env.MEDIA_STORAGE_PATH || process.env.EXTER_MEDIA_ROOT || ".data/media", "posters", VERSION);
  const key = createHash("sha256").update(`${media.sha256}:${seconds}:${VERSION}`).digest("hex");
  const path = resolve(root, `${key}.jpg`);
  if (await validPoster(path)) return path;
  const inProgress = pending.get(path);
  if (inProgress) return inProgress;
  const task = queue.then(async () => {
    if (await validPoster(path)) return path;
    await mkdir(root, { recursive: true, mode: 0o700 });
    const temporary = resolve(root, `.${key}-${randomUUID()}.jpg`);
    try {
      await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-filter_threads", "1", "-protocol_whitelist", "file,pipe", "-ss", seconds.toFixed(3), "-i", media.absolutePath,
        "-frames:v", "1", "-an", "-threads", "1", "-vf", "scale=min(640\\,iw):-2", "-q:v", "4", "-f", "image2", "-y", temporary], { timeout: 30000, maxBuffer: 1024 * 1024 });
      if (!await validPoster(temporary)) throw new Error("No valid poster frame was produced.");
      await rename(temporary, path);
      return path;
    } finally { await unlink(temporary).catch(() => {}); }
  });
  queue = task.catch(() => {});
  pending.set(path, task);
  void task.finally(() => { if (pending.get(path) === task) pending.delete(path); }).catch(() => {});
  return task;
}
