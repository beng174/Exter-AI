import { randomUUID } from "node:crypto";
import type pg from "pg";
import { DiskKernelArtifactStore, KernelArtifactBrokerClient, KernelArtifactError } from "./artifacts.js";
import { checkpointKernelJob, claimKernelJob, completeKernelJob, failKernelJob, heartbeatKernelJob } from "./jobs.js";

import { extractKernelScenes, SCENE_STAGE_PIPELINE } from "./scenes.js";

import { extractKernelAudio, AUDIO_STAGE_PIPELINE } from "./audio.js";

export const ARTIFACT_STAGE_PIPELINE = "exter-artifact-stage-v1";

export function configuredKernelArtifactClient(env: Record<string, string | undefined> = process.env) {
  if (env.EXTER_KERNEL_WORKER_ENABLED !== "true") return null;
  if (!env.EXTER_KERNEL_CACHE_PATH || !env.EXTER_ARTIFACT_BROKER_ORIGIN || !env.EXTER_ARTIFACT_BROKER_TOKEN)
    throw new Error("Kernel worker requires a separate cache path and configured artifact broker.");
  return new KernelArtifactBrokerClient({ origin: env.EXTER_ARTIFACT_BROKER_ORIGIN, token: env.EXTER_ARTIFACT_BROKER_TOKEN,
    store: new DiskKernelArtifactStore({ root: env.EXTER_KERNEL_CACHE_PATH }) });
}

/** K02 transfers verified media only. It does not call Gemini or load extractors. */
export async function workKernelOnce(pool: pg.Pool, client: Pick<KernelArtifactBrokerClient, "retrieve">, options: { signal?: AbortSignal; heartbeatMs?: number } = {}) {
  const job = await claimKernelJob(pool, randomUUID(), { pipelineVersions: [ARTIFACT_STAGE_PIPELINE, ...(process.env.EXTER_KERNEL_SCENES_ENABLED === "true" ? [SCENE_STAGE_PIPELINE] : []), ...(process.env.EXTER_KERNEL_AUDIO_ENABLED === "true" ? [AUDIO_STAGE_PIPELINE] : [])] });
  if (!job?.lease) return false;
  const controller = new AbortController(), lease = job.lease;
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  let leaseAlive = true, heartbeat: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (heartbeat) return;
    heartbeat = heartbeatKernelJob(pool, lease).then(alive => {
      if (!alive) { leaseAlive = false; controller.abort(); }
    }).catch(() => { leaseAlive = false; controller.abort(); }).finally(() => { heartbeat = undefined; });
  }, options.heartbeatMs ?? 15000);
  timer.unref();
  try {
    const stored = await client.retrieve(job.artifact, { signal });
    if (signal.aborted || !leaseAlive) return true;
    const checkpoint = job.pipelineVersion === AUDIO_STAGE_PIPELINE ? await extractKernelAudio(stored, signal) : job.pipelineVersion === SCENE_STAGE_PIPELINE ? await extractKernelScenes(stored, signal) : { stage: "media-ready", artifact: { ...stored.ref } };
    if (await checkpointKernelJob(pool, lease, checkpoint)) await completeKernelJob(pool, lease, checkpoint);
  } catch (error) {
    if (leaseAlive) {
      const failure = error instanceof KernelArtifactError && error.code === "authentication" ? "authentication"
        : error instanceof KernelArtifactError && ["corrupt", "invalid", "too_large", "configuration", "not_found"].includes(error.code) ? "invalid" : "transient";
      await failKernelJob(pool, lease, failure);
    }
  } finally { clearInterval(timer); await heartbeat; }
  return true;
}
