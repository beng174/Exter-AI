import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { StoredKernelArtifact } from "./artifacts.js";
const run = promisify(execFile);
export const SCENE_STAGE_PIPELINE = "exter-scenes-v1";
/** Worker-only subprocess. No import or process starts until explicitly dispatched. */
export async function extractKernelScenes(stored: StoredKernelArtifact, signal?: AbortSignal) {
  if (!stored.ref.mimeType.startsWith("video/")) throw new Error("Scene extraction requires video.");
  const root = process.env.EXTER_KERNEL_SCENES_PATH;
  if (!root) throw new Error("Configure a separate scene cache.");
  const { stdout } = await run(process.env.EXTER_KERNEL_PYTHON || "python3", [resolve("worker/extract_scenes.py"), "--source", stored.absolutePath,
    "--root", root, "--workspace", stored.ref.workspaceId, "--sha256", stored.ref.sha256], {
    signal, timeout: 600000, maxBuffer: 128 * 1024, env: { PATH: process.env.PATH, LANG: "C.UTF-8", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1" },
  });
  const result = JSON.parse(stdout);
  if (!/^[a-f0-9]{64}$/.test(result.cacheKey) || result.sourceSha256 !== stored.ref.sha256 || !Array.isArray(result.sampleTimes) || result.sampleTimes.length > 8)
    throw new Error("Invalid scene manifest.");
  return { stage: "scenes-ready", cacheKey: result.cacheKey, sourceSha256: result.sourceSha256, durationSeconds: result.durationSeconds,
    audioAvailable: result.audioAvailable, sceneCount: result.scenes.length, sampleTimes: result.sampleTimes, cacheHit: result.cacheHit };
}
