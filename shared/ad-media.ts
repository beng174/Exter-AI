import type {BrowserCreative} from "./creative-browser.js";
import {countryReach} from "./meta-public.js";
export const AD_MEDIA_ACTOR="automation_craft~facebook-ads-library-scraper";
export const AD_MEDIA_BUILD="1.3.12";
export const AD_MEDIA_RESULT_USD=0.0005;
export const AD_MEDIA_START_USD=0.00005;
export const AD_MEDIA_BATCH=500;
export const mediaEnabled=(env:Record<string,string|undefined>=process.env)=>env.EXTER_AD_MEDIA_ENABLED==="true";
export const mediaGbpRate=(env:Record<string,string|undefined>)=>{const value=Number(env.EXTER_AD_MEDIA_GBP_PER_USD);return Number.isFinite(value)&&value>0&&value<=10?value:null;};
export const mediaMaximumUsd=(cap:number)=>Math.ceil((cap*AD_MEDIA_RESULT_USD+AD_MEDIA_START_USD)*1e6)/1e6;
type PriorityAd=Pick<BrowserCreative,"nativeId"|"brandId"|"deliveryStartAt"|"daysRunning"|"publicReach">;
export function priorityVideoIds(rows:readonly PriorityAd[],now:Date):Set<string>{
  const ids=new Set<string>(),brands=new Map<string,PriorityAd[]>();
  // "This week" is the rolling seven-day window ending at the saved run time.
  for(const row of rows){const group=brands.get(row.brandId)||[];group.push(row);brands.set(row.brandId,group);
    const start=Date.parse(row.deliveryStartAt||"");
    if((row.daysRunning!==null&&row.daysRunning>=30)||(Number.isFinite(start)&&start<=now.getTime()&&start>=now.getTime()-7*86400000))ids.add(row.nativeId);
  }
  for(const group of brands.values())for(const row of group.filter(row=>countryReach(row.publicReach)!==null||row.publicReach?.eu.value!==null&&row.publicReach?.eu.value!==undefined).sort((a,b)=>(countryReach(b.publicReach)??b.publicReach?.eu.value??0)-(countryReach(a.publicReach)??a.publicReach?.eu.value??0)||a.nativeId.localeCompare(b.nativeId)).slice(0,20))ids.add(row.nativeId);
  return ids;
}
export interface MediaDiskHealth{status:"available"|"unavailable";usedBytes:number|null;remainingBytes:number|null;totalBytes:number|null;videoDownloadsPaused:boolean;measuredAt:string|null}
export interface AdMediaRunSummary{diagnostics?:MediaRunDiagnostics;id:string;brandKey:string;status:string;startedAt:string;finishedAt:string|null;results:number;adsWithMedia:number;costGbp:number;reservedGbp:number|null;costStatus:string;gbpPerUsd:number|null;error:string|null}
export type MediaMissingReason="not_requested"|"not_returned"|"expired"|"unsupported"|"wrong_page"|"budget"|"disk"|"provider"|"queued"|"no_media"|"file_missing";
export interface MediaCoverage{brandKey:string;brandName?:string;official:number;images:number;videos:number;requested:number;returned:number;matched:number;missing:number;reasons:Record<MediaMissingReason,number>;historyIncomplete:boolean}
export interface MediaRunDiagnostics{plan?:{pageId:string;from:string;to:string;cap:number;mode:string}|null;requested:number|null;returned:number|null;matched:number|null;actorRequested:number|null;actorInput:number|null;actorReturned:number|null;actorQueries:number|null;stopReasons:string[];input:{pageId:string;countries:string[];from:string;to:string;activeStatus:string;adType:string;maxAds:number;maxAdsPerQuery:number;mode:string;requested:number}|null}
export interface AdMediaHealth{coverage?:MediaCoverage[];enabled:boolean;configured:boolean;disk:MediaDiskHealth;runs:AdMediaRunSummary[]}
export const MEDIA_REASON_LABELS:Record<MediaMissingReason,string>={not_requested:"Never requested",queued:"In queue",no_media:"Scraper returned no media",not_returned:"Ad not found by the media scraper",expired:"Download failed: temporary file expired",unsupported:"Unsupported media file",wrong_page:"Returned ad belongs to another Page",budget:"Waiting for the media budget",disk:"Waiting for storage space",provider:"Download failed",file_missing:"File missing from disk"};
export interface MissingMediaAd {brandKey:string;nativeId:string;copy:string;startAt:string|null;reason:MediaMissingReason;lastAttemptAt:string|null}
export interface MissingMediaPage {ads:MissingMediaAd[];total:number;offset:number;limit:number}
export interface PreviewState {failedDays:number;reason:string|null;lastAttemptAt:string|null}
export function previewMessage(state?:PreviewState){return state&&state.failedDays>=7&&state.reason?"No preview from Meta":state?.failedDays?"Preview being retried":"Preview pending";}
export function publicMediaCoverage(rows:readonly BrowserCreative[]){
 const ads=[...new Map(rows.filter(row=>row.publicEvidence??(!row.owned&&row.sourceKind==="public")).map(row=>[JSON.stringify([row.platform,row.brandId,row.nativeId]),row])).values()];
 return {ads:ads.length,images:ads.filter(row=>Boolean(row.thumbnailUrl||row.imageUrls.length)).length,videos:ads.filter(row=>Boolean(row.videoUrl)).length};
}
export const MEDIA_ERRORS:Record<string,string>={configuration:"Media collection needs its token, GBP exchange-rate ceiling and service configuration.",budget:"Media collection is paused by the data provider budget.",provider:"The media provider could not complete this request. Saved files are retained.",uncertain:"A paid start could not be confirmed. Its reserve is retained; check the provider run before retrying.",changed:"The saved watchlist changed. Earlier files are retained.",media:"Some returned files could not be retained. Missing media will be checked on a later day.",disk:"Video downloads are paused at the disk safety limit. Images and saved files are retained.",expired:"Some temporary media links expired. Missing files can be retried later.",unsupported:"Some returned files are unsupported or missing.",output:"The media provider returned unsupported output. Its reserve is retained."};
