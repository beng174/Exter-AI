import type {BrowserCreative} from "./creative-browser.js";
export interface CategoryInput {copy:string;headlines:string[];landingPaths:string[]}
const strings=(v:unknown,max:number)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==="string").slice(0,5).map(x=>x.slice(0,max)):[];
export function categoryText(raw:Record<string,unknown>):CategoryInput{
 const paths=[...strings(raw.ad_creative_link_captions,2048),...strings(raw.ad_creative_link_urls,2048)].flatMap(value=>{
  try{const u=new URL(value.includes("://")?value:`https://${value}`);return [decodeURIComponent(u.pathname).slice(0,1024)];}catch{return [];}
 });
 return {copy:strings(raw.ad_creative_bodies,6000).join("\n\n").slice(0,12000),headlines:strings(raw.ad_creative_link_titles,500),landingPaths:[...new Set(paths)].filter(p=>p!=="/")};
}
export function creativeCategoryInput(row:BrowserCreative):CategoryInput{return {copy:row.copy.slice(0,12000),headlines:row.headlines||[],landingPaths:row.landingPaths||[]};}
