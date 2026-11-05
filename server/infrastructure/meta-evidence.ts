import type pg from "pg";
import type {BrowserCreative,CreativeBrowserResponse} from "../../shared/creative-browser.js";
import type {MetaSourceHealth} from "../../shared/meta-public.js";
import {publishedReach} from "../../shared/meta-public.js";
import {metaLibraryEnabled,metaStatus} from "../connectors/meta-library.js";

const iso=(value:unknown)=>{const date=value instanceof Date?value:typeof value==="string"?new Date(value):null;return date&&Number.isFinite(date.getTime())?date.toISOString():null;};
export async function metaSourceHealth(pool:pg.Pool,workspaceId:string,env:Record<string,string|undefined>=process.env):Promise<MetaSourceHealth>{
  const result=await pool.query(`SELECT DISTINCT ON(w.id) r.status,max(r.last_successful_check) OVER() AS last_successful_check FROM collection_runs r JOIN watchlists w ON w.id=r.watchlist_id
    WHERE w.workspace_id=$1 AND w.purpose='brand' AND r.config->>'revision'=w.revision::text ORDER BY w.id,r.started_at DESC`,[workspaceId]);
  const lastSuccessfulCheck=result.rows.map(row=>iso(row.last_successful_check)).filter((v):v is string=>Boolean(v)).sort().at(-1)||null;
  const enabled=metaLibraryEnabled(env),latest=["not_connected","paused","failed","running","queued"].find(status=>result.rows.some(row=>row.status===status))||result.rows[0]?.status;
  const status:MetaSourceHealth["status"]=!enabled?"off":metaStatus(env).status==="not_connected"?"not_connected":["paused","not_connected","failed","queued","running"].includes(latest)?latest:lastSuccessfulCheck?"connected":"ready";
  const messages:Record<MetaSourceHealth["status"],string>={off:"Live collection is off. Saved evidence is retained.",not_connected:"Add the approved token in Render, then resume collection.",ready:"Ready for the first collection. Add brand Page IDs in Edit watchlist.",queued:"Collection is queued. Saved pages will be retained.",running:"Collection is running from its saved cursor.",paused:"Collection is paused. Check credentials, permissions and the provider budget before resuming.",failed:"The last collection failed. Earlier evidence is retained; check configuration before retrying.",connected:"Public collection completed successfully.",unavailable:"Saved collection health could not be read."};
  return {status,enabled,lastSuccessfulCheck,message:messages[status]};
}
export interface PublicObservation {native_id:string;advertiser_id:string|null;observed_at:Date|string;last_confirmed_at?:Date|string|null;first_seen_at:Date|string;start_time:Date|string|null;stop_time:Date|string|null;raw_payload:Record<string,unknown>;brand_key:string|null;page_ids:string[]}
export function mergePublicEvidence(creatives:BrowserCreative[],observations:PublicObservation[],brand:CreativeBrowserResponse["brand"],competitors:CreativeBrowserResponse["competitors"]):BrowserCreative[]{
  const targets=new Map([[brand.id,{id:brand.id,name:brand.name}],...competitors.map(b=>[b.brandId||b.key,{id:b.brandId||b.key,name:b.name}] as const)]);
  const result=creatives.map(row=>({...row}));
  for(const item of observations){
    // Category discovery and unmatched legacy pages never acquire a brand identity by keyword.
    const target=item.brand_key?targets.get(item.brand_key):undefined;
    if(!target||!item.advertiser_id||!item.page_ids.includes(item.advertiser_id))continue;
    let row=result.find(row=>row.nativeId===item.native_id&&row.brandId===target.id&&["Meta","Facebook","Instagram"].includes(row.platform));
    const observed=iso(item.last_confirmed_at)||iso(item.observed_at),start=iso(item.start_time),stop=iso(item.stop_time);
    if(!observed)continue;
    if(!row){
      row={adId:`public:Meta:${item.native_id}`,nativeId:item.native_id,brandId:target.id,brandName:target.name,title:"",copy:"",sourceUrl:`https://www.facebook.com/ads/library/?id=${item.native_id}`,mediaKind:"unknown",durationSeconds:null,thumbnailUrl:null,videoUrl:null,imageUrls:[],imageCount:0,mediaAvailable:false,mediaStatus:"not-stored",analysis:null,creativeFormat:null,hookType:null,angle:null,offerType:null,ugc:null,creatorEvidence:[],partnershipAttribution:null,deliveryStatus:"unknown",deliveryStartAt:null,deliveryStopAt:null,observedAt:null,firstObservedAt:null,daysRunning:null,daysRunningAsOf:null,daysRunningBasis:null,searchText:"",platform:"Meta",publicEvidence:true,owned:false,workspaceBrand:target.id===brand.id,sourceKind:"public",placements:[],score:null,performance:[],scenes:[]};
      result.push(row);
    }
    row.publicEvidence=true;row.publicReach=publishedReach(item.raw_payload);row.reachObservedAt=observed;
    const bodies=item.raw_payload.ad_creative_bodies;
    if(!row.copy&&Array.isArray(bodies))row.copy=bodies.filter((v):v is string=>typeof v==="string").join("\n\n");
    row.searchText=[row.searchText,row.copy].join(" ");
    row.firstObservedAt=row.firstObservedAt||iso(item.first_seen_at);
    // A public ALL-status response with no stop date does not establish current activity.
    if(!row.observedAt||observed>=row.observedAt){row.observedAt=observed;row.deliveryStartAt=start||row.deliveryStartAt;row.deliveryStopAt=stop||row.deliveryStopAt;if(stop)row.deliveryStatus="inactive";}
    if(row.daysRunning===null&&start){const end=stop||observed;row.daysRunning=Math.max(0,Math.floor((Date.parse(end)-Date.parse(start))/86400000));row.daysRunningAsOf=end;row.daysRunningBasis="Source delivery start to saved source endpoint";}
    if(!row.placements.length&&Array.isArray(item.raw_payload.publisher_platforms))row.placements=item.raw_payload.publisher_platforms.filter((v):v is string=>typeof v==="string");
  }
  return result;
}
export async function readPublicObservations(pool:pg.Pool,workspaceId:string):Promise<PublicObservation[]>{
  const result=await pool.query(`SELECT DISTINCT ON(o.platform,o.native_id) o.native_id,o.observed_at,o.last_confirmed_at,COALESCE(o.raw_payload,p.raw_payload) AS raw_payload,a.advertiser_id,a.first_seen_at,a.start_time,a.stop_time,w.brand_key,w.page_ids
    FROM ad_observations o JOIN public_ads a USING(platform,native_id) JOIN collection_runs r ON r.id=o.run_id JOIN watchlists w ON w.id=r.watchlist_id
    LEFT JOIN ad_observations p ON p.platform=o.platform AND p.native_id=o.native_id AND p.run_id=o.raw_payload_run_id AND p.workspace_id=o.workspace_id
    WHERE o.workspace_id=$1 AND w.workspace_id=$1 AND w.purpose='brand' AND w.brand_key IS NOT NULL AND r.config->>'revision'=w.revision::text
    ORDER BY o.platform,o.native_id,o.observed_at DESC,o.run_id DESC LIMIT 100001`,[workspaceId]);
  if(result.rows.length>100000)throw new Error("Public evidence exceeds the read limit.");
  return result.rows;
}
