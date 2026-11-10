import {AD_MEDIA_ACTOR,AD_MEDIA_BUILD,mediaMaximumUsd,type MediaRunDiagnostics} from "../../shared/ad-media.js";
import {assertProxySupport} from "../connectors/http.js";
import {providerEndDate} from "../../shared/provider-dates.js";
const API="https://api.apify.com";
export const record=(value:unknown):Record<string,any>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,any>:{};
export const providerId=(value:unknown):value is string=>typeof value==="string"&&/^[A-Za-z0-9]{10,30}$/.test(value);
export class AdMediaError extends Error{constructor(public kind:string,public httpStatus:number|null=null){super(kind);}}
export interface ActorScope{pageId:string;from:string;to:string;ids:string[];cap:number;lookupMode?:string}
/** Release a hold only with recognised final event accounting. Unknown/repriced billing keeps it. */
export function finalMediaCostUsd(run:Record<string,any>,results:number,cap:number):number|null{
  const counts=record(run.chargedEventCounts),pricing=record(run.pricingInfo),events=record(record(pricing.pricingPerEvent).actorChargeEvents);
  if(pricing.pricingModel!=="PAY_PER_EVENT"||pricing.isPPEPlatformUsagePaidByUser===true||record(events["ad-result"]).eventPriceUsd!==0.0005||record(events["apify-actor-start"]).eventPriceUsd!==0.00005)return null;
  if(!Object.hasOwn(counts,"ad-result")||!Object.hasOwn(counts,"apify-actor-start")||Object.entries(counts).some(([key,value])=>!Number.isSafeInteger(value)||value<0||!["ad-result","apify-actor-start"].includes(key)&&value!==0))return null;
  const billed=Math.max(results*.0005+.00005,counts["ad-result"]*.0005+counts["apify-actor-start"]*.00005,typeof run.usageTotalUsd==="number"?run.usageTotalUsd:0,typeof run.externalChargedTotalUsd==="number"?run.externalChargedTotalUsd:0);
  return Number.isFinite(billed)&&billed>=0&&billed<=mediaMaximumUsd(cap)+1e-10?Math.min(mediaMaximumUsd(cap),billed):null;
}
export function mediaActorInput(scope:ActorScope,now=new Date()){
  if(!/^\d{1,30}$/.test(scope.pageId)||!Number.isSafeInteger(scope.cap)||scope.cap<1||scope.cap>500||scope.ids.length>500||scope.ids.some(id=>!/^\d{1,40}$/.test(id))||![scope.from,scope.to].every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v))||scope.from>scope.to)throw new AdMediaError("configuration");
  return {...(scope.ids.length?{adArchiveIds:scope.ids}:{pageIds:[scope.pageId]}),countries:scope.lookupMode==='ad_id'?["ALL"]:["GB"],adType:"all",activeStatus:"all",...(!scope.ids.length?{deliveredAfter:scope.from,deliveredBefore:providerEndDate(scope.to,now)}:{}),maxAds:scope.cap,maxAdsPerQuery:scope.cap,fetchAdDetails:true,resolveLandingPages:false,fetchPageDetails:false,includePageMatches:false,onlyTotalCount:false,maxConcurrency:1};
}
const count=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=2147483647?v:null;
const STOP_REASONS=new Set(["cap","end_of_results","thin_pages","blocked","work_allowance","known_pages","empty","complete"]);
export function mediaInputDetails(value:unknown):MediaRunDiagnostics["input"]{
 const input=record(value);
 if(typeof input.pageId!=="string"||!/^\d{1,30}$/.test(input.pageId)||!Array.isArray(input.countries)||input.countries.length!==1||!['GB','ALL'].includes(input.countries[0])||![input.from,input.to].every(v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v))||input.mode!=="adArchiveIds"||input.activeStatus!=="all"||input.adType!=="all"||count(input.maxAds)===null||input.maxAds<1||input.maxAds>500||input.maxAdsPerQuery!==input.maxAds||count(input.requested)===null||input.requested>input.maxAds)return null;
 return {pageId:input.pageId,countries:[input.countries[0]],from:input.from,to:input.to,activeStatus:"all",adType:"all",maxAds:input.maxAds,maxAdsPerQuery:input.maxAds,mode:"adArchiveIds",requested:input.requested};
}
/** Read only recognised actor-owned counters/categories; never persist its summary payload. */
export function actorCounts(value:unknown){
 const row=record(value);if(row.type!=="run-summary")return null;
 const queries=Array.isArray(row.queries)?row.queries.map(record):[];
 const sum=(key:string)=>queries.length&&queries.every(q=>count(q[key])!==null)?count(queries.reduce((n,q)=>n+q[key],0)):null;
 return {requested:count(row.requested)??count(row.requestedCount)??sum("requested"),returned:count(row.delivered)??count(row.returned)??sum("delivered"),queries:queries.length||null,stopReasons:[...new Set(queries.map(q=>q.stopReason).concat(row.stopReason).filter((v):v is string=>typeof v==="string"&&STOP_REASONS.has(v)))]};
}
/** Same header-only APIFY_TOKEN pattern as creator discovery. No URL/error payload is persisted. */
export class AdMediaActor{
  constructor(private options:{env?:Record<string,string|undefined>;fetch?:typeof fetch}={}){}
  private async json(path:string,init:RequestInit={}){
    const env=this.options.env||process.env,token=env.APIFY_TOKEN||"";
    if(!token.trim()||/[\r\n]/.test(token))throw new AdMediaError("configuration");
    assertProxySupport(Boolean(this.options.fetch),env);
    const url=new URL(path,API);if(url.origin!==API||url.username||url.password)throw new AdMediaError("configuration");
    let response:Response|undefined;
    const signal=AbortSignal.timeout(30000);
    try{
      response=await(this.options.fetch||fetch)(url,{...init,redirect:"manual",signal,headers:{...init.headers,Authorization:`Bearer ${token}`}});
      if(!response.ok||!response.body||Number(response.headers.get("content-length"))>2*1024*1024)throw new AdMediaError("provider",response.status);
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
      try{while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>2*1024*1024)throw new AdMediaError("output");chunks.push(item.value);}return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    }catch(error){if(error instanceof AdMediaError)throw error;throw new AdMediaError("provider");}
    finally{await response?.body?.cancel().catch(()=>{});}
  }
  async start(scope:ActorScope){return record(record(await this.json(`/v2/acts/${AD_MEDIA_ACTOR}/runs?build=${AD_MEDIA_BUILD}&memory=256&timeout=3600&restartOnError=false&maxTotalChargeUsd=${mediaMaximumUsd(scope.cap)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(mediaActorInput(scope))})).data);}
  async run(id:string){if(!providerId(id))throw new AdMediaError("output");return record(record(await this.json(`/v2/actor-runs/${id}`)).data);}
  async requestedCount(id:string){if(!providerId(id))throw new AdMediaError("output");const input=record(await this.json(`/v2/key-value-stores/${id}/records/INPUT`));return Array.isArray(input.adArchiveIds)&&input.adArchiveIds.length<=500&&input.adArchiveIds.every((v:unknown)=>typeof v==="string"&&/^\d{1,40}$/.test(v))?new Set(input.adArchiveIds).size:null;}
  async items(id:string,offset:number){if(!providerId(id)||!Number.isSafeInteger(offset)||offset<0)throw new AdMediaError("output");const rows=await this.json(`/v2/datasets/${id}/items?format=json&clean=false&limit=1&offset=${offset}`);if(!Array.isArray(rows)||rows.length>1)throw new AdMediaError("output");return rows as unknown[];}
}
export interface ActorMedia{adId:string;pageId:string;format:"image"|"video"|"carousel"|"catalogue"|null;images:string[];posters:string[];videos:string[];product?:{title:string;description:string}|null}
const urls=(values:unknown[])=>[...new Set(values.filter((v):v is string=>typeof v==="string"&&v.length<=20000&&v.startsWith("https://")))].slice(0,10);
/** Deliberate allowlist: actor reach, dates, spend, targeting, text and status never enter evidence. */
export function actorMedia(value:unknown):ActorMedia|null{
  const original=record(value),nested=record(original.snapshot);
  const row:Record<string,any>={...original,adArchiveId:original.adArchiveId||original.ad_archive_id,pageId:original.pageId||original.page_id||nested.page_id};if(typeof row.adArchiveId!=="string"||!/^\d{1,40}$/.test(row.adArchiveId)||typeof row.pageId!=="string"||!/^\d{1,30}$/.test(row.pageId))return null;
  const snapshot=record(row.snapshot);
  const cards:Record<string,any>[]=Array.isArray(row.cards||snapshot.cards)?(row.cards||snapshot.cards).map(record):[],images:Record<string,any>[]=Array.isArray(row.images||snapshot.images)?(row.images||snapshot.images).map((v:unknown)=>typeof v==='string'?{url:v}:record(v)):[],videos:Record<string,any>[]=[...(Array.isArray(row.videos||snapshot.videos)?(row.videos||snapshot.videos).map(record):[]),...cards.filter(c=>c.videoHdUrl||c.videoSdUrl||c.video_hd_url||c.video_sd_url||c.videoUrl||c.video_url)];
  let format:ActorMedia["format"]=({IMAGE:"image",VIDEO:"video",CAROUSEL:"carousel",MULTI_IMAGES:"carousel",DPA:"catalogue",DCO:"catalogue"} as const)[(row.displayFormat||snapshot.display_format) as "IMAGE"]||null;
  if(!format){if(Array.isArray(row.products||snapshot.products)&&(row.products||snapshot.products).length)format='catalogue';else if(videos.length)format='video';else if(cards.length>1)format='carousel';else if(images.length)format='image';}
  const list=(value:unknown)=>Array.isArray(value)?value:[];
  const imageLinks=list(row.imageUrls).length?row.imageUrls:images.map(i=>typeof i==='string'?i:i.url||i.originalImageUrl||i.original_image_url||i.resizedUrl||i.resizedImageUrl||i.resized_image_url||i.original_image_url);
  const videoLinks=list(row.videoUrls).length?row.videoUrls:videos.map(v=>v.videoHdUrl||v.video_hd_url||v.hdUrl||v.videoSdUrl||v.video_sd_url||v.sdUrl||v.videoUrl||v.video_url);
  const posterLinks=list(row.videoPreviewImageUrls).length?row.videoPreviewImageUrls:videos.map(v=>v.videoPreviewImageUrl||v.previewImageUrl||v.video_preview_image_url||v.thumbnailUrl||v.thumbnail_url||v.previewUrl);
  if(!format&&videoLinks.length)format='video';if(!format&&(imageLinks.length||cards.length))format=imageLinks.length>1||cards.length>1?'carousel':'image';
  const first=record(cards[0]||list(row.products)[0]||list(snapshot.products)[0]);
  const clean=(value:unknown)=>typeof value==='string'&&!/{{|}}/.test(value)?value.replace(/\s+/g,' ').trim().slice(0,500):'';
  const product=format==='catalogue'?{title:clean(first.title||first.name||first.productName),description:clean(record(first.body).text||first.body||first.description)}:null;
  return {product,adId:row.adArchiveId,pageId:row.pageId,format,images:urls([...imageLinks,...(Array.isArray(row.products||snapshot.products)?(row.products||snapshot.products).map((p:unknown)=>{const item=record(p);return item.imageUrl||item.image_url||record(item.image).url;}):[]),...(list(row.imageUrls).length?[]:cards.map(c=>c.originalImageUrl||c.original_image_url||c.imageUrl||c.image_url||c.image?.url||c.resizedImageUrl||c.resized_image_url))]),posters:urls(posterLinks),videos:urls(videoLinks)};
}
