export const META_PAGE_SIZES=[100,50,25,10] as const;
export type MetaPageSize=(typeof META_PAGE_SIZES)[number];
export function metaPageSize(value:unknown):MetaPageSize{return META_PAGE_SIZES.includes(value as MetaPageSize)?value as MetaPageSize:100;}
export function smallerMetaPage(value:unknown):MetaPageSize|null{const i=META_PAGE_SIZES.indexOf(metaPageSize(value));return META_PAGE_SIZES[i+1]??null;}
export function diagnosticNumber(value:unknown):number|null{
  const n=typeof value==="number"?value:typeof value==="string"&&/^\d{1,10}$/.test(value)?Number(value):NaN;
  return Number.isSafeInteger(n)&&n>=0&&n<=2147483647?n:null;
}
/** Only the two explicitly authorised user-facing fields may pass this boundary. */
export function metaUserText(value:unknown,token=""):string|null{
 if(typeof value!=="string")return null;
 let text=value.replace(/\\\//g,"/");
 for(let i=0;i<2;i++)text=text.replace(/(?:%[0-9a-f]{2})+/gi,part=>{try{return decodeURIComponent(part);}catch{return "[encoded text removed]";}});
 for(const secret of [token,token?encodeURIComponent(token):""])if(secret)text=text.split(secret).join("[redacted]");
 text=text.replace(/\bBearer\s+[^\s,;]+/gi,"[redacted]")
  .replace(/\b(?:access[_-]?token|api[_-]?key|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi,"[redacted]")
  .replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"']+/gi,"[link removed]")
  .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s<>"']*)?/gi,"[link removed]")
  .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g," ").replace(/\s+/g," ").trim();
 return Array.from(text).slice(0,300).join("")||null;
}
export const META_CONTROLLED_ERRORS={
  legacy:"Collection stopped before numeric diagnostics were recorded. Earlier evidence is retained.",
  budget:"Jobs paused: data_providers monthly budget is unset or its 90% threshold would be reached.",
  not_connected:"Meta not connected",
  permission:"Meta collection paused. Correct approved credentials and permissions, then resume explicitly; saved pages are retained.",
  schema:"Meta collection returned an unsupported configuration or response. Saved pages are retained; review the source configuration before retrying.",
  retry_limit:"Meta collection reached its retry limit. Saved pages are retained; retry collection to resume the saved progress.",
  rate_limited:"Meta collection was rate-limited. A bounded retry will resume from the saved cursor.",
  timeout:"Meta collection timed out. A bounded retry will resume from the saved cursor.",
  unavailable:"Meta collection is temporarily unavailable. A bounded retry will resume from the saved cursor.",
  page_size:"Meta could not return this page. Collection will retry the saved cursor with a smaller page size.",
  disabled:"The watchlist is disabled. Saved evidence is retained.",
  page_id:"Assign a Page ID to each brand in Edit watchlist before resuming collection."
} as const;
export type MetaFailureKind=keyof typeof META_CONTROLLED_ERRORS;
export interface MetaAttemptFailure {id:number;at:string;kind:MetaFailureKind;message:string;graphCode:number|null;graphSubcode:number|null;httpStatus:number|null;pageSize:number|null;timedOut:boolean;userTitle?:string|null;userMessage?:string|null}
export interface MetaRunSummary {
  id:string;status:"queued"|"running"|"complete"|"failed"|"paused"|"not_connected"|"superseded";
  adsSaved:number|null;pagesFetched:number|null;startedAt:string|null;stoppedAt:string|null;pageSize:MetaPageSize;
  message:string|null;failures:MetaAttemptFailure[];failureCount:number;
  currentFailure?:MetaAttemptFailure|null;nextAttemptAt?:string|null;
}
export function metaFailureMessage(failure:Pick<MetaAttemptFailure,"kind"|"graphCode"|"graphSubcode">):string{
  if(failure.graphCode===100&&failure.graphSubcode===2334030)return "Meta rejected the collection end date. Deploy the latest worker, then retry.";
  return META_CONTROLLED_ERRORS[failure.kind];
}
/** History survives a retry; cleared current errors must not become a new outage. */
export function currentMetaFailure(run:MetaRunSummary):MetaAttemptFailure|null{
  if(["complete","superseded"].includes(run.status))return null;
  if(run.currentFailure!==undefined)return run.currentFailure;
  return run.message||["failed","paused","not_connected"].includes(run.status)?run.failures[0]??null:null;
}
export function metaCollectionActivity(run:MetaRunSummary):string|null{
  const failure=currentMetaFailure(run);
  if(run.status==="complete"||run.status==="superseded")return null;
  if(["queued","running"].includes(run.status)){
    if(failure?.kind==="rate_limited")return "Waiting for Meta's rate limit. Collection will retry automatically.";
    if(failure&&["page_size","timeout","unavailable"].includes(failure.kind))return run.status==="queued"?`Retrying automatically with ${run.pageSize} ads per page.`:`Retrying with ${run.pageSize} ads per page.`;
    return run.status==="queued"?"Waiting for the worker.":"Collecting ads.";
  }
  return run.message||(failure?metaFailureMessage(failure):"Collection stopped. Review the source settings before retrying.");
}
