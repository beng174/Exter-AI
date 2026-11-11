import {checkWorkspaceMediaSlice} from "./file-health.js";
import {readMediaCoverage,readMissingMedia} from "./coverage.js";
import {actorCounts,mediaInputDetails} from "./apify.js";
import {captionDomain} from "../../shared/meta-page-candidates.js";
import {diagnosticNumber} from "../../shared/meta-collection.js";
import {createHash,randomUUID,timingSafeEqual} from "node:crypto";
import {isIP} from "node:net";
import type {Express} from "express";
import type {DatabaseSync} from "node:sqlite";
import type pg from "pg";
import {readBrand} from "../db.js";
import {infrastructureDatabase} from "../infrastructure/database.js";
import {MEDIA_ERRORS,mediaEnabled,mediaGbpRate,type AdMediaRunSummary} from "../../shared/ad-media.js";
import {AdMediaStorage,mediaDiskHealth} from "./storage.js";
import {claimAdMedia,enqueueAdMedia,stepAdMedia,scheduleAdMedia} from "./jobs.js";
import {brokerAcknowledgement,workerDiagnostic,type WorkerObserver} from "../infrastructure/worker-diagnostics.js";
import {clearWorkerFailures} from "../infrastructure/worker-recovery.js";
import {protectSettingsMutation} from "../request-guard.js";
import {assertProxySupport} from "../connectors/http.js";
import type {CreativeGalleryService} from "../demo/gallery.js";
import {configuredCreativeCompetitors} from "../demo/creative-competitors.js";
const digest=(value:string)=>createHash("sha256").update(value).digest();
function savedMediaPlan(row:Record<string,any>){
 const day=(value:unknown)=>value instanceof Date&&Number.isFinite(value.getTime())?value.toISOString().slice(0,10):typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
 const from=day(row.window_from),to=day(row.window_to),cap=diagnosticNumber(row.cap);
 return typeof row.page_id==="string"&&/^\d{1,30}$/.test(row.page_id)&&from&&to&&cap&&cap<=500?{pageId:row.page_id,from,to,cap,mode:row.phase==="page"?"Page search":"Exact ad IDs"}:null;
}
export function mediaBrokerConfig(env:Record<string,string|undefined>){
  const token=env.EXTER_AD_MEDIA_BROKER_TOKEN||"",raw=env.EXTER_AD_MEDIA_BROKER_ORIGIN||"";
  if(token.length<32||token.length>4096||/\s|[\u0000-\u001f]/.test(token))return null;
  try{const url=new URL(raw);if(url.protocol!=="https:"||url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash||isIP(url.hostname)||!url.hostname.includes(".")||/(?:^|\.)(?:localhost|internal|local|invalid)$/.test(url.hostname))return null;return {origin:url.origin,token};}catch{return null;}
}
export async function adMediaRuns(pool:pg.Pool,workspaceId:string):Promise<AdMediaRunSummary[]>{
  const result=await pool.query(`SELECT r.*,l.cost_gbp::float8,l.initial_reserved_gbp::float8,l.status AS cost_status FROM ad_media_runs r LEFT JOIN cost_ledger l ON l.id=r.reservation_id WHERE r.workspace_id=$1 ORDER BY r.started_at DESC LIMIT 20`,[workspaceId]);
  return result.rows.map(r=>({diagnostics:{plan:savedMediaPlan(r),requested:Array.isArray(r.requested_ids)?r.requested_ids.length:null,returned:r.requested_ids?diagnosticNumber(r.returned_ads):null,matched:r.requested_ids?diagnosticNumber(r.matched_ads):null,actorRequested:diagnosticNumber(r.actor_requested_count),actorInput:diagnosticNumber(r.actor_input_count),actorReturned:diagnosticNumber(r.actor_returned_count),actorQueries:diagnosticNumber(r.actor_query_count),stopReasons:actorCounts({type:"run-summary",queries:(Array.isArray(r.actor_stop_reasons)?r.actor_stop_reasons:[]).map((stopReason:unknown)=>({stopReason}))})!.stopReasons,input:mediaInputDetails(r.input_details)},id:r.id,lookupMode:r.lookup_mode,brandKey:r.brand_key,status:r.status,startedAt:new Date(r.started_at).toISOString(),finishedAt:r.finished_at?new Date(r.finished_at).toISOString():null,results:r.results,adsWithMedia:r.ads_with_media,costGbp:r.cost_gbp??0,reservedGbp:r.initial_reserved_gbp??null,costStatus:r.cost_status||"not_started",gbpPerUsd:r.gbp_per_usd===null?null:Number(r.gbp_per_usd),error:r.error_kind?MEDIA_ERRORS[r.error_kind]||MEDIA_ERRORS.provider:null}));
}
/** Dedicated machine auth grants one leased media step, with no general app access. */
export function attachMediaStep(app:Express,db:DatabaseSync,getPool= infrastructureDatabase,env:Record<string,string|undefined>=process.env){
  app.post("/api/ad-media/step/:runId/:owner",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    const token=env.EXTER_AD_MEDIA_BROKER_TOKEN||"",supplied=req.get("X-Exter-Ad-Media-Token")||"";
    if(token.length<32||token.length>4096||/\s/.test(token)||!timingSafeEqual(digest(token),digest(supplied))){res.status(401).json({error:"Media service authentication required."});return;}
    if(!mediaEnabled(env)){res.status(409).json({error:"Media collection is off."});return;}
    if(!/^[a-f0-9-]{36}$/.test(String(req.params.runId))||!/^[a-f0-9-]{36}$/.test(String(req.params.owner))){res.status(400).json({error:"A leased media step is required."});return;}
    try{
      const pool=getPool(),r=(await pool.query("SELECT workspace_id,brand_key,target_ids FROM ad_media_runs WHERE id=$1 AND lease_owner=$2 AND lease_until>now()",[req.params.runId,req.params.owner])).rows[0],brand=r?readBrand(db,r.workspace_id):null;
      if(!brand||brand.mode==="demo"){res.status(404).json({error:"Real workspace not found."});return;}
      const existingIds=new Set<string>(),existingVideoIds=new Set<string>(),existingVideoCandidates=new Set<string>(),gallery=app.locals.creativeGallery as CreativeGalleryService|undefined;
      const target=r.brand_key===brand.id?brand.id:configuredCreativeCompetitors(db,brand,app.locals.demoCollection).find(c=>(c.brandId||c.key)===r.brand_key)?.brandId;
      if(gallery&&target){
        // A failed legacy media read must not become permission to buy those files again.
        const saved=await gallery.selected(target,r.target_ids);
        for(const row of saved)if(row.mediaAvailable&&["Meta","Facebook","Instagram"].includes(row.platform||"")){
          if(row.thumbnailUrl||row.imageUrls.length)existingIds.add(row.nativeId);
          if(row.videoUrl)existingVideoIds.add(row.nativeId);
          if(row.mediaKind==="video")existingVideoCandidates.add(row.nativeId);
        }
      }
      const candidateName=configuredCreativeCompetitors(db,brand,app.locals.demoCollection).find(c=>(c.brandId||c.key)===r.brand_key)?.name;
      const host=captionDomain(r.brand_key===brand.id?brand.domain:brand.competitorProfiles?.find(c=>c.name.toLowerCase()===candidateName?.toLowerCase())?.domain||(target?readBrand(db,target)?.domain:null));
      const storage=new AdMediaStorage({images:{allowedHosts:host?[host,`*.${host}`]:[]}});
      let diagnostic:ReturnType<typeof workerDiagnostic>|undefined;
      const worked=await stepAdMedia(pool,String(req.params.runId),String(req.params.owner),{env,storage,existingIds,existingVideoIds,existingVideoCandidates,onFailure:error=>{diagnostic=workerDiagnostic(error);}});
      res.json({worked,...(diagnostic?{diagnostic}:{})});
    }catch(error){res.status(503).json({error:"The saved media step could not complete.",diagnostic:workerDiagnostic(error)});}
  });
}
async function refillMediaQueue(pool:pg.Pool,env:Record<string,string|undefined>,force=false){
 const claimed=await pool.query(`INSERT INTO ad_media_refill_gate(id,next_check) VALUES(1,now()+interval '1 minute') ON CONFLICT(id) DO UPDATE SET next_check=excluded.next_check WHERE ad_media_refill_gate.next_check<=now() OR $1 RETURNING id`,[force]);
 if(claimed.rowCount)await scheduleAdMedia(pool,env);
}
export async function workAdMediaOnce(pool:pg.Pool,options:WorkerObserver&{env?:Record<string,string|undefined>;fetch?:typeof fetch}={}){
  const env=options.env||process.env;if(!mediaEnabled(env))return false;
  const configuration=mediaBrokerConfig(env);if(!configuration)return false;
  const owner=randomUUID();let run=await claimAdMedia(pool,owner);if(!run){await refillMediaQueue(pool,env);run=await claimAdMedia(pool,owner);}if(!run)return false;
  options.onClaim?.({id:run.id,owner,workspaceId:run.workspace_id,status:run.status});
  let worked=false,brokerFailed=false;
  try{
    assertProxySupport(Boolean(options.fetch),env);
    const response=await(options.fetch||fetch)(`${configuration.origin}/api/ad-media/step/${run.id}/${owner}`,{method:"POST",redirect:"error",signal:AbortSignal.timeout(240000),headers:{"X-Exter-Ad-Media-Token":configuration.token}});
    worked=await brokerAcknowledgement(response);
  }catch(error){brokerFailed=true;options.onFailure?.(error);}
  await pool.query("UPDATE ad_media_runs SET lease_owner=NULL,lease_until=NULL,available_at=CASE WHEN $3 THEN available_at ELSE now()+interval '60 seconds' END WHERE id=$1 AND lease_owner=$2",[run.id,owner,worked]);
  const current=(await pool.query("SELECT status FROM ad_media_runs WHERE id=$1",[run.id])).rows[0];
  if(["complete","failed"].includes(current?.status)){options.onClaim?.(null);if(!brokerFailed)await refillMediaQueue(pool,env,true);}
  return true;
}
export function attachAdMedia(app:Express,db:DatabaseSync,getPool=infrastructureDatabase){
  app.get("/api/ad-media/missing",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    const brand=typeof req.query.workspaceId==="string"?readBrand(db,req.query.workspaceId):null;
    if(!brand||brand.mode==="demo"){res.status(404).json({error:"Real workspace not found."});return;}
    const offset=Number(req.query.offset||0);if(!Number.isSafeInteger(offset)||offset<0){res.status(400).json({error:"Choose a valid page."});return;}
    try{const pool=getPool();await checkWorkspaceMediaSlice(pool,brand.id);res.json(await readMissingMedia(pool,brand.id,{adId:typeof req.query.adId==="string"?req.query.adId:undefined,brand:typeof req.query.brand==="string"?req.query.brand:undefined,reason:typeof req.query.reason==="string"?req.query.reason:undefined,offset}));}
    catch{res.status(503).json({error:"Missing media could not be read."});}
  });
  app.get("/api/ad-media/status",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    const brand=typeof req.query.workspaceId==="string"?readBrand(db,req.query.workspaceId):null;
    if(!brand||brand.mode==="demo"){res.status(404).json({error:"Real workspace not found."});return;}
    try{
      const pool=process.env.DATABASE_URL?getPool():null;
      if(pool)await checkWorkspaceMediaSlice(pool,brand.id);
      const coverage=pool?await readMediaCoverage(pool,brand.id):[];
      const targets=[{key:brand.id,name:brand.name},...configuredCreativeCompetitors(db,brand,app.locals.demoCollection).map(c=>({key:c.brandId||c.key,name:c.name}))];
      res.json({enabled:mediaEnabled(),configured:Boolean(process.env.APIFY_TOKEN?.trim()&&mediaGbpRate(process.env)!==null),disk:await mediaDiskHealth(),runs:pool?await adMediaRuns(pool,brand.id):[],coverage:coverage.map(c=>({...c,estimatedRemainingGbp:mediaGbpRate(process.env)===null?null:Math.ceil(((c.official-c.requested)*.0005+Math.ceil((c.official-c.requested)/500)*.00005)*mediaGbpRate(process.env)!*1e6)/1e6,brandName:targets.find(t=>t.key===c.brandKey)?.name||"Watchlist brand"}))});
    }catch{res.status(503).json({error:"Saved media health could not be read."});}
  });
  app.post("/api/ad-media/collect",protectSettingsMutation,async(req,res)=>{
    const brand=typeof req.body?.workspaceId==="string"?readBrand(db,req.body.workspaceId):null;
    if(!brand||brand.mode==="demo"){res.status(404).json({error:"Real workspace not found."});return;}
    if(!mediaEnabled()||!process.env.APIFY_TOKEN?.trim()||mediaGbpRate(process.env)===null){res.status(409).json({error:"Enable configured media collection in Render first."});return;}
    try{
      const pool=getPool(),rows=await pool.query("SELECT id FROM watchlists WHERE workspace_id=$1 AND enabled AND purpose='brand' AND ($2::text IS NULL OR brand_key=$2) ORDER BY id",[brand.id,typeof req.body?.brandKey==='string'?req.body.brandKey:null]);
      // Explicit retries resume safe existing checkpoints. Uncertain paid starts stay blocked.
      const resumed=await pool.query("UPDATE ad_media_runs SET status=CASE WHEN actor_run_id IS NULL THEN 'queued' ELSE 'running' END,error_kind=NULL,available_at=now() WHERE workspace_id=$1 AND status='paused' AND (reservation_id IS NULL OR actor_run_id IS NOT NULL) AND (lease_until IS NULL OR lease_until<now()) RETURNING id",[brand.id]);
      await clearWorkerFailures(pool,"media",resumed.rows.map(row=>row.id));
      for(const row of rows.rows)await enqueueAdMedia(pool,row.id);
      res.status(202).json({queued:true});
    }catch{res.status(503).json({error:"Missing media could not be queued. Saved files are retained."});}
  });
  app.get("/api/ad-media/files/:workspaceId/:brandKey/:nativeId/:artifactId",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");
    const workspaceId=String(req.params.workspaceId),brand=readBrand(db,workspaceId);
    if(!brand||brand.mode==="demo"||!/^\d{1,40}$/.test(String(req.params.nativeId))||!/^[a-f0-9]{64}$/.test(String(req.params.artifactId))){res.status(404).end();return;}
    try{
      const result=await getPool().query("SELECT assets FROM ad_media_creatives WHERE workspace_id=$1 AND brand_key=$2 AND native_id=$3 ORDER BY created_at DESC",[workspaceId,req.params.brandKey,req.params.nativeId]);
      const asset=result.rows.flatMap(r=>r.assets).find(a=>a.ref?.artifactId===req.params.artifactId);
      if(!asset||asset.ref.workspaceId!==workspaceId){res.status(404).end();return;}
      const file=await new AdMediaStorage().store.load(asset.ref);if(!file){await getPool().query("INSERT INTO ad_media_file_checks(workspace_id,artifact_id,available) VALUES($1,$2,false) ON CONFLICT(workspace_id,artifact_id) DO UPDATE SET available=false,checked_at=now()",[workspaceId,asset.ref.artifactId]);res.status(404).end();return;}
      res.setHeader("Content-Type",file.ref.mimeType);res.sendFile(file.absolutePath,{acceptRanges:true,cacheControl:false,dotfiles:"deny"},error=>{if(error&&!res.headersSent)res.status(404).end();});
    }catch{if(!res.headersSent)res.status(503).json({error:"Retained media could not be verified."});}
  });
}
