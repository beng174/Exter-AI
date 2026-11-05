import type {BrowserCreative} from "../creative-browser";
import type {VideoAnalysisFields,VideoField} from "../video-analysis";
import type {DemoAdScore,DemoScoreCriterion} from "../brand-demo";
import {creativeScoreSummary} from "../creative-score-presentation";
const field=(value:string,start=0):VideoField<string>=>({value,confidence:1,timestamps:[{startSeconds:start,endSeconds:start+2}]});
/** Fictional inputs and recorded check outcomes for the unchanged five-check service. */
export function sampleScoreFields(base:VideoAnalysisFields,variant:number):VideoAnalysisFields {
 const unknown=variant===4;
 return {...base,hook:field(unknown?"unknown":base.hook.value,variant===1||variant===2?5:0),keyClaims:unknown?[]:base.keyClaims,onScreenText:variant===0||unknown?[]:[field("Refill the jar",0)],cta:field(unknown?"unknown":variant===2?"none":"Tap shop now for your first refill",23),offer_explanation:field(unknown?"unknown":"15% off the first refill",20)};
}
export function sampleCreativeScore(row:BrowserCreative,fields:VideoAnalysisFields,variant:number):DemoAdScore {
 const statuses:DemoScoreCriterion["status"][][]=[["met","met","unknown","met","met"],["not-met","met","met","met","met"],["not-met","met","met","not-met","met"],["met","met","met","met","met"],["unknown","unknown","unknown","unknown","unknown"]];
 const definitions=[
  ["opening-message","Opening message is placed at the start","hook",fields.hook],
  ["claim-specificity","Advertiser proposition is recorded","keyClaims",fields.keyClaims[0]],
  ["visible-message","On-screen text fits the pacing benchmark","onScreenText",fields.onScreenText[0]],
  ["cta","Call to action contains an explicit action","cta",fields.cta],
  ["offer-clarity","Offer or no-offer decision is explicit","offer",fields.offer_explanation],
 ] as const;
 const criteria:DemoScoreCriterion[]=definitions.map(([id,label,name,annotation],i)=>({id,label,weight:20,status:statuses[variant][i],explanation:statuses[variant][i]==="unknown"?"No usable saved evidence is available for this check.":id==="opening-message"&&variant!==0&&variant!==3?"The recorded opening message starts after the first three seconds.":id==="cta"&&variant===2?"The retained analysis explicitly records an absence: none.":"This fictional saved evidence meets the check.",evidence:annotation&&annotation.value!=="unknown"?[{kind:"ad",adId:row.adId,sourceUrl:row.sourceUrl,field:name,observedAt:row.analysis!.createdAt,quote:String(annotation.value),timestamps:annotation.timestamps}]:[]}));
 const summary=creativeScoreSummary({criteria});
 return {adId:row.adId,nativeId:row.nativeId,sourceUrl:row.sourceUrl,mediaKind:row.mediaKind==="image"?"image":"video",analysisId:row.analysis!.id,analysedAt:row.analysis!.createdAt,score:summary.score,label:"Best-practice score, not a performance prediction.",method:"Sample evidence for the existing five checks: opening placement, a recorded advertiser claim, text pacing at no more than three words per second, an explicit action word and an assessable offer or no-offer decision. Missing evidence is excluded. The checks are not calibrated to sales.",coverage:summary.coverage,provisional:summary.provisional,assessedWeight:summary.assessedPoints,totalWeight:summary.totalPoints,criteria};
}
