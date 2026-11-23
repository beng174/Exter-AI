import {readMissingReasons} from "./coverage.js";
import {visitDatabaseRows} from "../infrastructure/read-rows.js";
import {createHash} from "node:crypto";
import type pg from "pg";
import type {BrowserCreative} from "../../shared/creative-browser.js";
import type {MediaAsset} from "./storage.js";
export interface RetainedCreative{platform?:string;workspace_id:string;brand_key:string;native_id:string;format:string|null;product?:BrowserCreative["catalogueProduct"];assets:MediaAsset[]}
export function mergeRetainedMedia(rows:BrowserCreative[],saved:RetainedCreative[],workspaceId:string){
  const index=new Map<string,RetainedCreative>(),key=(brand:string,native:string,platform="Meta")=>JSON.stringify([brand,native,["Facebook","Instagram"].includes(platform)?"Meta":platform]);
  for(const media of saved)if(media.workspace_id===workspaceId&&!index.has(key(media.brand_key,media.native_id,media.platform||"Meta")))index.set(key(media.brand_key,media.native_id,media.platform||"Meta"),media);
  return rows.map(row=>{
    const media=index.get(key(row.brandId,row.nativeId,row.platform));
    if(!media||!row.publicEvidence||!["Meta","Facebook","Instagram","TikTok"].includes(row.platform))return row;
    if(media.product)row={...row,catalogueProduct:media.product};
    const adFormat=({image:"static_image",video:"video",carousel:"carousel",catalogue:"catalogue"} as const)[media.format as "image"|"video"|"carousel"|"catalogue"]||null;
    if(!media.assets.length)return {...row,adFormat:adFormat==='catalogue'?adFormat:row.adFormat||adFormat};
    const url=(a:MediaAsset)=>`/api/ad-media/files/${encodeURIComponent(workspaceId)}/${encodeURIComponent(row.brandId)}/${encodeURIComponent(row.nativeId)}/${a.ref.artifactId}?platform=${encodeURIComponent(row.platform)}`;
    const images=media.assets.filter(a=>a.role==="image").sort((a,b)=>a.index-b.index),posters=media.assets.filter(a=>a.role==="poster"),video=media.assets.find(a=>a.role==="video");
    const isVideo=media.format==="video"||Boolean(row.videoUrl)||Boolean(video)||posters.length>0,kind=isVideo?"video":images.length>1?"carousel":images.length?"image":"unknown";
    return {...row,adFormat:adFormat==='catalogue'?adFormat:row.adFormat||adFormat,mediaKind:kind as BrowserCreative["mediaKind"],creativeFormat:row.creativeFormat,thumbnailUrl:row.thumbnailUrl||(posters[0]?url(posters[0]):images[0]?url(images[0]):null),videoUrl:row.videoUrl||(video?url(video):null),imageUrls:row.imageUrls.length?row.imageUrls:images.map(url),imageCount:row.imageUrls.length||images.length,mediaAvailable:true,mediaStatus:"stored" as const,durationSeconds:video?.durationSeconds||row.durationSeconds,mediaSha256:video?.sourceSha256||video?.ref.sha256||(!isVideo&&images.length?createHash("sha256").update(JSON.stringify([images.length>1?"carousel":"image",...images.map(a=>a.ref.sha256)])).digest("hex"):null)};
  });
}
export async function readRetainedMedia(pool:pg.Pool,workspaceId:string,ids?:string[],client?:pg.PoolClient):Promise<RetainedCreative[]>{
  const groups=new Map<string,RetainedCreative>();
  await visitDatabaseRows<RetainedCreative>(pool,`SELECT c.workspace_id,c.brand_key,c.native_id,c.platform,c.format,c.product,c.assets
    FROM ad_media_creatives c JOIN watchlists w ON w.workspace_id=c.workspace_id AND w.brand_key=c.brand_key AND w.platform=c.platform
    WHERE c.workspace_id=$1 AND w.page_ids @> to_jsonb(ARRAY[c.page_id]) AND ($2::text[] IS NULL OR c.native_id=ANY($2)) ORDER BY c.created_at DESC LIMIT 100001`,[workspaceId,ids||null],row=>{const key=JSON.stringify([row.brand_key,row.native_id,row.platform||"Meta"]),saved=groups.get(key);if(!saved)groups.set(key,{...row,assets:[...row.assets]});else {if(!saved.product&&row.product)saved.product=row.product;if(!saved.format&&row.format)saved.format=row.format;for(const asset of row.assets)if(!saved.assets.some(a=>a.role===asset.role&&a.index===asset.index))saved.assets.push(asset);}},100000,client);
  return [...groups.values()];
}
export async function mergePreviewState(pool:pg.Pool,workspace:string,rows:BrowserCreative[]){
 const result=await pool.query(`SELECT d.brand_key,d.native_id,count(*)::integer AS failed_days,max(d.attempted_at) AS last_attempt_at
  FROM ad_media_preview_days d JOIN watchlists w ON w.workspace_id=d.workspace_id AND w.brand_key=d.brand_key AND w.page_ids->>0=d.page_id AND w.platform='Meta' WHERE d.workspace_id=$1 AND d.native_id=ANY($2::text[]) GROUP BY d.brand_key,d.native_id`,[workspace,rows.map(row=>row.nativeId)]);
 const days=new Map(result.rows.map(r=>[JSON.stringify([r.brand_key,r.native_id]),r]));
 // Read all controlled states without loading ad copy for every page of diagnostics.
 const reasons=await readMissingReasons(pool,workspace,rows.filter(r=>r.platform!=='TikTok').map(row=>row.nativeId));
 const tikIds=rows.filter(r=>r.platform==='TikTok').map(r=>r.nativeId);
 const tik=tikIds.length?(await pool.query(`SELECT DISTINCT ON(m.brand_key,m.native_id) m.brand_key,m.native_id,m.error_kind,m.created_at,
 (SELECT count(DISTINCT (a.created_at AT TIME ZONE 'Europe/London')::date)::integer FROM ad_media_creatives a WHERE a.workspace_id=m.workspace_id AND a.brand_key=m.brand_key AND a.native_id=m.native_id AND a.platform='TikTok' AND a.error_kind IN ('expired','unsupported','provider')) AS failed_days
 FROM ad_media_creatives m JOIN watchlists w ON w.workspace_id=m.workspace_id AND w.brand_key=m.brand_key AND w.platform=m.platform AND w.page_ids @> to_jsonb(ARRAY[m.page_id]) WHERE m.workspace_id=$1 AND m.platform='TikTok' AND m.native_id=ANY($2::text[]) ORDER BY m.brand_key,m.native_id,m.created_at DESC`,[workspace,tikIds])).rows:[];
 const tikState=new Map(tik.map(r=>[JSON.stringify([r.brand_key,r.native_id]),r]));
 return rows.map(row=>{if(row.thumbnailUrl)return row;if(row.platform==='TikTok'){const state=tikState.get(JSON.stringify([row.brandId,row.nativeId]));return {...row,previewState:{failedDays:state?.failed_days||0,reason:state?.error_kind||'queued',lastAttemptAt:state?new Date(state.created_at).toISOString():null}};}const key=JSON.stringify([row.brandId,row.nativeId]),day=days.get(key),state=reasons.get(key);return {...row,previewState:{failedDays:day?.failed_days||0,reason:state?.reason||null,lastAttemptAt:state?.lastAttemptAt||null}};});
}
