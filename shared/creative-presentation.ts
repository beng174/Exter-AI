import type { DemoGalleryCreative } from "./creative-gallery.js";
import { ANGLE_OPTIONS, AUDIO_TYPE_OPTIONS, CLAIM_TYPE_OPTIONS, CREATIVE_BOOLEAN_TAG_OPTIONS, FORMAT_OPTIONS, HOOK_TYPE_OPTIONS, OFFER_TYPE_OPTIONS } from "./creative-taxonomy.js";

/** UI-02/UI-03 presentation only. Saved source text remains immutable. */
export function creativeTitle(row:Pick<DemoGalleryCreative,"title"|"copy"|"nativeId"|"adId">):string {
  const usable=(value:string|undefined)=>Boolean(value?.trim())&&!/{{|}}/.test(value!)&&!/^(unknown|unavailable|unsure)$/i.test(value!.trim());
  if(usable(row.title))return row.title.trim();
  const firstLine=row.copy?.split(/\r?\n/).find(line=>line.trim())?.trim();
  return usable(firstLine)?firstLine!:`Ad ${row.nativeId||row.adId}`;
}
const enumLabels=new Map<string,string>([...FORMAT_OPTIONS,...HOOK_TYPE_OPTIONS,...ANGLE_OPTIONS,...OFFER_TYPE_OPTIONS,...AUDIO_TYPE_OPTIONS,...CLAIM_TYPE_OPTIONS,...CREATIVE_BOOLEAN_TAG_OPTIONS]);
const sourceLabels:Record<string,string>={facebook:"Facebook",instagram:"Instagram",audience_network:"Audience Network",messenger:"Messenger",threads:"Threads",meta:"Meta",tiktok:"TikTok",ugc:"UGC",cta:"CTA",gbp:"GBP",usd:"USD",eur:"EUR",uk:"UK",gb:"GB",none:"None",active:"Active",inactive:"Inactive"};
export function plainEnum(value:string):string {
  const key=value.toLowerCase();
  if(sourceLabels[key])return sourceLabels[key];
  if(enumLabels.has(value))return enumLabels.get(value)!;
  const attribution=/^(\d+)d_(click|view)$/.exec(value);
  if(attribution)return `${attribution[1]}-day ${attribution[2]}`;
  const words=value.replace(/[_-]+/g," ").toLowerCase();
  return words.charAt(0).toUpperCase()+words.slice(1);
}
export function ukDate(value:string|null|undefined,withTime=false):string|null {
  if(!value)return null;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return null;
  return new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"Europe/London",...(withTime?{hour:"2-digit",minute:"2-digit",timeZoneName:"short"}: {})}).format(date);
}
export function adCount(value:number):string {return `${value} ${value===1?"ad":"ads"}`;}
export function copyExcerpt(copy:string,limit=240) {
  if(copy.length<=limit)return {preview:copy,hasMore:false};
  const before=copy.slice(0,limit+1),boundary=before.search(/\s+\S*$/);
  const after=copy.slice(limit).search(/\s/);
  const end=boundary>0?boundary:after>=0?limit+after:copy.length;
  return {preview:copy.slice(0,end).trimEnd(),hasMore:end<copy.length};
}
export function analysisUrl(brandId:string,nativeId?:string,workspaceId?:string):string {
  if(workspaceId&&workspaceId!==brandId)return `/?${new URLSearchParams({view:"settings",brandId:workspaceId})}#demo-collection`;
  return `/?${new URLSearchParams({view:"settings",brandId,...(nativeId?{analysisAdId:nativeId}:{})})}#gemini-smoke-test`;
}
