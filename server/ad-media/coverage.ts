import type pg from "pg";
import type {MediaCoverage,MediaMissingReason,MissingMediaPage} from "../../shared/ad-media.js";
export interface CoverageAd{brandKey:string;nativeId:string}
export interface CoverageAttempt extends CoverageAd{returned:boolean;matched:boolean;outcome:string;queued?:boolean;requested?:boolean;lastAttemptAt?:string|null}
export interface CoverageFile extends CoverageAd{image:boolean;video:boolean;legacy?:boolean;error?:string|null;missingFile?:boolean}
const identity=(row:CoverageAd)=>JSON.stringify([row.brandKey,row.nativeId]);
export function missingMediaReason(request:CoverageAttempt|undefined,file:CoverageFile|undefined,budget=false):MediaMissingReason {
 if(request?.queued)return budget?"budget":"queued";
 if(file?.missingFile)return "file_missing";
 if(budget&&!request)return "budget";
 if(!request)return file?.legacy?"provider":"not_requested";
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
async function readCoverageData(pool:pg.Pool,workspace:string){
 const [brands,official,requests,files]=await Promise.all([
  pool.query(`SELECT w.brand_key AS "brandKey",bool_or(EXISTS(SELECT 1 FROM ad_media_runs r WHERE r.watchlist_id=w.id AND r.status='paused' AND r.error_kind='budget')) AS budget,
   bool_or(EXISTS(SELECT 1 FROM ad_media_runs r WHERE r.watchlist_id=w.id AND r.actor_run_id IS NOT NULL AND r.requested_ids IS NULL)) AS "historyIncomplete"
   FROM watchlists w WHERE w.workspace_id=$1 AND w.purpose='brand' AND w.brand_key IS NOT NULL AND jsonb_array_length(w.page_ids)=1 GROUP BY w.brand_key`,[workspace]),
  pool.query(`SELECT DISTINCT w.brand_key AS "brandKey",o.native_id AS "nativeId" FROM watchlists w JOIN collection_runs r ON r.watchlist_id=w.id JOIN ad_observations o ON o.run_id=r.id JOIN public_ads a USING(platform,native_id)
   WHERE w.workspace_id=$1 AND o.workspace_id=$1 AND w.purpose='brand' AND r.config->>'revision'=w.revision::text AND a.advertiser_id=w.page_ids->>0`,[workspace]),
  pool.query(`SELECT DISTINCT ON(r.brand_key,q.native_id) r.brand_key AS "brandKey",q.native_id AS "nativeId",bool_or(q.returned_at IS NOT NULL) OVER(PARTITION BY r.brand_key,q.native_id) AS returned,bool_or(q.matched_at IS NOT NULL) OVER(PARTITION BY r.brand_key,q.native_id) AS matched,q.outcome,q.requested_at AS "lastAttemptAt"
   FROM ad_media_requests q JOIN ad_media_runs r ON r.id=q.run_id JOIN watchlists w ON w.id=r.watchlist_id AND w.page_ids->>0=r.page_id
   WHERE r.workspace_id=$1 ORDER BY r.brand_key,q.native_id,q.requested_at DESC,r.id DESC`,[workspace]),
  pool.query(`SELECT c.brand_key AS "brandKey",c.native_id AS "nativeId",true AS legacy,
   bool_or(EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets) a WHERE a->>'role' IN ('image','poster') AND NOT EXISTS(SELECT 1 FROM ad_media_file_checks f WHERE f.workspace_id=c.workspace_id AND f.artifact_id=a->'ref'->>'artifactId' AND NOT f.available))) AS image,
   bool_or(EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets) a WHERE a->>'role'='video' AND NOT EXISTS(SELECT 1 FROM ad_media_file_checks f WHERE f.workspace_id=c.workspace_id AND f.artifact_id=a->'ref'->>'artifactId' AND NOT f.available))) AS video,
   bool_or(EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets) a JOIN ad_media_file_checks f ON f.workspace_id=c.workspace_id AND f.artifact_id=a->'ref'->>'artifactId' WHERE a->>'role' IN ('image','poster') AND NOT f.available)) AS "missingFile"
   FROM ad_media_creatives c JOIN watchlists w ON w.workspace_id=c.workspace_id AND w.brand_key=c.brand_key AND w.page_ids->>0=c.page_id
   WHERE c.workspace_id=$1 GROUP BY c.brand_key,c.native_id`,[workspace])
 ]);
 const queued=await pool.query(`SELECT r.brand_key AS "brandKey",jsonb_array_elements_text(r.target_ids) AS "nativeId",r.status,r.error_kind
  FROM ad_media_runs r JOIN watchlists w ON w.id=r.watchlist_id AND w.page_ids->>0=r.page_id WHERE r.workspace_id=$1 AND r.status IN ('queued','starting','running','paused','uncertain')`,[workspace]);
 const byId=new Map<string,CoverageAttempt>(requests.rows.map(row=>[identity(row),row]));
 for(const row of queued.rows){const key=identity(row),previous=byId.get(key);byId.set(key,{...row,returned:previous?.returned||false,matched:previous?.matched||false,lastAttemptAt:previous?.lastAttemptAt,outcome:row.error_kind==='budget'?'budget':previous?.outcome||'not_requested',requested:Boolean(previous),queued:!['paused','uncertain'].includes(row.status)});}
 return {official:official.rows as CoverageAd[],requests:[...byId.values()],files:files.rows as CoverageFile[],brands:brands.rows};
}

export async function readMediaCoverage(pool:pg.Pool,workspace:string):Promise<MediaCoverage[]>{
 const data=await readCoverageData(pool,workspace);return mediaCoverage(data.official,data.requests,data.files,data.brands);
}
export async function readMissingMedia(pool:pg.Pool,workspace:string,options:{brand?:string;reason?:string;offset?:number}={}):Promise<MissingMediaPage>{
 const data=await readCoverageData(pool,workspace),requests=new Map(data.requests.map(row=>[identity(row),row])),files=new Map(data.files.map(row=>[identity(row),row]));
 const missing=data.official.filter(row=>!files.get(identity(row))?.image).map(row=>({...row,reason:missingMediaReason(requests.get(identity(row)),files.get(identity(row)),data.brands.find(b=>b.brandKey===row.brandKey)?.budget)})).filter(row=>(!options.brand||row.brandKey===options.brand)&&(!options.reason||row.reason===options.reason)).sort((a,b)=>a.brandKey.localeCompare(b.brandKey)||a.nativeId.localeCompare(b.nativeId));
 const offset=Math.max(0,Math.floor(options.offset||0)),limit=50,page=missing.slice(offset,offset+limit);
 const metadata=page.length?await pool.query(`SELECT DISTINCT ON(w.brand_key,o.native_id) w.brand_key,o.native_id,a.start_time,
  left(COALESCE(o.raw_payload,p.raw_payload)->'ad_creative_bodies'->>0,500) AS copy
  FROM ad_observations o JOIN public_ads a USING(platform,native_id) JOIN collection_runs r ON r.id=o.run_id JOIN watchlists w ON w.id=r.watchlist_id
  LEFT JOIN ad_observations p ON p.workspace_id=o.workspace_id AND p.platform=o.platform AND p.native_id=o.native_id AND p.run_id=o.raw_payload_run_id
  WHERE o.workspace_id=$1 AND w.workspace_id=$1 AND r.config->>'revision'=w.revision::text AND a.advertiser_id=w.page_ids->>0 AND o.native_id=ANY($2::text[])
  ORDER BY w.brand_key,o.native_id,o.observed_at DESC,o.run_id DESC`,[workspace,page.map(row=>row.nativeId)]):{rows:[]};
 return {total:missing.length,offset,limit,ads:page.map(row=>{const meta=metadata.rows.find(m=>m.brand_key===row.brandKey&&m.native_id===row.nativeId),when=requests.get(identity(row))?.lastAttemptAt;return {...row,copy:meta?.copy||'',startAt:meta?.start_time?new Date(meta.start_time).toISOString():null,lastAttemptAt:when?new Date(when).toISOString():null};})};
}

export async function readMissingReasons(pool:pg.Pool,workspace:string){
 const data=await readCoverageData(pool,workspace),requests=new Map(data.requests.map(row=>[identity(row),row])),files=new Map(data.files.map(row=>[identity(row),row]));
 return new Map(data.official.filter(row=>!files.get(identity(row))?.image).map(row=>[identity(row),{reason:missingMediaReason(requests.get(identity(row)),files.get(identity(row)),data.brands.find(b=>b.brandKey===row.brandKey)?.budget),lastAttemptAt:requests.get(identity(row))?.lastAttemptAt||null}]));
}
