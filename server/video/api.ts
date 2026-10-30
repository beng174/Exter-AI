import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { VideoAnalysisService, videoStatus, type VideoJobInput, type VideoServiceOptions } from "./service.js";
import { VideoProviderError } from "./types.js";
const identifier = (value: unknown) => {
  if (typeof value !== "string" || !value.trim() || value.length > 300) throw new VideoProviderError("configuration", "Provide the workspace and source ad identifiers.");
  return value.trim();
};
export function attachVideoAnalysis(app: Express, db: DatabaseSync, options: VideoServiceOptions = {}) {
  const service = new VideoAnalysisService(db, options);
  app.locals.videoAnalysis = service;
  app.get("/api/video/status", (_req, res) => res.json(videoStatus()));
  const failure = (res: import("express").Response, error: unknown) => {
    res.status(error instanceof VideoProviderError ? 400 : 500).json({ error: error instanceof VideoProviderError ? error.message : "Video request failed; earlier stored results were preserved." });
  };
  app.post("/api/video/jobs", (req, res) => {
    try {
      const provider = req.body?.provider ?? "gemini";
      const processingMode = req.body?.processingMode ?? "agentic";
      if (!["gemini", "twelvelabs"].includes(provider) || !["agentic", "static-high-fps-hook"].includes(processingMode)) throw new VideoProviderError("configuration", "Choose a supported video provider and processing mode.");
      if (req.body?.sourceVideoUrl !== undefined && (typeof req.body.sourceVideoUrl !== "string" || req.body.sourceVideoUrl.length > 10000)) throw new VideoProviderError("configuration", "Provide a valid video source URL.");
      if (req.body?.force !== undefined && typeof req.body.force !== "boolean") throw new VideoProviderError("configuration", "force must be a boolean.");
      const input: VideoJobInput = { brandId: identifier(req.body?.brandId), adId: identifier(req.body?.adId), provider, processingMode, sourceVideoUrl: req.body?.sourceVideoUrl, force: req.body?.force === true };
      res.status(202).json(service.enqueue(input));
    } catch (error) { failure(res, error); }
  });
  app.get("/api/video/jobs/:id", (req, res) => {
    try {
      const job = service.job(identifier(req.query.brandId), identifier(req.params.id));
      if (!job) { res.status(404).json({ error: "Video job not found in this workspace." }); return; }
      res.json(job);
    } catch (error) { failure(res, error); }
  });
  app.get("/api/video/analyses", (req, res) => {
    try { res.json(service.history(identifier(req.query.brandId), identifier(req.query.adId))); }
    catch (error) { failure(res, error); }
  });
  app.get("/api/video/export", (req, res) => {
    try {
      const history = service.history(identifier(req.query.brandId), identifier(req.query.adId));
      const selected = req.query.analysisId ? history.find((run) => run.id === identifier(req.query.analysisId)) : history[0];
      if (req.query.analysisId && !selected) { res.status(404).json({ error: "Analysis not found in this ad/workspace history." }); return; }
      const predictions = selected ? [selected] : [];
      res.setHeader("Content-Disposition", 'attachment; filename="exter-video-predictions.json"');
      res.json({ predictions });
    } catch (error) { failure(res, error); }
  });
  app.get("/api/video/media/:id", async (req, res) => {
    try {
      const media = await service.storedMedia(identifier(req.query.brandId), identifier(req.query.adId), identifier(req.params.id));
      if (!media) { res.status(404).json({ error: "Stored video not found in this workspace." }); return; }
      res.setHeader("Content-Type", media.mimeType);
      res.setHeader("Cache-Control", "private, no-store");
      res.sendFile(media.absolutePath);
    } catch (error) { failure(res, error); }
  });
  return service;
}
