import type pg from "pg";
import { actorDiscoveryInput,discoverySteps } from "./discovery-store.js";
import { legacyCreatorHolds,actorIdValid,finalActorStatus,settleCreatorRun,trackCreatorProgress,type CreatorActorRun } from "./run-store.js";
import type { ApifyCreatorProvider } from "./apify.js";
const object=(v:unknown):Record<string,any>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{};
/** Historical matching also requires the owner's explicit run-to-hold selection. */
export function creatorRunInputMatches(job:Record<string,any>,input:unknown){
 const actual=object(input),brief=job.brief,target=Math.min(199,Math.max(1,Math.ceil(brief.target/Math.max(1,discoverySteps(brief).length))));
 const steps=[...discoverySteps(brief),...(Array.isArray(job.steps)?job.steps:[])].filter(s=>s.kind!=="verify");
 if(steps.some(step=>{const expected=actorDiscoveryInput(step,brief.country,target);if(expected.search&&Array.isArray(actual.directUrls)&&actual.directUrls.length||expected.directUrls&&actual.search)return false;return Object.entries(expected).every(([k,v])=>JSON.stringify(actual[k])===JSON.stringify(v));}))return true;
 const known=new Set(Array.isArray(job.handles)?job.handles:[]);
 return actual.resultsType==="details" && actual.resultsLimit===1 && !actual.search && Array.isArray(actual.directUrls) && actual.directUrls.length>0 && actual.directUrls.length<=20 && actual.directUrls.every((url:unknown)=>typeof url==="string" && /^https:\/\/www\.instagram\.com\/[a-z0-9._]+\/$/.test(url) && known.has(url.split("/")[3]));
}
export async function reconcileCreatorSearch(pool:pg.Pool,job:Record<string,any>,provider:Partial<Pick<ApifyCreatorProvider,"inspectRun"|"inspectInput"|"inspectActor">>){
 if(!provider.inspectRun)throw new Error("Provider checks are unavailable.");
 let checked=0,pending=0,invalid=0;
 const mappings=Array.isArray(job.reconcile_mappings)?job.reconcile_mappings:[];
 for(const mapping of mappings)try{
  if(!actorIdValid(mapping.actorRunId)||!actorIdValid(mapping.reservationId))throw new Error();
  const hold=(await legacyCreatorHolds(pool,job)).find(h=>h.reservationId===mapping.reservationId);if(!hold)throw new Error();
  const run=object(object(await provider.inspectRun(mapping.actorRunId)).data),actor=object(object(await provider.inspectActor?.()).data);
  if(run.id!==mapping.actorRunId || !actorIdValid(actor.id) || run.actId!==actor.id || !actorIdValid(run.defaultKeyValueStoreId) || !creatorRunInputMatches(job,await provider.inspectInput?.(run.defaultKeyValueStoreId)))throw new Error();
  const at=Date.parse(run.startedAt),holdAt=Date.parse(hold.createdAt);
  if(!Number.isFinite(at)||at<holdAt||at-holdAt>90000)throw new Error();
  await pool.query(`INSERT INTO creator_provider_runs(reservation_id,workspace_id,search_id,actor_id,actor_run_id,gbp_per_usd,started_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(reservation_id) DO UPDATE SET actor_run_id=excluded.actor_run_id WHERE creator_provider_runs.search_id=excluded.search_id AND creator_provider_runs.actor_run_id IS NULL`,[hold.reservationId,job.workspace_id,job.id,actor.id,run.id,job.conversion,run.startedAt]);
 }catch{invalid++;}
 const rows=(await pool.query("SELECT r.*,l.initial_reserved_gbp FROM creator_provider_runs r JOIN cost_ledger l ON l.id=r.reservation_id WHERE r.search_id=$1 ORDER BY started_at LIMIT 200",[job.id])).rows;
 for(const r of rows){if(!actorIdValid(r.actor_run_id)){pending++;continue;}try{
  const data=object(object(await provider.inspectRun(r.actor_run_id)).data);if(data.id!==r.actor_run_id)throw new Error();
  const status=["READY","RUNNING","SUCCEEDED","FAILED","ABORTED","ABORTING","TIMED-OUT","TIMING-OUT"].includes(data.status)?data.status:"UNKNOWN";
  const run:CreatorActorRun={reservationId:r.reservation_id,reservedGbp:Number(r.initial_reserved_gbp),conversion:Number(r.gbp_per_usd),runId:data.id,datasetId:actorIdValid(data.defaultDatasetId)?data.defaultDatasetId:r.dataset_id,status,found:r.found,startedAt:new Date(r.started_at).toISOString(),usageUsd:finalActorStatus(status)&&typeof data.usageTotalUsd==="number"&&Number.isFinite(data.usageTotalUsd)&&data.usageTotalUsd>=0?data.usageTotalUsd:null};
  await trackCreatorProgress(pool,run);if(await settleCreatorRun(pool,run))checked++;else pending++;
 }catch{pending++;}}
 const missing=await legacyCreatorHolds(pool,job);
 return `${checked} charges checked. ${pending} runs still pending.${missing.length?` ${missing.length} earlier holds need a confirmed run ID.`:""}${invalid?` ${invalid} mappings could not be verified.`:""}`;
}
