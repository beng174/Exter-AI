/** Public library measurements only. Missing published values are never zero-filled. */
export type Published<T> = {type:"observed";value:T}|{type:"unavailable";value:null};
export interface CountryReach {country:string;reach:number}
export interface DemographicReach {country:string;age:string;gender:string;reach:number}
export interface PublicReach {eu:Published<number>;locations:Published<CountryReach[]>;demographics:Published<DemographicReach[]>}
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
export function displayedReach(reach:PublicReach|undefined):{label:string;value:number}|null {
  const gb=countryReach(reach);return gb!==null?{label:"UK reach",value:gb}:reach?.eu.value!==null&&reach?.eu.value!==undefined?{label:"EU reach",value:reach.eu.value}:null;
}
export const REACH_SHARE_NOTE="Estimated share of published UK reach in this watchlist, not share of impressions or sales. Reach is summed across ads and is not deduplicated between ads. Ads without published UK reach are excluded. These are lifetime totals at the saved check, not reach earned during the selected week.";

export interface MetaWatchlist {id:string;workspace_id:string;brand_key:string|null;purpose:"brand"|"discovery";page_ids:string[];search_terms:string[];countries:string[];enabled:boolean}
export interface MetaSourceHealth {status:"off"|"not_connected"|"ready"|"queued"|"running"|"paused"|"failed"|"connected"|"unavailable";enabled:boolean;lastSuccessfulCheck:string|null;message:string}
