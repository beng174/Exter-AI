import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Express, Request, Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import type pg from "pg";
import { z } from "zod";
import { readBrand } from "../db.js";
import { protectSettingsMutation } from "../request-guard.js";
import { infrastructureDatabase } from "../infrastructure/database.js";
import { budgetStatus } from "../infrastructure/budget.js";
import { CREATOR_RULE_VERSION, creatorCsv, creatorHandle, creatorPrecision, emptyDiscovery, matchesCreator, parseCreatorLabels } from "../../shared/creator-discovery.js";
import { ApifyCreatorProvider } from "./apify.js";
import { InstagramCreatorVerifier, publicCreatorUrl } from "./discovery-provider.js";
import { briefDigest, briefSchema, deleteDiscoveryCreator, discoveryBatchCount, discoverySnapshot, filtersSchema, readDiscoveryCreators, readCreatorRejections, rescreenCreatorRules, saveCreatorSegment, suppressionHash } from "./discovery-store.js";
import { enqueueCreatorDiscovery, enqueueCreatorRefresh } from "./discovery-jobs.js";
export interface CreatorApiOptions {
  pool?: pg.Pool; env?: Record<string, string | undefined>; now?: () => Date;
  labels?: () => Promise<string>; fixtureLabels?: boolean;
}
export function attachCreatorDiscovery(app: Express, db: DatabaseSync, options: CreatorApiOptions = {}) {
  const env = options.env ?? process.env, pool = () => options.pool ?? (env.DATABASE_URL ? infrastructureDatabase() : null), now = () => options.now?.() ?? new Date();
  const provider = new ApifyCreatorProvider({ env }), verifier = new InstagramCreatorVerifier({ env });
  app.use("/api/creator-discovery", protectSettingsMutation);
  const workspace = (req: Request) => { const id = req.method === "GET" ? req.query.workspaceId : req.body?.workspaceId; if (typeof id !== "string" || !readBrand(db, id) || readBrand(db, id)!.mode === "demo" || req.query.demo === "1") throw new Error(); return id; };
  const route = (handler: (req: Request, res: Response, id: string, p: pg.Pool) => Promise<unknown>) => (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    Promise.resolve().then(async () => { const id = workspace(req), p = pool(); if (!p) { res.status(409).json({ error: "Creator research needs its database configured." }); return; } await handler(req, res, id, p); }).catch(e => res.status(e instanceof z.ZodError ? 400 : 409).json({ error: e instanceof z.ZodError ? "Check the creator brief fields and follower range." : "Creator research could not finish. Check settings or refresh the page." }));
  };
  app.get("/api/creator-discovery", (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    Promise.resolve().then(async () => { const id = workspace(req), p = pool(); const value = p ? await discoverySnapshot(p, id,now()) : emptyDiscovery(), config = provider.researchConfiguration(); value.configured = Boolean(p && config.configured); value.verificationConfigured = verifier.configured(); value.reason = value.configured ? value.verificationConfigured ? "Internal research until all three accuracy checks pass." : "Official account checks need their access configured." : config.reason; res.json(value); }).catch(() => res.status(422).json({ error: "Saved creator research could not be read." }));
  });
  app.post("/api/creator-discovery/quote", route(async (req, res, id, p) => {
    const brief = briefSchema.parse(req.body?.brief);
    if([env.APIFY_TOKEN,env.EXTER_INSTAGRAM_ACCESS_TOKEN].some(secret=>secret&&JSON.stringify(brief).includes(secret)))throw new Error();
    const config = provider.researchConfiguration();
    if (!config.configured || config.reserveGbp === null) { res.status(409).json({ error: config.reason }); return; }
    const batches = discoveryBatchCount(brief), cost = Number((batches * config.reserveGbp).toFixed(6)), budget = (await budgetStatus(p)).find(b => b.cost_type === "data_providers");
    const available = Boolean(budget && !budget.paused && budget.remaining_gbp >= cost), quote = randomUUID(), expiry = new Date(now().getTime() + 15 * 60000);
    if (available) await p.query("INSERT INTO creator_discovery_quotes(id,workspace_id,brief,brief_version,max_cost_gbp,per_batch_gbp,conversion,batches,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [quote, id, JSON.stringify(brief), briefDigest(brief), cost, config.reserveGbp, config.conversion, batches, expiry]);
    res.json({ id: quote, maxCostGbp: cost, batches, expiresAt: expiry.toISOString(), available, reason: available ? "Maximum reserved cost. Official checks follow in the background." : "This search exceeds the remaining data-provider budget." });
  }));
  app.post("/api/creator-discovery/run", route(async (req, res, id, p) => {
    if (!provider.researchConfiguration().configured) throw new Error();
    const quote = z.string().uuid().parse(req.body?.quoteId);
    const seeds=db.prepare("SELECT id,json_extract(data,'$.brandedContentPartner.profileUrl') AS url FROM ads WHERE brand_id=? AND source='public' AND json_extract(data,'$.brandedContentPartner.profileUrl') IS NOT NULL LIMIT 1000").all(id) as {id:string;url:string}[];
    const visible=db.prepare("SELECT a.id,json_extract(e.value,'$.value') AS handle FROM ads a,json_each(a.data,'$.videoAnalysis.fields.creatorEvidence') e WHERE a.brand_id=? AND a.source='public' AND json_extract(e.value,'$.kind')='visible-creator-handle' AND json_extract(e.value,'$.value') LIKE '@%' AND json_array_length(json_extract(e.value,'$.timestamps'))>0 LIMIT 1000").all(id) as {id:string;handle:string}[];
    for(const found of visible){const handle=creatorHandle(found.handle);if(handle)seeds.push({id:found.id,url:`https://www.instagram.com/${handle}/`});}
    for(const seed of seeds){const url=publicCreatorUrl(seed.url),handle=url?creatorHandle(new URL(url).pathname.replaceAll("/","")):null;if(handle)await p.query("INSERT INTO creator_discovery_ad_handles(workspace_id,handle,ad_ids) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM creator_discovery_suppression WHERE workspace_id=$1 AND handle_hash=$4) ON CONFLICT(workspace_id,handle) DO UPDATE SET ad_ids=(SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(creator_discovery_ad_handles.ad_ids || excluded.ad_ids) x)",[id,handle,JSON.stringify([seed.id]),suppressionHash(id,handle)]);}
    res.status(202).json({ id: await enqueueCreatorDiscovery(p, id, quote) });
  }));
  app.post("/api/creator-discovery/save", route(async (req, res, id, p) => {
    const handle = creatorHandle(req.body?.handle), saved = z.boolean().parse(req.body?.saved); if (!handle) throw new Error();
    await rescreenCreatorRules(p,id,now());
    if(saved){const row=(await readDiscoveryCreators(p,id)).find(r=>r.profile.handle===handle);if(!row||!matchesCreator(row,{},"Results",now())){res.status(409).json({error:"Only creators who pass every brief rule can be saved."});return;}}
    const result = await p.query("UPDATE creator_discovery_results SET saved=$3,used_at=now() WHERE workspace_id=$1 AND handle=$2 AND (NOT $3 OR (evaluation->'screen'->>'disposition'='Results' AND evaluation->>'ruleVersion'=$4 AND brief_version=(SELECT brief_version FROM creator_discovery_settings WHERE workspace_id=$1) AND (evaluation->'screen'->>'activeUntil')::timestamptz>=$5)) RETURNING handle", [id, handle, saved,CREATOR_RULE_VERSION,now()]); if (!result.rowCount) throw new Error(); res.json({ saved });
  }));
  app.post("/api/creator-discovery/delete", route(async (req, res, id, p) => { const handle = creatorHandle(req.body?.handle); if (!handle) throw new Error(); await deleteDiscoveryCreator(p, id, handle); res.json({ deleted: true }); }));
  app.post("/api/creator-discovery/refresh", route(async (_req, res, id, p) => { if (!verifier.configured()) throw new Error(); res.status(202).json({ id: await enqueueCreatorRefresh(p, id, now()) }); }));
  app.post("/api/creator-discovery/segments", route(async (req, res, id, p) => { const name = z.string().trim().min(1).max(100).parse(req.body?.name), filters = filtersSchema.parse(req.body?.filters); res.status(201).json({ id: await saveCreatorSegment(p, id, name, filters) }); }));
  app.post("/api/creator-discovery/segments/delete", route(async (req, res, id, p) => { const segment = z.string().uuid().parse(req.body?.segmentId); await p.query("DELETE FROM creator_discovery_segments WHERE workspace_id=$1 AND id=$2", [id, segment]); res.json({ deleted: true }); }));
  app.get("/api/creator-discovery/export", route(async (req, res, id, p) => {
    await rescreenCreatorRules(p,id,now());
    const filters = filtersSchema.parse(req.query.filters ? JSON.parse(String(req.query.filters)) : {}), rows = await readDiscoveryCreators(p, id);
    res.setHeader("Content-Disposition", 'attachment; filename="internal-creator-research.csv"'); res.type("text/csv").send(creatorCsv(rows.filter(r => matchesCreator(r, filters))));
  }));
  app.get("/api/creator-discovery/preview", route(async (req, res, id, p) => {
    const handle = creatorHandle(req.query.handle), postId = z.string().max(150).parse(req.query.postId); if (!handle) throw new Error();
    const row = (await p.query("SELECT image FROM creator_discovery_previews WHERE workspace_id=$1 AND handle=$2 AND post_id=$3", [id, handle, postId])).rows[0]; if (!row) { res.sendStatus(404); return; }
    res.setHeader("X-Content-Type-Options", "nosniff"); res.type("image/png").send(row.image);
  }));
  app.post("/api/creator-discovery/validate", route(async (_req, res, id, p) => {
    await rescreenCreatorRules(p,id,now());
    const csv = await (options.labels ? options.labels() : readFile(new URL("../../research/creator-briefs/test-set.csv", import.meta.url), "utf8")), labels = parseCreatorLabels(csv);
    const setting = (await p.query("SELECT brief_version FROM creator_discovery_settings WHERE workspace_id=$1", [id])).rows[0]; if (!setting) throw new Error();
    const results = creatorPrecision(labels, [...await readDiscoveryCreators(p, id),...await readCreatorRejections(p,id)], setting.brief_version, now().toISOString(), options.fixtureLabels ?? false);
    await p.query("INSERT INTO creator_discovery_validation(workspace_id,brief_version,input_hash,results,checked_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id) DO UPDATE SET brief_version=excluded.brief_version,input_hash=excluded.input_hash,results=excluded.results,checked_at=excluded.checked_at", [id, setting.brief_version, createHash("sha256").update(csv).digest("hex"), JSON.stringify(results), now()]); res.json(results);
  }));
}
