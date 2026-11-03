import { createHash } from "node:crypto";
import type { Express, Response } from "express";
import { z } from "zod";
import { infrastructureDatabase } from "../infrastructure/database.js";
import { protectSettingsMutation } from "../request-guard.js";
import { artifactBrokerConfiguration, KernelBrokerError, type KernelMediaBroker } from "./broker.js";
import { enqueueKernelJob, readKernelJob, cancelKernelJob, resumeKernelJob, KernelJobError } from "./jobs.js";
import { ARTIFACT_STAGE_PIPELINE } from "./worker.js";

import { SCENE_STAGE_PIPELINE } from "./scenes.js";

const input = z.object({ workspaceId: z.string().min(1).max(200), adId: z.string().min(1).max(200), kind: z.enum(["video", "image", "carousel"]),
  stage: z.enum(["media", "scenes"]).optional(), mediaId: z.string().regex(/^[a-f0-9]{64}$/).optional(), imageIndex: z.number().int().min(0).max(9).optional() }).strict();
const scope = z.object({ workspaceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/) }).strict();

export function attachKernelJobs(app: Express, broker: KernelMediaBroker, resolveWorkspace: (id: string) => string, database = infrastructureDatabase) {
  app.use("/api/kernel/jobs", protectSettingsMutation);
  const fail = (res: Response, error: unknown) => {
    const status = error instanceof z.ZodError || error instanceof KernelJobError ? 400 : error instanceof KernelBrokerError ? error.status : 503;
    res.status(status).json({ error: error instanceof KernelBrokerError ? error.message : status === 400 ? "Provide a valid scoped kernel request." : "Kernel job storage is unavailable. Check database configuration and migrations." });
  };
  app.post("/api/kernel/jobs", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const request = input.parse(req.body), workspaceId = resolveWorkspace(request.workspaceId);
      if (!artifactBrokerConfiguration().workspaces.has(workspaceId)) throw new KernelBrokerError("Configure the media broker for this workspace before staging a worker job.", 409);
      // Verify PostgreSQL availability before creating a safe local export reference.
      const pool = database();
      await pool.query("SELECT 1 FROM kernel_jobs LIMIT 0");
      if (request.stage === "scenes" && request.kind !== "video") throw new KernelBrokerError("Scene extraction requires a retained video.");
      const record = await broker.register({ ...request, workspaceId });
      const job = await enqueueKernelJob(pool, { scope: record.scope, artifact: record.ref, pipelineVersion: request.stage === "scenes" ? SCENE_STAGE_PIPELINE : ARTIFACT_STAGE_PIPELINE,
        config: { stage: request.stage === "scenes" ? "extract-scenes" : "stage-media" }, contextHash: createHash("sha256").update(JSON.stringify(record.scope)).digest("hex") });
      res.status(202).json(job);
    } catch (error) { fail(res, error); }
  });
  app.get("/api/kernel/jobs/:id", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const request = scope.parse(req.query), job = await readKernelJob(database(), String(req.params.id), resolveWorkspace(request.workspaceId));
      if (!job) { res.status(404).json({ error: "Kernel job not found in this workspace." }); return; }
      res.json(job);
    } catch (error) { fail(res, error); }
  });
  for (const [action, operation] of [["cancel", cancelKernelJob], ["resume", resumeKernelJob]] as const) {
    app.post(`/api/kernel/jobs/:id/${action}`, async (req, res) => {
      res.setHeader("Cache-Control", "private, no-store");
      try {
        const request = scope.parse(req.body), changed = await operation(database(), String(req.params.id), resolveWorkspace(request.workspaceId));
        res.status(changed ? 200 : 409).json({ changed, ...(changed ? {} : { error: "The job cannot make this transition. Uncertain paid work requires review." }) });
      } catch (error) { fail(res, error); }
    });
  }
}
