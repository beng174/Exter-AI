import type { DatabaseSync } from "node:sqlite";
import { readBrand } from "../db.js";
import type { Express } from "express";
import { infrastructureDatabase } from "./database.js";
import { budgetStatus } from "./budget.js";
import {metaLibraryEnabled} from "../connectors/meta-library.js";
import {configuredCreativeCompetitors} from "../demo/creative-competitors.js";
import {randomUUID} from "node:crypto";
import { metaStatus } from "../connectors/meta-library.js";
import { tiktokCommercialStatus } from "../connectors/tiktok-commercial.js";
import { enqueueCollection,CollectionBusyError } from "./jobs.js";
import {readMetaWatchlists} from "./meta-runs.js";
import {metaSourceHealth} from "./meta-evidence.js";
import {attachMetaPageCandidates,type PageLookupApiOptions} from "./meta-page-api.js";
import {databaseStorageHealth} from "./storage-health.js";
import {missingStorage} from "../../shared/storage-health.js";
import {mediaDiskHealth} from "../ad-media/storage.js";
type BudgetPool = ReturnType<typeof infrastructureDatabase>;

export function attachBudgetRoutes(app: Express, getPool: () => BudgetPool = infrastructureDatabase) {
  app.get("/api/budgets", async (_req,res) => {
    try {
      const budgets = await budgetStatus(getPool());
      res.json({ currency: "GBP", month: new Date().toISOString().slice(0,7), timezone: "UTC", pause_threshold: 0.9, budgets });
    } catch { res.status(503).json({ error: "Budget database unavailable. Check the database configuration and migrations in Render." }); }
  });
  app.put("/api/budgets/:type", async (req,res) => {
    const amount = req.body?.monthly_budget_gbp;
    const pence = typeof amount === "number" ? amount * 100 : NaN;
    if (!["inference","data_providers"].includes(String(req.params.type)) || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(pence)) || Math.abs(pence - Math.round(pence)) > 0.000001) {
      res.status(400).json({ error: "Provide a valid cost type and a non-negative monthly GBP budget with at most two decimal places." }); return;
    }
    try {
      const pool = getPool();
      await pool.query(`INSERT INTO budget_settings(cost_type,monthly_budget_gbp) VALUES($1,$2)
        ON CONFLICT(cost_type) DO UPDATE SET monthly_budget_gbp=excluded.monthly_budget_gbp`, [req.params.type,amount]);
      res.json({ saved: true, budget: (await budgetStatus(pool)).find(row => row.cost_type === req.params.type) });
    } catch { res.status(503).json({ error: "Budget database unavailable. The updated budget could not be confirmed." }); }
  });
}

export function attachInfrastructure(app: Express, db: DatabaseSync, getPool:()=>BudgetPool=infrastructureDatabase,pageOptions:PageLookupApiOptions={}) {
  attachBudgetRoutes(app);
  attachMetaPageCandidates(app,db,getPool,pageOptions);
  app.get("/api/infrastructure/status", async (_req,res) => {
    const meta = metaStatus();
    const tiktok=tiktokCommercialStatus();
    const mediaDisk=await mediaDiskHealth();
    if (!process.env.DATABASE_URL) { res.json({ meta, tiktok,mediaDisk, database: "not_configured", storage:missingStorage("not_configured"), budgets: [], message: "Durable collection and paid inference paused: DATABASE_URL is not configured." }); return; }
    try {
      const pool = getPool();
      const [budgets,runs,storage] = await Promise.all([budgetStatus(pool),pool.query("SELECT id,watchlist_id,status,records_new,records_updated,started_at,finished_at,last_successful_check,errors FROM collection_runs ORDER BY started_at DESC LIMIT 20"),databaseStorageHealth(pool)]);
      res.json({ meta, tiktok,mediaDisk, database: "connected", budgets, runs: runs.rows,storage });
    } catch { res.json({ meta, tiktok,mediaDisk, database: "unavailable", storage:missingStorage(), message: "Collection database unavailable. Check DATABASE_URL and run migrations." }); }
  });
  app.get("/api/public/meta/watchlists", async (req,res) => {
    const brand=typeof req.query.workspaceId==="string"?readBrand(db,req.query.workspaceId):null;
    if(!brand||brand.mode==="demo"){res.status(400).json({error:"Choose an existing real workspace."});return;}
    try { res.json(await readMetaWatchlists(getPool(),brand.id)); }
    catch { res.status(503).json({ error: "Collection database unavailable." }); }
  });
  app.get("/api/public/meta/source-status",async(req,res)=>{
    const brand=typeof req.query.workspaceId==="string"?readBrand(db,req.query.workspaceId):null;
    if(!brand||brand.mode==="demo"){res.status(400).json({error:"Choose an existing real workspace."});return;}
    try{res.json(await metaSourceHealth(getPool(),brand.id));}catch{res.status(503).json({error:"Saved collection health could not be read."});}
  });
  app.put("/api/public/meta/watchlists/:id", async (req,res) => {
    const {workspaceId,brandKey,purpose="brand",pageIds=[],searchTerms=[],countries=["GB"]}=req.body||{};
    const brand=typeof workspaceId==="string"?readBrand(db,workspaceId):null;
    if(!brand||brand.mode==="demo"){res.status(404).json({error:"Real workspace not found."});return;}
    const targets=[brand.id,...configuredCreativeCompetitors(db,brand,app.locals.demoCollection).map(b=>b.brandId||b.key)];
    if(!["brand","discovery"].includes(purpose)||String(req.params.id).length>120||!String(req.params.id)||!Array.isArray(pageIds)||pageIds.length>1||pageIds.some((v:unknown)=>typeof v!=="string"||!/^\d{1,30}$/.test(v))||!Array.isArray(searchTerms)||searchTerms.length>20||searchTerms.some((v:unknown)=>typeof v!=="string"||!v.trim()||v.length>200)||!Array.isArray(countries)||!countries.length||countries.length>30||countries.some((v:unknown)=>typeof v!=="string"||!/^[A-Z]{2}$/.test(v))||purpose==="brand"&&(!targets.includes(brandKey)||searchTerms.length)||purpose==="discovery"&&(pageIds.length||brandKey)){
      res.status(400).json({error:"Save one numeric Page ID per brand. Keywords are for category discovery only. Use two-letter countries."});return;
    }
    const client=await Promise.resolve().then(()=>getPool().connect()).catch(()=>null);
    if(!client){res.status(503).json({error:"Collection database unavailable."});return;}
    try{
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[brand.id]);
      const key=purpose==="brand"?brandKey:null;
      const existing=await client.query("SELECT * FROM watchlists WHERE id=$1 OR (workspace_id=$2 AND brand_key=$3) FOR UPDATE",[req.params.id,brand.id,key]);
      if(existing.rows.some(w=>w.workspace_id!==brand.id)){await client.query("ROLLBACK");res.status(409).json({error:"This watchlist belongs to another workspace."});return;}
      if(existing.rows.length>1||existing.rows.some(w=>w.brand_key&&w.brand_key!==key||w.purpose!==purpose)){await client.query("ROLLBACK");res.status(409).json({error:"Choose the saved watchlist for this brand or category."});return;}
      const old=existing.rows[0],id=old?.id||String(req.params.id)||randomUUID(),enabled=purpose==="discovery"?searchTerms.length>0:pageIds.length>0;
      const changed=old&&(JSON.stringify(old.page_ids)!==JSON.stringify(pageIds)||JSON.stringify(old.search_terms)!==JSON.stringify(searchTerms)||JSON.stringify(old.countries)!==JSON.stringify(countries)||old.brand_key!==key||old.purpose!==purpose);
      if(changed){
        // Retain old immutable runs and cursors, but never resume a different Page from an old cursor.
        await client.query("UPDATE collection_runs SET status='superseded',finished_at=now() WHERE watchlist_id=$1 AND status IN ('queued','running','paused','not_connected','failed')",[id]);
        await client.query("UPDATE collection_jobs j SET status='superseded',lease_until=NULL,lease_owner=NULL FROM collection_runs r WHERE r.id=j.id AND r.watchlist_id=$1 AND r.status='superseded'",[id]);
      }
      await client.query(`INSERT INTO watchlists(id,workspace_id,brand_key,purpose,page_ids,search_terms,countries,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(id) DO UPDATE SET brand_key=excluded.brand_key,purpose=excluded.purpose,page_ids=excluded.page_ids,search_terms=excluded.search_terms,countries=excluded.countries,enabled=excluded.enabled,revision=watchlists.revision+$9`,[id,brand.id,key,purpose,JSON.stringify(pageIds),JSON.stringify(searchTerms),JSON.stringify(countries),enabled,changed?1:0]);
      await client.query("COMMIT");res.json({saved:true,id});
    }catch(error){await client.query("ROLLBACK");if((error as {code?:string}).code==="23505")res.status(409).json({error:"This Page ID is already assigned to a watchlist brand in this workspace."});else res.status(503).json({error:"The watchlist could not be saved. Earlier collection history is retained."});}finally{client.release();}
  });
  app.post("/api/public/meta/collect", async (req,res) => {
    if(!metaLibraryEnabled()){res.status(409).json({error:"Live collection is off. Enable it in Render before collecting."});return;}
    if (metaStatus().status === "not_connected") { res.status(409).json(metaStatus()); return; }
    if (typeof req.body?.watchlistId !== "string" || !req.body.watchlistId || req.body.watchlistId.length > 120) { res.status(400).json({ error: "Provide watchlistId." }); return; }
    try {
      const pool=getPool();
      if(req.body.workspaceId!==undefined){
        const brand=typeof req.body.workspaceId==="string"?readBrand(db,req.body.workspaceId):null;
        if(!brand||brand.mode==="demo"){res.status(404).json({error:"Choose an existing real workspace."});return;}
        const saved=await pool.query("SELECT id FROM watchlists WHERE id=$1 AND workspace_id=$2 AND purpose='brand'",[req.body.watchlistId,brand.id]);
        if(!saved.rowCount){res.status(404).json({error:"The brand watchlist is not available in this workspace."});return;}
      }
      if((await budgetStatus(pool)).find(b=>b.cost_type==="data_providers")?.paused!==false){res.status(409).json({error:"Collection is paused by the data provider budget. Review Budgets and schedule before retrying."});return;}
      res.status(202).json({runId:await enqueueCollection(pool,req.body.watchlistId)});
    } catch(error) { res.status(error instanceof CollectionBusyError?409:503).json({ error:error instanceof CollectionBusyError?error.message:"Cannot enqueue collection. Check database and watchlist configuration." }); }
  });
  app.get("/api/public/meta/observations", async (req,res) => {
    if (typeof req.query.workspaceId !== "string" || !req.query.workspaceId) { res.status(400).json({ error: "Provide workspaceId." }); return; }
    try {
      const result = await getPool().query(`SELECT o.*,a.advertiser_id,a.start_time,a.stop_time,COALESCE(o.raw_payload,p.raw_payload) AS raw_payload
        FROM ad_observations o JOIN public_ads a USING(platform,native_id)
        LEFT JOIN ad_observations p ON p.platform=o.platform AND p.native_id=o.native_id AND p.run_id=o.raw_payload_run_id AND p.workspace_id=o.workspace_id
        WHERE o.workspace_id=$1 ORDER BY o.observed_at DESC,o.run_id DESC LIMIT 100`, [req.query.workspaceId]);
      res.json({ coverage: metaStatus().coverage, observations: result.rows });
    } catch { res.status(503).json({ error: "Collection database unavailable." }); }
  });
}
