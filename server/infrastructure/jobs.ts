import {scheduleOnboarding} from "../onboarding/queue.js";
import { scheduleCreatorRefresh } from "../creators/discovery-jobs.js";
import {schedulePublicCategories,enqueueCategoryBatch,categoryConfigured} from "../public-categories/jobs.js";
import {scheduleAdMedia,enqueueAdMedia} from "../ad-media/jobs.js";
import { scheduleOwnedSync } from "../owned/jobs.js";
export { enqueueOwnedSync, workOwnedOnce } from "../owned/jobs.js";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { collectMetaPage, MetaCollectionError, MetaLibraryConnector, metaStatus, metaLibraryEnabled } from "../connectors/meta-library.js";
import {claimMetaRequest,delayMetaRequests} from "./meta-rate.js";
import {META_CONTROLLED_ERRORS,smallerMetaPage,metaUserText,type MetaFailureKind,type MetaPageSize} from "../../shared/meta-collection.js";
const MAX_PAGE_ATTEMPTS = 5;
export class CollectionBusyError extends Error {constructor(){super("Collection still has an active request. Retry after it finishes.");}}
export async function enqueueCollection(pool: pg.Pool, watchlistId: string, day?: string, now=new Date()) {
  const client = await pool.connect();
  const id = randomUUID();
  try {
    await client.query("BEGIN");
    // Serialize scheduler/manual work for this watchlist, preserving the daily slot on restart.
    const watchlist = await client.query("SELECT id,page_ids,search_terms,countries,purpose,brand_key,revision FROM watchlists WHERE id=$1 AND enabled FOR UPDATE", [watchlistId]);
    if (!watchlist.rowCount) throw new Error("Watchlist is missing or disabled.");
    if (day) {
      const slot = await client.query("SELECT run_id FROM schedule_slots WHERE watchlist_id=$1 AND day=$2", [watchlistId,day]);
      if (slot.rowCount) { await client.query("COMMIT"); return slot.rows[0].run_id as string; }
    }
    const active = await client.query("SELECT id,status FROM collection_runs WHERE watchlist_id=$1 AND status IN ('queued','running','paused','not_connected','failed') ORDER BY started_at LIMIT 1 FOR UPDATE", [watchlistId]);
    if (active.rowCount) {
      const run = active.rows[0];
      // Only an explicit operator request resumes blocked work. Scheduling does
      // not establish that credentials, permissions or budgets were corrected.
      if (!day && ["paused","not_connected","failed"].includes(run.status)) {
        const resumed = await client.query(`UPDATE collection_jobs SET status='queued',attempts=0,available_at=now(),lease_owner=NULL,lease_until=NULL
          WHERE id=$1 AND (lease_until IS NULL OR lease_until<=now()) RETURNING id`, [run.id]);
        if(!resumed.rowCount)throw new CollectionBusyError();
        await client.query(`INSERT INTO meta_collection_failures(run_id,attempted_at,kind)
          SELECT id,COALESCE(stopped_at,finished_at),'legacy' FROM collection_runs WHERE id=$1 AND COALESCE(stopped_at,finished_at) IS NOT NULL
            AND NOT EXISTS(SELECT 1 FROM meta_collection_failures f WHERE f.run_id=$1)`,[run.id]);
        await client.query("UPDATE collection_runs SET status='queued',errors='[]',finished_at=NULL,stopped_at=NULL WHERE id=$1", [run.id]);
      }
      if (day) await client.query("INSERT INTO schedule_slots VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [watchlistId,day,run.id]);
      await client.query("COMMIT"); return run.id as string;
    }
    const config=watchlist.rows[0];
    const prior=await client.query("SELECT 1 FROM collection_runs WHERE watchlist_id=$1 AND status='complete' AND config->>'revision'=$2 LIMIT 1",[watchlistId,String(config.revision)]);
    const to=day||now.toISOString().slice(0,10),from=rollingYearStart(to);
    await client.query("INSERT INTO collection_runs(id,watchlist_id,config,pages_fetched) VALUES($1,$2,$3,0)", [id,watchlistId,JSON.stringify({...config,from,to,phase:prior.rowCount?"daily":"backfill"})]);
    await client.query("INSERT INTO collection_jobs(id) VALUES($1)", [id]);
    if (day) await client.query("INSERT INTO schedule_slots VALUES($1,$2,$3)", [watchlistId,day,id]);
    await client.query("COMMIT"); return id;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function claimJob(pool: pg.Pool, owner: string) {
  const result = await pool.query(`UPDATE collection_jobs SET status='running',lease_owner=$1,lease_until=now()+interval '2 minutes',attempts=attempts+1
    WHERE id=(SELECT id FROM collection_jobs WHERE status IN ('queued','running') AND available_at<=now()
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [owner]);
  return result.rows[0] ?? null;
}
export async function workOnce(pool: pg.Pool, connector?: MetaLibraryConnector, options:{env?:Record<string,string|undefined>;paceMs?:number}={}) {
  if(!metaLibraryEnabled(options.env))return false;
  // A shared row reserves dispatch time across worker processes and watchlist brands.
  if(await claimMetaRequest(pool,options.paceMs??20000))return false;
  const owner = randomUUID();
  const job = await claimJob(pool,owner);
  if (!job) return false;
  let state = "queued", backoffMs = 0, resetAttempts = false, errorMessage: string | null = null;
  let errorKind:MetaFailureKind|null=null,numericError:MetaCollectionError|null=null,nextSize:MetaPageSize|null=null;
  try {
    const run = (await pool.query("SELECT r.status,w.enabled,w.brand_key,w.purpose FROM collection_runs r JOIN watchlists w ON w.id=r.watchlist_id WHERE r.id=$1", [job.id])).rows[0];
    if (run?.status === "complete" || run?.status === "superseded") { state = "complete"; resetAttempts = true; }
    else if (run && ["paused","not_connected","failed"].includes(run.status)) {
      // Reconcile jobs left queued by the earlier implementation without
      // treating an upgrade/restart as permission to resume blocked work.
      state = run.status;
    }
    else if(!run?.enabled){state="superseded";errorKind="disabled";errorMessage=META_CONTROLLED_ERRORS.disabled;}
    else if(run.purpose==="brand"&&!run.brand_key){state="paused";errorKind="page_id";errorMessage=META_CONTROLLED_ERRORS.page_id;}
    else if (job.attempts > MAX_PAGE_ATTEMPTS) {
      // A crash on the final attempt must not create an unbounded sixth request.
      state = "failed";
      errorKind="retry_limit";errorMessage=META_CONTROLLED_ERRORS.retry_limit;
    } else {
      if (!connector && metaStatus().status === "not_connected") throw new MetaCollectionError("permission", "Meta not connected");
      await pool.query(`UPDATE collection_runs r SET status='running',stopped_at=NULL WHERE r.id=$1 AND r.status IN ('queued','running')
        AND EXISTS(SELECT 1 FROM collection_jobs j WHERE j.id=r.id AND j.lease_owner=$2 AND j.lease_until>now())`,[job.id,owner]);
      const result = await collectMetaPage(pool,job.id,connector,owner);
      state = result.complete ? "complete" : "queued"; backoffMs = result.backoffMs;
      // Attempts apply to the current page, not the total number of healthy pages.
      resetAttempts = true;
    }
  } catch (error) {
    numericError=error instanceof MetaCollectionError?error:null;
    const providerDelay=error instanceof MetaCollectionError?Math.max(error.reason==="rate_limited"?60000:0,error.retryAfterMs):0;
    await delayMetaRequests(pool,providerDelay);
    // Only controlled messages enter persistent status; driver/provider errors can contain secrets.
    if (error instanceof Error && error.message.startsWith("Jobs paused:")) {
      state = "paused";
      errorKind="budget";errorMessage=META_CONTROLLED_ERRORS.budget;
    } else if (error instanceof MetaCollectionError && error.reason === "permission") {
      state = error.message === "Meta not connected" ? "not_connected" : "paused";
      errorKind=state==="not_connected"?"not_connected":"permission";errorMessage=META_CONTROLLED_ERRORS[errorKind];
    } else if (error instanceof MetaCollectionError && error.reason === "schema") {
      state = "failed";
      errorKind="schema";errorMessage=META_CONTROLLED_ERRORS.schema;
    } else if(numericError?.reducePage&&(nextSize=smallerMetaPage(numericError.pageSize))){
      // One paced request per claim keeps every 90-second request within the lease.
      // Persist the smaller size and cancel this claim's failed-attempt increment.
      state="queued";errorKind="page_size";errorMessage=META_CONTROLLED_ERRORS.page_size;
      backoffMs=numericError.retryAfterMs;
    } else if (job.attempts >= MAX_PAGE_ATTEMPTS) {
      state = "failed";
      errorKind="retry_limit";errorMessage=META_CONTROLLED_ERRORS.retry_limit;
    } else {
      state = "queued";
      errorKind=numericError?.reason==="rate_limited"?"rate_limited":numericError?.timedOut?"timeout":"unavailable";
      errorMessage=META_CONTROLLED_ERRORS[errorKind];
      backoffMs = Math.max(error instanceof MetaCollectionError?error.retryAfterMs:0,Math.min(3600000,60000 * 2 ** Math.min(job.attempts - 1,6)));
    }
  }
  await delayMetaRequests(pool,backoffMs);
  // Commit the run and job disposition together, fenced by the live claim.
  // Keep lock order consistent with collectMetaPage: run before job.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM collection_runs WHERE id=$1 FOR UPDATE", [job.id]);
    const lease = await client.query("SELECT id FROM collection_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now() FOR UPDATE", [job.id,owner]);
    if (!lease.rowCount) { await client.query("ROLLBACK"); return true; }
    if(errorKind)await client.query(`INSERT INTO meta_collection_failures(run_id,kind,graph_code,graph_subcode,http_status,page_size,timed_out,error_user_title,error_user_msg) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [job.id,errorKind,numericError?.graphCode??null,numericError?.graphSubcode??null,numericError?.httpStatus??null,numericError?.pageSize??null,numericError?.timedOut??false,metaUserText(numericError?.userTitle,(options.env||process.env).META_ACCESS_TOKEN),metaUserText(numericError?.userMessage,(options.env||process.env).META_ACCESS_TOKEN)]);
    if (errorMessage) await client.query(`UPDATE collection_runs SET status=$2,errors=$3,finished_at=CASE WHEN $2='failed' THEN clock_timestamp() ELSE NULL END,
      stopped_at=CASE WHEN $2 IN ('failed','paused','not_connected','superseded') THEN clock_timestamp() ELSE NULL END WHERE id=$1`, [job.id,state,JSON.stringify([{ message: errorMessage }])]);
    await client.query(`UPDATE collection_jobs SET status=$3,available_at=now()+($4 * interval '1 millisecond'),lease_until=NULL,lease_owner=NULL,
      attempts=CASE WHEN $5 THEN 0 WHEN $6::integer IS NOT NULL THEN GREATEST(attempts-1,0) ELSE attempts END,page_size=COALESCE($6,page_size)
      WHERE id=$1 AND lease_owner=$2`, [job.id,owner,state,backoffMs,resetAttempts,nextSize]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  if(state==="complete"){
    try{const completed=(await pool.query("SELECT r.watchlist_id,w.workspace_id FROM collection_runs r JOIN watchlists w ON w.id=r.watchlist_id WHERE r.id=$1",[job.id])).rows[0];
      if(completed){
        if((options.env||process.env).EXTER_AD_MEDIA_ENABLED==="true")await enqueueAdMedia(pool,completed.watchlist_id,new Date(),job.id);
        if(categoryConfigured(options.env||process.env))await enqueueCategoryBatch(pool,completed.workspace_id);
      }
    }catch{/* Durable refill gates retry enrichment without repeating official collection. */}
  }
  return true;
}
export function rollingYearStart(day:string){const date=new Date(day+"T00:00:00Z"),month=date.getUTCMonth();date.setUTCFullYear(date.getUTCFullYear()-1);if(date.getUTCMonth()!==month)date.setUTCDate(0);return date.toISOString().slice(0,10);}
export function metaScheduleDay(now:Date):string|null {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const get=(type:string)=>parts.find(part=>part.type===type)!.value;
  return Number(get("hour"))>=3?`${get("year")}-${get("month")}-${get("day")}`:null;
}
export async function schedule(pool: pg.Pool, now = new Date(), env:Record<string,string|undefined>=process.env) {
  await scheduleOnboarding(pool,now,env);
  await scheduleOwnedSync(pool,now);
  await scheduleCreatorRefresh(pool,now,env);
  const day=metaScheduleDay(now);
  if(day){await scheduleAdMedia(pool,env,now);await schedulePublicCategories(pool,env);}
  if(!metaLibraryEnabled(env)||!day)return;
  const watchlists = await pool.query("SELECT id FROM watchlists WHERE enabled AND ((brand_key IS NOT NULL AND jsonb_array_length(page_ids)>0) OR purpose='discovery') ORDER BY id");
  for (const row of watchlists.rows) await enqueueCollection(pool,row.id,day,now);
}
