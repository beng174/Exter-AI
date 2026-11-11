import type pg from "pg";
import type {WorkerJobType} from "../../shared/worker-health.js";
import {databaseConnectionError,workerDiagnostic,type WorkerClaim,type WorkerObserver} from "./worker-diagnostics.js";
import {QUEUE_JOB_ID,queueMayRun,recordWorkerFailure,resolveWorkerFailure} from "./worker-recovery.js";

export interface WorkerTask {type:WorkerJobType; run:(observer:WorkerObserver)=>Promise<boolean>}
export interface WorkerLoopOptions {signal?:AbortSignal;log?:(line:string)=>void;idle?:(signal?:AbortSignal)=>Promise<void>;recoveryBackoff?:Map<WorkerJobType,{failures:number;next:number}>}
/** Run each independent queue even when a previous queue fails. */
export async function workerCycle(pool:pg.Pool,tasks:WorkerTask[],options:WorkerLoopOptions={}){
 const log=options.log??console.error,fallback=options.recoveryBackoff??new Map<WorkerJobType,{failures:number;next:number}>();let worked=false;
 for(const task of tasks){
  if(options.signal?.aborted)break;
  const unrecorded=fallback.get(task.type);if(unrecorded&&(unrecorded.failures>=3||unrecorded.next>Date.now()))continue;
  const attempt:{claim:WorkerClaim|null}={claim:null};let failure:unknown,failed=false;
  try{
   if(!await queueMayRun(pool,task.type))continue;
   const result=await task.run({onClaim:value=>{attempt.claim=value;},onFailure:error=>{if(!failed){failure=error;failed=true;}}});worked=result||worked;
   if(failed)throw failure;
   await resolveWorkerFailure(pool,task.type,attempt.claim);
   fallback.delete(task.type);
  }catch(error){
   const diagnostic=workerDiagnostic(error);
   // A provider network error is not proof that the database connection failed.
   if(databaseConnectionError(error)){
    try{await pool.query("SELECT 1");}catch(probe){if(databaseConnectionError(probe)){log(JSON.stringify({event:"worker_database_unavailable",jobType:task.type,jobId:attempt.claim?.id??QUEUE_JOB_ID,error:workerDiagnostic(probe)}));throw probe;}}
   }
   try{const saved=await recordWorkerFailure(pool,task.type,attempt.claim,diagnostic);log(JSON.stringify({event:"worker_job_failed",jobType:task.type,jobId:attempt.claim?.id??QUEUE_JOB_ID,failures:saved?.failures??null,status:saved?.status??"lease_lost",error:diagnostic}));}
   catch(saveError){
    log(JSON.stringify({event:"worker_job_recovery_failed",jobType:task.type,jobId:attempt.claim?.id??QUEUE_JOB_ID,error:diagnostic,recoveryError:workerDiagnostic(saveError)}));
    try{await pool.query("SELECT 1");}catch(probe){if(databaseConnectionError(probe))throw probe;}
    // If the database cannot save diagnostics, still stop a hot restart loop.
    const failures=(fallback.get(task.type)?.failures??0)+1;
    fallback.set(task.type,{failures,next:Date.now()+60000*failures});
   }
  }
 }
 return worked;
}
export async function idleWorker(signal?:AbortSignal){
 if(signal?.aborted)return;
 await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener("abort",done);resolve();};const timer=setTimeout(done,1000);signal?.addEventListener("abort",done,{once:true});});
}
export async function runWorkerLoop(pool:pg.Pool,tasks:WorkerTask[],options:WorkerLoopOptions={}){
 const databaseStop=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,databaseStop.signal]):databaseStop.signal;
 const recoveryBackoff=options.recoveryBackoff??new Map<WorkerJobType,{failures:number;next:number}>();
 let databaseFailure:unknown;
 const onError=(error:unknown)=>{(options.log??console.error)(JSON.stringify({event:"worker_database_client_error",error:workerDiagnostic(error)}));if(databaseConnectionError(error)){databaseFailure=error;databaseStop.abort();}};
 pool.on("error",onError);
 try{while(!signal.aborted){const worked=await workerCycle(pool,tasks,{...options,signal,recoveryBackoff});if(!worked&&!signal.aborted)await(options.idle??idleWorker)(signal);}if(databaseFailure)throw databaseFailure;}
 finally{pool.off("error",onError);}
}
