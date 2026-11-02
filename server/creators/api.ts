import type { Express, Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import { protectSettingsMutation } from "../request-guard.js";
import { VideoProviderError } from "../video/types.js";
import { CreatorProviderError } from "./types.js";
import { CreatorResearchError, CreatorResearchService, type CreatorResearchOptions } from "./service.js";

/** Register after the app's authentication middleware. Every paid action also
 * requires same-origin JSON; reads never start a provider or model request. */
export function attachCreatorResearch(app: Express, db: DatabaseSync, options: CreatorResearchOptions = {}) {
  const service = new CreatorResearchService(db, options);
  app.locals.creatorResearch = service;
  app.use("/api/creator-research", protectSettingsMutation);
  const failure = (res: Response, error: unknown) => {
    const known = error instanceof CreatorResearchError || error instanceof CreatorProviderError || error instanceof VideoProviderError;
    const status = error instanceof CreatorResearchError ? error.status : error instanceof CreatorProviderError || error instanceof VideoProviderError ? error.code === "budget_paused" ? 409 : error.code === "configuration" ? 400 : 502 : 500;
    res.status(status).json({ error: known ? error.message : "Creator research failed; saved source evidence was preserved." });
  };
  app.get("/api/creator-research", (req, res) => {
    try { res.setHeader("Cache-Control", "private, no-store"); res.json(service.snapshot(req.query.brandId)); }
    catch (error) { failure(res, error); }
  });
  app.post("/api/creator-research/search", async (req, res) => {
    try { res.status(201).json(await service.search(req.body || {})); }
    catch (error) { failure(res, error); }
  });
  app.post("/api/creator-research/fit", async (req, res) => {
    try { res.status(201).json(await service.fit(req.body?.brandId, req.body?.candidateId)); }
    catch (error) { failure(res, error); }
  });
  app.post("/api/creator-research/shortlist", (req, res) => {
    try { res.json(service.shortlist(req.body?.brandId, req.body?.candidateId, req.body?.selected)); }
    catch (error) { failure(res, error); }
  });
  app.get("/api/creator-research/report", (req, res) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", 'attachment; filename="creator-research-report.md"');
      res.type("text/markdown").send(service.report(req.query.brandId));
    } catch (error) { failure(res, error); }
  });
  return service;
}
