import {createContext,useContext} from "react";
import {comparisonCohorts,cohortLabel,mediaFormat,formatName,type ComparisonFilter} from "../../../shared/public-comparisons";
import {comparisonGroups,evidenceUrl,longestRunning,type EvidenceSelection,type ResearchDimension} from "../../../shared/creative-research";
import {reachScorecard} from "../../../shared/meta-research";
import type {ResearchData} from "./useResearchData";
export type Cohort=ReturnType<typeof comparisonCohorts>[number];
export interface ComparisonState {originalLibrary:ResearchData["library"];groups:Cohort[];hidden:Cohort[];primary:string[];filter:ComparisonFilter;chartFormat:string|null;onChartFormat?:(format:string)=>void}
export const ComparisonContext=createContext<ComparisonState|null>(null);
export function scopedResearch(data:ResearchData,filter:ComparisonFilter={},chartFormat?:string|null,onChartFormat?:(format:string)=>void):ResearchData{
 const primary=data.library.brand.primaryCategories||[],all=data.library.sql?data.library.sql.cohorts.map(g=>({...g,rows:data.library.creatives.filter(r=>mediaFormat(r)===g.format)})):comparisonCohorts(data.library.creatives,primary,filter),groups=all.filter(g=>!g.hidden);
 return {...data,library:{...data.library,creatives:groups.flatMap(g=>g.rows),sql:data.library.sql?{...data.library.sql,scopeFormat:"scope"}:undefined},comparison:{originalLibrary:data.library,groups,hidden:all.filter(g=>g.hidden&&(g.yours+g.competitors)>0),primary,filter,chartFormat:groups.some(g=>g.format===chartFormat)?chartFormat!:groups[0]?.format||null,onChartFormat}};
}
export function cohortSelection(data:Pick<ResearchData,"library"|"comparison">,group:Cohort,selection:EvidenceSelection={}):EvidenceSelection{
 const category=data.comparison?.filter.category||"mine";
 return {...selection,category:category==="mine"?data.comparison?.primary.join(",")||"none":category,adFormat:group.format};
}
export function forCohort(data:ResearchData,group:Cohort):ResearchData{return {...data,library:{...data.library,creatives:group.rows,sql:data.library.sql?{...data.library.sql,scopeFormat:group.format}:undefined},comparison:undefined};}
export function scorecardCohorts(data:ResearchData,selection:EvidenceSelection={}){
 const groups=data.comparison?.groups;
 return (groups||[undefined]).map(group=>{
  const scoped=group?forCohort(data,group):data,filter=group?cohortSelection(data,group,selection):selection;
  const result=reachScorecard(scoped.library,data.window,selection.platform);
  for(const brand of result.brands)for(const metric of Object.values(brand))if(metric&&typeof metric==="object"&&"selection" in metric)Object.assign(metric.selection,filter);
  return {...result,group,selection:filter,data:scoped};
 });
}
export function comparedGroups(data:ResearchData,dimension:ResearchDimension,selection:EvidenceSelection={}){
 const groups=data.comparison?.groups||[undefined];
 return groups.flatMap(cohort=>comparisonGroups(cohort?forCohort(data,cohort).library:data.library,dimension,cohort?cohortSelection(data,cohort,selection):selection).map(row=>({...row,cohort,key:`${cohort?.format||"all"}:${row.value}`})));
}
export function tableGroup(group:Cohort|undefined,data:Pick<ResearchData,"library"|"comparison">){return group?{key:group.format,label:cohortLabel(group),href:evidenceUrl(data.library.brand.id,cohortSelection(data,group))}:null;}
export function creativeGroup(row:ResearchData["library"]["creatives"][number],data:Pick<ResearchData,"library"|"comparison">){return tableGroup(data.comparison?.groups.find(g=>g.format===mediaFormat(row)),data);}
export function longestByFormat(data:ResearchData,selection:EvidenceSelection={},limit?:number){return data.comparison?data.comparison.groups.flatMap(group=>longestRunning(group.rows,cohortSelection(data,group,selection),limit)):longestRunning(data.library.creatives,selection,limit);}
export function FormatSwitch(){const comparison=useContext(ComparisonContext);if(!comparison||!comparison.groups.length)return null;const current=comparison.groups.find(group=>group.format===comparison.chartFormat);return <div className="ui-format-control"><div className="ui-format-switch" role="group" aria-label="Chart format">{comparison.groups.map(group=><button key={group.format} aria-pressed={comparison.chartFormat===group.format} onClick={()=>comparison.onChartFormat?.(group.format)}>{formatName(group.format)}</button>)}</div>{current&&<small>{cohortLabel(current)}</small>}</div>;}

export function chartData(data:ResearchData){const group=data.comparison?.groups.find(g=>g.format===data.comparison?.chartFormat);return group?{data:forCohort(data,group),selection:cohortSelection(data,group)}:{data,selection:{}};}
export function ComparisonNotice({data}:{data:ResearchData}){const c=data.comparison;if(!c)return null;return c.hidden.length?<p className="reference-muted">Hidden: {c.hidden.map(group=>formatName(group.format)).join(", ")}. Both sides have fewer than 10 ads.</p>:!c.groups.length?<p className="reference-muted">Comparisons need category tags, media types and at least 10 ads on either side.</p>:null;}
