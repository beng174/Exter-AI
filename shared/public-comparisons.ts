import type {BrowserCreative} from "./creative-browser.js";
import type {Brand} from "./types.js";
export const PRODUCT_CATEGORIES=["home fragrance","candles","bath and body","fashion","homeware","gifting","beauty and skincare","wellness","food and drink","other"] as const;
export type ProductCategory=typeof PRODUCT_CATEGORIES[number];
export const AD_FORMATS=["video","static_image","carousel","catalogue"] as const;
export type AdFormat=typeof AD_FORMATS[number];
export const formatName=(format:AdFormat)=>({video:"Video",static_image:"Static image",carousel:"Carousel",catalogue:"Catalogue"})[format];
export function primaryCategories(brand:Pick<Brand,"primaryCategories"|"category"|"domain">):ProductCategory[]{
 if(brand.primaryCategories)return brand.primaryCategories.filter((v)=>typeof v==="string"&&v.length>=3&&v.length<=80) as ProductCategory[];
 if((brand.domain||"").replace(/^www\./,"").toLowerCase()==="valentte.com")return ["home fragrance","candles"];
 return ({"Home fragrance & gifting":["home fragrance","candles"],Fashion:["fashion"],"Beauty & skincare":["beauty and skincare"],Wellness:["wellness"],"Food & beverage":["food and drink"]} as Record<string,ProductCategory[]>)[brand.category]||[];
}
export function mediaFormat(row:BrowserCreative):AdFormat|null{
 if(row.adFormat&&AD_FORMATS.includes(row.adFormat))return row.adFormat;
 if(!row.mediaAvailable)return null;
 return ({video:"video",image:"static_image",carousel:"carousel"} as const)[row.mediaKind as "video"]||null;
}
export interface ComparisonFilter {category?:string;adFormat?:string}
export function comparableAds(rows:readonly BrowserCreative[],primary:readonly string[],filter:ComparisonFilter={},anchor?:BrowserCreative){
 const categories=filter.category&&filter.category!=="mine"&&filter.category!=="all"?filter.category.split(","):filter.category==="all"?null:primary;
 const format=anchor?mediaFormat(anchor):filter.adFormat&&filter.adFormat!=="same"?filter.adFormat:null;
 if(anchor&&!format)return [];
 return rows.filter(row=>{
  if(!(row.publicEvidence??(!row.owned&&row.sourceKind==="public")))return false;
  const known=mediaFormat(row);if(!known||format&&known!==format)return false;
  const tags=row.productCategories;if(!tags?.length)return false;
  if(categories&&!tags.some(tag=>categories.includes(tag)))return false;
  return !anchor||Boolean(anchor.productCategories?.some(tag=>tags.includes(tag)));
 });
}
export function comparisonCohorts(rows:readonly BrowserCreative[],primary:readonly string[],filter:ComparisonFilter={}){
 const eligible=comparableAds(rows,primary,filter);
 return AD_FORMATS.filter(format=>!filter.adFormat||filter.adFormat==="same"||filter.adFormat===format).map(format=>{
  const rows=eligible.filter(row=>mediaFormat(row)===format),yours=rows.filter(row=>row.workspaceBrand).length,competitors=rows.length-yours;
  return {format,rows,yours,competitors,hidden:yours<10&&competitors<10};
 }).sort((a,b)=>b.yours-a.yours||b.competitors-a.competitors||AD_FORMATS.indexOf(a.format)-AD_FORMATS.indexOf(b.format));
}
export function cohortLabel(group:{format:AdFormat;yours:number;competitors:number}){return `${formatName(group.format)} · you ${group.yours.toLocaleString("en-GB")} ${group.yours===1?"ad":"ads"} · competitors ${group.competitors.toLocaleString("en-GB")}`;}
export function similarCompetitors(selected:BrowserCreative,rows:readonly BrowserCreative[],filter:ComparisonFilter={},primary:readonly string[]=selected.productCategories||[]){
 return comparableAds(rows,primary,filter,selected).filter(row=>row.adId!==selected.adId&&row.brandId!==selected.brandId&&!row.workspaceBrand&&!row.owned)
  .sort((a,b)=>{const score=(row:BrowserCreative)=>Number(Boolean(selected.angle&&row.angle===selected.angle))*2+Number(Boolean(selected.offerType&&row.offerType===selected.offerType));return score(b)-score(a)||(b.daysRunning??-1)-(a.daysRunning??-1)||a.adId.localeCompare(b.adId);});
}
export function comparableBriefs<T extends {evidence:{adId?:string|null}[]}>(briefs:readonly T[],rows:readonly BrowserCreative[],primary:readonly string[],filter:ComparisonFilter={}){
 const groups=comparisonCohorts(rows,primary,filter).filter(group=>!group.hidden);
 return briefs.flatMap(brief=>{
  const ids=brief.evidence.flatMap(ref=>ref.adId?[ref.adId]:[]);if(!ids.length)return [];
  const group=groups.find(group=>ids.every(id=>group.rows.some(row=>row.adId===id||row.nativeId===id)));
  return group?[{brief,group}]:[];
 });
}
export function comparisonEvidenceIds(value:unknown):string[]{
 if(!value||typeof value!=="object")return [];
 if(Array.isArray(value))return value.flatMap(comparisonEvidenceIds);
 const record=value as Record<string,unknown>;
 return [...(typeof record.adId==="string"?[record.adId]:[]),...Object.entries(record).filter(([key])=>key!=="adId").flatMap(([,item])=>comparisonEvidenceIds(item))];
}
