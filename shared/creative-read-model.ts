import type {EvidenceSelection,ResearchDimension,MixGroup} from "./creative-research.js";
import type {BrandSnapshot,ResearchWindow} from "./creative-research.js";
import type {AdFormat} from "./public-comparisons.js";
export interface SqlBrandStats {
 brandId:string;format:string;sample:number;lastChecked:string|null;statuses:number;active:number;starts:number;launches:number;previousLaunches:number;stopsKnown:number;stopped:number;daysKnown:number;medianDays:number|null;ukKnown:number;ukReach:number|null;
}
export interface SqlCohort {format:AdFormat;yours:number;competitors:number;hidden:boolean}
export interface SqlDimensionStats {format:string;brandId:string;kind:string;dimension:string;value:string|null;count:number;sample:number;classified:number;medianDays:number|null}
export interface SqlProductionStats {format:string;show:string;duration:number|null;durationKnown:number;talkingShare:number|null;talkingKnown:number}
export interface SqlAudienceCell {key:string;brandId:string;brand:string;country:string;age:string;gender:string;reach:number;ads:number}
export interface CreativeReadModel {
 detailOrder?:string[];
 detailSimilarTotal?:number;
 page:{offset:number;limit:number;total:number;totalAll:number;hasNext:boolean};
 coverage:{yours:number;ads:number;images:number;videos:number;tagged:number;formatKnown:number;owned:number;official:number};
 ownedScopes?:import("./creative-browser.js").CreativePerformance[];
 window:ResearchWindow;cohorts:SqlCohort[];brands:SqlBrandStats[];scopeFormat?:string;
 dimensions?:SqlDimensionStats[];production?:SqlProductionStats[];audience?:SqlAudienceCell[];voices?:{format:string;brandId:string;claim:string|null;cta:string|null;offer:string|null}[];
 options:{brands:{value:string;label:string}[];platforms:string[];formats:string[];hooks:string[];angles:string[];offers:string[]};
 fallback:boolean;previewMissing:number;
}
export function sqlSnapshots(model:CreativeReadModel,brandId:string,brands:{id:string;name:string;status:string}[],window:ResearchWindow):BrandSnapshot[]{
 const format=model.scopeFormat||"all",stats=model.brands.filter(row=>row.format===format);
 const result:BrandSnapshot[]=brands.map(brand=>{
  const s=stats.find(s=>s.brandId===brand.id),sample=s?.sample||0,base={brand:brand.id,asOf:window.asOf||undefined};
  const count=(kind:"active"|"launches"|"stopped",known:number,value:number,previous=false)=>({value:known&&(value||known===sample)?value:null,known,excluded:sample-known,selection:{...base,kind,...(kind==="active"?{}:{activityFrom:(previous?window.previousFrom:window.from)||undefined,activityTo:(previous?window.previousTo:window.to)||undefined})}});
  return {...brand,workspaceBrand:brand.id===brandId,available:sample>0,sample,lastChecked:s?.lastChecked||null,active:count("active",s?.statuses||0,s?.active||0),launched:count("launches",s?.starts||0,s?.launches||0),stopped:count("stopped",s?.stopsKnown||0,s?.stopped||0),previousLaunches:count("launches",s?.starts||0,s?.previousLaunches||0,true),medianDays:{value:s?.medianDays??null,known:s?.daysKnown||0,excluded:sample-(s?.daysKnown||0),selection:{...base,kind:"running" as const}},shareActive:{value:null as number|null,known:0,excluded:sample,selection:{...base,kind:"active" as const}}};
 });
 const complete=result.every(b=>b.available&&b.active.value!==null&&b.active.excluded===0),total=result.reduce((n,b)=>n+(b.active.value||0),0);
 if(complete&&total>0)for(const b of result)b.shareActive={...b.active,value:100*b.active.value!/total};
 return result;
}

export function sqlMix(model:CreativeReadModel,brandId:string,dimension:ResearchDimension,selection:EvidenceSelection={}){
 const kind=selection.kind==="launches"&&selection.activityFrom===model.window.previousFrom?"previousLaunches":selection.kind||"all",bucket=selection.brand||(selection.show==="yours"?brandId:selection.show==="competitors"?"competitors":"*"),format=model.scopeFormat||"all";
 const stats=(model.dimensions||[]).filter(s=>s.format===format&&s.brandId===bucket&&s.dimension===dimension&&s.kind===kind),sample=stats[0]?.sample||0,classified=stats[0]?.classified||0;
 return {sample,classified,unclassified:sample-classified,groups:stats.filter(s=>s.value!==null).map((s):MixGroup=>({value:s.value!,count:s.count,share:sample?100*s.count/sample:null,selection:{...selection,dimension,value:s.value!},adIds:[],medianDays:s.medianDays})).sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value))};
}
