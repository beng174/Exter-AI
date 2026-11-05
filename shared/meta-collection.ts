export const META_PAGE_SIZES=[100,50,25,10] as const;
export type MetaPageSize=(typeof META_PAGE_SIZES)[number];
export function metaPageSize(value:unknown):MetaPageSize{return META_PAGE_SIZES.includes(value as MetaPageSize)?value as MetaPageSize:100;}
export function smallerMetaPage(value:unknown):MetaPageSize|null{const i=META_PAGE_SIZES.indexOf(metaPageSize(value));return META_PAGE_SIZES[i+1]??null;}
export function diagnosticNumber(value:unknown):number|null{
  const n=typeof value==="number"?value:typeof value==="string"&&/^\d{1,10}$/.test(value)?Number(value):NaN;
  return Number.isSafeInteger(n)&&n>=0&&n<=2147483647?n:null;
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
export interface MetaAttemptFailure {id:number;at:string;kind:MetaFailureKind;message:string;graphCode:number|null;graphSubcode:number|null;httpStatus:number|null;pageSize:number|null;timedOut:boolean}
export interface MetaRunSummary {
  id:string;status:"queued"|"running"|"complete"|"failed"|"paused"|"not_connected"|"superseded";
  adsSaved:number|null;pagesFetched:number|null;startedAt:string|null;stoppedAt:string|null;pageSize:MetaPageSize;
  message:string|null;failures:MetaAttemptFailure[];failureCount:number;
}
