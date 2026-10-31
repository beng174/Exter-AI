import type { Express, Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import type { VideoAnalysisService } from "../video/service.js";
import { GeminiSmokeService, SmokeRequestError, type SmokeOptions } from "./service.js";
const id = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(value)) throw new SmokeRequestError("Provide a valid smoke run identifier.", 400);
  return value;
};
export function attachGeminiSmoke(app: Express, db: DatabaseSync, video: VideoAnalysisService, options: SmokeOptions = {}) {
  const service = new GeminiSmokeService(db, video, options);
  app.locals.geminiSmoke = service;
  const fail = (res: Response, error: unknown) => res.status(error instanceof SmokeRequestError ? error.status : 503).json({ error: error instanceof SmokeRequestError ? error.message : "The hosted Gemini test is unavailable; prior stored work was preserved." });
  app.get("/api/gemini-smoke/status", async (_req,res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try { res.json(await service.status()); } catch (error) { fail(res,error); }
  });
  app.post("/api/gemini-smoke/prepare", async (_req,res) => {
    try { res.status(202).json(await service.start("prepare")); } catch (error) { fail(res,error); }
  });
  app.post("/api/gemini-smoke/runs", async (req,res) => {
    try { res.status(202).json(await service.start("smoke", req.body?.processingMode ?? "agentic")); } catch (error) { fail(res,error); }
  });
  app.get("/api/gemini-smoke/runs/:id", (req,res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const run = service.run(id(req.params.id));
      if (!run) throw new SmokeRequestError("Gemini smoke test not found.",404);
      res.json(run);
    } catch (error) { fail(res,error); }
  });
  app.post("/api/gemini-smoke/runs/:id/resume", async (req,res) => {
    try { res.status(202).json(await service.resume(id(req.params.id))); } catch (error) { fail(res,error); }
  });
  app.get("/api/gemini-smoke/runs/:id/report", (req,res) => {
    try {
      const report = service.report(id(req.params.id));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", 'attachment; filename="gemini-live-report.md"');
      res.type("text/markdown").send(report);
    } catch (error) { fail(res,error); }
  });
  return service;
}
