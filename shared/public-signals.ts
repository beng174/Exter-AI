import type {BrowserCreative} from "./creative-browser.js";
import {countryReach,countryName,publishedAdDetails} from "./meta-public.js";
export interface PublicSignalTile {id:string;label:string;value:number|string;basis:"Observed"|"Estimated";text?:boolean;note?:string;tooltip?:string}
const format=(value:number)=>new Intl.NumberFormat("en-GB",{maximumFractionDigits:1}).format(value);
export const fullCopy=(row:BrowserCreative)=>row.copy&&!row.copyTruncated&&!/\{\{.*?\}\}/.test(row.copy)?row.copy.normalize("NFC").trim().replace(/\s+/g," "):null;
export const sha=(row:BrowserCreative)=>row.mediaSha256&&/^[a-f0-9]{64}$/i.test(row.mediaSha256)?row.mediaSha256.toLowerCase():null;
const adIdentity=(row:BrowserCreative)=>`${["Meta","Facebook","Instagram"].includes(row.platform)?"Meta":row.platform}:${row.nativeId||row.adId}`;
export function publicVersions(row:BrowserCreative,creatives:readonly BrowserCreative[]):number|null {
  if(row.owned&&row.workspaceBrand)return null;
  if(row.publicVersionCount!==undefined)return row.publicVersionCount;
  const copy=fullCopy(row),hash=sha(row);if(!copy&&!hash)return null;
  const count=new Set([row,...creatives].filter(item=>(!item.owned||item.publicEvidence===true)&&item.brandId===row.brandId&&(Boolean(hash&&sha(item)===hash)||Boolean(copy&&fullCopy(item)===copy))).map(adIdentity)).size;
  return count||null;
}
export function publicSignalTiles(row:BrowserCreative,creatives:readonly BrowserCreative[]):PublicSignalTile[]{
  if(row.owned&&row.workspaceBrand)return [];
  const result:PublicSignalTile[]=[],reach=row.publicReach,uk=countryReach(reach),eu=reach?.eu.value??countryReach(reach,"EU"),days=typeof row.daysRunning==="number"&&Number.isFinite(row.daysRunning)&&row.daysRunning>=0?row.daysRunning:null;
  if(uk!==null)result.push({id:"uk",label:"UK reach",value:uk,basis:"Observed"});
  if(eu!==null)result.push({id:"eu",label:"EU reach",value:eu,basis:"Observed"});
  const countries=new Map<string,number>();for(const item of reach?.locations.value||[])if(!["GB","EU"].includes(item.country))countries.set(item.country,(countries.get(item.country)||0)+item.reach);
  for(const [country,value] of countries)result.push({id:`country-${country}`,label:`${countryName(country)} reach`,value,basis:"Observed"});
  if(days!==null)result.push({id:"days",label:"Days running",value:days,basis:"Observed"});
  const numerator=uk??eu,basis=uk!==null?"UK reach":"EU reach";
  if(numerator!==null&&days!==null&&days>0)result.push({id:"daily",label:"Reach per day",value:format(numerator/days),basis:"Estimated",note:basis,tooltip:`${format(numerator)} ${basis} ÷ ${format(days)} days running = ${format(numerator/days)} reach per day. Average over the saved running period.`});
  const versions=publicVersions(row,creatives);if(versions!==null)result.push({id:"versions",label:"Versions",value:versions,basis:"Observed",tooltip:`${versions} saved public ${versions===1?"ad uses":"ads use"} this exact creative or full copy for this brand. Only matching content hashes or full wording are counted, not similar copy.`});
  const saved=row.publicDetails||publishedAdDetails({}),details={...saved,platforms:saved.platforms.length?saved.platforms:publishedAdDetails({publisher_platforms:row.placements}).platforms};
  for(const [id,label,values] of [["target-ages","Target ages",details.targetAges],["target-gender","Target gender",details.targetGenders],["target-locations","Target locations",details.targetLocations],["platforms","Platforms",details.platforms],["languages","Languages",details.languages]] as const){if(values.length)result.push({id,label,value:values.join(", "),basis:"Observed",text:true,...(id.startsWith("target-")?{tooltip:"Targeting settings published by the advertiser. These are separate from the people the ad reached."}:{})});}
  return result;
}
export function publicAudienceBars(row:BrowserCreative){
  if(row.owned&&row.workspaceBrand)return [];
  const groups=new Map<string,{id:string;label:string;value:number}>();
  for(const item of row.publicReach?.demographics.value||[]){const id=JSON.stringify([item.country,item.age,item.gender]),previous=groups.get(id);groups.set(id,{id,label:`${countryName(item.country)} · ${item.age} · ${item.gender==="female"?"Women":item.gender==="male"?"Men":"Unknown gender"}`,value:(previous?.value||0)+item.reach});}
  return [...groups.values()];
}
