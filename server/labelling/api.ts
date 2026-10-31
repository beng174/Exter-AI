import { readFile } from "node:fs/promises";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import type { VideoAnalysisService } from "../video/service.js";
import { LABELLING_FIELDS } from "../../shared/labelling.js";
import { LabellingError, LabellingService } from "./service.js";

// Prevent saved source copy or free-text notes from executing as spreadsheet formulas.
function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function attachLabelling(app: Express, db: DatabaseSync, video?: VideoAnalysisService) {
  const service = new LabellingService(db, { video });
  const error = (res: import("express").Response, cause: unknown) => res.status(cause instanceof LabellingError ? cause.status : 500)
    .json({ error: cause instanceof LabellingError ? cause.message : "Labelling request failed. Saved human reviews were preserved." });
  app.get("/api/labelling/queue", (req, res) => {
    try { res.setHeader("Cache-Control", "private, no-store"); res.json(service.queue(req.query.brandId, Number(req.query.offset ?? 0), Number(req.query.limit ?? 50))); }
    catch (cause) { error(res, cause); }
  });
  app.post("/api/labelling/store-video", async (req, res) => {
    try { res.json(await service.storeVideo(req.body || {})); }
    catch (cause) { error(res, cause); }
  });
  app.post("/api/labelling/sessions", async (req, res) => {
    try { res.status(201).json(await service.start(req.body || {})); }
    catch (cause) { error(res, cause); }
  });
  app.post("/api/labelling/sessions/:id/labels", (req, res) => {
    try { res.status(201).json(service.submit(req.body?.brandId, req.params.id, req.body || {})); }
    catch (cause) { error(res, cause); }
  });
  app.get("/api/labelling/export", (req, res) => {
    try {
      const result = service.export(req.query.brandId);
      res.setHeader("Cache-Control", "private, no-store");
      if (req.query.format === "csv") {
        const columns = ["id", "brandId", "adId", "sourceUrl", "mediaSha256", "labeller", "startedAt", "labelledAt", "elapsedSeconds", "schemaVersion", "guideVersion", ...LABELLING_FIELDS.map(field => field.key), "notes"];
        const rows = result.labels.map(review => ({ ...review, ...review.labels }));
        res.setHeader("Content-Disposition", 'attachment; filename="exter-human-labels.csv"');
        res.type("text/csv").send([columns, ...rows.map(row => columns.map(column => (row as Record<string, unknown>)[column]))].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n");
      } else {
        res.setHeader("Content-Disposition", 'attachment; filename="exter-human-labels.json"'); res.json(result);
      }
    } catch (cause) { error(res, cause); }
  });
  app.get("/api/labelling/guide", async (_req, res) => {
    try {
      const guide = await readFile(new URL("../../research/LABELLING-GUIDE.md", import.meta.url), "utf8");
      res.type("text/plain").send(guide);
    } catch { res.status(503).json({ error: "Labelling guide unavailable." }); }
  });
  return service;
}
