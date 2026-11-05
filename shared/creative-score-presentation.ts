import {explainScore} from "./score-explanation";
import type {DemoAdScore,DemoScoreCriterion} from "./brand-demo";
/** Display arithmetic mirrors server/demo/scores.ts; it never changes a check or its weight. */
export function creativeScoreSummary(score:Pick<DemoAdScore,"criteria">) {
 const total=score.criteria.reduce((sum,c)=>sum+c.weight,0);
 const assessed=score.criteria.filter(c=>c.status!=="unknown");
 const calculation=explainScore({criteria:score.criteria,totalWeight:total}),assessedPoints=calculation.assessed,earnedPoints=calculation.earned;
 return {score:calculation.percent,earnedPoints,assessedPoints,totalPoints:total,notAssessedPoints:total-assessedPoints,checks:score.criteria.length,assessedChecks:assessed.length,coverage:total?assessedPoints/total:0,provisional:assessed.length<score.criteria.length||!total};
}
export function scoreCheckLabel(check:DemoScoreCriterion) {
 const image=check.evidence.some(e=>e.imageIndices!==undefined);
 return ({"opening-message":image?"Opening message on the first image":"Opening message in the first three seconds","claim-specificity":"An advertiser claim is recorded","visible-message":"Text stays within three words per second",cta:"A clear call to action","offer-clarity":"The offer or no-offer choice is clear"} as Record<string,string>)[check.id]||check.label;
}
export function scoreCheckReason(check:DemoScoreCriterion) {
 const state=check.status,detail=check.explanation.toLowerCase();
 switch(check.id){
  case "opening-message":return state==="met"?check.evidence.some(e=>e.imageIndices!==undefined)?"The opening message appears on the first image.":"The opening message appears within the first three seconds.":state==="not-met"?/no opening hook|absence/.test(detail)?"No opening message was recorded.":/carousel|later.*image/.test(detail)?"The opening message appears after the first image.":"The opening message starts after the first three seconds.":/interval|placement|supplied copy/.test(detail)?"The saved evidence does not show exactly where the opening message appears.":"There is no usable opening evidence to assess.";
  case "claim-specificity":return state==="met"?"An advertiser claim is saved with evidence.":state==="not-met"?"The saved analysis records no advertiser claim.":"No advertiser claim has usable saved evidence.";
  case "visible-message":return state==="met"?"The saved text stays within three words per second.":state==="not-met"?"The saved text appears faster than three words per second.":"Reading pace cannot be checked from the saved text and timing.";
  case "cta":return state==="met"?"The call to action includes a clear action word.":state==="not-met"?"The saved analysis records no call to action.":/english action word|custom wording/.test(detail)?"The saved wording needs a person to check its call to action.":"No usable call to action is saved.";
  case "offer-clarity":return state==="met"?/no offer/.test(detail)?"The creative clearly states that there is no offer.":"An offer is described in the saved evidence.":state==="not-met"?"The saved evidence does not clearly state the offer.":"There is not enough saved evidence to check the offer.";
  default:return state==="met"?"The saved evidence supports this check.":state==="not-met"?"The saved evidence does not meet this check.":"There is not enough saved evidence to assess this check.";
 }
}
