import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { readBrand } from "../db.js";
import { BrandDemoService } from "./service.js";
import { WebsiteEvidenceError } from "./website.js";
import { ensureRequestedDemoWorkspaces } from "./workspaces.js";
import { reconcileValentteWorkspace, resolveDemoBrandId } from "./reconcile.js";
import { attachCreativeGallery } from "./gallery.js";

export function attachBrandDemo(app: Express, db: DatabaseSync) {
  ensureRequestedDemoWorkspaces(db);
  reconcileValentteWorkspace(db);
  attachCreativeGallery(app, db);
  const service = new BrandDemoService(db);
  app.locals.brandDemo = service;
  app.get("/api/brands/:brandId/demo", (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!readBrand(db, resolveDemoBrandId(db, req.params.brandId))) { res.status(404).json({ error: "Brand report not found in this workspace." }); return; }
    try { res.json(service.report(req.params.brandId)); }
    catch { res.status(503).json({ error: "The saved brand report is unavailable. Earlier source evidence was preserved." }); }
  });
  app.post("/api/brands/:brandId/demo/website", async (req, res) => {
    if (!readBrand(db, resolveDemoBrandId(db, req.params.brandId))) { res.status(404).json({ error: "Brand not found in this workspace." }); return; }
    try { res.json(await service.refreshWebsite(req.params.brandId)); }
    catch (cause) { res.status(cause instanceof WebsiteEvidenceError ? cause.status : 503).json({ error: cause instanceof WebsiteEvidenceError ? cause.message : "Website evidence could not be refreshed. The previous snapshot was preserved." }); }
  });
  return service;
}
