import type {PublicReach,Published,CountryReach,DemographicReach} from './meta-public.js';
export interface TikTokCandidate {id:string;name:string;country:string|null;ads:number;domainMatches:number;confidence:number;highConfidence:boolean;reason:string;exampleId:string|null}
export interface TikTokWatch {id:string;brandKey:string;name:string;businessIds:string[];countries:string[];enabled:boolean;manual:boolean;candidates:TikTokCandidate[];status:string;ads:number;images:number;videos:number;lastSuccessfulCheck:string|null;error:string|null;pages:number;adsSaved:number;stoppedAt:string|null;mediaErrors:{reason:string;count:number}[];discoveryStatus?:string;analysis?:{complete:number;waiting:number;failed:number}}
export interface TikTokWorkspace {configured:boolean;status:string;lastSuccessfulCheck:string|null;message:string;watchlists:TikTokWatch[]}
export const TIKTOK_COUNTRIES='AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE NO IS LI GB CH'.split(' ');
export const TIKTOK_DEFAULT_COUNTRIES=['GB','IE'];
const record=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const missing=<T>():Published<T>=>({type:'unavailable',value:null});
export function tiktokCount(value:unknown):Published<number>{
 const raw=typeof value==='number'?String(value):typeof value==='string'?value.trim():'';
 if(/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw)))return {type:'observed',value:Number(raw)};
 const m=/^(\d+(?:\.\d+)?)(K|M)$/i.exec(raw);if(m){const n=Number(m[1])*(m[2].toUpperCase()==='K'?1000:1000000);if(Number.isSafeInteger(n))return {type:'estimated',value:n,display:raw};}
 return missing();
}
export function tiktokReach(input:unknown):PublicReach{
 const r=record(input),locations:CountryReach[]=[],demographics:DemographicReach[]=[];
 for(const [country,v]of Object.entries(record(r.unique_users_seen_by_country))){if(!/^[A-Z]{2}$/.test(country))continue;const n=tiktokCount(v);if(n.value!==null)locations.push({country,reach:n.value,...(n.type==='estimated'?{estimated:true,display:n.display}:{})});}
 for(const raw of Array.isArray(r.unique_users_seen_breakdowns)?r.unique_users_seen_breakdowns:[]){const group=record(raw);if(!/^[A-Z]{2}$/.test(String(group.region)))continue;for(const rawCell of Array.isArray(group.breakdowns)?group.breakdowns:[]){const c=record(rawCell),n=tiktokCount(c.unique_users_seen);if(n.value!==null&&/^\d{2}(?:-\d{2}|\+)$/.test(String(c.age))&&['MALE','FEMALE','OTHER'].includes(c.gender))demographics.push({country:group.region,age:c.age,gender:c.gender==='OTHER'?'unknown':c.gender.toLowerCase(),reach:n.value,...(n.type==='estimated'?{estimated:true}:{})});}}
 const list=<T extends {estimated?:boolean}>(rows:T[]):Published<T[]>=>rows.length?{type:rows.some(r=>r.estimated)?'estimated':'observed',value:rows}:missing();
 return {total:tiktokCount(r.unique_users_seen??r.unique_user_seen),eu:missing(),locations:list(locations),demographics:list(demographics)};
}
export function reachBasis(reach:PublicReach|undefined,country='GB'):'Observed'|'Estimated'|'Unavailable'{const rows=reach?.locations.value?.filter(r=>r.country===country);return rows?.length?rows.some(r=>r.estimated)?'Estimated':'Observed':'Unavailable';}
export function rankTikTokCandidates(advertisers:{id:string;name:string;country:string|null}[],ads:{id:string;advertiserId:string|null;landingUrl?:string|null}[],name:string,domain:string):TikTokCandidate[]{
 const clean=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,''),host=(v:string)=>{try{return new URL(v.includes('://')?v:'https://'+v).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}};
 const target=host(domain),rows=advertisers.map(a=>{const own=ads.filter(ad=>ad.advertiserId===a.id),matching=own.filter(ad=>{const h=ad.landingUrl?host(ad.landingUrl):'';return target&&h&&(h===target||h.endsWith('.'+target));}),exact=clean(a.name)===clean(name),confidence=matching.length?(exact?100:95):exact?65:clean(a.name).includes(clean(name))?45:20;return {...a,ads:own.length,domainMatches:matching.length,confidence,highConfidence:false,reason:matching.length?`${matching.length} ads link to the saved website.`:exact?'Name matches; website still needs checking.':'Check this advertiser before confirming.',exampleId:(matching[0]||own[0])?.id||null};}).sort((a,b)=>b.domainMatches-a.domainMatches||b.confidence-a.confidence||b.ads-a.ads||a.id.localeCompare(b.id));
 const matches=rows.filter(r=>r.domainMatches>0);if(matches.length===1)matches[0].highConfidence=true;return rows.slice(0,3);
}
/** Only allowlisted, credential-free fields enter observations; signed media links stay ephemeral. */
export function tiktokPayload(ad:{id:string;advertiserId:string|null;advertiserName:string|null;firstShownDate:string|null;lastShownDate:string|null;active:boolean|null;title?:string;landingUrl?:string|null;publicData?:Record<string,unknown>;media:{videos:string[];images:string[]}}){
 const data=record(ad.publicData),target=record(data.targeting),ages=Object.entries(record(target.age)).filter(([,v])=>v===true).map(([k])=>k).filter(k=>/^\d{2}(?:-\d{2}|\+)$/.test(k)),genders=Object.entries(record(target.gender)).filter(([,v])=>v===true).map(([k])=>k).filter(k=>['male','female'].includes(k));
 const words=(v:unknown)=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&/^[\p{L}\p{N} ,+'-]{1,120}$/u.test(x)).slice(0,50):[];
 const reach=tiktokReach(data.reach);
 return {ad_delivery_start_time:ad.firstShownDate,ad_delivery_stop_time:ad.active===false?ad.lastShownDate:null,id:ad.id,page_id:ad.advertiserId,page_name:ad.advertiserName,ad_creative_bodies:ad.title?[ad.title]:[],ad_creative_link_titles:ad.title?[ad.title]:[],ad_creative_link_urls:ad.landingUrl?[new URL(ad.landingUrl).origin+new URL(ad.landingUrl).pathname]:[],tiktok_reach:reach,tiktok_status:ad.active===null?'unknown':ad.active?'active':'inactive',tiktok_last_shown:ad.lastShownDate,source_format:ad.media.videos.length?'VIDEO':ad.media.images.length>1?'CAROUSEL':ad.media.images.length?'IMAGE':null,target_ages:ages,target_gender:genders,target_locations:words(target.country),languages:words(target.languages),publisher_platforms:['tiktok']};
}
