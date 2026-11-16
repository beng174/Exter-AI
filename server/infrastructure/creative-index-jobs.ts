import {randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import type pg from 'pg';
import type {DatabaseSync} from 'node:sqlite';
import type {Express} from 'express';
import {readBrand} from '../db.js';
import {CreativeGalleryService} from '../demo/gallery.js';
import {configuredCreativeCompetitors} from '../demo/creative-competitors.js';
import {indexCreativeChunk} from './creative-index.js';
import {mediaBrokerConfig} from '../ad-media/api.js';
import {assertProxySupport} from '../connectors/http.js';
import {brokerAcknowledgement,workerDiagnostic,type WorkerObserver} from './worker-diagnostics.js';
import {workerClaimGate} from './worker-recovery.js';

export async function enqueueCreativeIndex(pool:Pick<pg.Pool,'query'>,workspace:string){
 await pool.query(`INSERT INTO creative_index_jobs(id,workspace_id) VALUES($1,$1) ON CONFLICT(id) DO UPDATE SET requested_at=clock_timestamp(),
 status=CASE WHEN creative_index_jobs.status='complete' THEN 'queued' ELSE creative_index_jobs.status END,
 checkpoint=CASE WHEN creative_index_jobs.status='complete' THEN NULL ELSE creative_index_jobs.checkpoint END,
 available_at=CASE WHEN creative_index_jobs.status='complete' THEN now() ELSE creative_index_jobs.available_at END`,[workspace]);
}
/** Deployment and scheduler only; brand identities are small, never creative rows. */
export async function enqueueAllCreativeIndexes(pool:pg.Pool,localIds:string[]=[]){
 const workspaces=(await pool.query("SELECT DISTINCT workspace_id FROM watchlists WHERE purpose='brand' UNION SELECT unnest($1::text[]) AS workspace_id",[localIds])).rows;
 for(const {workspace_id} of workspaces)await enqueueCreativeIndex(pool,workspace_id);
}
export async function workCreativeIndexOnce(pool:pg.Pool,options:WorkerObserver&{env?:Record<string,string|undefined>;fetch?:typeof fetch}={}){
 const env=options.env??process.env,config=mediaBrokerConfig(env);if(!config)return false;
 const owner=randomUUID(),run=(await pool.query(`UPDATE creative_index_jobs SET status='running',lease_owner=$1,lease_until=now()+interval '90 seconds',
 started_at=CASE WHEN checkpoint IS NULL THEN clock_timestamp() ELSE started_at END,processed=CASE WHEN checkpoint IS NULL THEN 0 ELSE processed END
 WHERE id=(SELECT id FROM creative_index_jobs j WHERE status IN ('queued','running') AND available_at<=now() AND (lease_until IS NULL OR lease_until<=now()) AND ${workerClaimGate('index','j.id')} ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[owner])).rows[0];
 if(!run)return false;options.onClaim?.({id:run.id,owner,workspaceId:run.workspace_id,status:'queued'});
 try{
  assertProxySupport(Boolean(options.fetch),env);
  const response=await(options.fetch??fetch)(`${config.origin}/api/creative-index/step/${encodeURIComponent(run.id)}/${owner}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{'X-Exter-Ad-Media-Token':config.token}});
  await brokerAcknowledgement(response);return true;
 }finally{await pool.query("UPDATE creative_index_jobs SET lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2",[run.id,owner]);}
}
const digest=(value:string)=>createHash('sha256').update(value).digest();
/** Worker-controlled bounded local-disk adapter; no public page invokes it. */
export function attachCreativeIndexStep(app:Express,db:DatabaseSync,getPool:()=>pg.Pool,env:Record<string,string|undefined>=process.env){
 app.post('/api/creative-index/step/:id/:owner',async(req,res)=>{
  const key=env.EXTER_AD_MEDIA_BROKER_TOKEN??'',given=req.get('X-Exter-Ad-Media-Token')??'';
  if(key.length<32||key.length>4096||/\s/.test(key)||!timingSafeEqual(digest(key),digest(given))){res.status(401).json({error:'Worker authentication required.'});return;}
  const id=String(req.params.id),owner=String(req.params.owner);
  if(id.length>160||!/^[a-f0-9-]{36}$/.test(owner)){res.status(400).json({error:'Choose a leased indexing job.'});return;}
  try{
   const pool=getPool(),run=(await pool.query('SELECT * FROM creative_index_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now()',[id,owner])).rows[0];
   if(!run){res.status(409).json({error:'The indexing lease has expired.'});return;}
   const brand=readBrand(db,run.workspace_id);
   if(!brand||brand.mode==='demo'){res.status(404).json({error:'Real workspace not found.'});return;}
   const gallery=app.locals.creativeGallery??(app.locals.creativeGallery=new CreativeGalleryService(db));
   await indexCreativeChunk(pool,db,brand,configuredCreativeCompetitors(db,brand,app.locals.demoCollection),gallery,{checkpoint:run.checkpoint??undefined,commit:async(client,result)=>{
    // The lease and checkpoint are checked again inside the chunk transaction.
    const saved=await client.query(`UPDATE creative_index_jobs SET checkpoint=CASE WHEN $4 AND requested_at>started_at THEN NULL ELSE $3::jsonb END,
     status=CASE WHEN $4 AND requested_at<=started_at THEN 'complete' ELSE 'queued' END,
     finished_at=CASE WHEN $4 THEN clock_timestamp() END,processed=processed+$5,available_at=now(),lease_owner=NULL,lease_until=NULL
     WHERE id=$1 AND lease_owner=$2 AND lease_until>now() AND checkpoint IS NOT DISTINCT FROM $6::jsonb RETURNING id`,[id,owner,JSON.stringify(result.checkpoint),result.complete,result.processed,run.checkpoint?JSON.stringify(run.checkpoint):null]);
    if(!saved.rowCount)throw new Error('The indexing lease changed. This batch will retry.');
   }});
   res.json({worked:true});
  }catch(error){res.status(503).json({error:workerDiagnostic(error).message,diagnostic:workerDiagnostic(error)});}
 });
}
