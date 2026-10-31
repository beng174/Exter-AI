import type { DatabaseSync } from "node:sqlite";
import { readBrand } from "../db.js";
import type { Express } from "express";
import { infrastructureDatabase } from "./database.js";
import { budgetStatus } from "./budget.js";
import { metaStatus } from "../connectors/meta-library.js";
import { enqueueCollection } from "./jobs.js";
export function attachInfrastructure(app: Express, db: DatabaseSync) {
  app.get("/api/infrastructure/status", async (_req,res) => {
    const meta = metaStatus();
    if (!process.env.DATABASE_URL) { res.json({ meta, database: "not_configured", budgets: [], message: "Durable collection and paid inference paused: DATABASE_URL is not configured." }); return; }
    try {
      const pool = infrastructureDatabase();
      const [budgets,runs] = await Promise.all([budgetStatus(pool),pool.query("SELECT id,watchlist_id,status,records_new,records_updated,started_at,finished_at,last_successful_check,errors FROM collection_runs ORDER BY started_at DESC LIMIT 20")]);
      res.json({ meta, database: "connected", budgets, runs: runs.rows });
    } catch { res.json({ meta, database: "unavailable", message: "Collection database unavailable. Check DATABASE_URL and run migrations." }); }
  });
  app.put("/api/budgets/:type", async (req,res) => {
    if (!["inference","data_providers"].includes(String(req.params.type)) || typeof req.body?.monthly_budget_gbp !== "number" || !Number.isFinite(req.body.monthly_budget_gbp) || req.body.monthly_budget_gbp < 0) { res.status(400).json({ error: "Provide a valid cost type and non-negative monthly_budget_gbp." }); return; }
    try { await infrastructureDatabase().query("UPDATE budget_settings SET monthly_budget_gbp=$2 WHERE cost_type=$1", [req.params.type,req.body.monthly_budget_gbp]); res.json({ saved: true }); }
    catch { res.status(503).json({ error: "Budget database unavailable." }); }
  });
  app.get("/api/public/meta/watchlists", async (req,res) => {
    if (typeof req.query.workspaceId !== "string" || !readBrand(db,req.query.workspaceId)) { res.status(400).json({ error: "Choose an existing workspace." }); return; }
    try { res.json((await infrastructureDatabase().query("SELECT * FROM watchlists WHERE workspace_id=$1 ORDER BY id", [req.query.workspaceId])).rows); }
    catch { res.status(503).json({ error: "Collection database unavailable." }); }
  });
  app.put("/api/public/meta/watchlists/:id", async (req,res) => {
    const { workspaceId, pageIds = [], searchTerms = [], countries = ["GB"] } = req.body || {};
    if (typeof workspaceId !== "string" || !workspaceId || workspaceId.length > 120 || String(req.params.id).length > 120 || !Array.isArray(pageIds) || pageIds.length > 100 || pageIds.some((v: unknown) => typeof v !== "string" || !/^\d{1,40}$/.test(v)) || !Array.isArray(searchTerms) || searchTerms.length > 20 || searchTerms.some((v: unknown) => typeof v !== "string" || !v.trim() || v.length > 200) || !Array.isArray(countries) || !countries.length || countries.length > 30 || countries.some((v: unknown) => typeof v !== "string" || !/^[A-Z]{2}$/.test(v)) || (!pageIds.length && !searchTerms.length)) {
      res.status(400).json({ error: "Provide a workspace, Meta page IDs or search terms, and two-letter countries." }); return;
    }
    if (!readBrand(db,workspaceId)) { res.status(404).json({ error: "Workspace not found." }); return; }
    try {
      await infrastructureDatabase().query(`INSERT INTO watchlists(id,workspace_id,page_ids,search_terms,countries) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(id) DO UPDATE SET workspace_id=excluded.workspace_id,page_ids=excluded.page_ids,search_terms=excluded.search_terms,countries=excluded.countries`, [req.params.id,workspaceId,JSON.stringify(pageIds),JSON.stringify(searchTerms),JSON.stringify(countries)]);
      res.json({ saved: true });
    } catch { res.status(503).json({ error: "Collection database unavailable." }); }
  });
  app.post("/api/public/meta/collect", async (req,res) => {
    if (metaStatus().status === "not_connected") { res.status(409).json(metaStatus()); return; }
    if (typeof req.body?.watchlistId !== "string" || !req.body.watchlistId || req.body.watchlistId.length > 120) { res.status(400).json({ error: "Provide watchlistId." }); return; }
    try { res.status(202).json({ runId: await enqueueCollection(infrastructureDatabase(),req.body.watchlistId) }); }
    catch { res.status(503).json({ error: "Cannot enqueue collection. Check database and watchlist configuration." }); }
  });
  app.get("/api/public/meta/observations", async (req,res) => {
    if (typeof req.query.workspaceId !== "string" || !req.query.workspaceId) { res.status(400).json({ error: "Provide workspaceId." }); return; }
    try {
      const result = await infrastructureDatabase().query("SELECT o.*,a.advertiser_id,a.start_time,a.stop_time FROM ad_observations o JOIN public_ads a USING(platform,native_id) WHERE o.workspace_id=$1 ORDER BY observed_at DESC LIMIT 100", [req.query.workspaceId]);
      res.json({ coverage: metaStatus().coverage, observations: result.rows });
    } catch { res.status(503).json({ error: "Collection database unavailable." }); }
  });
}
