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
  app.get("/api/gemini-smoke/creatives", async (_req,res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try { res.json(await service.creatives()); } catch (error) { fail(res,error); }
  });
  app.post("/api/gemini-smoke/test-one", async (req,res) => {
    try {
      const { brandId, adId } = req.body || {};
      if (typeof brandId !== "string" || !brandId || brandId.length > 300 || typeof adId !== "string" || !adId || adId.length > 300)
        throw new SmokeRequestError("Choose one retained creative in its workspace.", 400);
      res.status(202).json(await service.testOne(brandId, adId, req.body?.processingMode ?? "static-high-fps-hook", { mediaResolution: req.body?.mediaResolution }));
    } catch (error) { fail(res,error); }
  });
  app.get("/api/gemini-smoke/image-media/:mediaId/:index", async (req,res) => {
    try {
      const { brandId, adId } = req.query;
      if (typeof brandId !== "string" || !brandId || brandId.length > 300 || typeof adId !== "string" || !adId || adId.length > 300 || !/^[0-9]$/.test(String(req.params.index)))
        throw new SmokeRequestError("Choose a retained image in its workspace.", 400);
      const media = await service.images.storedMedia(brandId, adId, id(req.params.mediaId));
      const image = media?.images[Number(req.params.index)];
      if (!image) throw new SmokeRequestError("Retained image not found in this workspace.", 404);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.type(image.mimeType).sendFile(image.absolutePath);
    } catch (error) { fail(res,error); }
  });
  app.post("/api/gemini-smoke/prepare", async (req,res) => {
    try {
      if (req.body?.refreshFailed !== undefined && typeof req.body.refreshFailed !== "boolean")
        throw new SmokeRequestError("refreshFailed must be a boolean.", 400);
      res.status(202).json(await service.start("prepare", req.body?.processingMode ?? "static-high-fps-hook", { refreshFailed: req.body?.refreshFailed === true, mediaResolution: req.body?.mediaResolution }));
    } catch (error) { fail(res,error); }
  });
  app.post("/api/gemini-smoke/runs", async (req,res) => {
    try { res.status(202).json(await service.start("smoke", req.body?.processingMode ?? "static-high-fps-hook", { mediaResolution: req.body?.mediaResolution })); } catch (error) { fail(res,error); }
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
    try { res.status(202).json(await service.resume(id(req.params.id), req.body?.processingMode ?? "static-high-fps-hook", { mediaResolution: req.body?.mediaResolution })); } catch (error) { fail(res,error); }
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
