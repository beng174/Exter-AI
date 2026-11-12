import type pg from "pg";
import type {WorkerJobType,WorkerDiagnostic,WorkerFailure} from "../../shared/worker-health.js";
import type {WorkerClaim} from "./worker-diagnostics.js";

export const QUEUE_JOB_ID="@queue";
export const JOB_TABLES:Record<WorkerJobType,string>={onboarding:"brand_onboarding_runs",collection:"collection_jobs",owned:"owned_sync_jobs",media:"ad_media_runs",creators:"creator_discovery_runs",categories:"public_category_batches",kernel:"kernel_jobs"};
/** Static SQL identifiers only; caller supplies a known queue and an internal alias. */
export function workerClaimGate(type:WorkerJobType,idExpression:string){return `NOT EXISTS(SELECT 1 FROM worker_job_failures wf WHERE wf.job_type='${type}' AND wf.job_id=(${idExpression})::text AND (wf.status='paused' OR wf.status='retrying' AND wf.next_attempt_at>now()))`;}
export async function queueMayRun(pool:pg.Pool,type:WorkerJobType){return !(await pool.query("SELECT 1 FROM worker_job_failures WHERE job_type=$1 AND job_id=$2 AND (status='paused' OR status='retrying' AND next_attempt_at>now())",[type,QUEUE_JOB_ID])).rowCount;}
export async function recordWorkerFailure(pool:pg.Pool,type:WorkerJobType,claim:WorkerClaim|null,error:WorkerDiagnostic){
 const client=await pool.connect();const table=JOB_TABLES[type],id=claim?.id??QUEUE_JOB_ID;
 try{
  await client.query("BEGIN");
  // Collection code always locks run before job. Keep that lock order here.
  if(claim&&type==="collection")await client.query("SELECT id FROM collection_runs WHERE id=$1 FOR UPDATE",[id]);
  const row=claim?(await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0]:null;
  if(claim&&(!row||row.lease_owner&&row.lease_owner!==claim.owner)){await client.query("ROLLBACK");return null;}
  let workspace=claim?.workspaceId??row?.workspace_id??null;
  if(claim&&!workspace&&type==="collection")workspace=(await client.query("SELECT w.workspace_id FROM collection_runs r JOIN watchlists w ON w.id=r.watchlist_id WHERE r.id=$1",[id])).rows[0]?.workspace_id??null;
  if(claim&&!workspace&&type==="owned")workspace=(await client.query("SELECT workspace_id FROM owned_accounts WHERE id=$1",[row.account_id])).rows[0]?.workspace_id??null;
  const resume=type==="collection"||type==="owned"||type==="creators"||type==="kernel"?"queued":claim?.status??row?.status??null;
  const policyPaused=Boolean(row?.paid_dispatch_in_flight)||row?.status==="paused"&&(type==="creators"||["budget","configuration","disk","uncertain","quote","output","changed","permission"].includes(row.error_kind)||["authentication","permission","budget","invalid","uncertain_paid"].includes(row.error_code));
  const saved=(await client.query(`INSERT INTO worker_job_failures(job_type,job_id,workspace_id,failures,status,last_error,resume_status,next_attempt_at)
   VALUES($1,$2,$3,1,'retrying',$4,$5,now()+interval '1 minute') ON CONFLICT(job_type,job_id) DO UPDATE SET
   workspace_id=COALESCE(excluded.workspace_id,worker_job_failures.workspace_id),failures=CASE WHEN worker_job_failures.status='resolved' THEN 1 ELSE worker_job_failures.failures+1 END,
   status=CASE WHEN worker_job_failures.status<>'resolved' AND worker_job_failures.failures+1>=3 THEN 'paused' ELSE 'retrying' END,
   last_error=excluded.last_error,last_failed_at=clock_timestamp(),resume_status=COALESCE(worker_job_failures.resume_status,excluded.resume_status),
   next_attempt_at=CASE WHEN worker_job_failures.status<>'resolved' AND worker_job_failures.failures+1>=3 THEN NULL ELSE now()+interval '2 minutes' END
   RETURNING *`,[type,id,workspace,JSON.stringify(error),resume])).rows[0];
  // Existing permanent/uncertain outcomes remain blocked, even before attempt 3.
  if(policyPaused||row&&["failed","not_connected","review_required","uncertain"].includes(row.status)){
   await client.query("UPDATE worker_job_failures SET status='paused',next_attempt_at=NULL WHERE job_type=$1 AND job_id=$2",[type,id]);saved.status="paused";saved.next_attempt_at=null;
  }
  if(row&&!policyPaused&&!["complete","superseded","cancelled","review_required","uncertain","failed","not_connected"].includes(row.status)){
   const paused=saved.status==="paused",status=paused?(type==="owned"?"failed":"paused"):type==="kernel"?"queued":row.status==="paused"&&["queued","running","starting"].includes(resume??"")?resume:row.status;
   const updated=(await client.query(`UPDATE ${table} SET status=$2,lease_owner=NULL,lease_until=NULL,available_at=GREATEST(available_at,COALESCE($3::timestamptz,now())) WHERE id=$1 RETURNING available_at`,[id,status,saved.next_attempt_at])).rows[0];
   if(!paused&&updated&&new Date(updated.available_at)>new Date(saved.next_attempt_at)){
    saved.next_attempt_at=updated.available_at;await client.query("UPDATE worker_job_failures SET next_attempt_at=$3 WHERE job_type=$1 AND job_id=$2",[type,id,saved.next_attempt_at]);
   }
   if(type==="collection"&&paused)await client.query("UPDATE collection_runs SET status='paused',stopped_at=clock_timestamp(),errors=$2 WHERE id=$1",[id,JSON.stringify([{message:"Collection paused after three failed steps. See worker details on Data sources."}])]);
   if(type==="owned"&&paused)await client.query("UPDATE owned_accounts SET status='error',last_error='Sync paused after three failed steps. See worker details on Data sources.' WHERE id=$1",[row.account_id]);
  }
  await client.query("COMMIT");return saved;
 }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}finally{client.release();}
}
export async function resolveWorkerFailure(pool:pg.Pool,type:WorkerJobType,claim:WorkerClaim|null){
 await pool.query("UPDATE worker_job_failures SET status='resolved',failures=0,next_attempt_at=NULL,resume_status=NULL WHERE job_type=$1 AND job_id=ANY($2::text[])",[type,[QUEUE_JOB_ID,...(claim?[claim.id]:[])]]);
}
/** Call only after an existing, authorised manual resume has passed its guards. */
export async function clearWorkerFailures(client:Pick<pg.Pool,"query">,type:WorkerJobType,ids:string[]){
 await client.query("UPDATE worker_job_failures SET status='resolved',failures=0,next_attempt_at=NULL,resume_status=NULL WHERE job_type=$1 AND job_id=ANY($2::text[])",[type,[QUEUE_JOB_ID,...ids]]);
}
export async function readWorkerFailures(pool:pg.Pool,workspace:string):Promise<WorkerFailure[]>{
 const rows=(await pool.query("SELECT * FROM worker_job_failures WHERE (workspace_id=$1 OR workspace_id IS NULL) AND status<>'resolved' ORDER BY last_failed_at DESC LIMIT 100",[workspace])).rows;
 return rows.map(r=>({type:r.job_type,jobId:r.job_id,workspaceId:r.workspace_id,failures:r.failures,status:r.status,lastFailedAt:new Date(r.last_failed_at).toISOString(),nextAttemptAt:r.next_attempt_at?new Date(r.next_attempt_at).toISOString():null,error:r.last_error}));
}
export async function retryWorkerFailure(pool:pg.Pool,workspace:string,type:WorkerJobType,id:string){
 const client=await pool.connect();try{
  await client.query("BEGIN");
  // Match the failure writer's run -> job -> diagnostic lock order.
  if(id!==QUEUE_JOB_ID&&type==="collection")await client.query("SELECT id FROM collection_runs WHERE id=$1 FOR UPDATE",[id]);
  const row=id!==QUEUE_JOB_ID?(await client.query(`SELECT * FROM ${JOB_TABLES[type]} WHERE id=$1 FOR UPDATE`,[id])).rows[0]:null;
  const failure=(await client.query("SELECT * FROM worker_job_failures WHERE job_type=$1 AND job_id=$2 AND (workspace_id=$3 OR workspace_id IS NULL) AND status<>'resolved' FOR UPDATE",[type,id,workspace])).rows[0];
  if(!failure){await client.query("ROLLBACK");return false;}
  if(id!==QUEUE_JOB_ID){
   if(!row||row.lease_owner&&new Date(row.lease_until)>new Date()||["complete","cancelled","superseded","review_required","not_connected","uncertain"].includes(row.status)||row.paid_dispatch_in_flight){await client.query("ROLLBACK");return false;}
   if(type==="media"&&row.reservation_id&&!row.actor_run_id||type==="categories"&&row.reservation_id&&!row.provider_name){await client.query("ROLLBACK");return false;}
   if(["paused","failed"].includes(row.status)){
    const status=["queued","running","starting"].includes(failure.resume_status)?failure.resume_status:"queued";
    await client.query(`UPDATE ${JOB_TABLES[type]} SET status=$2,available_at=now(),lease_owner=NULL,lease_until=NULL WHERE id=$1`,[id,status]);
    if(type==="collection"||type==="owned")await client.query(`UPDATE ${JOB_TABLES[type]} SET attempts=0 WHERE id=$1`,[id]);
    if(type==="kernel")await client.query("UPDATE kernel_jobs SET retry_count=0,error_code=NULL WHERE id=$1",[id]);
    if(type==="collection")await client.query("UPDATE collection_runs SET status='queued',stopped_at=NULL WHERE id=$1 AND status='paused'",[id]);
   }else await client.query(`UPDATE ${JOB_TABLES[type]} SET available_at=now(),lease_owner=NULL,lease_until=NULL WHERE id=$1`,[id]);
  }
  await client.query("UPDATE worker_job_failures SET status='resolved',failures=0,next_attempt_at=NULL,resume_status=NULL WHERE job_type=$1 AND job_id=$2",[type,id]);await client.query("COMMIT");return true;
 }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}finally{client.release();}
}
