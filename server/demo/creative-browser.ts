import {writeJsonRows} from "../infrastructure/json-rows.js";
import {LibraryReadGate} from "../infrastructure/library-read-gate.js";
import {readRetainedMedia,mergeRetainedMedia} from "../ad-media/read.js";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import type pg from "pg";
import { configuredCreativeCompetitors } from "./creative-competitors.js";
import type { BrowserCreative, CreativeBrowserResponse, CreativePerformance } from "../../shared/creative-browser.js";
import { ownedMetrics, type OwnedDay } from "../../shared/owned-metrics.js";
import {researchWindow} from "../../shared/creative-research.js";
import { readBrand } from "../db.js";
import { resolveDemoBrandId } from "./reconcile.js";
import type { CreativeGalleryService } from "./gallery.js";
import type { BrandDemoService } from "./service.js";
import { infrastructureDatabase } from "../infrastructure/database.js";
import {metaLibraryEnabled} from "../connectors/meta-library.js";
import {metaSourceHealth,readPublicCreatives} from "../infrastructure/meta-evidence.js";
import type {MetaSourceHealth} from "../../shared/meta-public.js";
export interface BrowserOptions {
    getPool?: () => pg.Pool | null;
    now?: () => Date;
}
export function attachCreativeBrowser(app: Express, db: DatabaseSync, options: BrowserOptions = {}) {
    const libraryReads=new LibraryReadGate();
    app.get("/api/brands/:brandId/creative-competitors",(req,res)=>{
        res.setHeader("Cache-Control","private, no-store");
        try {
            const brand=readBrand(db,resolveDemoBrandId(db,String(req.params.brandId)));
            if(!brand||brand.mode==="demo"){res.status(404).json({error:"Real workspace not found."});return;}
            res.json({brandId:brand.id,competitors:configuredCreativeCompetitors(db,brand,app.locals.demoCollection)});
        }catch{res.status(503).json({error:"The configured competitor set could not be read."});}
    });
    app.get("/api/brands/:brandId/creatives", async (req, res) => {
        res.setHeader("Cache-Control", "private, no-store");
        res.vary("Accept-Encoding");
        const brand = readBrand(db, resolveDemoBrandId(db, String(req.params.brandId)));
        if (!brand || brand.mode === "demo") {
            res.status(404).json({ error: "Real workspace not found." });
            return;
        }
        const now = options.now?.() || new Date(), date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
        if ((req.query.from !== undefined && !date(req.query.from)) || (req.query.to !== undefined && !date(req.query.to))) {
            res.status(400).json({ error: "Choose valid reporting dates." });
            return;
        }
        let from = String(req.query.from || new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10)), to = String(req.query.to || now.toISOString().slice(0, 10));
        if (from > to && (req.query.window !== "research" || req.query.from && req.query.to)) {
            res.status(400).json({ error: "The reporting start must precede the end." });
            return;
        }
        const disconnected=new AbortController(),onClose=()=>disconnected.abort();res.once("close",onClose);
        const release=await libraryReads.acquire(disconnected.signal);
        if(!release){res.off("close",onClose);if(!res.destroyed){res.setHeader("Retry-After","2");res.status(503).json({error:"The creative library is busy. Please try again shortly."});}return;}
        if(res.destroyed){res.off("close",onClose);release();return;}
        try {
            const gallery = app.locals.creativeGallery as CreativeGalleryService, reports = app.locals.brandDemo as BrandDemoService;
            const competitors=configuredCreativeCompetitors(db,brand,app.locals.demoCollection);
            const ids=new Set([brand.id,...competitors.flatMap(item=>item.brandId?[item.brandId]:[])]);
            const sources:CreativeBrowserResponse["sources"]=competitors.map(item=>({brandId:item.brandId,name:item.name,status:item.status}));
            let creatives: BrowserCreative[] = [];
            for (const id of ids) {
                try {
                    const list = await gallery.list(id);
                    const coverage=sources.find(item=>item.brandId===id&&item.status==="configured");
                    if(coverage)coverage.status=list.creatives.some(item=>!item.owned)?"collected":"not-collected";
                    let scores: ReturnType<BrandDemoService["report"]>["scores"] = [];
                    let scoreError=false;
                    try {
                        scores = reports.report(id).scores;
                    }
                    catch { scoreError=true; }
                    for (const item of list.creatives) {
                        if (id !== brand.id && item.owned)
                            continue;
                        creatives.push({ ...item, publicEvidence:!item.owned, platform: item.platform || "Unavailable", owned: id === brand.id && item.owned === true, workspaceBrand: id === brand.id, sourceKind: item.owned && id === brand.id ? "owned" : "public", placements: item.placements || [], score: scores.find(score => score.adId === item.adId || score.nativeId === item.nativeId) || null, scoreError, performance: [], scenes: item.scenes || [] });
                    }
                }
                catch {
                    sources.push({ brandId: id, name: competitors.find(item => item.brandId === id)?.name || "Configured brand", status: "error", message: "Stored creative data could not be read. Earlier records are preserved." });
                }
            }
            let metaSource:MetaSourceHealth={status:metaLibraryEnabled()?"unavailable":"off",enabled:metaLibraryEnabled(),lastSuccessfulCheck:null,message:metaLibraryEnabled()?"Collection database is not configured.":"Live collection is off. Saved evidence is retained."};
            try {
                const pool=options.getPool?options.getPool():process.env.DATABASE_URL?infrastructureDatabase():null;
                if(pool){
                    const official=await readPublicCreatives(pool,brand.id,creatives,brand,competitors);
                    const health=await metaSourceHealth(pool,brand.id);
                    let merged=official;
                    try{merged=mergeRetainedMedia(official,await readRetainedMedia(pool,brand.id),brand.id);}catch{/* An upgrade or media failure cannot hide official evidence. */}
                    creatives=merged;metaSource=health;
                    for(const source of sources){const target=source.brandId||competitors.find(b=>b.name===source.name)?.key;if(source.status!=="error"&&creatives.some(row=>!row.owned&&row.brandId===target))source.status="collected";}
                }
            }catch{metaSource={status:"unavailable",enabled:metaLibraryEnabled(),lastSuccessfulCheck:null,message:"Saved public collection could not be read. Earlier media and analysis are retained."};}
            if(res.destroyed)return;
            // Resolve the research window before owned cohorts, without a second library response.
            if(req.query.window === "research") {
                const window=researchWindow(creatives,req.query.from as string|undefined,req.query.to as string|undefined,now);
                if(window.from)from=window.from;
                if(window.to)to=window.to;
            }
            if(from>to){res.status(400).json({error:"The reporting start must precede the end."});return;}
            let ownedStatus: CreativeBrowserResponse["ownedStatus"] = "not_configured";
            try {
                const pool = options.getPool ? options.getPool() : process.env.DATABASE_URL ? infrastructureDatabase() : null;
                if (pool) {
                    const result = await pool.query("SELECT d.data FROM owned_ad_days d JOIN owned_accounts a ON a.id=d.owned_account_id WHERE a.workspace_id=$1 AND d.day BETWEEN $2::date AND $3::date ORDER BY d.day,d.ad_id LIMIT 100001", [brand.id, from, to]);
                    if (result.rows.length > 100000)
                        throw new Error("Narrow the reporting window.");
                    const withOwned=result.rows.length?creatives.map(item=>({...item,performance:[] as CreativePerformance[]})):creatives;
                    const ownedIndex=new Map(withOwned.filter(item=>item.workspaceBrand).map(item=>[JSON.stringify([item.platform,item.nativeId]),item]));
                    const rows = result.rows.map(row => row.data as OwnedDay), groups = new Map<string, OwnedDay[]>();
                    for (const row of rows) {
                        const key = JSON.stringify([row.platform, row.accountId, row.currency, row.attribution, row.conversionEvent]);
                        const group = groups.get(key) || [];
                        group.push(row);
                        groups.set(key, group);
                    }
                    for (const [key, group] of groups) {
                        const benchmark = ownedMetrics(group), ads = new Map<string, OwnedDay[]>();
                        for (const row of group) {
                            const days = ads.get(row.adId) || [];
                            days.push(row);
                            ads.set(row.adId, days);
                        }
                        for (const [nativeId, days] of ads) {
                            const latest = [...days].sort((a, b) => b.pulledAt.localeCompare(a.pulledAt))[0];
                            const identity=JSON.stringify([latest.platform,nativeId]);
                            let creative = ownedIndex.get(identity);
                            if (!creative) {
                                creative = { adId: `owned:${brand.id}:${latest.platform}:${latest.accountId}:${nativeId}`, nativeId, brandId: brand.id, brandName: brand.name, title: latest.adName || `Ad ${nativeId}`, copy: "", sourceUrl: latest.platform === "Meta" && /^\d+$/.test(nativeId) ? `https://www.facebook.com/ads/library/?id=${nativeId}` : null, mediaKind: "unknown", durationSeconds: null, thumbnailUrl: null, videoUrl: null, imageUrls: [], imageCount: 0, mediaAvailable: false, mediaStatus: "not-stored", analysis: null, creativeFormat: null, hookType: null, angle: null, offerType: null, ugc: null, creatorEvidence: [], partnershipAttribution: null, deliveryStatus: "unknown", deliveryStartAt: null, deliveryStopAt: null, observedAt: latest.pulledAt, firstObservedAt: null, daysRunning: null, daysRunningAsOf: null, daysRunningBasis: null, searchText: latest.adName || "", platform: latest.platform, owned: true, workspaceBrand: true, sourceKind: "owned", publicEvidence:false, placements: [], score: null, performance: [], scenes: [] };
                                withOwned.push(creative);
                                ownedIndex.set(identity,creative);
                            }
                            creative.owned = true;
                            creative.sourceKind = "owned";
                            const cohort: CreativePerformance = { id: key, accountId: latest.accountId, platform: latest.platform, currency: latest.currency, attribution: latest.attribution, conversionEvent: latest.conversionEvent, from, to, lastChecked: latest.pulledAt, benchmarkSampleSize: ads.size, metrics: ownedMetrics(days), benchmark };
                            creative.performance.push(cohort);
                        }
                    }
                    creatives=withOwned;
                    ownedStatus = "available";
                }
            }
            catch {
                ownedStatus = "error";
            }
            const dates = creatives.flatMap(item => [item.firstObservedAt, item.observedAt].filter((value): value is string => Boolean(value))).sort();
            if(res.destroyed)return;
            await writeJsonRows(res,{ metaSource, brand: { id: brand.id, name: brand.name, domain: brand.domain }, creatives, competitors, sources, ownedStatus, dateRange: { from: dates[0] || null, to: dates.at(-1) || null }, lastChecked: dates.at(-1) || null, reportingRange: { from, to } } satisfies CreativeBrowserResponse,"creatives",{gzip:req.acceptsEncodings("gzip")==="gzip"});
        }
        catch {
            if(!res.destroyed&&!res.headersSent)res.status(503).json({ error: "Stored creative evidence is unavailable. No source collection or analysis was started." });
            else if(!res.destroyed)res.destroy();
        }finally{res.off("close",onClose);release();}
    });
}
