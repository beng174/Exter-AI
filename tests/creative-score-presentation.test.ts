import test from "node:test";
import assert from "node:assert/strict";
import {creativeScoreSummary,scoreCheckReason} from "../shared/creative-score-presentation.js";
import {scoreCreative} from "../server/demo/scores.js";
import {sampleCreatives} from "../shared/sample/workspace.js";
import type {DemoAdScore} from "../shared/brand-demo.js";
import type {Ad} from "../shared/types.js";
import type {VideoAnalysisResult} from "../shared/video-analysis.js";
test("UI-03/UI-13 all 243 five-check result combinations add up and partial coverage is Provisional",()=>{
 const template=sampleCreatives[0].score!;
 for(let mask=0;mask<3**5;mask++){
  let digits=mask;const criteria=template.criteria.map(c=>{const status=(["met","not-met","unknown"] as const)[digits%3];digits=Math.floor(digits/3);return {...c,status};});
  const before=JSON.stringify(criteria),met=criteria.filter(c=>c.status==="met").length,known=criteria.filter(c=>c.status!=="unknown").length;
  const result=creativeScoreSummary({criteria});assert.equal(result.score,known?Math.round(met/known*100):null);assert.equal(result.earnedPoints,met*20);assert.equal(result.assessedPoints,known*20);assert.equal(result.notAssessedPoints,(5-known)*20);assert.equal(result.coverage,known/5);assert.equal(result.provisional,known<5);assert.equal(JSON.stringify(criteria),before,"display never changes checks or weights");
 }
});
test("UI-03/UI-13 sample checks and totals agree with the existing server score function",()=>{
 for(const row of sampleCreatives.slice(0,5)){
  const actual=scoreCreative({ad:{id:row.adId,providerAdId:row.nativeId,sourceUrl:row.sourceUrl} as Ad,analysis:row.analysis as unknown as VideoAnalysisResult,mediaKind:row.mediaKind as "video"|"image"});
  const fixture=row.score!;assert.deepEqual(fixture.criteria.map(c=>[c.id,c.status,c.weight]),actual.criteria.map(c=>[c.id,c.status,c.weight]));
  for(const key of ["score","coverage","provisional","assessedWeight","totalWeight"] as (keyof DemoAdScore)[])assert.equal(fixture[key],actual[key],`${row.adId} ${key}`);
  for(const check of actual.criteria){const reason=scoreCheckReason(check);assert.doesNotMatch(reason,/rubric|heuristic|model-reported/i);assert.match(reason,/\.$/);}
 }
});
