import type {BrowserCreative} from "./creative-browser.js";
import {selectResearchAds,type EvidenceSelection} from "./creative-research.js";
import {comparisonCohorts,mediaFormat,formatName,type ComparisonFilter} from "./public-comparisons.js";
import {publicMediaCoverage} from "./ad-media.js";
export function winnersCoverage(rows:BrowserCreative[],primary:readonly string[],filter:ComparisonFilter={},model?:import("./creative-read-model.js").CreativeReadModel){
 if(model){const {ads:total,tagged,formatKnown:known,images:media}=model.coverage,groups=model.cohorts.map(g=>({...g,rows:rows.filter(r=>mediaFormat(r)===g.format)})),percent=(n:number)=>total?Math.round(n/total*100):null;return {total,tagged,known,media,taggedPercent:percent(tagged),knownPercent:percent(known),mediaPercent:percent(media),groups,gaps:[...(total>tagged?[`${(total-tagged).toLocaleString("en-GB")} ads need a category tag`]:[]),...(total>known?[`${(total-known).toLocaleString("en-GB")} ads have unknown format`]:[]),...(!primary.length&&(!filter.category||filter.category==='mine')?["Choose your brand's categories in Brand research"]:[]),...groups.filter(g=>g.hidden).map(g=>`${formatName(g.format)}: you ${g.yours.toLocaleString("en-GB")}, competitors ${g.competitors.toLocaleString("en-GB")}`)]};}

 const ads=selectResearchAds(rows),total=ads.length,tagged=ads.filter(row=>row.productCategories?.length).length,known=ads.filter(row=>mediaFormat(row)).length,media=publicMediaCoverage(ads).images;
 const groups=comparisonCohorts(ads,primary,filter),hidden=groups.filter(group=>group.hidden&&group.rows.length);
 const gaps=[...(total>tagged?[`${(total-tagged).toLocaleString('en-GB')} ads need a category tag`]:[]),...(total>known?[`${(total-known).toLocaleString('en-GB')} ads have unknown format`]:[]),...(!primary.length&&(!filter.category||filter.category==='mine')?["Choose your brand's categories in Brand research"]:[]),...hidden.map(group=>`${formatName(group.format)}: you ${group.yours.toLocaleString('en-GB')}, competitors ${group.competitors.toLocaleString('en-GB')}`)];
 const percent=(count:number)=>total?Math.round(count/total*100):null;
 return {total,tagged,known,media,taggedPercent:percent(tagged),knownPercent:percent(known),mediaPercent:percent(media),groups,gaps};
}
/** Honest duration ranking, independent of incomplete modelled tags and missing previews. */
export function unqualifiedWinners(rows:BrowserCreative[],selection:EvidenceSelection={}){
 return selectResearchAds(rows,{...selection,category:undefined,adFormat:undefined,kind:undefined}).sort((a,b)=>(b.daysRunning??-1)-(a.daysRunning??-1)||a.adId.localeCompare(b.adId));
}
