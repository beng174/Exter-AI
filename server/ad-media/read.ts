import {visitDatabaseRows} from "../infrastructure/read-rows.js";
import {createHash} from "node:crypto";
import type pg from "pg";
import type {BrowserCreative} from "../../shared/creative-browser.js";
import type {MediaAsset} from "./storage.js";
export interface RetainedCreative{workspace_id:string;brand_key:string;native_id:string;format:string|null;assets:MediaAsset[]}
export function mergeRetainedMedia(rows:BrowserCreative[],saved:RetainedCreative[],workspaceId:string){
  const index=new Map<string,RetainedCreative>(),key=(brand:string,native:string)=>JSON.stringify([brand,native]);
  for(const media of saved)if(media.workspace_id===workspaceId&&!index.has(key(media.brand_key,media.native_id)))index.set(key(media.brand_key,media.native_id),media);
  return rows.map(row=>{
    const media=index.get(key(row.brandId,row.nativeId));
    if(!media||row.mediaAvailable||!row.publicEvidence||!["Meta","Facebook","Instagram"].includes(row.platform))return row;
    const url=(a:MediaAsset)=>`/api/ad-media/files/${encodeURIComponent(workspaceId)}/${encodeURIComponent(row.brandId)}/${encodeURIComponent(row.nativeId)}/${a.ref.artifactId}`;
    const images=media.assets.filter(a=>a.role==="image").sort((a,b)=>a.index-b.index),posters=media.assets.filter(a=>a.role==="poster"),video=media.assets.find(a=>a.role==="video");
    if(!media.assets.length)return row;
    const isVideo=media.format==="video"||Boolean(video),kind=isVideo?"video":images.length>1?"carousel":images.length?"image":"unknown";
    return {...row,mediaKind:kind as BrowserCreative["mediaKind"],creativeFormat:row.creativeFormat||({image:"Image",video:"Video",carousel:"Carousel",catalogue:"Catalogue"}[media.format||""]||null),thumbnailUrl:posters[0]?url(posters[0]):images[0]?url(images[0]):row.thumbnailUrl,videoUrl:video?url(video):row.videoUrl,imageUrls:images.map(url),imageCount:images.length,mediaAvailable:true,mediaStatus:"stored" as const,durationSeconds:video?.durationSeconds||row.durationSeconds,mediaSha256:video?.sourceSha256||video?.ref.sha256||(!isVideo&&images.length?createHash("sha256").update(JSON.stringify([images.length>1?"carousel":"image",...images.map(a=>a.ref.sha256)])).digest("hex"):null)};
  });
}
export async function readRetainedMedia(pool:pg.Pool,workspaceId:string):Promise<RetainedCreative[]>{
  const groups=new Map<string,RetainedCreative>();
  await visitDatabaseRows<RetainedCreative>(pool,`SELECT c.workspace_id,c.brand_key,c.native_id,c.format,c.assets
    FROM ad_media_creatives c JOIN watchlists w ON w.workspace_id=c.workspace_id AND w.brand_key=c.brand_key
    WHERE c.workspace_id=$1 AND w.page_ids->>0=c.page_id AND jsonb_array_length(c.assets)>0 ORDER BY c.created_at DESC LIMIT 100001`,[workspaceId],row=>{const key=JSON.stringify([row.brand_key,row.native_id]),saved=groups.get(key);if(!saved)groups.set(key,{...row,assets:[...row.assets]});else for(const asset of row.assets)if(!saved.assets.some(a=>a.role===asset.role&&a.index===asset.index))saved.assets.push(asset);});
  return [...groups.values()];
}
