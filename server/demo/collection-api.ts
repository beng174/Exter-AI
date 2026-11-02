import type { Express, Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import type { VideoAnalysisService } from "../video/service.js";
import { protectSettingsMutation } from "../request-guard.js";
import { DemoCollectionRequestError, DemoCollectionService, type DemoCollectionOptions } from "./collection.js";

export function attachDemoCollection(app: Express, db: DatabaseSync, video: VideoAnalysisService, options: DemoCollectionOptions = {}) {
  const service = new DemoCollectionService(db, video, options);
  app.locals.demoCollection = service;
  app.use("/api/demo-collection", protectSettingsMutation);
  const failure = (res: Response, error: unknown) => res.status(error instanceof DemoCollectionRequestError ? error.status : 503).json({ error: error instanceof DemoCollectionRequestError ? error.message : "Hosted competitor collection is unavailable; previous sources and results remain available." });
  app.get("/api/demo-collection", (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try { res.json(service.snapshot(req.query.brandId)); } catch (error) { failure(res, error); }
  });
  app.post("/api/demo-collection/start", async (req, res) => {
    try { res.status(202).json(await service.start(req.body?.brandId, req.body?.competitorId)); } catch (error) { failure(res, error); }
  });
  return service;
}
