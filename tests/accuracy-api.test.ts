import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type pg from "pg";
import { openDatabase } from "../server/db.js";
import { attachAccuracy } from "../server/accuracy/api.js";
import { attachSampleWorkspace } from "../server/sample.js";
import { latestRecords, appendAccuracy, ensureAccuracy } from "../server/accuracy/store.js";
import { accuracyScope, featuresFixture, ownedFixture } from "./fixtures/accuracy.js";
import type { RecommendationTest, TestThresholds } from "../shared/recommendation-tests.js";
import type { AccuracyWorkspace } from "../shared/accuracy-workspace.js";
import { evaluateLikelihoodFile } from "../scripts/evaluate-likelihood.js";
import { enrichLikelihood } from "../server/accuracy/predictions.js";
import { browserCreative } from "./fixtures/creative-browser.js";
import { ownedMetrics } from "../shared/owned-metrics.js";

async function fixture() {
 const db=openDatabase(":memory:",false);for(const id of ["willow","other"])db.prepare("INSERT INTO brands VALUES(?,?)").run(id,JSON.stringify({id,name:"Willow Candle Studio",domain:"willow.example",mode:"imported"}));
 let at=new Date("2026-11-10T00:00:00Z"),queries=0;
 const days=Array.from({length:7},(_,i)=>[ownedFixture("variant",`2026-11-${i+11}`),ownedFixture("control",`2026-11-${i+11}`,{purchaseValue:80})]).flat();
 const pool={query:async(sql:string,params:unknown[])=>{queries++;assert.equal(params[0]==="willow"||params[0]==="account-db",true,"all reads are scoped");
   if(sql.includes("DISTINCT ad_id"))return {rows:(params[1] as string[]).filter(id=>["variant","control"].includes(id)).map(ad_id=>({ad_id}))};
   if(sql.includes("FROM owned_accounts")&&!sql.includes("JOIN"))return {rows:[{id:"account-db",...accuracyScope}]};
   if(sql.startsWith("SELECT 1 FROM owned_ad_days"))return {rows:[{}],rowCount:["variant","control"].includes(String(params[1]))?1:0};
   if(sql.includes("FROM owned_ad_days"))return {rows:days.filter(d=>d.day>=String(params[2])&&d.day<=String(params[3])).map(data=>({data}))};
   if(sql.includes("FROM ad_observations"))return {rows:[]};throw new Error("Unexpected fixture query");
 }} as unknown as pg.Pool;
 const app=express();app.use(express.json());attachSampleWorkspace(app);attachAccuracy(app,db,{getPool:()=>pool,now:()=>at});const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address() as {port:number},origin=`http://127.0.0.1:${address.port}`;
 const call=async(path:string,body?:unknown,headers:Record<string,string>={})=>{const response=await fetch(origin+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
 return {db,call,setTime:(value:string)=>{at=new Date(value);},queries:()=>queries,close:async()=>{await new Promise<void>(r=>server.close(()=>r()));db.close();}};
}
test("AC-01..06 append-only snapshots retry safely and never return truncated measurements",()=>{
 const db=openDatabase(":memory:",false);ensureAccuracy(db);const at="2026-11-10T00:00:00Z";
 const first=appendAccuracy(db,"willow","fixture","a",{value:1},at);assert.equal(appendAccuracy(db,"willow","fixture","a",{value:1},at),first);
 appendAccuracy(db,"willow","fixture","a",{value:2},at);appendAccuracy(db,"willow","fixture","b",{value:3},at);
 assert.equal((db.prepare("SELECT count(*) AS n FROM accuracy_records").get() as {n:number}).n,3);assert.deepEqual(latestRecords(db,"willow","fixture"),[{value:2},{value:3}]);assert.throws(()=>latestRecords(db,"willow","fixture",1),/No partial/);assert.deepEqual(latestRecords(db,"other","fixture"),[]);db.close();
});
test("AC-05 API freezes primary metric and thresholds, reads owned results and preserves result history",async()=>{
 const f=await fixture();try{
  let response=await f.call("/api/accuracy?workspaceId=willow");assert.equal(response.status,200);assert.equal(new Set(response.value.rows.map((r:any)=>r.layer)).size,5);assert.ok(response.value.rows.some((r:any)=>r.field==="Product category"));assert.ok(response.value.rows.every((r:any)=>r.score===null));
  response=await f.call("/api/accuracy/ad-scopes",{workspaceId:"willow",scope:accuracyScope,adIds:["variant","public-competitor"]});assert.equal(response.status,422);
  assert.equal((await f.call("/api/accuracy/ad-scopes",{workspaceId:"willow",scope:accuracyScope,adIds:["variant","control"]})).status,200);
  const body={workspaceId:"willow",title:"Early opening",sourceKind:"brief",sourceId:"brief-1",scope:accuracyScope,variantIds:["variant"],controlIds:["control"],primaryMetric:"ROAS",from:"2026-11-11",to:"2026-11-17"};
  response=await f.call("/api/accuracy/tests",body);assert.equal(response.status,201,JSON.stringify(response.value));const test=response.value as RecommendationTest;assert.equal(test.thresholds.minSpend,150);
  await f.call("/api/accuracy/thresholds",{workspaceId:"willow",scope:accuracyScope,values:{minSpend:240,minDays:14,winMargin:.14}});
  assert.equal(latestRecords<RecommendationTest>(f.db,"willow","test")[0].thresholds.minSpend,150);assert.equal(latestRecords<RecommendationTest>(f.db,"willow","test")[0].primaryMetric,"ROAS");
  assert.equal((await f.call(`/api/accuracy/tests/${test.id}/refresh`,{workspaceId:"other"})).status,404);
  response=await f.call(`/api/accuracy/tests/${test.id}/refresh`,{workspaceId:"willow"});assert.equal(response.value.status,"Pending");
  f.setTime("2026-11-30T00:00:00Z");response=await f.call(`/api/accuracy/tests/${test.id}/refresh`,{workspaceId:"willow"});assert.equal(response.value.status,"Won");assert.equal(response.value.variant.ROAS,3);assert.equal(response.value.control.ROAS,2);assert.ok(f.db.prepare("SELECT count(*) AS n FROM accuracy_records WHERE kind='result'").get());
  response=await f.call("/api/accuracy?workspaceId=willow");assert.equal(response.value.tests[0].test.thresholds.minSpend,150);assert.equal(response.value.rows.find((r:any)=>r.layer==="Recommendations").score,1);
  assert.equal((await f.call("/api/accuracy/tests",{...body,primaryMetric:"CPA",from:"2026-11-01"})).status,422);
 }finally{await f.close();}
});
test("AC-01..06 mutations reject cross-site requests, extra fields and sample writes without provider calls",async()=>{
 const f=await fixture();try{
  assert.equal((await f.call("/api/accuracy/check",{workspaceId:"willow"},{origin:"https://foreign.example"})).status,403);
  const before=f.queries();assert.equal((await f.call("/api/accuracy/check?demo=1",{workspaceId:"sample-northwick"})).status,403);assert.equal(f.queries(),before);
  const sample=await f.call("/api/accuracy?workspaceId=sample-northwick&demo=1");assert.equal(sample.status,200);assert.equal(sample.value.sample,true);assert.ok(sample.value.rows.every((r:any)=>r.status!=="Live"));assert.equal(f.queries(),before);
  const run=await f.call("/api/accuracy/check",{workspaceId:"willow"});assert.equal(run.status,200);assert.equal(run.value.rows[0].score,1);
  const draft=await f.call("/api/accuracy/estimate",{workspaceId:"willow",features:featuresFixture()});assert.equal(draft.status,200);assert.equal(draft.value.label,"Estimated, not yet validated");assert.equal(draft.value.neighbourCount,0);assert.equal(draft.value.reportEligible,false);
  assert.equal((await f.call("/api/accuracy/estimate",{workspaceId:"other",features:{...featuresFixture(),providerToken:"forbidden"}})).status,400);
  assert.equal((await f.call("/api/accuracy/score-ads",{workspaceId:"willow",features:[featuresFixture()]})).status,422);
  assert.equal((await f.call("/api/accuracy/thresholds",{workspaceId:"willow",scope:accuracyScope,values:{minDays:2}})).status,400);
 }finally{await f.close();}
});
test("AC-06 offline evaluator produces actual model predictions and fixture imports cannot pass the live gate",async()=>{
 const f=await fixture();try{
  const old=featuresFixture({adId:"old",familyId:"old-family",at:"2026-01-01T00:00:00Z"});
  const artifact=evaluateLikelihoodFile({workspaceId:"willow",reference:[{features:old,outcome:1,resolvedAt:"2026-02-01T00:00:00Z"}],market:[],holdout:[{features:featuresFixture(),outcome:0,resolvedAt:"2026-11-01T00:00:00Z",baseline:.5}],referenceEnd:"2026-03-01T00:00:00Z",holdoutStart:"2026-10-01T00:00:00Z",holdoutEnd:"2026-10-02T00:00:00Z",checkedAt:"2026-11-10T00:00:00Z",trainingPrevalence:.5});
  assert.equal(artifact.dataSource,"fixtures");const response=await f.call("/api/accuracy/models",artifact);assert.equal(response.status,201,JSON.stringify(response.value));assert.notEqual(response.value.status,"Live");assert.equal(response.value.fixture,true);
  const estimate=await f.call("/api/accuracy/estimate",{workspaceId:"willow",features:featuresFixture()});assert.equal(estimate.value.neighbourCount,1);assert.equal(estimate.value.reportEligible,false);
  assert.equal((await f.call("/api/accuracy/models",{...artifact,evaluation:{...artifact.evaluation,status:"Live"}})).status,400);
  const other=await f.call("/api/accuracy/estimate",{workspaceId:"other",features:featuresFixture()});assert.equal(other.value.neighbourCount,0);
 }finally{await f.close();}
});
test("AC-06 synced owned estimates require their actual account and product group, then invalidate after regrouping",async()=>{
 const f=await fixture();try{
  const cohort=JSON.stringify(["Meta","11","GBP","7d_click","purchase","candle-200g"]),features=featuresFixture({adId:"owned:willow:Meta:11:variant",target:"owned-benchmark",accountCohort:cohort});
  assert.equal((await f.call("/api/accuracy/score-ads",{workspaceId:"willow",features:[features]})).status,422);
  await f.call("/api/accuracy/ad-scopes",{workspaceId:"willow",scope:accuracyScope,adIds:["variant"]});
  const response=await f.call("/api/accuracy/score-ads",{workspaceId:"willow",features:[features]});assert.equal(response.status,200,JSON.stringify(response.value));assert.equal(response.value[0].estimate.target,"owned-benchmark");
  const metrics=ownedMetrics([ownedFixture()]),row=browserCreative({adId:features.adId,nativeId:"variant",brandId:"willow",owned:true,workspaceBrand:true,mediaKind:"unknown",performance:[{id:"own",accountId:"11",platform:"Meta",currency:"GBP",attribution:"7d_click",conversionEvent:"purchase",from:"2026-11-11",to:"2026-11-17",lastChecked:null,benchmarkSampleSize:1,metrics,benchmark:metrics}]});
  assert.equal(enrichLikelihood(f.db,"willow",[row],"2026-11-10T00:00:00Z")[0].likelihood?.target,"owned-benchmark");
  await f.call("/api/accuracy/ad-scopes",{workspaceId:"willow",scope:{...accuracyScope,product:"gift-set-200"},adIds:["variant"]});
  assert.equal(enrichLikelihood(f.db,"willow",[row],"2026-11-10T00:00:00Z")[0].likelihood,undefined);
  const wrong={...features,accountCohort:JSON.stringify(["Meta","11","GBP","7d_click","purchase"])};assert.equal((await f.call("/api/accuracy/estimate",{workspaceId:"willow",features:wrong})).status,400);
 }finally{await f.close();}
});
