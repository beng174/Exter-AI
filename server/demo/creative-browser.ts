import {ownedPagePerformance} from "../infrastructure/owned-read.js";
import {checkedRetainedMedia} from "../ad-media/file-health.js";
import {refreshCreativeIndex} from "../infrastructure/creative-index.js";
import {readCreativePage,type PageQuery} from "../infrastructure/creative-pages.js";
import {sqliteCreativePage} from "../infrastructure/sqlite-creative-page.js";
import {enrichLikelihood} from "../accuracy/predictions.js";
import {writeJsonRows} from "../infrastructure/json-rows.js";
import {LibraryReadGate} from "../infrastructure/library-read-gate.js";
import {readRetainedMedia,mergeRetainedMedia,mergePreviewState} from "../ad-media/read.js";
import {mergeProductCategories} from "../public-categories/jobs.js";
import {primaryCategories} from "../../shared/public-comparisons.js";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import type pg from "pg";
import { configuredCreativeCompetitors } from "./creative-competitors.js";
import type { CreativeBrowserResponse } from "../../shared/creative-browser.js";
import { readBrand } from "../db.js";
import { resolveDemoBrandId } from "./reconcile.js";
import { CreativeGalleryService } from "./gallery.js";
import { infrastructureDatabase } from "../infrastructure/database.js";
import {metaLibraryEnabled} from "../connectors/meta-library.js";
import {metaSourceHealth} from "../infrastructure/meta-evidence.js";
import type {MetaSourceHealth} from "../../shared/meta-public.js";
export interface BrowserOptions {
    getPool?: () => pg.Pool | null;
    now?: () => Date;
    /** Fixture observer. Production responses never expose database diagnostics. */
    onReadError?: (error:unknown)=>void;
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
        for(const [key,min,max] of [["offset",0,10000000],["limit",1,100]] as const){const raw=req.query[key];if(raw!==undefined&&(typeof raw!=="string"||!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<min||Number(raw)>max)){res.status(400).json({error:"Choose a valid page."});return;}}
        const disconnected=new AbortController(),onClose=()=>disconnected.abort();res.once("close",onClose);
        const release=await libraryReads.acquire(disconnected.signal);
        if(!release){res.off("close",onClose);if(!res.destroyed){res.setHeader("Retry-After","2");res.status(503).json({error:"The creative library is busy. Please try again shortly."});}return;}
        if(res.destroyed){res.off("close",onClose);release();return;}
        try {
            const gallery:CreativeGalleryService=typeof app.locals.creativeGallery?.selected==='function'?app.locals.creativeGallery:(app.locals.creativeGallery=new CreativeGalleryService(db)),competitors=configuredCreativeCompetitors(db,brand,app.locals.demoCollection);
            const pool=options.getPool?options.getPool():process.env.DATABASE_URL?infrastructureDatabase():null;
            const query:PageQuery={};for(const [key,value] of Object.entries(req.query)){if(typeof value!=="string"||value.length>(key==='refs'?20000:2000)){res.status(400).json({error:"Choose valid creative filters."});return;}(query as Record<string,string>)[key]=value;}
            const sources:CreativeBrowserResponse["sources"]=competitors.map(item=>({brandId:item.brandId,name:item.name,status:item.status}));
            let mediaReadStatus:CreativeBrowserResponse["mediaReadStatus"]="not_configured",categoryReadStatus:CreativeBrowserResponse["categoryReadStatus"]="not_configured";
            let metaSource:MetaSourceHealth={status:metaLibraryEnabled()?"unavailable":"off",enabled:metaLibraryEnabled(),lastSuccessfulCheck:null,message:metaLibraryEnabled()?"Collection database is not configured.":"Live collection is off. Saved evidence is retained."};
            if(pool)await refreshCreativeIndex(pool,db,brand,competitors,gallery,disconnected.signal);
            const page=pool?await readCreativePage(pool,brand,competitors,query,now):await sqliteCreativePage(db,brand,competitors,query,gallery);
            let creatives=page.rows;
            if((query as Record<string,string>).window==="research" && page.model.window.from && page.model.window.to){from=page.model.window.from;to=page.model.window.to;}
            if(pool){
                metaSource=await metaSourceHealth(pool,brand.id);
                for(const source of sources){const target=source.brandId||competitors.find(c=>c.name===source.name)?.key;if(page.model.brands.some(b=>b.brandId===target&&b.sample>0))source.status="collected";}
                // Rich legacy analysis/media is hydrated only for this page.
                for(const target of [brand.id,...competitors.flatMap(c=>c.brandId?[c.brandId]:[])]){
                    const selected=creatives.filter(c=>c.brandId===target);
                    const rich=await gallery.selected(target,selected.map(c=>c.nativeId));const byId=new Map(rich.map(c=>[c.nativeId,c]));
                    creatives=creatives.map(row=>{const r=row.brandId===target?byId.get(row.nativeId):null;return r?{...row,analysis:r.analysis,scenes:r.scenes||[],creatorEvidence:r.creatorEvidence,thumbnailUrl:r.thumbnailUrl,videoUrl:r.videoUrl,imageUrls:r.imageUrls,imageCount:r.imageCount,mediaAvailable:r.mediaAvailable,mediaStatus:r.mediaStatus,mediaSha256:r.mediaSha256}:row;});
                }
                try{creatives=mergeRetainedMedia(creatives,await checkedRetainedMedia(pool,await readRetainedMedia(pool,brand.id,creatives.map(c=>c.nativeId))),brand.id);mediaReadStatus="available";}catch{mediaReadStatus="unavailable";}
                creatives=await mergePreviewState(pool,brand.id,creatives);
                creatives=await mergeProductCategories(pool,brand.id,creatives);categoryReadStatus="available";
            }
            let ownedStatus: CreativeBrowserResponse["ownedStatus"] = "not_configured";
            try {
                const pool = options.getPool ? options.getPool() : process.env.DATABASE_URL ? infrastructureDatabase() : null;
                if (pool) {
                    const owned=await ownedPagePerformance(pool,brand.id,creatives,from,to);creatives=owned.rows;page.model.ownedScopes=owned.scopes;
                    ownedStatus = "available";
                }
            }
            catch {
                ownedStatus = "error";
            }
            creatives=enrichLikelihood(db,brand.id,creatives,now.toISOString());
            if(res.destroyed)return;
            await writeJsonRows(res,{sql:page.model,mediaReadStatus,categoryReadStatus,metaSource,brand:{id:brand.id,name:brand.name,domain:brand.domain,primaryCategories:primaryCategories(brand)},creatives,competitors,sources,ownedStatus,dateRange:page.dateRange,lastChecked:page.lastChecked,reportingRange:{from,to}} satisfies CreativeBrowserResponse,"creatives",{gzip:req.acceptsEncodings("gzip")==="gzip"});
        }
        catch(error) {
            options.onReadError?.(error);
            if(!res.destroyed&&!res.headersSent)res.status(503).json({ error: "Stored creative evidence is unavailable. No source collection or analysis was started." });
            else if(!res.destroyed)res.destroy();
        }finally{res.off("close",onClose);release();}
    });
}
