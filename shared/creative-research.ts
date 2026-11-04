import type { BrowserCreative, CreativeBrowserResponse } from "./creative-browser.js";
import { ANGLE_VALUES, CLAIM_TYPE_VALUES, FORMAT_VALUES, HOOK_TYPE_VALUES, OFFER_TYPE_VALUES } from "./creative-taxonomy.js";

export type ResearchDimension="format"|"hook"|"angle"|"offer"|"claim";
export type EvidenceKind="all"|"active"|"launches"|"stopped"|"running"|"analysed"|"unanalysed"|"talking";
export interface EvidenceSelection {show?:string;brand?:string;platform?:string;dimension?:ResearchDimension;value?:string;kind?:EvidenceKind;activityFrom?:string;activityTo?:string;asOf?:string;ad?:string;take?:string;measure?:"duration"|"talkingKnown"}
export interface ResearchWindow {from:string|null;to:string|null;previousFrom:string|null;previousTo:string|null;asOf:string|null}
export interface EvidenceMeasure {value:number|null;selection:EvidenceSelection;known:number;excluded:number}
export interface BrandSnapshot {id:string;name:string;workspaceBrand:boolean;available:boolean;status:string;sample:number;lastChecked:string|null;active:EvidenceMeasure;launched:EvidenceMeasure;stopped:EvidenceMeasure;medianDays:EvidenceMeasure;shareActive:EvidenceMeasure;previousLaunches:EvidenceMeasure}
export interface MixGroup {value:string;count:number;share:number|null;selection:EvidenceSelection;adIds:string[];medianDays:number|null}
export const RESEARCH_DIMENSIONS:readonly ResearchDimension[]=["format","hook","angle","offer","claim"];
const DAY=86400000;
const isoDay=(value:string|null|undefined)=>value&&/^\d{4}-\d{2}-\d{2}/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString().slice(0,10):null;
const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=0;
export function publicCreative(row:BrowserCreative) {return row.publicEvidence??(!row.owned&&row.sourceKind==="public");}
export function researchWindow(rows:BrowserCreative[],from?:string,to?:string,now=new Date()):ResearchWindow {
  const dates=rows.filter(publicCreative).flatMap(row=>row.observedAt&&Date.parse(row.observedAt)<=now.getTime()?[isoDay(row.observedAt)!]:[]).filter(Boolean).sort();
  const end=isoDay(to)||dates.at(-1)||null;
  const start=isoDay(from)||(end?new Date(Date.parse(end)-6*DAY).toISOString().slice(0,10):null);
  if(!start||!end||start>end)return {from:null,to:null,previousFrom:null,previousTo:null,asOf:null};
  const length=Date.parse(end)-Date.parse(start)+DAY;
  return {from:start,to:end,previousFrom:new Date(Date.parse(start)-length).toISOString().slice(0,10),previousTo:new Date(Date.parse(start)-DAY).toISOString().slice(0,10),asOf:end};
}
export function dimensionValues(row:BrowserCreative,dimension:ResearchDimension):string[] {
  const allowed=dimension==="format"?FORMAT_VALUES:dimension==="hook"?HOOK_TYPE_VALUES:dimension==="angle"?ANGLE_VALUES:dimension==="offer"?OFFER_TYPE_VALUES:CLAIM_TYPE_VALUES;
  const values=dimension==="claim"?row.analysis?.fields.keyClaims.flatMap(claim=>claim.claim_type||[])||[]:[dimension==="format"?row.creativeFormat:dimension==="hook"?row.hookType:dimension==="angle"?row.angle:row.offerType];
  return [...new Set(values.filter((value):value is string=>Boolean(value)&&allowed.includes(value as never)&&value!=="unknown"&&value!=="unsure"))];
}
export function selectResearchAds(rows:BrowserCreative[],selection:EvidenceSelection={}):BrowserCreative[] {
  const filtered=rows.filter(row=>{
    if(!publicCreative(row)||!row.workspaceBrand&&row.owned)return false;
    if(selection.show==="yours"&&!row.workspaceBrand||selection.show==="competitors"&&row.workspaceBrand)return false;
    if(selection.brand&&row.brandId!==selection.brand||selection.platform&&selection.platform!=="all"&&row.platform!==selection.platform||selection.ad&&row.adId!==selection.ad)return false;
    if(selection.dimension&&selection.value){const values=dimensionValues(row,selection.dimension);if(selection.value==="classified"?values.length===0:selection.value==="unclassified"?values.length>0:!values.includes(selection.value))return false;}
    const observed=isoDay(row.observedAt);
    if(selection.asOf&&(!observed||observed>selection.asOf))return false;
    const event=selection.kind;
    if(event==="active")return row.deliveryStatus==="active"&&Boolean(observed);
    if(event==="running")return finite(row.daysRunning)&&Boolean(observed);
    if(event==="analysed")return Boolean(row.analysis);
    if(event==="unanalysed")return !row.analysis;
    if(event==="talking")return row.analysis?.mediaKind==="video"&&row.analysis.fields.personTalkingToCamera.value===true;
    if(event==="launches"||event==="stopped"){
      const date=isoDay(event==="launches"?row.deliveryStartAt:row.deliveryStopAt);
      return Boolean(observed&&date&&selection.activityFrom&&selection.activityTo&&date>=selection.activityFrom&&date<=selection.activityTo&&(event!=="stopped"||row.deliveryStatus==="inactive"));
    }
    return true;
  });
  const take=Number(selection.take);const limited=selection.take&&Number.isInteger(take)&&take>0&&take<=100?[...filtered].sort((a,b)=>(b.daysRunning??-1)-(a.daysRunning??-1)||a.adId.localeCompare(b.adId)).slice(0,take):filtered;
  return selection.measure?limited.filter(row=>measurementEligible(row,selection.measure!)):limited;
}
export function evidenceUrl(workspaceId:string,selection:EvidenceSelection={},extra:Record<string,string>={}) {
  const params=new URLSearchParams({view:"creatives",brandId:workspaceId,...extra});
  for(const [key,value] of Object.entries(selection))if(value&&(value!=="all"||key==="kind"))params.set(key,value);
  if(selection.take&&!params.has("sort"))params.set("sort","days");
  return `/?${params}`;
}
export function selectionFromParams(params:URLSearchParams):EvidenceSelection {
  const result:EvidenceSelection={};
  for(const key of ["show","brand","platform","dimension","value","kind","activityFrom","activityTo","asOf","ad","take","measure"] as const){const value=params.get(key);if(value)(result as Record<string,string>)[key]=value;}
  return result;
}
export function median(values:(number|null|undefined)[]):number|null {
  const ordered=values.filter(finite).sort((a,b)=>a-b),middle=Math.floor(ordered.length/2);
  return !ordered.length?null:ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;
}
export function mixGroups(rows:BrowserCreative[],dimension:ResearchDimension,selection:EvidenceSelection={}) {
  const sample=selectResearchAds(rows,selection),groups=new Map<string,BrowserCreative[]>();
  for(const row of sample)for(const value of dimensionValues(row,dimension)){const group=groups.get(value)||[];group.push(row);groups.set(value,group);}
  return {sample:sample.length,classified:sample.filter(row=>dimensionValues(row,dimension).length).length,unclassified:sample.filter(row=>!dimensionValues(row,dimension).length).length,groups:[...groups].map(([value,ads]):MixGroup=>({value,count:ads.length,share:sample.length?100*ads.length/sample.length:null,selection:{...selection,dimension,value},adIds:ads.map(row=>row.adId),medianDays:median(ads.map(row=>row.daysRunning))})).sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value))};
}
export function longestRunning(rows:BrowserCreative[],selection:EvidenceSelection={},limit?:number) {
  const ordered=selectResearchAds(selectResearchAds(rows,selection),{...selection,kind:"running"}).sort((a,b)=>b.daysRunning!-a.daysRunning!||a.adId.localeCompare(b.adId));
  return limit===undefined?ordered:ordered.slice(0,limit);
}
export function brandSnapshots(data:CreativeBrowserResponse,window:ResearchWindow,platform?:string):BrandSnapshot[] {
  const brands=[{id:data.brand.id,name:data.brand.name,workspaceBrand:true,status:"saved"},...data.competitors.map(item=>({id:item.brandId||item.key,name:item.name,workspaceBrand:false,status:item.status}))];
  const result=brands.map(brand=>{
    const base:EvidenceSelection={brand:brand.id,asOf:window.asOf||undefined,...(platform&&platform!=="all"?{platform}:{})};
    const rows=selectResearchAds(data.creatives,base),checked=rows.map(row=>row.observedAt).filter((value):value is string=>Boolean(value)).sort().at(-1)||null;
    const measure=(kind:EvidenceKind,known:BrowserCreative[],from=window.from,to=window.to):EvidenceMeasure=>({value:known.length?(selectResearchAds(rows,{...base,kind,activityFrom:from||undefined,activityTo:to||undefined}).length||known.length===rows.length?selectResearchAds(rows,{...base,kind,activityFrom:from||undefined,activityTo:to||undefined}).length:null):null,known:known.length,excluded:rows.length-known.length,selection:{...base,kind,...(kind==="launches"||kind==="stopped"?{activityFrom:from||undefined,activityTo:to||undefined}:{})}});
    const statuses=rows.filter(row=>row.deliveryStatus!=="unknown"&&row.deliveryStatus&&isoDay(row.observedAt));
    const starts=rows.filter(row=>isoDay(row.deliveryStartAt));
    const stops=rows.filter(row=>row.deliveryStatus==="active"||isoDay(row.deliveryStopAt));
    const running=rows.filter(row=>finite(row.daysRunning));
    const medianDays:EvidenceMeasure={value:median(running.map(row=>row.daysRunning)),known:running.length,excluded:rows.length-running.length,selection:{...base,kind:"running"}};
    return {...brand,available:rows.length>0,sample:rows.length,lastChecked:checked,active:measure("active",statuses),launched:measure("launches",starts),stopped:measure("stopped",stops),medianDays,shareActive:{value:null,known:0,excluded:rows.length,selection:{...base,kind:"active"}} as EvidenceMeasure,previousLaunches:measure("launches",starts,window.previousFrom,window.previousTo)};
  });
  const complete=result.every(brand=>brand.available&&brand.active.value!==null&&brand.active.excluded===0),total=result.reduce((sum,brand)=>sum+(brand.active.value||0),0);
  for(const brand of result)if(complete&&total>0)brand.shareActive={...brand.active,value:100*brand.active.value!/total};
  return result;
}
export function competitorAverage(brands:BrandSnapshot[],key:"active"|"launched"|"stopped"|"medianDays"|"shareActive"):EvidenceMeasure {
  const competitors=brands.filter(brand=>!brand.workspaceBrand),known=competitors.filter(brand=>brand[key].value!==null);
  return {value:known.length?known.reduce((sum,brand)=>sum+brand[key].value!,0)/known.length:null,known:known.length,excluded:competitors.length-known.length,selection:{show:"competitors",kind:key==="active"||key==="shareActive"?"active":key==="medianDays"?"running":key==="launched"?"launches":"stopped"}};
}
export function comparisonGroups(rows:BrowserCreative[],dimension:ResearchDimension,selection:EvidenceSelection={}) {
  const yours=mixGroups(rows,dimension,{...selection,show:"yours"}),competitors=mixGroups(rows,dimension,{...selection,show:"competitors"});
  return [...new Set([...yours.groups,...competitors.groups].map(item=>item.value))].map(value=>{
    const own=yours.groups.find(item=>item.value===value),market=competitors.groups.find(item=>item.value===value);
    const ownShare=yours.classified?(own?.share??0):null,marketShare=competitors.classified?(market?.share??0):null;
    return {value,yours:own?.count??(yours.classified?0:null),competitors:market?.count??(competitors.classified?0:null),yourShare:ownShare,competitorShare:marketShare,gap:ownShare===null||marketShare===null?null:marketShare-ownShare,medianDays:median(selectResearchAds(rows,{...selection,dimension,value}).map(row=>row.daysRunning)),selection:{...selection,dimension,value}};
  });
}
export function launchShareTrend(rows:BrowserCreative[],dimension:ResearchDimension,value:string,window:ResearchWindow,selection:EvidenceSelection={}) {
  if(!window.from||!window.to||!window.previousFrom||!window.previousTo)return null;
  const base={...selection,kind:"launches" as const,asOf:window.asOf||undefined};
  const current=mixGroups(rows,dimension,{...base,activityFrom:window.from,activityTo:window.to}),previous=mixGroups(rows,dimension,{...base,activityFrom:window.previousFrom,activityTo:window.previousTo});
  if(!current.sample||!previous.sample)return null;
  return (current.groups.find(item=>item.value===value)?.share||0)-(previous.groups.find(item=>item.value===value)?.share||0);
}
export function productionFacts(rows:BrowserCreative[],selection:EvidenceSelection={}) {
  const sample=selectResearchAds(rows,selection),durations=sample.filter(row=>row.mediaKind==="video"&&finite(row.durationSeconds)),talking=sample.filter(row=>row.analysis?.mediaKind==="video"&&typeof row.analysis.fields.personTalkingToCamera.value==="boolean");
  return {duration:median(durations.map(row=>row.durationSeconds)),durationKnown:durations.length,talkingShare:talking.length?100*talking.filter(row=>row.analysis?.mediaKind==="video"&&row.analysis.fields.personTalkingToCamera.value===true).length/talking.length:null,talkingKnown:talking.length};
}
export function staleCapture(lastChecked:string|null,now=new Date()) {return lastChecked&&Number.isFinite(Date.parse(lastChecked))?now.getTime()-Date.parse(lastChecked)>DAY:null;}

/** Count exact saved phrases, never infer tone, themes or demographics. */
export function brandVoice(rows:BrowserCreative[],selection:EvidenceSelection={}) {
  const sample=selectResearchAds(rows,selection),claims=new Map<string,number>(),ctas=new Map<string,number>();
  for(const row of sample){for(const claim of new Set(row.analysis?.fields.keyClaims.map(item=>item.value).filter(value=>value&&value!=="unknown")||[]))claims.set(claim,(claims.get(claim)||0)+1);const cta=row.analysis?.fields.cta.value;if(cta&&cta!=="unknown")ctas.set(cta,(ctas.get(cta)||0)+1);}
  const top=(values:Map<string,number>)=>[...values].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||null;
  return {claim:top(claims),cta:top(ctas),offer:mixGroups(rows,"offer",selection).groups[0]?.value||null};
}

export function measurementEligible(row:BrowserCreative,measure:"duration"|"talkingKnown") {return measure==="duration"?row.mediaKind==="video"&&finite(row.durationSeconds):row.analysis?.mediaKind==="video"&&typeof row.analysis.fields.personTalkingToCamera.value==="boolean";}
