import type pg from "pg";
import type {MetaWatchlist} from "../../shared/meta-public.js";
import {META_CONTROLLED_ERRORS,diagnosticNumber,metaPageSize,metaUserText,metaFailureMessage,currentMetaFailure,type MetaFailureKind,type MetaRunSummary} from "../../shared/meta-collection.js";
const iso=(value:unknown)=>{const date=value instanceof Date?value:typeof value==="string"?new Date(value):null;return date&&Number.isFinite(date.getTime())?date.toISOString():null;};
const kind=(value:unknown):MetaFailureKind=>typeof value==="string"&&Object.hasOwn(META_CONTROLLED_ERRORS,value)?value as MetaFailureKind:"unavailable";
const statuses=["queued","running","complete","failed","paused","not_connected","superseded"] as const;
export function metaRunProjection(row:Record<string,any>):MetaRunSummary|null{
  if(!row.run_id)return null;
  const failures=(Array.isArray(row.failures)?row.failures:[]).map((failure:any)=>({id:diagnosticNumber(failure.id)??0,at:iso(failure.attempted_at)!,kind:kind(failure.kind),message:metaFailureMessage({kind:kind(failure.kind),graphCode:diagnosticNumber(failure.graph_code),graphSubcode:diagnosticNumber(failure.graph_subcode)}),graphCode:diagnosticNumber(failure.graph_code),graphSubcode:diagnosticNumber(failure.graph_subcode),httpStatus:diagnosticNumber(failure.http_status),pageSize:failure.page_size==null?null:metaPageSize(failure.page_size),timedOut:failure.timed_out===true,userTitle:metaUserText(failure.error_user_title,process.env.META_ACCESS_TOKEN),userMessage:metaUserText(failure.error_user_msg,process.env.META_ACCESS_TOKEN)}));
  // Earlier runs stored only fixed messages. Never echo an unrecognised persisted string.
  const oldMessage=row.errors?.[0]?.message;
  const known=Object.values(META_CONTROLLED_ERRORS).find(message=>message===oldMessage);
  const message=["complete","superseded"].includes(row.run_status)?null:Array.isArray(row.errors)&&row.errors.length?failures[0]?.message||known||"The collection stopped. Earlier evidence is retained; retry from the saved progress.":null;
  const added=diagnosticNumber(row.records_new),updated=diagnosticNumber(row.records_updated);
  const summary:MetaRunSummary={id:row.run_id,status:statuses.includes(row.run_status)?row.run_status:"paused",adsSaved:added===null||updated===null?null:added+updated,pagesFetched:diagnosticNumber(row.pages_fetched),startedAt:iso(row.started_at),stoppedAt:iso(row.stopped_at)||(["complete","failed"].includes(row.run_status)?iso(row.finished_at):null),pageSize:metaPageSize(row.request_page_size??row.meta_page_size),message,failures,failureCount:diagnosticNumber(row.failure_count)??failures.length,nextAttemptAt:["queued","running"].includes(row.run_status)?iso(row.next_attempt_at):null};
  return {...summary,currentFailure:currentMetaFailure(summary)};
}
export async function readMetaWatchlists(pool:pg.Pool,workspaceId:string):Promise<MetaWatchlist[]>{
  const result=await pool.query(`SELECT w.id,w.workspace_id,w.brand_key,w.purpose,w.page_ids,w.search_terms,w.countries,w.enabled,w.meta_page_size,
    r.id AS run_id,r.status AS run_status,r.records_new,r.records_updated,r.started_at,r.finished_at,r.stopped_at,r.errors,
    COALESCE(r.pages_fetched,(SELECT count(*) FROM collection_cursors c WHERE c.run_id=r.id)+r.query_index)::int AS pages_fetched,
    j.page_size AS request_page_size,
    CASE WHEN j.status='queued' AND r.status IN ('queued','running') THEN GREATEST(j.available_at,(SELECT next_request_at FROM meta_request_gate WHERE id=1)) END AS next_attempt_at,
    (SELECT count(*)::int FROM meta_collection_failures f WHERE f.run_id=r.id) AS failure_count,
    (SELECT jsonb_agg(f ORDER BY f.id DESC) FROM (SELECT id,attempted_at,kind,graph_code,graph_subcode,http_status,page_size,timed_out,error_user_title,error_user_msg FROM meta_collection_failures WHERE run_id=r.id ORDER BY id DESC LIMIT 20) f) AS failures
    FROM watchlists w LEFT JOIN LATERAL(SELECT id,status,records_new,records_updated,started_at,finished_at,stopped_at,errors,pages_fetched,query_index FROM collection_runs WHERE watchlist_id=w.id ORDER BY started_at DESC,id DESC LIMIT 1) r ON true
    LEFT JOIN collection_jobs j ON j.id=r.id WHERE w.workspace_id=$1 ORDER BY w.id`,[workspaceId]);
  return result.rows.map(row=>({id:row.id,workspace_id:row.workspace_id,brand_key:row.brand_key,purpose:row.purpose,page_ids:row.page_ids,search_terms:row.search_terms,countries:row.countries,enabled:row.enabled,meta_page_size:metaPageSize(row.meta_page_size),latestRun:metaRunProjection(row)}));
}
