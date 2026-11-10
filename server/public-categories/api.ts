import type pg from "pg";
import {categoryList} from "../../shared/onboarding/rules.js";
import {createHash,timingSafeEqual} from "node:crypto";
import type {Express} from "express";
import type {DatabaseSync} from "node:sqlite";
import {infrastructureDatabase} from "../infrastructure/database.js";
import {readBrand} from "../db.js";
import {mediaGbpRate} from "../../shared/ad-media.js";
import {primaryCategories,PRODUCT_CATEGORIES} from "../../shared/public-comparisons.js";
import {protectSettingsMutation} from "../request-guard.js";
import {stepCategoryBatch,categoryConfigured,categoryQuote,enqueueCategoryBatch} from "./jobs.js";
const digest=(v:string)=>createHash('sha256').update(v).digest();
export function attachCategoryStep(app:Express,db:DatabaseSync,getPool=infrastructureDatabase,env:Record<string,string|undefined>=process.env){
 app.post('/api/public-categories/step/:runId/:owner',async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  const key=env.EXTER_AD_MEDIA_BROKER_TOKEN||'',given=req.get('X-Exter-Ad-Media-Token')||'';
  if(key.length<32||key.length>4096||/\s/.test(key)||!timingSafeEqual(digest(key),digest(given))){res.status(401).json({error:'Media service authentication required.'});return;}
  if(!categoryConfigured(env)){res.status(409).json({error:'Public ad enrichment is off.'});return;}
  if(![req.params.runId,req.params.owner].every(v=>/^[a-f0-9-]{36}$/.test(String(v)))){res.status(400).json({error:'A leased tagging job is required.'});return;}
  try{const pool=getPool(),run=(await pool.query('SELECT workspace_id FROM public_category_batches WHERE id=$1 AND lease_owner=$2 AND lease_until>now()',[req.params.runId,req.params.owner])).rows[0],brand=run?readBrand(db,run.workspace_id):null;
   if(!brand||brand.mode==='demo'){res.status(404).json({error:'Real workspace not found.'});return;}
   res.json({worked:await stepCategoryBatch(pool,String(req.params.runId),String(req.params.owner),{env})});
  }catch{res.status(503).json({error:'Saved category tagging could not complete.'});}
 });
}
export function attachPrimaryCategories(app:Express,db:DatabaseSync,getPool=infrastructureDatabase,env:Record<string,string|undefined>=process.env){
 app.post('/api/public-categories/tag',protectSettingsMutation,async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  const brand=typeof req.body?.workspaceId==='string'?readBrand(db,req.body.workspaceId):null;
  if(!brand||brand.mode==='demo'){res.status(404).json({error:'Real workspace not found.'});return;}
  if(!categoryConfigured(env)){res.status(409).json({error:'Configure category tagging in Render first.'});return;}
  if(typeof req.body?.quoteHash!=='string'||!/^[a-f0-9]{64}$/.test(req.body.quoteHash)){res.status(400).json({error:'Review the current cost estimate first.'});return;}
  try{const id=await enqueueCategoryBatch(getPool(),brand.id,new Date(),{hash:req.body.quoteHash,env});res.status(202).json({queued:Boolean(id)});}
  catch{res.status(409).json({error:'The estimate changed. Refresh it before tagging.'});}
 });
 app.get('/api/public-categories/status',async(req,res)=>{
  const brand=typeof req.query.workspaceId==='string'?readBrand(db,req.query.workspaceId):null;
  if(!brand||brand.mode==='demo'){res.status(404).json({error:'Real workspace not found.'});return;}
  res.setHeader('Cache-Control','private, no-store');
  try{const result=await getPool().query(`SELECT b.id,b.status,b.error_kind,b.created_at,b.finished_at,jsonb_array_length(b.items) AS ads,l.cost_gbp::float8 AS cost_gbp,l.status AS cost_status FROM public_category_batches b LEFT JOIN cost_ledger l ON l.id=b.reservation_id WHERE b.workspace_id=$1 ORDER BY b.created_at DESC LIMIT 20`,[brand.id]);
   res.json({enabled:categoryConfigured(env),configured:categoryConfigured(env),quote:await categoryQuote(getPool(),brand.id,env),batches:result.rows.map(r=>({id:r.id,status:r.status,error:r.error_kind,createdAt:r.created_at,finishedAt:r.finished_at,ads:r.ads,costGbp:r.cost_gbp??null,costStatus:r.cost_status||null}))});
  }catch{res.status(503).json({error:'Category tagging status could not be read.'});}
 });
 app.post('/api/brands/:brandId/primary-categories',protectSettingsMutation,async(req,res)=>{
  const brand=readBrand(db,String(req.params.brandId)),categories=req.body?.categories;
  if(!brand||brand.mode==='demo'){res.status(404).json({error:'Real workspace not found.'});return;}
  if(!Array.isArray(categories)||categories.length>16||categories.some(v=>typeof v!=='string'||v.length<3||v.length>80)||categoryList(categories).length!==new Set(categories).size){res.status(400).json({error:'Choose supported product categories.'});return;}
  let client:pg.PoolClient|null=null;
  try{if(process.env.DATABASE_URL||getPool!==infrastructureDatabase){client=await getPool().connect();await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`public-categories:${brand.id}`]);}
   const updated={...readBrand(db,brand.id)!,primaryCategories:categoryList(categories),primaryCategoriesSource:'manual' as const};
   if(client)await client.query('INSERT INTO workspace_category_vocabularies(workspace_id,categories) VALUES($1,$2) ON CONFLICT(workspace_id) DO UPDATE SET categories=excluded.categories,updated_at=now()',[brand.id,JSON.stringify(updated.primaryCategories)]);
   db.prepare('UPDATE brands SET data=? WHERE id=?').run(JSON.stringify(updated),brand.id);if(client)await client.query('COMMIT');
  }catch{if(client)await client.query('ROLLBACK');res.status(503).json({error:'Categories could not be saved. Please retry.'});return;}finally{client?.release();}
  res.json({brandId:brand.id,primaryCategories:primaryCategories(readBrand(db,brand.id)!)});
 });
}
