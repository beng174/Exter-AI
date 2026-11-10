import test from "node:test";
import assert from "node:assert/strict";
import { agreement, rocAuc, validateModel, wilson, type ValidationInput } from "../shared/accuracy.js";
import { betaInterval, estimateLikelihood, likelihoodCohort, predictionForReport, marketMomentum } from "../shared/likelihood.js";
import { deriveThresholds, evaluateRecommendation, recommendationWinRate } from "../shared/recommendation-tests.js";
import { calculationChecks, factChecks, tagChecks } from "../server/accuracy/measurements.js";
import { featuresFixture, accuracyScope, ownedFixture, experimentFixture, resultDays } from "./fixtures/accuracy.js";
import { openDatabase } from "../server/db.js";
import { jsonFingerprint } from "../server/infrastructure/meta-observations.js";
import { publishedReach } from "../shared/meta-public.js";
import type pg from "pg";
function validationFixture(n=3000):ValidationInput {return {modelVersion:"likelihood-v1",cohort:likelihoodCohort(featuresFixture()),target:"public-winner",referenceEnd:"2026-01-01T00:00:00Z",holdoutStart:"2026-07-01T00:00:00Z",holdoutEnd:"2026-07-31T00:00:00Z",referenceIds:["old"],referenceFamilies:["old-family"],referenceOutcomesResolvedBy:"2026-06-01T00:00:00Z",trainingPrevalence:.5,cases:Array.from({length:n},(_,i)=>({adId:`a${i}`,familyId:`f${i}`,advertiserId:`brand${i%30}`,featureAt:"2026-07-01T00:00:00Z",predictedAt:"2026-07-01T00:00:00Z",resolvedAt:"2026-09-01T00:00:00Z",outcome:i%2 as 0|1,probability:i%2,baseline:.5}))};}
test("AC-01 facts preserve absent values and exact object agreement",()=>{assert.equal(agreement([null,0,{b:2,a:[1]}],[null,null,{a:[1],b:2}]).score,2/3);assert.equal(agreement([],[]).score,null);assert.throws(()=>agreement([1],[]));});
test("AC-02 formula measurement has independent expected values",()=>{const row=calculationChecks("2026-11-10T00:00:00Z");assert.equal(row.score,1);assert.equal(row.sampleSize,19);assert.match(row.detail,/not live verification/);});
test("AC-04 AUC handles ties, reversal and single-class sets",()=>{assert.equal(rocAuc([{probability:.5,outcome:0},{probability:.5,outcome:1}]),.5);assert.equal(rocAuc([{probability:1,outcome:0},{probability:0,outcome:1}]),0);assert.equal(rocAuc([{probability:1,outcome:1}]),null);});
test("AC-04 temporal holdout, 3,000, AUC, baselines and calibration all gate release",()=>{
 const at="2026-11-10T00:00:00Z",input=validationFixture(),pass=validateModel(input,at);
 assert.equal(pass.status,"Live");assert.equal(pass.auc,1);assert.equal(pass.ece,0);assert.equal(pass.brier,0);
 assert.equal(validateModel(input,at,true).status,"In validation");assert.equal(validateModel(validationFixture(2999),at).status,"Not enough data");
 const reversed=validationFixture();reversed.cases=reversed.cases.map(c=>({...c,probability:1-c.probability}));assert.equal(validateModel(reversed,at).status,"In validation");
 const uncalibrated=validationFixture();uncalibrated.cases=uncalibrated.cases.map(c=>({...c,probability:c.outcome?.9:.8}));assert.equal(validateModel(uncalibrated,at).auc,1);assert.equal(validateModel(uncalibrated,at).status,"In validation");
 for(const mutation of [(v:ValidationInput)=>v.cases[0].adId="old",(v:ValidationInput)=>v.cases[0].familyId="old-family",(v:ValidationInput)=>v.cases[0].resolvedAt=v.cases[0].predictedAt,(v:ValidationInput)=>v.cases[0].featureAt="2026-08-01T00:00:00Z",(v:ValidationInput)=>v.cases[1].adId=v.cases[0].adId]){const v=validationFixture();mutation(v);assert.throws(()=>validateModel(v,at));}
});
test("AC-06 posterior prior weight falls, excludes future/families/cohorts and gives honest drivers",()=>{
 const f=featuresFixture(),old=featuresFixture({adId:"old",familyId:"old-family",at:"2026-06-01T00:00:00Z"}),n={features:old,outcome:1 as const,resolvedAt:"2026-08-01T00:00:00Z"};
 const empty=estimateLikelihood(f,[],[]),one=estimateLikelihood(f,[n],[]),many=estimateLikelihood(f,Array.from({length:40},(_,i)=>({...n,features:{...old,adId:`old${i}`,familyId:`family${i}`}})),[]);
 assert.ok(one.probability>empty.probability);assert.ok(many.theoryWeight<one.theoryWeight);assert.ok(one.theoryWeight<empty.theoryWeight);assert.equal(many.neighbourCount,40);assert.ok(many.interval[1]-many.interval[0]<empty.interval[1]-empty.interval[0]);assert.match(one.negative.join(" "),/0:09/);
 for(const invalid of [{...n,resolvedAt:f.at},{...n,features:{...old,category:"fashion"}},{...n,features:{...old,familyId:f.familyId}},{...n,features:{...old,embeddingVersion:"different"}},{...n,features:{...old,target:"owned-benchmark" as const,accountCohort:"other"}}])assert.equal(estimateLikelihood(f,[invalid],[]).neighbourCount,0);
 assert.equal(estimateLikelihood({...f,visualEmbedding:null},[n],[]).neighbourCount,0);assert.equal(predictionForReport(one),null);
 const valid=validateModel(validationFixture(),"2026-11-10T00:00:00Z");assert.ok(predictionForReport(estimateLikelihood(f,[n],[],valid)));assert.equal(predictionForReport(estimateLikelihood({...f,visualEmbedding:null},[n],[],valid)),null);
 const [lo,hi]=betaInterval(1,1);assert.ok(Math.abs(lo-.025)<.002&&Math.abs(hi-.975)<.002);
});
test("AC-06 momentum uses earlier category shares, with sample requirements",()=>{const f=featuresFixture(),rows=Array.from({length:20},(_,i)=>({adId:`m${i}`,category:"candles",format:i<10?"static_image":"video",angle:"gifting",hook:"question",firstSeen:i<10?"2026-08-15T00:00:00Z":"2026-09-15T00:00:00Z"}));assert.equal(marketMomentum(f,rows),.25);assert.equal(marketMomentum(f,rows.slice(0,9)),null);assert.equal(marketMomentum(f,rows.map(r=>({...r,firstSeen:"2027-01-01T00:00:00Z"}))),null);});
test("AC-05 history thresholds and every scoped override are frozen and account-specific",()=>{
 const history=Array.from({length:20},(_,ad)=>Array.from({length:30},(_,d)=>ownedFixture(`ad${ad}`,`2026-09-${String(d+1).padStart(2,"0")}`,{spend:20,purchases:2,purchaseValue:50+ad}))).flat();
 const auto=deriveThresholds(history,accuracyScope,"ROAS","2026-10-01"),fallback=deriveThresholds(history,{...accuracyScope,product:"gift-set"},"ROAS","2026-10-01");
 assert.equal(auto.source,"Account history");assert.equal(auto.medianCpa,10);assert.equal(auto.minSpend,30);assert.equal(auto.dailyPurchases,40);assert.notEqual(auto.winMargin,.1);assert.equal(fallback.source,"Default thresholds");assert.equal(fallback.minSpend,150);
 const overridden=deriveThresholds(history,accuracyScope,"ROAS","2026-10-01",{minSpend:240,minDays:21,winMargin:.14},"settings-1");assert.equal(overridden.minSpend,240);assert.equal(overridden.minDays,21);assert.equal(overridden.settingsVersion,"settings-1");assert.equal(auto.minDays,7);
});
test("AC-05 owned test outcomes, CPA guardrail, restatements and win-rate denominator",()=>{
 const t=experimentFixture(),rows=resultDays(),at="2026-11-10T00:00:00Z",win=evaluateRecommendation(t,rows,at);
 assert.equal(win.status,"Won");assert.equal(win.variant.ROAS,3);assert.equal(win.control.ROAS,2);assert.equal(win.confidence,1);assert.equal(win.cpaGuardrail,false);
 assert.equal(evaluateRecommendation(t,rows,"2026-10-09T00:00:00Z").status,"Pending");assert.equal(evaluateRecommendation(t,rows.slice(0,4),at).status,"Pending");
 for(const key of ["accountId","category","product","format","currency","attribution","conversionEvent"]){assert.throws(()=>evaluateRecommendation(t,[{...rows[0],[key]:"wrong"},...rows.slice(1)],at));}
 const badCpa=rows.map(r=>r.adId==="variant"?{...r,spend:80,purchaseValue:300}:r);assert.equal(evaluateRecommendation(t,badCpa,at).cpaGuardrail,true);
 const restated=[...rows,...rows.filter(r=>r.adId==="variant").map(r=>({...r,pulledAt:"2026-11-05T00:00:00Z",purchaseValue:40}))],loss=evaluateRecommendation(t,restated,at);assert.equal(loss.status,"Did not win");assert.equal(loss.variant.ROAS,1);
 const rate=recommendationWinRate([win,{...loss,checkedAt:"2026-11-11T00:00:00Z"},{...win,testId:"second"},{...win,testId:"pending",status:"Pending"}]);assert.equal(rate.rate,.5);assert.equal(rate.resolved,2);assert.equal(rate.pending,1);assert.ok(rate.interval);assert.equal(wilson(0,0),null);
});
test("AC-05 checks each ad's spend and cycle, not pooled spend",()=>{const t=experimentFixture({variantIds:["variant","tiny"]}),rows=[...resultDays(),...resultDays().filter(r=>r.adId==="variant").map(r=>({...r,adId:"tiny",spend:1}))];assert.equal(evaluateRecommendation(t,rows,"2026-11-10T00:00:00Z").status,"Pending");});
test("AC-05 CPA and hook tests do not need revenue, and ties never become wins",()=>{
 const at="2026-11-10T00:00:00Z",rows=resultDays().map(r=>({...r,purchaseValue:null,spend:r.adId==="variant"?30:40,earlyViews:r.adId==="variant"?1000:800}));
 const cpa=evaluateRecommendation(experimentFixture({primaryMetric:"CPA"}),rows,at);assert.equal(cpa.status,"Won");assert.equal(cpa.variant.ROAS,null);assert.equal(cpa.cpaGuardrail,null);
 const hook=evaluateRecommendation(experimentFixture({primaryMetric:"Hook rate"}),rows.map(r=>({...r,purchases:null})),at);assert.equal(hook.status,"Won");assert.equal(hook.variant.CPA,null);
 const tied=evaluateRecommendation(experimentFixture({primaryMetric:"Hook rate"}),rows.map(r=>({...r,earlyViews:800})),at);assert.equal(tied.status,"Did not win");
});
test("AC-05 controls running on different days cannot resolve a comparable test",()=>{
 const test=experimentFixture({to:"2026-10-14"}),rows=resultDays().map(r=>r.adId==="control"?{...r,day:new Date(Date.parse(r.day)+7*86400000).toISOString().slice(0,10)}:r);
 const result=evaluateRecommendation(test,rows,"2026-11-10T00:00:00Z");assert.equal(result.status,"Pending");assert.match(result.reason,/same reporting days/);
});
test("AC-01 source fixtures catch stored reach corruption and missing payloads without network",async()=>{
 const payload={id:"1",page_id:"2",ad_delivery_start_time:"2026-01-01",eu_total_reach:120,ad_creative_bodies:["Fictional candle copy"]};
 const row={native_id:"1",advertiser_id:"2",start_time:new Date("2026-01-01"),stop_time:null,active_status:"unknown",reach:publishedReach(payload),payload_hash:jsonFingerprint(payload),payload};
 const pool={query:async(sql:string,args:unknown[])=>{assert.deepEqual(args,["willow"]);assert.match(sql,/workspace_id=\$1/);return {rows:[row]};}} as unknown as pg.Pool;
 assert.ok((await factChecks(pool,"willow","2026-11-10T00:00:00Z")).every(r=>r.score===1));row.reach.eu={type:"observed",value:0};assert.equal((await factChecks(pool,"willow","2026-11-10T00:00:00Z")).find(r=>r.field.endsWith("eu"))?.status,"In validation");
});
test("AC-03 human agreement is per field/config/format with abstentions counted and disputed labels excluded",()=>{
 const db=openDatabase(":memory:",false);db.exec("CREATE TABLE human_creative_labels(brand_id TEXT,labelled_at TEXT,data TEXT);CREATE TABLE video_analysis_runs(brand_id TEXT,ad_id TEXT,created_at TEXT,data TEXT)");
 const insertHuman=db.prepare("INSERT INTO human_creative_labels VALUES(?,?,?)"),insertMachine=db.prepare("INSERT INTO video_analysis_runs VALUES(?,?,?,?)");
 for(let i=0;i<200;i++){
  const labels={format:"studio",hookType:"question",angle:"gifting",personOnCamera:"yes",ugcEvidence:"none",offerType:"none",cta:"shop"};
  const review={id:`h${i}`,brandId:"willow",adId:`a${i}`,mediaSha256:`hash${i}`,schemaVersion:"exter-human-labels-v2",taxonomyVersion:"taxonomy-v2",guideVersion:"blind-v2",labels};
  insertHuman.run("willow","2026-10-01",JSON.stringify(review));
  const machine={id:`m${i}`,adId:`a${i}`,mediaSha256:`hash${i}`,provider:"fixture",model:"fixture-model",modelVersion:"1",promptVersion:"1",analysisConfigSha256:"fixed-config",fields:{format:{value:"studio"},hook_type:{value:i<180?"question":"unknown"},angle:{value:"gifting"},offer_type:{value:"none"},creatorEvidence:[]}};
  insertMachine.run("willow",`a${i}`,"2026-09-01",JSON.stringify(machine));
 }
 const rows=tagChecks(db,"willow","2026-11-10T00:00:00Z"),hook=rows.find(r=>r.field.startsWith("Hook type"))!;assert.equal(hook.sampleSize,200);assert.equal(hook.score,.9);assert.equal(hook.status,"Live");assert.ok(!rows.some(r=>/Person on camera|Call to action/.test(r.field)));
 const conflicting={adId:"a0",mediaSha256:"hash0",schemaVersion:"exter-human-labels-v2",taxonomyVersion:"taxonomy-v2",guideVersion:"blind-v2",labels:{format:"studio",hookType:"problem",angle:"gifting",personOnCamera:"no",ugcEvidence:"none",offerType:"none",cta:"shop"}};insertHuman.run("willow","2026-10-02",JSON.stringify(conflicting));
 const after=tagChecks(db,"willow","2026-11-10T00:00:00Z").find(r=>r.field.startsWith("Hook type"))!;assert.equal(after.sampleSize,199);assert.equal(after.status,"Not enough data");assert.deepEqual(tagChecks(db,"other","2026-11-10T00:00:00Z"),[]);db.close();
});
