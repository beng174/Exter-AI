import {BrandLogoStore} from "../brand-logos.js";
import {OnboardingMeta,OnboardingWait} from "./meta.js";
import {brandColour,brandInitials} from "../../shared/brand-identity.js";
import {createHash,timingSafeEqual} from "node:crypto";
import type {Express} from "express";
import type {DatabaseSync} from "node:sqlite";
import {infrastructureDatabase} from "../infrastructure/database.js";
import {protectSettingsMutation} from "../request-guard.js";
import {captionDomain} from "../../shared/meta-page-candidates.js";
import type {Brand} from "../../shared/types.js";
import {enqueueCollection} from "../infrastructure/jobs.js";
import {metaLibraryEnabled} from "../connectors/meta-library.js";
import {readBrand} from "../db.js";
import {stepOnboarding,type OnboardingOptions,type RunData} from "./jobs.js";
import {readOnboarding} from "./read.js";
import {onboardingBrand,enqueueOnboarding,applyOwnPages,applyCompetitor,competitorKey} from "./store.js";
const digest=(v:string)=>createHash('sha256').update(v).digest();
export function attachOnboardingStep(app:Express,db:DatabaseSync,getPool=infrastructureDatabase,options:OnboardingOptions={}){
 app.post('/api/onboarding/step/:runId/:owner',async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');const env=options.env||process.env,key=env.EXTER_AD_MEDIA_BROKER_TOKEN||'',given=req.get('X-Exter-Ad-Media-Token')||'';
  if(key.length<32||key.length>4096||/\s/.test(key)||!timingSafeEqual(digest(key),digest(given))){res.status(401).json({error:'Setup service authentication required.'});return;}
  if(![req.params.runId,req.params.owner].every(v=>/^[a-f0-9-]{36}$/.test(String(v)))){res.status(400).json({error:'A leased setup job is required.'});return;}
  try{res.json({worked:await stepOnboarding(getPool(),db,String(req.params.runId),String(req.params.owner),options)});}catch{res.status(503).json({error:'Setup could not continue.'});}
 });
}
export function attachOnboarding(app:Express,db:DatabaseSync,getPool=infrastructureDatabase){
 const pictures=new BrandLogoStore({opaqueMetaIdentity:true,beforeResourceRequest:async url=>{if(url.hostname==='graph.facebook.com')await new OnboardingMeta(getPool()).slot();},retryAutomatic:error=>error instanceof OnboardingWait});
 app.use('/api/onboarding',protectSettingsMutation);
 app.post('/api/onboarding/start',async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(req.query.demo==='1'){res.status(403).json({error:'Sample data is read-only.'});return;}
  try{const pool=getPool();await pool.query('SELECT 1');const brand=onboardingBrand(db,req.body?.name,req.body?.website);const runId=await enqueueOnboarding(pool,brand);res.status(202).json({brand,runId});}
  catch(error){res.status(error instanceof Error&&error.message==='input'?400:503).json({error:error instanceof Error&&error.message==='input'?'Enter a brand name and public website.':'Setup needs the collection database. Review Data sources.'});}
 });
 app.get('/api/brands/:brandId/onboarding',async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');const brand=readBrand(db,String(req.params.brandId));if(!brand||brand.mode==='demo'){res.status(404).json({error:'Real workspace not found.'});return;}
  try{res.json(await readOnboarding(getPool(),db,brand.id));}catch{res.status(503).json({error:'Setup progress could not be read.'});}
 });
 const load=async(workspace:string)=>{const brand=readBrand(db,workspace);if(!brand||brand.mode==='demo')return null;const run=(await getPool().query(`SELECT id,status,phase,jsonb_build_object('ownMatches',data->'ownMatches','choices',data->'choices') AS data FROM brand_onboarding_runs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1`,[workspace])).rows[0];return run?{brand,run,data:run.data as RunData}:null;};
 app.post('/api/brands/:brandId/onboarding/page-picture',protectSettingsMutation,async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(!process.env.META_ACCESS_TOKEN?.trim()){res.status(409).end();return;}
  try{const target=await load(String(req.params.brandId)),pageId=req.body?.pageId;if(!target||typeof pageId!=='string'||!/^\d{1,30}$/.test(pageId)){res.status(404).end();return;}
   const page=target.data.ownMatches?.find(row=>row.pageId===pageId),saved=page||(await getPool().query("SELECT id FROM watchlists WHERE workspace_id=$1 AND brand_key=$1 AND enabled AND page_ids->>0=$2",[target.brand.id,pageId])).rowCount;
   if(!saved){res.status(404).end();return;}
   const name=page?.name||target.brand.name,image=await pictures.image({id:`setup-page:${pageId}`,name,domain:target.brand.domain,metaPageId:pageId,mode:'imported',color:brandColour(name),initials:brandInitials(name)});
   if(image)res.type('png').send(image);else res.status(204).end();
  }catch{res.status(204).end();}
 });
 app.post('/api/brands/:brandId/onboarding/retry',protectSettingsMutation,async(req,res)=>{
  try{const target=await load(String(req.params.brandId));if(!target){res.status(404).end();return;}if(target.run.status==='uncertain'){res.status(409).json({error:'Review the paid batch before retrying.'});return;}
   await getPool().query("UPDATE brand_onboarding_runs SET status='queued',error_kind=NULL,available_at=now() WHERE id=$1 AND status='paused'",[target.run.id]);res.status(202).json({queued:true});
  }catch{res.status(503).json({error:'Setup could not be resumed.'});}
 });
 app.post('/api/brands/:brandId/onboarding/confirm-page',protectSettingsMutation,async(req,res)=>{
  try{const target=await load(String(req.params.brandId)),page=target?.data.ownMatches?.find(page=>page.pageId===req.body?.pageId);if(!target||!page){res.status(404).json({error:'Page suggestion not found.'});return;}
   await applyOwnPages(getPool(),db,target.brand.id,[page],true);await getPool().query("UPDATE brand_onboarding_runs SET status='queued',phase=CASE WHEN phase IN ('complete','enrichment') THEN 'collection' ELSE phase END,available_at=now() WHERE id=$1 AND status IN ('complete','needs_review','paused')",[target.run.id]);res.json({confirmed:true});
  }catch{res.status(503).json({error:'The Page could not be confirmed.'});}
 });
 app.post('/api/brands/:brandId/onboarding/competitor',protectSettingsMutation,async(req,res)=>{
  try{const target=await load(String(req.params.brandId));if(!target){res.status(404).end();return;}
   const choice=target.data.choices.find(row=>row.domain===req.body?.domain)||target.brand.competitorProfiles?.find(row=>row.domain===req.body?.domain);
   if(!choice||!['add','remove','swap'].includes(req.body?.action)){res.status(400).json({error:'Choose a saved competitor or suggestion.'});return;}
   const pool=getPool(),removeDomain=req.body.action==='swap'?req.body.swapDomain:req.body.action==='remove'?choice.domain:null;
   if(removeDomain){const saved=target.brand.competitorProfiles?.find(row=>row.domain===removeDomain);if(!saved){res.status(400).json({error:'Choose the competitor to replace.'});return;}
    const lock=await pool.connect();try{await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(hashtext($1))',[target.brand.id]);
    await lock.query("INSERT INTO brand_onboarding_choices(workspace_id,domain,action) VALUES($1,$2,'removed') ON CONFLICT(workspace_id,domain) DO UPDATE SET action='removed',updated_at=now()",[target.brand.id,saved.domain]);
    const latest=readBrand(db,target.brand.id)!;db.prepare('UPDATE brands SET data=? WHERE id=?').run(JSON.stringify({...latest,competitors:latest.competitors.filter(name=>name!==saved.name),competitorProfiles:latest.competitorProfiles?.filter(row=>row.domain!==saved.domain)}),target.brand.id);
    const registered=(db.prepare('SELECT data FROM brands').all() as {data:string}[]).map(row=>JSON.parse(row.data) as Brand).find(brand=>brand.mode!=='demo'&&captionDomain(brand.domain)===saved.domain);await lock.query("UPDATE collection_runs r SET status='superseded',finished_at=now() FROM watchlists w WHERE r.watchlist_id=w.id AND w.workspace_id=$1 AND w.brand_key=ANY($2::text[]) AND r.status IN ('queued','running','paused','not_connected','failed')",[target.brand.id,[competitorKey(saved.name),...(registered?[registered.id]:[])]]);await lock.query("UPDATE collection_jobs j SET status='superseded',lease_owner=NULL,lease_until=NULL FROM collection_runs r WHERE r.id=j.id AND r.status='superseded' AND r.watchlist_id IN (SELECT id FROM watchlists WHERE workspace_id=$1)",[target.brand.id]);await lock.query("UPDATE watchlists SET enabled=false,revision=revision+1,managed_by='manual' WHERE workspace_id=$1 AND brand_key=ANY($2::text[])",[target.brand.id,[competitorKey(saved.name),...(registered?[registered.id]:[])]]);await lock.query('COMMIT');}catch(error){await lock.query('ROLLBACK');throw error;}finally{lock.release();}
   }
   if(req.body.action!=='remove'){await pool.query("INSERT INTO brand_onboarding_choices(workspace_id,domain,action) VALUES($1,$2,'added') ON CONFLICT(workspace_id,domain) DO UPDATE SET action='added',updated_at=now()",[target.brand.id,choice.domain]);await applyCompetitor(pool,db,target.brand.id,{...choice,state:'confirmed'});}
   if(req.body.action!=='remove'&&metaLibraryEnabled()){const registered=(db.prepare('SELECT data FROM brands').all() as {data:string}[]).map(row=>JSON.parse(row.data) as Brand).find(brand=>brand.mode!=='demo'&&captionDomain(brand.domain)===choice.domain);const lists=(await pool.query("SELECT id FROM watchlists WHERE workspace_id=$1 AND enabled AND brand_key=ANY($2::text[])",[target.brand.id,[competitorKey(choice.name),...(registered?[registered.id]:[])]])).rows;for(const list of lists)await enqueueCollection(pool,list.id);}
   await pool.query("UPDATE brand_onboarding_runs SET status='queued',phase='collection',available_at=now(),updated_at=now() WHERE id=$1 AND status IN ('complete','needs_review','paused')",[target.run.id]);res.json({saved:true});
  }catch{res.status(503).json({error:'The competitor change could not finish.'});}
 });
}
