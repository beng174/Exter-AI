import type pg from "pg";
import type {MediaCoverage,MediaMissingReason,MissingMediaPage} from "../../shared/ad-media.js";
import {PUBLIC_ROWS_SQL,MISSING_REASON_SQL} from "../infrastructure/public-rows-sql.js";
export interface CoverageAd{brandKey:string;nativeId:string}
export interface CoverageAttempt extends CoverageAd{returned:boolean;matched:boolean;outcome:string;queued?:boolean;requested?:boolean;lastAttemptAt?:string|null}
export interface CoverageFile extends CoverageAd{image:boolean;video:boolean;legacy?:boolean;error?:string|null;missingFile?:boolean}
const identity=(row:CoverageAd)=>JSON.stringify([row.brandKey,row.nativeId]);
export function missingMediaReason(request:CoverageAttempt|undefined,file:CoverageFile|undefined,budget=false):MediaMissingReason {
 if(request?.queued)return budget?"budget":"queued";
 if(file?.missingFile)return "file_missing";
 if(budget&&!request)return "budget";
 if(!request)return file?.error&&["expired","unsupported","disk","provider"].includes(file.error)?file.error as MediaMissingReason:file?.legacy?"provider":"not_requested";
 if(["expired","unsupported","wrong_page","disk","provider","no_media","not_returned","budget"].includes(request.outcome))return request.outcome as MediaMissingReason;
 return !request.returned?"not_returned":"no_media";
}
export function mediaCoverage(official:CoverageAd[],attempts:CoverageAttempt[],files:CoverageFile[],brands:{brandKey:string;budget:boolean;historyIncomplete?:boolean}[]):MediaCoverage[]{
 const requests=new Map(attempts.map(a=>[identity(a),a])),assets=new Map(files.map(a=>[identity(a),a]));
 return brands.map(brand=>{
  const rows=[...new Map(official.filter(a=>a.brandKey===brand.brandKey).map(a=>[a.nativeId,a])).values()],reasons:Record<MediaMissingReason,number>={not_requested:0,not_returned:0,expired:0,unsupported:0,wrong_page:0,budget:0,disk:0,provider:0,queued:0,no_media:0,file_missing:0};
  let images=0,videos=0,requested=0,returned=0,matched=0;
  for(const row of rows){const request=requests.get(identity(row)),file=assets.get(identity(row));
   if(file?.image)images++;if(file?.video)videos++;
   if(request&&request.requested!==false||file?.legacy)requested++;if(request?.returned||file?.legacy)returned++;if(request?.matched||file?.legacy)matched++;
   if(file?.image)continue;
   const reason=missingMediaReason(request,file,brand.budget);
   reasons[reason]++;
  }
  return {brandKey:brand.brandKey,official:rows.length,images,videos,requested,returned,matched,missing:rows.length-images,reasons,historyIncomplete:Boolean(brand.historyIncomplete)};
 });
}
export async function readMediaCoverage(pool:pg.Pool,workspace:string):Promise<MediaCoverage[]>{
 const result=await pool.query(`${PUBLIC_ROWS_SQL}, counted AS (SELECT *,${MISSING_REASON_SQL} AS reason FROM state)
 SELECT w.brand_key AS "brandKey",count(c.native_id)::integer AS official,count(*) FILTER(WHERE c.image)::integer AS images,count(*) FILTER(WHERE c.video)::integer AS videos,
 count(*) FILTER(WHERE c.requested_at IS NOT NULL OR c.legacy_attempt IS NOT NULL)::integer AS requested,count(*) FILTER(WHERE c.ever_returned OR c.legacy_attempt IS NOT NULL)::integer AS returned,count(*) FILTER(WHERE c.ever_matched OR c.legacy_attempt IS NOT NULL)::integer AS matched,
 count(*) FILTER(WHERE c.native_id IS NOT NULL AND NOT c.image)::integer AS missing,
 jsonb_build_object(${["not_requested","not_returned","expired","unsupported","wrong_page","budget","disk","provider","queued","no_media","file_missing"].map(reason=>`'${reason}',count(*) FILTER(WHERE NOT c.image AND c.reason='${reason}')`).join(",")}) AS reasons,
 EXISTS(SELECT 1 FROM ad_media_runs r WHERE r.workspace_id=$1 AND r.brand_key=w.brand_key AND r.actor_run_id IS NOT NULL AND r.requested_ids IS NULL) AS "historyIncomplete"
 FROM (SELECT DISTINCT brand_key FROM watches) w LEFT JOIN counted c ON c.brand_key=w.brand_key GROUP BY w.brand_key ORDER BY w.brand_key`,[workspace,null,new Date()]);
 return result.rows;
}
export async function readMissingMedia(pool:pg.Pool,workspace:string,options:{brand?:string;reason?:string;offset?:number;adId?:string}={}):Promise<MissingMediaPage>{
 const offset=Math.max(0,Math.floor(options.offset||0)),limit=50;
 const result=await pool.query(`${PUBLIC_ROWS_SQL}, missing AS (SELECT *,${MISSING_REASON_SQL} AS reason FROM state WHERE NOT image), filtered AS (
  SELECT * FROM missing WHERE ($4::text IS NULL OR brand_key=$4) AND ($5::text IS NULL OR reason=$5) AND ($6::text IS NULL OR native_id=$6)
 ) SELECT (SELECT count(*)::integer FROM filtered) AS total,COALESCE((SELECT jsonb_agg(p) FROM (SELECT brand_key AS "brandKey",native_id AS "nativeId",reason,requested_at AS "lastAttemptAt" FROM filtered ORDER BY brand_key,native_id LIMIT $7 OFFSET $8)p),'[]'::jsonb) AS ads`,[workspace,null,new Date(),options.brand||null,options.reason||null,options.adId?.trim()||null,limit,offset]);
 const page:({brandKey:string;nativeId:string;reason:MediaMissingReason;lastAttemptAt:string|null})[]=result.rows[0]?.ads||[],total=result.rows[0]?.total||0;
 const attempts=page.length?(await pool.query(`SELECT DISTINCT ON(r.brand_key,q.native_id) r.brand_key,q.native_id,r.page_id,r.lookup_mode,q.returned_at,q.matched_at,
  COALESCE(c.diagnostics,'[]'::jsonb) AS diagnostics FROM ad_media_requests q JOIN ad_media_runs r ON r.id=q.run_id
  LEFT JOIN ad_media_creatives c ON c.run_id=r.id AND c.native_id=q.native_id WHERE r.workspace_id=$1 AND q.native_id=ANY($2::text[]) ORDER BY r.brand_key,q.native_id,q.requested_at DESC,r.id DESC`,[workspace,page.map(row=>row.nativeId)])).rows:[];

 const metadata=page.length?await pool.query(`SELECT DISTINCT ON(w.brand_key,o.native_id) w.brand_key,o.native_id,a.start_time,
  left(COALESCE(o.raw_payload,p.raw_payload)->'ad_creative_bodies'->>0,500) AS copy
  FROM ad_observations o JOIN public_ads a USING(platform,native_id) JOIN collection_runs r ON r.id=o.run_id JOIN watchlists w ON w.id=r.watchlist_id
  LEFT JOIN ad_observations p ON p.workspace_id=o.workspace_id AND p.platform=o.platform AND p.native_id=o.native_id AND p.run_id=o.raw_payload_run_id
  WHERE o.workspace_id=$1 AND w.workspace_id=$1 AND r.config->>'revision'=w.revision::text AND a.advertiser_id=w.page_ids->>0 AND o.native_id=ANY($2::text[])
  ORDER BY w.brand_key,o.native_id,o.observed_at DESC,o.run_id DESC`,[workspace,page.map(row=>row.nativeId)]):{rows:[]};
 return {total,offset,limit,ads:page.map(row=>{const meta=metadata.rows.find(m=>m.brand_key===row.brandKey&&m.native_id===row.nativeId),when=row.lastAttemptAt;const attempt=attempts.find(a=>a.brand_key===row.brandKey&&a.native_id===row.nativeId);return {...row,diagnostics:attempt?.diagnostics||[],pageId:attempt?.page_id||null,lookupMode:attempt?.lookup_mode||null,returned:Boolean(attempt?.returned_at),matched:Boolean(attempt?.matched_at),copy:meta?.copy||'',startAt:meta?.start_time?new Date(meta.start_time).toISOString():null,lastAttemptAt:when?new Date(when).toISOString():null};})};
}

export async function readMissingReasons(pool:pg.Pool,workspace:string,ids?:string[]){
 if(!ids?.length)return new Map<string,{reason:MediaMissingReason;lastAttemptAt:string|null}>();
 const selectedSql=PUBLIC_ROWS_SQL.replace('WHERE a.advertiser_id=w.page_ids->>0','WHERE a.advertiser_id=w.page_ids->>0 AND o.native_id=ANY($4::text[])');
 const result=await pool.query(`${selectedSql} SELECT brand_key AS "brandKey",native_id AS "nativeId",${MISSING_REASON_SQL} AS reason,requested_at AS "lastAttemptAt" FROM state WHERE NOT image LIMIT 500`,[workspace,null,new Date(),ids]);
 return new Map(result.rows.map(row=>[identity(row),{reason:row.reason,lastAttemptAt:row.lastAttemptAt}]));
}
