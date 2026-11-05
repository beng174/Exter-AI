import type { DemoGalleryCreative } from "./creative-gallery.js";
import { ANGLE_OPTIONS, AUDIO_TYPE_OPTIONS, CLAIM_TYPE_OPTIONS, CREATIVE_BOOLEAN_TAG_OPTIONS, FORMAT_OPTIONS, HOOK_TYPE_OPTIONS, OFFER_TYPE_OPTIONS } from "./creative-taxonomy.js";

/** UI-02/UI-03 presentation only. Saved source text remains immutable. */
type CreativeIdentityInput=Pick<DemoGalleryCreative,"title"|"copy"|"nativeId"|"adId">&Partial<Pick<DemoGalleryCreative,"brandName"|"creativeFormat"|"angle">>;
const visibleLabel=(value:string|null|undefined)=>Boolean(value?.trim())&&!/{{|}}/.test(value!)&&!/^(unknown|unavailable|unsure|none)$/i.test(value!.trim());
export function creativeIdentity(row:CreativeIdentityInput):{title:string;secondary:string|null} {
  const firstLine=row.copy?.split(/\r?\n/).find(line=>line.trim())?.trim();
  if(visibleLabel(firstLine))return {title:firstLine!,secondary:null};
  const shortFormats:Record<string,string>={UGC:"UGC",studio:"Studio",static:"Static image","founder-led":"Founder led",animation:"Animation",mixed:"Mixed formats"};
  const format=visibleLabel(row.creativeFormat)?shortFormats[row.creativeFormat!]||plainEnum(row.creativeFormat!):null;
  const angle=visibleLabel(row.angle)?plainEnum(row.angle!).toLowerCase():null;
  if(format||angle)return {title:format&&angle?`${format}, ${angle}`:format||plainEnum(angle!),secondary:null};
  return {title:`${row.brandName||"Brand"} ad`,secondary:`Ad ${row.nativeId||row.adId}`};
}
export function creativeTitle(row:CreativeIdentityInput):string {return creativeIdentity(row).title;}
/** A readable detail heading; the original title and complete source copy stay intact. */
export function creativeHeading(row:CreativeIdentityInput):string {
  const title=creativeTitle(row),sentence=[...new Intl.Segmenter("en-GB",{granularity:"sentence"}).segment(title)][0]?.segment.trim()||title;
  const excerpt=copyExcerpt(sentence,140);return excerpt.preview+(excerpt.hasMore?"…":"");
}
export function creativeSecondary(row:CreativeIdentityInput):string|null {return creativeIdentity(row).secondary;}
export function videoLength(seconds:number|null|undefined):string|null {
  if(typeof seconds!=="number"||!Number.isFinite(seconds)||seconds<0)return null;
  const whole=Math.round(seconds);return `${Math.floor(whole/60)}:${String(whole%60).padStart(2,"0")}`;
}
export function creativeTags(values:readonly (string|null|undefined)[]):string[] {return [...new Set(values.filter((value):value is string=>visibleLabel(value)).map(plainEnum))].slice(0,3);}
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
