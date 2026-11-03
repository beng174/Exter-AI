import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { StoredKernelArtifact } from "./artifacts.js";
import { extractKernelScenes } from "./scenes.js";
const run = promisify(execFile);
export const AUDIO_STAGE_PIPELINE = "exter-audio-v1";
export async function extractKernelAudio(stored: StoredKernelArtifact, signal?: AbortSignal) {
  const models = process.env.EXTER_KERNEL_AUDIO_MODELS_PATH;
  if (!models) throw new Error("Local audio models are not configured.");
  const scene = await extractKernelScenes(stored, signal);
  const { stdout } = await run(process.env.EXTER_KERNEL_PYTHON || "python3", [resolve("worker/audio_features.py"), "--scene-root", process.env.EXTER_KERNEL_SCENES_PATH!,
    "--scene-key", scene.cacheKey, "--models", models], { signal, timeout: 600000, maxBuffer: 64 * 1024,
    env: { PATH: process.env.PATH, LANG: "C.UTF-8", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", TF_NUM_INTRAOP_THREADS: "1", TF_NUM_INTEROP_THREADS: "1", HF_HUB_OFFLINE: "1" } });
  const result = JSON.parse(stdout);
  if (result.stage !== "audio-ready" || !["silent", "music-only", "unsure"].includes(result.audio_type) || !Array.isArray(result.qualityFlags)) throw new Error("Invalid audio stage response.");
  return { ...result, sceneCacheKey: scene.cacheKey };
}
