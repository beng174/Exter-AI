import type {Express} from "express";
import type {DatabaseSync} from "node:sqlite";
import type pg from "pg";
import {readBrand} from "../db.js";
import {protectSettingsMutation} from "../request-guard.js";
import {WORKER_JOB_TYPES,type WorkerJobType} from "../../shared/worker-health.js";
import {readWorkerFailures,retryWorkerFailure} from "./worker-recovery.js";

export function attachWorkerRoutes(app:Express,db:DatabaseSync,getPool:()=>pg.Pool){
 app.get("/api/infrastructure/worker",async(req,res)=>{
  res.setHeader("Cache-Control","private, no-store");
  const brand=typeof req.query.workspaceId==="string"?readBrand(db,req.query.workspaceId):null;
  if(!brand||brand.mode==="demo"||req.query.demo==="1"){res.status(400).json({error:"Choose a real workspace."});return;}
  try{res.json({failures:await readWorkerFailures(getPool(),brand.id),checkedAt:new Date().toISOString()});}
  catch{res.status(503).json({error:"Worker details could not be read."});}
 });
 app.post("/api/infrastructure/worker/retry",protectSettingsMutation,async(req,res)=>{
  const brand=typeof req.body?.workspaceId==="string"?readBrand(db,req.body.workspaceId):null;
  const {type,jobId}=req.body??{};
  if(!brand||brand.mode==="demo"||req.query.demo==="1"||!WORKER_JOB_TYPES.includes(type)||typeof jobId!=="string"||!jobId||jobId.length>160){res.status(400).json({error:"Choose an existing worker job in a real workspace."});return;}
  try{if(!await retryWorkerFailure(getPool(),brand.id,type as WorkerJobType,jobId)){res.status(409).json({error:"This job is active or needs review before retrying."});return;}res.status(202).json({queued:true});}
  catch{res.status(503).json({error:"The saved job could not be retried."});}
 });
}
