import {sourceAdFormat} from "../../shared/source-ad-format.js";
import type pg from "pg";
import { reserveCost } from "../infrastructure/budget.js";
import { boundedPublicBody } from "./public-json.js";
import {recordMetaObservation} from "../infrastructure/meta-observations.js";
import {diagnosticNumber,metaPageSize,metaUserText,type MetaPageSize} from "../../shared/meta-collection.js";
export const META_REQUEST_TIMEOUT_MS=90000;
export const META_COVERAGE = "Commercial ads delivered in the UK or EU; searchable for one year. Public reach is not conversions or sales. Media requires a separate browser capture.";
export const META_FIELDS = "id,page_id,page_name,ad_creation_time,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_snapshot_url,publisher_platforms,languages,target_ages,target_gender,target_locations,eu_total_reach,total_reach_by_location,age_country_gender_reach_breakdown,beneficiary_payers";
export function metaStatus(env:Record<string,string|undefined>=process.env) {
  const configured=Boolean(env.META_ACCESS_TOKEN?.trim()&&!/[\r\n]/.test(env.META_ACCESS_TOKEN));
  return { status: configured ? "configured" : "not_connected", enabled:metaLibraryEnabled(env), message: !metaLibraryEnabled(env)?"Live collection is off.":configured ? "Meta configured; collection permission is verified on the next run." : "Meta not connected", coverage: META_COVERAGE };
}
export function metaLibraryEnabled(env:Record<string,string|undefined>=process.env){return env.EXTER_META_LIBRARY_ENABLED==="true";}
export class MetaCollectionError extends Error {
  graphCode:number|null=null;graphSubcode:number|null=null;httpStatus:number|null=null;
  pageSize:MetaPageSize|null=null;reducePage=false;timedOut=false;
  userTitle:string|null=null;userMessage:string|null=null;
  constructor(public reason: "rate_limited" | "permission" | "unavailable" | "schema", message: string,public retryAfterMs=0) { super(message); }
}
function retryDelay(value:string|null){if(!value)return 0;const seconds=Number(value);const delay=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-Date.now();return Number.isFinite(delay)&&delay>0?Math.min(delay,86400000):0;}
function httpFailure(status: number) {
  const error=new MetaCollectionError(status === 429 ? "rate_limited" : [401,403].includes(status) ? "permission" : status === 400 ? "schema" : "unavailable", `Meta collection failed (HTTP ${status}). Check app approval, request configuration and provider availability.`);
  error.httpStatus=status;error.reducePage=status===500;return error;
}
function graphFailure(error: unknown, status: number) {
  const detail = error && typeof error === "object" ? error as Record<string,unknown> : {};
  const code=diagnosticNumber(detail.code),subcode=diagnosticNumber(detail.error_subcode);
  const withDiagnostics=(error:MetaCollectionError)=>{error.graphCode=code;error.graphSubcode=subcode;error.httpStatus=status;error.reducePage=error.reason==="unavailable"&&(code===1||status===500);return error;};
  // Graph can return application errors inside HTTP 200 or HTTP 400 bodies.
  // Interpret only known codes; never persist its message, trace or request URLs.
  if ([10,102,190,200,294].includes(code!))
    return withDiagnostics(new MetaCollectionError("permission", `Meta approval, permission or token was rejected (HTTP ${status}). Correct approved credentials and permissions before resuming.`));
  if (status===429||[4,17,32,613,80000,80001,80003,80004].includes(code!))
    return withDiagnostics(new MetaCollectionError("rate_limited", `Meta collection was rate-limited (HTTP ${status}). Retry later from the saved cursor.`));
  if ([1,2].includes(code!) || detail.is_transient === true)
    return withDiagnostics(new MetaCollectionError("unavailable", `Meta collection is temporarily unavailable (HTTP ${status}).`));
  return withDiagnostics(status >= 400 ? httpFailure(status) : new MetaCollectionError("schema", "Meta returned an unsupported application error."));
}
export interface MetaQuery {activeStatus?:"ALL"|"ACTIVE"; pageIds?: string[]; searchTerm?: string; countries: string[]; after?: string | null; from?:string;to?:string;pageSize?:MetaPageSize }
export class MetaLibraryConnector {
  constructor(private readonly options: { token?: string; version?: string; fetch?: typeof fetch } = {}) {}
  async page(query: MetaQuery) {
    const pageSize=metaPageSize(query.pageSize);
    if(query.pageSize!==undefined&&query.pageSize!==pageSize)throw new MetaCollectionError("schema","Use a supported Meta page size.");
    try{return await this.requestPage(query,pageSize);}catch(error){if(error instanceof MetaCollectionError)error.pageSize=pageSize;throw error;}
  }
  private async requestPage(query:MetaQuery,pageSize:MetaPageSize){
    const token = this.options.token ?? process.env.META_ACCESS_TOKEN;
    if (!token?.trim() || /[\r\n]/.test(token)) throw new MetaCollectionError("permission", "Meta not connected");
    const version = this.options.version ?? process.env.META_API_VERSION ?? "v26.0";
    if (!/^v\d+\.0$/.test(version)) throw new MetaCollectionError("schema", "Invalid META_API_VERSION.");
    if (!query.countries.length || query.countries.some(c => !/^[A-Z]{2}$/.test(c))) throw new MetaCollectionError("schema", "Use two-letter reached-country codes.");
    if ((!query.pageIds?.length && !query.searchTerm) || query.pageIds?.some(id => !/^\d+$/.test(id))) throw new MetaCollectionError("schema", "Provide Meta page IDs or a category search term.");
    if(query.pageIds?.length&&query.searchTerm)throw new MetaCollectionError("schema","Brand collection uses Page IDs; category discovery uses keywords separately.");
    if([query.from,query.to].some(value=>value!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))||query.from&&query.to&&query.from>query.to)throw new MetaCollectionError("schema","Choose a valid collection date range.");
    const url = new URL(`https://graph.facebook.com/${version}/ads_archive`);
    url.searchParams.set("fields", META_FIELDS);
    url.searchParams.set("ad_reached_countries", JSON.stringify(query.countries));
    if(query.activeStatus!==undefined&&!["ALL","ACTIVE"].includes(query.activeStatus))throw new MetaCollectionError("schema","Invalid discovery status.");
    url.searchParams.set("ad_active_status", query.activeStatus||"ALL");
    url.searchParams.set("ad_type", "ALL");
    url.searchParams.set("limit", String(pageSize));
    if (query.pageIds?.length) url.searchParams.set("search_page_ids", JSON.stringify(query.pageIds));
    if (query.searchTerm) url.searchParams.set("search_terms", query.searchTerm);
    if (query.after) url.searchParams.set("after", query.after);
    if(query.from)url.searchParams.set("ad_delivery_date_min",query.from);
    // No upper bound: Graph's Pacific "today" can lag the UK collection day.
    let response: Response;
    const signal=AbortSignal.timeout(META_REQUEST_TIMEOUT_MS);
    const timeout=(value:unknown)=>{
      const timed=(item:unknown)=>item instanceof Error&&["TimeoutError","HeadersTimeoutError","BodyTimeoutError"].includes(item.name)||Boolean(item&&typeof item==="object"&&["ETIMEDOUT","UND_ERR_HEADERS_TIMEOUT","UND_ERR_BODY_TIMEOUT"].includes(String((item as {code?:unknown}).code)));
      return signal.aborted||timed(value)||Boolean(value&&typeof value==="object"&&timed((value as {cause?:unknown}).cause));
    };
    const timeoutFailure=()=>{const error=new MetaCollectionError("unavailable","Meta request timed out; collection will resume from its saved cursor.");error.timedOut=true;error.reducePage=true;return error;};
    try { response = await (this.options.fetch ?? fetch)(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal }); }
    catch(error) { throw timeout(error)?timeoutFailure():new MetaCollectionError("unavailable", "Meta request unavailable; collection will resume from its saved cursor."); }
    const schemaFailure=(message:string)=>{const error=new MetaCollectionError("schema",message);error.httpStatus=response.status;return error;};
    const responseFailure=()=>{const error=httpFailure(response.status);error.retryAfterMs=metaResponseDelay(response);return error;};
    // Generic error text and paging URLs stay excluded; user fields are sanitised below.
    if (Number(response.headers.get("content-length")) > 10000000) throw response.ok ? schemaFailure("Meta page exceeds size limit.") : responseFailure();
    let raw:string;
    try { raw = await boundedPublicBody(response,10000000); }
    catch(error) { if(timeout(error)){const failure=timeoutFailure();failure.httpStatus=response.status;throw failure;}throw response.ok ? schemaFailure("Meta page could not be read within the size and request limits.") : responseFailure(); }
    let body: any;
    try { body = JSON.parse(raw); } catch { throw response.ok ? schemaFailure("Meta returned invalid JSON.") : responseFailure(); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw response.ok ? schemaFailure("Meta returned an unsupported ad schema.") : responseFailure();
    if (body.error||!response.ok){const error=body.error?graphFailure(body.error,response.status):responseFailure();error.userTitle=metaUserText(body.error?.error_user_title,token);error.userMessage=metaUserText(body.error?.error_user_msg,token);error.retryAfterMs=metaResponseDelay(response);throw error;}
    if (!Array.isArray(body.data) || body.data.length > 100 || body.data.some((r: any) => !r || typeof r.id !== "string" || !/^\d+$/.test(r.id))) throw schemaFailure("Meta returned an unsupported ad schema.");
    const after = body.paging?.next ? body.paging?.cursors?.after : null;
    if (body.paging?.next && (typeof after !== "string" || !after || after === query.after || after.length > 2000 || after.includes(token)||/https?:|access_token|[\r\n]/i.test(after))) throw schemaFailure("Meta pagination cursor is invalid.");
    // Source copy is untrusted too. Remove credentials and paging URLs recursively.
    const pagingUrls=[body.paging?.next,body.paging?.previous].filter((v):v is string=>typeof v==="string"&&v.length>0);
    const clean=(value:any):any=>typeof value==="string"?pagingUrls.reduce((s,url)=>s.split(url).join("[redacted]"),value).split(token).join("[redacted]"):Array.isArray(value)?value.map(clean):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).filter(([key])=>!["paging","next","previous","access_token","error"].includes(key)).map(([key,v])=>[key,clean(v)])):value;
    const rows = body.data.map((row:any)=>({...clean(Object.fromEntries(META_FIELDS.split(",").filter(key=>key in row).map(key=>[key,row[key]]))),...(sourceAdFormat(row)?{source_format:sourceAdFormat(row)}:{}),ad_snapshot_url:`https://www.facebook.com/ads/library/?id=${row.id}`}));
    return {rows,after:after as string|null,backoffMs:metaResponseDelay(response),pageSize};
  }
}
export function metaResponseDelay(response:Response){
  let usage = 0;
    for (const header of ["x-app-usage", "x-business-use-case-usage"]) {
      try {
        const data = JSON.parse(response.headers.get(header) || "{}");
        const walk = (v: any) => { if (v && typeof v === "object") for (const [k,n] of Object.entries(v)) { if (["call_count","total_cputime","total_time"].includes(k) && typeof n === "number") usage = Math.max(usage,n); else walk(n); } };
        walk(data);
      } catch { /* Malformed usage headers do not erase a successfully collected page. */ }
    }
  return Math.max(response.status===429?60000:0,usage >= 80 ? 60000 : 0,retryDelay(response.headers.get("retry-after")));
}
export async function collectMetaPage(pool: pg.Pool, runId: string, connector = new MetaLibraryConnector(), leaseOwner?: string) {
  const result = await pool.query(`SELECT r.*,w.workspace_id,w.page_ids,w.search_terms,w.countries,w.meta_page_size,w.revision AS watchlist_revision,j.page_size,
    COALESCE(r.pages_fetched,(SELECT count(*) FROM collection_cursors c WHERE c.run_id=r.id)+r.query_index)::int AS successful_pages
    FROM collection_runs r JOIN watchlists w ON w.id=r.watchlist_id LEFT JOIN collection_jobs j ON j.id=r.id WHERE r.id=$1`, [runId]);
  const run = result.rows[0];
  if (!run || ["complete","superseded"].includes(run.status)) return { complete: true, backoffMs: 0 };
  const config = run.config || run;
  const queries: MetaQuery[] = [
    ...(config.purpose!=="discovery"&&config.page_ids.length ? [{ pageIds: config.page_ids, countries: config.countries }] : []),
    ...(config.purpose==="discovery"||!config.page_ids.length?config.search_terms.map((searchTerm: string) => ({ searchTerm, countries: config.countries })):[]),
  ];
  if (!queries.length) throw new MetaCollectionError("schema", "Watchlist has no advertisers or search terms.");
  await reserveCost(pool,"data_providers","meta",0);
  const page = await connector.page({ ...queries[run.query_index],from:config.from, after: run.cursor,pageSize:metaPageSize(run.page_size??run.meta_page_size) });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT cursor,query_index,status FROM collection_runs WHERE id=$1 FOR UPDATE", [runId]);
    if (leaseOwner) {
      const lease = await client.query("SELECT id FROM collection_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now() FOR UPDATE", [runId,leaseOwner]);
      if (!lease.rowCount) throw new Error("Collection lease expired.");
    }
    if (locked.rows[0].cursor !== run.cursor || locked.rows[0].query_index !== run.query_index || ["complete","superseded"].includes(locked.rows[0].status)) {
      await client.query("ROLLBACK"); return { complete: false, backoffMs: 0 };
    }
    if (page.after) {
      const cursor = await client.query("INSERT INTO collection_cursors VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING cursor", [runId,run.query_index,page.after]);
      if (!cursor.rowCount) throw new MetaCollectionError("schema", "Meta pagination contains a cycle.");
    }
    let added = 0, updated = 0;
    // A stable lock order also covers overlapping ads in concurrent workspace scans.
    for (const row of [...page.rows].sort((left,right)=>String(left.id).localeCompare(String(right.id)))) {
      const inserted = await client.query(`INSERT INTO public_ads(platform,native_id,advertiser_id,start_time,stop_time)
        VALUES('Meta',$1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING native_id`, [String(row.id),row.page_id ?? null,row.ad_delivery_start_time ?? null,row.ad_delivery_stop_time ?? null]);

      await client.query("UPDATE public_ads SET advertiser_id=COALESCE($2,advertiser_id),start_time=COALESCE($3,start_time),stop_time=COALESCE($4,stop_time) WHERE platform='Meta' AND native_id=$1", [String(row.id),row.page_id ?? null,row.ad_delivery_start_time ?? null,row.ad_delivery_stop_time ?? null]);
      const observation=await recordMetaObservation(client,run,row);
      if(observation==="conflict")throw new MetaCollectionError("schema","Meta returned conflicting ad states in one collection run. Earlier snapshots are retained.");
      if (observation==="inserted") { if (inserted.rowCount) added++; else updated++; }
    }
    const nextIndex = page.after ? run.query_index : run.query_index + 1;
    const complete = nextIndex >= queries.length;
    await client.query(`UPDATE collection_runs SET records_new=records_new+$2,records_updated=records_updated+$3,cursor=$4,query_index=$5,
      status=$6,finished_at=CASE WHEN $7 THEN clock_timestamp() ELSE NULL END,stopped_at=CASE WHEN $7 THEN clock_timestamp() ELSE NULL END,
      last_successful_check=CASE WHEN $7 THEN clock_timestamp() ELSE last_successful_check END,pages_fetched=$8,errors='[]' WHERE id=$1`,
      [runId,added,updated,page.after,nextIndex,complete ? "complete" : "running",complete,run.successful_pages+1]);
    await client.query("UPDATE watchlists SET meta_page_size=$2 WHERE id=$1 AND revision=$3",[run.watchlist_id,page.pageSize,config.revision??run.watchlist_revision]);
    if (leaseOwner) await client.query("UPDATE collection_jobs SET attempts=0 WHERE id=$1 AND lease_owner=$2", [runId,leaseOwner]);
    await client.query("COMMIT");
    return { complete, backoffMs: page.backoffMs };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
