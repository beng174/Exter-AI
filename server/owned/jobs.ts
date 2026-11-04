import { randomUUID } from "node:crypto";
import type pg from "pg";
import { reserveCost } from "../infrastructure/budget.js";
import type { ConnectorEnv, FetchLike } from "../connectors/types.js";
import { pullOwnedDays, ownedToken } from "./providers.js";
import { OwnedSyncError, ownedFailure, type OwnedAccount } from "./types.js";

const asDay = (date:Date) => date.toISOString().slice(0,10);
export function ownedWindow(lastSuccess:unknown,now:Date) {
  return {from:asDay(new Date(now.getTime()-(lastSuccess?6:89)*86400000)),to:asDay(now)};
}
export async function enqueueOwnedSync(pool:pg.Pool,accountId:string,day?:string,now=new Date()) {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const account=(await client.query("SELECT * FROM owned_accounts WHERE id=$1 AND enabled FOR UPDATE",[accountId])).rows[0] as OwnedAccount|undefined;
    if(!account)throw new Error("Owned account missing or disabled.");
    if(day) {
      const slot=(await client.query("SELECT job_id FROM owned_schedule_slots WHERE account_id=$1 AND day=$2",[accountId,day])).rows[0];
      if(slot){await client.query("COMMIT");return slot.job_id as string;}
      if(account.status==="error" || account.status==="not_connected") {await client.query("COMMIT");return null;}
    }
    const active=(await client.query("SELECT id FROM owned_sync_jobs WHERE account_id=$1 AND status IN ('queued','running')",[accountId])).rows[0];
    const jobId=active?.id || randomUUID(), window=ownedWindow(account.last_successful_sync,now);
    if(!active)await client.query("INSERT INTO owned_sync_jobs(id,account_id,since_day,until_day) VALUES($1,$2,$3,$4)",[jobId,accountId,window.from,window.to]);
    if(day)await client.query("INSERT INTO owned_schedule_slots VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[accountId,day,jobId]);
    await client.query("COMMIT");return jobId as string;
  } catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export async function scheduleOwnedSync(pool:pg.Pool,now=new Date()) {
  for(const row of (await pool.query("SELECT id FROM owned_accounts WHERE enabled AND status IN ('pending','connected','syncing') ORDER BY id")).rows)await enqueueOwnedSync(pool,row.id,asDay(now),now);
}
export interface OwnedWorkerOptions {fetch?:FetchLike;env?:ConnectorEnv;now?:Date;beforeRequest?:()=>Promise<void>}
/** Default-off: fixture injection is allowed; production activation needs separate live approval. */
export async function workOwnedOnce(pool:pg.Pool,options:OwnedWorkerOptions={}) {
  const env=options.env || process.env;
  if(!options.fetch && env.EXTER_OWNED_SYNC_ENABLED!=="true")return false;
  const owner=randomUUID(), now=options.now || new Date();
  const job=(await pool.query(`UPDATE owned_sync_jobs SET status='running',lease_owner=$1,lease_until=now()+interval '2 minutes',attempts=attempts+1
    WHERE id=(SELECT id FROM owned_sync_jobs WHERE status IN ('queued','running') AND available_at<=now()
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *,since_day::text AS since_text,until_day::text AS until_text`,[owner])).rows[0];
  if(!job)return false;
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  try {
    const account=(await pool.query("SELECT * FROM owned_accounts WHERE id=$1",[job.account_id])).rows[0] as OwnedAccount;
    if(!account?.enabled)throw new OwnedSyncError("schema",ownedFailure("schema"));
    ownedToken(account,env);
    if(job.attempts>3)throw new OwnedSyncError("temporary",ownedFailure("temporary"));
    await pool.query("UPDATE owned_accounts SET status='syncing' WHERE id=$1",[account.id]);
    heartbeat=setInterval(()=>{void pool.query("UPDATE owned_sync_jobs SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND lease_owner=$2 AND lease_until>now()",[job.id,owner]).catch(()=>{});},20000);
    const days=await pullOwnedDays(account,job.since_text,job.until_text,{
      fetch:options.fetch || fetch,env,now,
      beforeRequest:async()=>{
        const claim=await pool.query("SELECT j.id FROM owned_sync_jobs j JOIN owned_accounts a ON a.id=j.account_id WHERE j.id=$1 AND j.lease_owner=$2 AND j.lease_until>now() AND a.enabled",[job.id,owner]);
        if(!claim.rowCount)throw new OwnedSyncError("temporary",ownedFailure("temporary"));
        if(options.beforeRequest)await options.beforeRequest();
        else try {await reserveCost(pool,"data_providers",account.platform==="Meta"?"owned-meta":"owned-tiktok",0);}
        catch {throw new OwnedSyncError("budget",ownedFailure("budget"));}
      },
    });
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      // All successful pages commit atomically; a stale worker cannot overwrite history.
      const claim=await client.query("SELECT id FROM owned_sync_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now() FOR UPDATE",[job.id,owner]);
      if(!claim.rowCount){await client.query("ROLLBACK");return true;}
      const current=(await client.query("SELECT * FROM owned_accounts WHERE id=$1 FOR UPDATE",[account.id])).rows[0];
      if(!current.enabled || current.attribution!==account.attribution || current.conversion_event!==account.conversion_event || current.currency!==account.currency)throw new OwnedSyncError("schema",ownedFailure("schema"));
      for(const row of days)await client.query(`INSERT INTO owned_ad_days(owned_account_id,platform,ad_id,day,attribution,currency,conversion_event,pulled_at,data)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(owned_account_id,platform,ad_id,day,attribution,currency,conversion_event) DO UPDATE SET pulled_at=excluded.pulled_at,data=excluded.data
        WHERE owned_ad_days.pulled_at<excluded.pulled_at`,[account.id,row.platform,row.adId,row.day,row.attribution,row.currency,row.conversionEvent,row.pulledAt,JSON.stringify(row)]);
      const latest=days.map(row=>row.day).sort().at(-1) || null;
      await client.query("UPDATE owned_accounts SET status='connected',last_successful_sync=GREATEST(last_successful_sync,$2::timestamptz),latest_data_date=GREATEST(latest_data_date,$3::date),last_error=NULL WHERE id=$1",[account.id,now.toISOString(),latest]);
      await client.query("UPDATE owned_sync_jobs SET status='complete',lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2",[job.id,owner]);
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }catch(error){
    const reason=error instanceof OwnedSyncError?error.reason:"temporary";
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const claim=await client.query("SELECT id FROM owned_sync_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now() FOR UPDATE",[job.id,owner]);
      if(claim.rowCount){
        const retry=reason==="temporary" && job.attempts<3;
        await client.query("UPDATE owned_accounts SET status=$2,last_error=$3 WHERE id=$1",[job.account_id,reason==="not_connected"?"not_connected":retry?"pending":"error",ownedFailure(reason)]);
        await client.query("UPDATE owned_sync_jobs SET status=$3,lease_owner=NULL,lease_until=NULL,available_at=now()+interval '1 minute' WHERE id=$1 AND lease_owner=$2",[job.id,owner,retry?"queued":reason==="not_connected"?"not_connected":"failed"]);
      }
      await client.query("COMMIT");
    }catch{await client.query("ROLLBACK");throw new Error("Owned sync status could not be saved.");}finally{client.release();}
  }finally{if(heartbeat)clearInterval(heartbeat);}
  return true;
}
