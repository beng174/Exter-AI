import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type pg from "pg";
import { infrastructureDatabase } from "../infrastructure/database.js";
import { protectSettingsMutation } from "../request-guard.js";
import { ownedBenchmark, type OwnedDay } from "../../shared/owned-metrics.js";
import { enqueueOwnedSync } from "./jobs.js";

const safeId=(value:unknown):value is string=>typeof value==="string" && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(value);
const day=(value:unknown):value is string=>typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
export function attachOwnedAccounts(app:Express,workspaceExists:(id:string)=>boolean,getPool:()=>pg.Pool=infrastructureDatabase) {
  app.use("/api/owned",protectSettingsMutation);
  const validWorkspace=(value:unknown):value is string=>safeId(value) && workspaceExists(value);
  const unavailable=(res:import("express").Response)=>res.status(503).json({error:"Owned account database unavailable. Check configuration and migrations."});
  app.get("/api/owned/accounts",async(req,res)=>{
    const workspace=req.query.workspaceId;
    if(!validWorkspace(workspace)){res.status(400).json({error:"Choose an existing workspace."});return;}
    try{res.json({accounts:(await getPool().query("SELECT *,latest_data_date::text AS latest_data_date FROM owned_accounts WHERE workspace_id=$1 ORDER BY platform,account_id",[workspace])).rows.map(account=>({...account,status:process.env[account.platform==="Meta"?"EXTER_META_ACCESS_TOKEN":"EXTER_TIKTOK_ACCESS_TOKEN"]?.trim()?account.status:"not_connected"})),liveDispatchEnabled:process.env.EXTER_OWNED_SYNC_ENABLED==="true",verification:"Fixtures are not live verification. Both live gates remain open until the owner confirms them."});}catch{unavailable(res);}
  });
  app.post("/api/owned/accounts",async(req,res)=>{
    const b=req.body || {};
    // Accept metadata only; credentials have no API field and no database column.
    const allowed=["workspaceId","platform","accountId","currency","attribution","conversionEvent"];
    if(Object.keys(b).some(key=>!allowed.includes(key)) || !validWorkspace(b.workspaceId) || !["Meta","TikTok"].includes(b.platform) || typeof b.accountId!=="string" || !/^\d{1,40}$/.test(b.accountId) || typeof b.currency!=="string" || !/^[A-Z]{3}$/.test(b.currency) || typeof b.attribution!=="string" || (b.platform==="Meta"?b.attribution.split(",").some((value:string)=>!["1d_click","7d_click","1d_view"].includes(value)):b.attribution!=="account_configured") || typeof b.conversionEvent!=="string" || !/^[A-Za-z0-9_: -]{1,80}$/.test(b.conversionEvent) || (b.platform==="Meta" && b.conversionEvent!=="purchase")) {
      res.status(400).json({error:"Provide workspace, platform, numeric account ID, currency, attribution and conversion event only. Keep tokens in Render secrets."});return;
    }
    const status=process.env[b.platform==="Meta"?"EXTER_META_ACCESS_TOKEN":"EXTER_TIKTOK_ACCESS_TOKEN"]?.trim()?"pending":"not_connected";
    try{const result=await getPool().query(`INSERT INTO owned_accounts(id,workspace_id,platform,account_id,currency,attribution,conversion_event,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(workspace_id,platform,account_id)
      DO UPDATE SET
      last_successful_sync=CASE WHEN (owned_accounts.currency,owned_accounts.attribution,owned_accounts.conversion_event) IS DISTINCT FROM (excluded.currency,excluded.attribution,excluded.conversion_event) THEN NULL ELSE owned_accounts.last_successful_sync END,
      latest_data_date=CASE WHEN (owned_accounts.currency,owned_accounts.attribution,owned_accounts.conversion_event) IS DISTINCT FROM (excluded.currency,excluded.attribution,excluded.conversion_event) THEN NULL ELSE owned_accounts.latest_data_date END,
      currency=excluded.currency,attribution=excluded.attribution,conversion_event=excluded.conversion_event,status=excluded.status,last_error=NULL,enabled=true RETURNING *`,[randomUUID(),b.workspaceId,b.platform,b.accountId,b.currency,b.attribution,b.conversionEvent,status]);res.status(201).json(result.rows[0]);}catch{unavailable(res);}
  });
  app.post("/api/owned/accounts/:id/sync",async(req,res)=>{
    if(!validWorkspace(req.body?.workspaceId) || !safeId(req.params.id)){res.status(400).json({error:"Choose an account in this workspace."});return;}
    try{const pool=getPool(), result=await pool.query("SELECT id FROM owned_accounts WHERE id=$1 AND workspace_id=$2",[req.params.id,req.body.workspaceId]);
      if(!result.rowCount){res.status(404).json({error:"Owned account not found in this workspace."});return;}
      res.status(202).json({jobId:await enqueueOwnedSync(pool,String(req.params.id)),message:"Sync queued. Live dispatch remains disabled unless separately authorised and enabled."});
    }catch{unavailable(res);}
  });
  app.get("/api/owned/accounts/:id/metrics",async(req,res)=>{
    const {workspaceId,from,to}=req.query;
    if(!validWorkspace(workspaceId) || !safeId(req.params.id) || !day(from) || !day(to) || from>to){res.status(400).json({error:"Choose a workspace and inclusive reporting dates."});return;}
    try {
      const pool=getPool(),account=(await pool.query("SELECT * FROM owned_accounts WHERE id=$1 AND workspace_id=$2",[req.params.id,workspaceId])).rows[0];
      if(!account){res.status(404).json({error:"Owned account not found in this workspace."});return;}
      const rows=(await pool.query("SELECT d.data FROM owned_ad_days d JOIN owned_accounts a ON a.id=d.owned_account_id WHERE a.workspace_id=$1 AND a.id=$2 AND day BETWEEN $3::date AND $4::date ORDER BY day,ad_id LIMIT 100001",[workspaceId,account.id,from,to])).rows.map(row=>row.data as OwnedDay);
      if(rows.length>100000){res.status(422).json({error:"Narrow the reporting dates; no truncated benchmark is shown."});return;}
      const cohorts=new Map<string,OwnedDay>();for(const row of rows)cohorts.set(JSON.stringify([row.currency,row.attribution,row.conversionEvent]),row);
      res.json({from,to,lastSuccessfulSync:account.last_successful_sync,latestDataDate:account.latest_data_date,verification:"Fixture-tested only; live verification is pending.",cohorts:[...cohorts.values()].map(row=>({currency:row.currency,attribution:row.attribution,conversionEvent:row.conversionEvent,metrics:ownedBenchmark(rows,{...row,from,to})}))});
    }catch{unavailable(res);}
  });
}
