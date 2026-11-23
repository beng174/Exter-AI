/** Public library measurements only. Missing published values are never zero-filled. */
export type Published<T> = {type:"observed";value:T}|{type:"estimated";value:T;display?:string}|{type:"unavailable";value:null};
export interface CountryReach {country:string;reach:number;estimated?:boolean;display?:string}
export interface DemographicReach {country:string;age:string;gender:string;reach:number;estimated?:boolean}
export interface PublicReach {total?:Published<number>;eu:Published<number>;locations:Published<CountryReach[]>;demographics:Published<DemographicReach[]>}
export interface PublicAdDetails {targetAges:string[];targetGenders:string[];targetLocations:string[];platforms:string[];languages:string[]}
const publicText=(value:unknown):string|null=>typeof value==="string"&&value.trim()&&!/^(?:unknown|none|null|unavailable)$/i.test(value.trim())&&!/https?:|[<>\u0000-\u001f]/i.test(value)&&value.length<=160?value.trim():null;
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:value==null?[]:[value];
const unique=(values:(string|null)[])=>[...new Set(values.filter((value):value is string=>Boolean(value)))];
export function countryName(code:string):string {try{return new Intl.DisplayNames("en-GB",{type:"region"}).of(code)||code;}catch{return code;}}
export function publishedAdDetails(row:Record<string,unknown>):PublicAdDetails {
  const platforms:Record<string,string>={facebook:"Facebook",instagram:"Instagram",messenger:"Messenger",audience_network:"Audience Network",threads:"Threads",whatsapp:"WhatsApp",tiktok:"TikTok"};
  const genders:Record<string,string>={female:"Women",women:"Women",male:"Men",men:"Men",all:"All genders"};
  const location=(value:unknown)=>{const item=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;const text=publicText(item?.name??item?.country??value);return text&&/^[A-Z]{2}$/.test(text)?countryName(text):text;};
  return {targetAges:unique(list(row.target_ages).map(value=>{const text=publicText(value);return text&&/^\d{1,3}(?:(?:\s*-\s*|\s+to\s+)\d{1,3}|\+)?$/.test(text)?text:null;})),targetGenders:unique(list(row.target_gender).map(value=>typeof value==="string"?genders[value.trim().toLowerCase()]||null:null)),targetLocations:unique(list(row.target_locations).map(location)),platforms:unique(list(row.publisher_platforms).map(value=>typeof value==="string"?platforms[value.toLowerCase()]||null:null)),languages:unique(list(row.languages).map(value=>{
    const text=publicText(value);if(!text||!/[a-z]/i.test(text))return null;const named=/^[A-Z][a-z]+(?:[ -][A-Za-z]+)*$/.test(text)?text:null;try{const code=text.replaceAll("_","-"),name=new Intl.DisplayNames("en-GB",{type:"language",fallback:"none"}).of(code);return name||named;}catch{return named;}
  }))};
}
const observed=<T>(value:T):Published<T>=>({type:"observed",value});
const missing=<T>():Published<T>=>({type:"unavailable",value:null});
const count=(value:unknown):number|null=>{
  const n=typeof value==="number"?value:typeof value==="string"&&/^\d+$/.test(value)?Number(value):NaN;
  return Number.isSafeInteger(n)&&n>=0?n:null;
};
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);
export function publishedReach(row:Record<string,unknown>):PublicReach {
  const eu=count(row.eu_total_reach);
  const locations:CountryReach[]=[];
  if(Array.isArray(row.total_reach_by_location))for(const item of row.total_reach_by_location){
    if(!record(item))continue;
    const raw=item.key??item.country??item.location,country=raw==="UK"?"GB":raw;
    if(typeof country!=="string"||!/^[A-Z]{2}$/.test(country))continue;
    const reach=count(item.value??item.reach);if(reach!==null)locations.push({country,reach});
  }
  const demographics:DemographicReach[]=[];
  if(Array.isArray(row.age_country_gender_reach_breakdown))for(const item of row.age_country_gender_reach_breakdown){
    if(!record(item)||typeof item.country!=="string"||!/^[A-Z]{2}$/.test(item.country)||!Array.isArray(item.age_gender_breakdowns))continue;
    for(const band of item.age_gender_breakdowns){
      if(!record(band)||typeof band.age_range!=="string"||!/^\d{2}(?:-\d{2}|\+)$/.test(band.age_range))continue;
      for(const gender of ["female","male","unknown"]) {const reach=count(band[gender]);if(reach!==null)demographics.push({country:item.country==="UK"?"GB":item.country,age:band.age_range,gender,reach});}
    }
  }
  return {eu:eu===null?missing():observed(eu),locations:locations.length?observed(locations):missing(),demographics:demographics.length?observed(demographics):missing()};
}
export function countryReach(reach:PublicReach|undefined,country="GB"):number|null {
  const rows=reach?.locations.value?.filter(item=>item.country===country);
  return rows?.length?rows.reduce((sum,item)=>sum+item.reach,0):null;
}
export function displayedReach(reach:PublicReach|undefined):{label:string;value:number;basis?:"Estimated";display?:string}|null {
 const rows=reach?.locations.value?.filter(r=>r.country==='GB'),gb=countryReach(reach);if(gb!==null)return {label:'UK reach',value:gb,...(rows?.some(r=>r.estimated)?{basis:'Estimated' as const,...(rows.length===1&&rows[0].display?{display:rows[0].display}:{})}:{})};
 if(reach?.eu.value!=null)return {label:'EU reach',value:reach.eu.value,...(reach.eu.type==='estimated'?{basis:'Estimated' as const,display:reach.eu.display}:{})};
 if(reach?.total?.value!=null)return {label:'Published reach',value:reach.total.value,...(reach.total.type==='estimated'?{basis:'Estimated' as const,display:reach.total.display}:{})};return null;
}

export const REACH_SHARE_NOTE="Estimated share of published UK reach in this watchlist, not share of impressions or sales. Reach is summed across ads and is not deduplicated between ads. Ads without published UK reach are excluded. These are lifetime totals at the saved check, not reach earned during the selected week.";

export interface MetaWatchlist {id:string;workspace_id:string;brand_key:string|null;purpose:"brand"|"discovery";page_ids:string[];search_terms:string[];countries:string[];enabled:boolean;meta_page_size?:import("./meta-collection.js").MetaPageSize;latestRun?:import("./meta-collection.js").MetaRunSummary|null}
export interface MetaSourceHealth {status:"off"|"not_connected"|"ready"|"queued"|"running"|"paused"|"failed"|"connected"|"unavailable";enabled:boolean;lastSuccessfulCheck:string|null;message:string}
