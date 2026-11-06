import type pg from "pg";
import type {MediaCoverage,MediaMissingReason} from "../../shared/ad-media.js";
export interface CoverageAd{brandKey:string;nativeId:string}
export interface CoverageAttempt extends CoverageAd{returned:boolean;matched:boolean;outcome:string}
export interface CoverageFile extends CoverageAd{image:boolean;video:boolean;legacy?:boolean;error?:string|null}
const identity=(row:CoverageAd)=>JSON.stringify([row.brandKey,row.nativeId]);
export function mediaCoverage(official:CoverageAd[],attempts:CoverageAttempt[],files:CoverageFile[],brands:{brandKey:string;budget:boolean;historyIncomplete?:boolean}[]):MediaCoverage[]{
 const requests=new Map(attempts.map(a=>[identity(a),a])),assets=new Map(files.map(a=>[identity(a),a]));
 return brands.map(brand=>{
  const rows=[...new Map(official.filter(a=>a.brandKey===brand.brandKey).map(a=>[a.nativeId,a])).values()],reasons:Record<MediaMissingReason,number>={not_requested:0,not_returned:0,expired:0,unsupported:0,wrong_page:0,budget:0,disk:0,provider:0};
  let images=0,videos=0,requested=0,returned=0,matched=0;
  for(const row of rows){const request=requests.get(identity(row)),file=assets.get(identity(row));
   if(file?.image)images++;if(file?.video)videos++;
   if(request||file?.legacy)requested++;if(request?.returned||file?.legacy)returned++;if(request?.matched||file?.legacy)matched++;
   if(file?.image)continue;
   const reason:MediaMissingReason=brand.budget&&!request?"budget":!request?file?.legacy?"provider":"not_requested":!request.returned||request.outcome==="not_returned"?"not_returned":["expired","unsupported","wrong_page","disk","provider"].includes(request.outcome)?request.outcome as MediaMissingReason:"unsupported";
   reasons[reason]++;
  }
  return {brandKey:brand.brandKey,official:rows.length,images,videos,requested,returned,matched,missing:rows.length-images,reasons,historyIncomplete:Boolean(brand.historyIncomplete)};
 });
}
export async function readMediaCoverage(pool:pg.Pool,workspace:string):Promise<MediaCoverage[]>{
 const [brands,official,requests,files]=await Promise.all([
  pool.query(`SELECT w.brand_key AS "brandKey",EXISTS(SELECT 1 FROM ad_media_runs r WHERE r.watchlist_id=w.id AND r.status='paused' AND r.error_kind='budget') AS budget,
   EXISTS(SELECT 1 FROM ad_media_runs r WHERE r.watchlist_id=w.id AND r.actor_run_id IS NOT NULL AND r.requested_ids IS NULL) AS "historyIncomplete"
   FROM watchlists w WHERE w.workspace_id=$1 AND w.purpose='brand' AND w.brand_key IS NOT NULL AND jsonb_array_length(w.page_ids)=1`,[workspace]),
  pool.query(`SELECT DISTINCT w.brand_key AS "brandKey",o.native_id AS "nativeId" FROM watchlists w JOIN collection_runs r ON r.watchlist_id=w.id JOIN ad_observations o ON o.run_id=r.id JOIN public_ads a USING(platform,native_id)
   WHERE w.workspace_id=$1 AND o.workspace_id=$1 AND w.purpose='brand' AND r.config->>'revision'=w.revision::text AND a.advertiser_id=w.page_ids->>0`,[workspace]),
  pool.query(`SELECT DISTINCT ON(r.brand_key,q.native_id) r.brand_key AS "brandKey",q.native_id AS "nativeId",bool_or(q.returned_at IS NOT NULL) OVER(PARTITION BY r.brand_key,q.native_id) AS returned,bool_or(q.matched_at IS NOT NULL) OVER(PARTITION BY r.brand_key,q.native_id) AS matched,q.outcome
   FROM ad_media_requests q JOIN ad_media_runs r ON r.id=q.run_id JOIN watchlists w ON w.id=r.watchlist_id AND w.page_ids->>0=r.page_id
   WHERE r.workspace_id=$1 ORDER BY r.brand_key,q.native_id,q.requested_at DESC,r.id DESC`,[workspace]),
  pool.query(`SELECT c.brand_key AS "brandKey",c.native_id AS "nativeId",true AS legacy,
   bool_or(EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets) a WHERE a->>'role' IN ('image','poster'))) AS image,
   bool_or(EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets) a WHERE a->>'role'='video')) AS video
   FROM ad_media_creatives c JOIN watchlists w ON w.workspace_id=c.workspace_id AND w.brand_key=c.brand_key AND w.page_ids->>0=c.page_id
   WHERE c.workspace_id=$1 GROUP BY c.brand_key,c.native_id`,[workspace])
 ]);
 return mediaCoverage(official.rows,requests.rows,files.rows,brands.rows);
}
