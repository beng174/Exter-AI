import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { StoredKernelArtifact } from "./artifacts.js";
import { extractKernelScenes } from "./scenes.js";
const run = promisify(execFile);
export const VISUAL_STAGE_PIPELINE = "exter-visual-v1";
export async function extractKernelVisual(stored: StoredKernelArtifact, signal?: AbortSignal) {
  const models = process.env.EXTER_KERNEL_VISUAL_MODELS_PATH, root = process.env.EXTER_KERNEL_SCENES_PATH;
  if (!models || !root) throw new Error("Local visual models and cache must be configured.");
  const mediaArgs = stored.ref.mimeType.startsWith("video/") ? ["--scene-key", (await extractKernelScenes(stored, signal)).cacheKey]
    : stored.ref.mimeType.startsWith("image/") ? ["--source", stored.absolutePath, "--workspace", stored.ref.workspaceId, "--sha256", stored.ref.sha256] : null;
  if (!mediaArgs) throw new Error("Visual evidence requires retained image or video.");
  const { stdout } = await run(process.env.EXTER_KERNEL_PYTHON || "python3", [resolve("worker/visual_features.py"), "--scene-root", root, "--models", models, ...mediaArgs],
    { signal, timeout: 600000, maxBuffer: 64 * 1024, env: { PATH: process.env.PATH, LANG: "C.UTF-8", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", OPENCV_IO_MAX_IMAGE_PIXELS: "40000000" } });
  const result = JSON.parse(stdout);
  if (result.stage !== "visual-ready" || !/^[a-f0-9]{64}$/.test(result.sceneCacheKey) || !Number.isInteger(result.sampledFrameCount) || result.sampledFrameCount < 1 || result.sampledFrameCount > 8 || !Array.isArray(result.qualityFlags))
    throw new Error("Invalid visual stage response.");
  return result;
}
