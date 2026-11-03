import {test} from "node:test";
import assert from "node:assert/strict";
import {explainScore,scoreCriterionPopulation} from "../shared/score-explanation.js";
import type {DemoAdScore} from "../shared/brand-demo.js";
const score={totalWeight:100,criteria:[{id:"opening",label:"Opening",weight:20,status:"met",evidence:[],explanation:"Within three seconds"},{id:"cta",label:"CTA",weight:20,status:"not-met",evidence:[],explanation:"Explicitly absent"},{id:"offer",label:"Offer",weight:20,status:"unknown",evidence:[],explanation:"Not recorded"}]} as unknown as DemoAdScore;
test("score explanation displays earned points, assessed denominator and excluded unknowns",()=>{const result=explainScore(score);assert.equal(result.earned,20);assert.equal(result.assessed,40);assert.equal(result.percent,50);assert.deepEqual(result.rows.map(r=>r.earned),[20,0,null]);assert.equal(result.total,100);});
test("subscore population preserves pass, fail and unknown counts",()=>{const rows=scoreCriterionPopulation([score,score]);assert.deepEqual(rows.map(r=>[r.met,r.failed,r.unknown,r.total]),[[2,0,0,2],[0,2,0,2],[0,0,2,2]]);assert.equal(explainScore({...score,criteria:score.criteria.map(c=>({...c,status:"unknown"}))}).percent,null);});
