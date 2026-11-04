import test from "node:test";
import assert from "node:assert/strict";
import { ownedBenchmark, ownedMetrics, latestOwnedDays } from "../shared/owned-metrics.js";
import { pullOwnedDays } from "../server/owned/providers.js";
import { fixtureAccount, fixtureEnv, fixtureFetch } from "./fixtures/owned-fixtures.js";
async function row(){return (await pullOwnedDays(fixtureAccount(),"2026-11-01","2026-11-04",{fetch:fixtureFetch(),env:fixtureEnv,now:new Date("2026-11-04T00:00:00Z")}))[0];}

test("CA-02 every metric formula reproduces manually from fixture rows",async()=>{
  const source=await row(),metrics=ownedMetrics([source]);
  for(const [key,value] of Object.entries({Spend:100,CPM:50,"Link CTR":.05,"Hook rate":.25,"Hold rate":.4,"Retention 25%":.5,"Retention 50%":.3,"Retention 75%":.2,"Retention 95%":.1,"Retention 100%":.05,"Average watch time":4,Frequency:1.5,Purchases:20,CPA:5,ROAS:4,CVR:.2}))assert.equal(metrics[key as keyof typeof metrics].value,value,key);
  assert.equal(metrics.Purchases.value,20,"purchase mappings prefer one type, never add overlapping purchase aliases");
});
test("CA-02 rates are ratios of sums, reported period metrics are never averaged",async()=>{
  const first=await row(),second={...first,adId:"2222",impressions:8000,linkClicks:100,earlyViews:500};
  const metrics=ownedMetrics([first,second]);
  assert.equal(metrics["Link CTR"].value,.02);
  assert.equal(metrics["Hook rate"].value,.1);
  assert.equal(metrics.Frequency.status,"unavailable");
  assert.equal(metrics["Average watch time"].status,"unavailable");
});
test("CA-02 minimum samples include exact boundaries; missing image views are excluded",async()=>{
  const source=await row();
  for(const [key,patch] of [["Link CTR",{impressions:999}],["Hook rate",{impressions:999}],["Hold rate",{earlyViews:299}],["CPA",{purchases:9}],["ROAS",{purchases:9}]] as const)assert.equal(ownedMetrics([{...source,...patch}])[key].status,"too early",key);
  const exact=ownedMetrics([{...source,impressions:1000,earlyViews:300,purchases:10}]);
  for(const key of ["Link CTR","Hook rate","Hold rate","CPA","ROAS"] as const)assert.equal(exact[key].status,"available",key);
  const result=ownedMetrics([source,{...source,adId:"image",earlyViews:null,longerViews:null,videoStarts:null}]);
  assert.equal(result["Hook rate"].value,.25);assert.equal(result["Hook rate"].rowsExcluded,1);
  assert.equal(ownedMetrics([{...source,spend:0,purchases:0,linkClicks:0}]).CVR.status,"unavailable");
});
test("CA-02 benchmarks separate account, dates, currency, attribution, event and platform",async()=>{
  const source=await row(),other=[{...source,currency:"USD"},{...source,accountId:"22"},{...source,attribution:"1d_click"},{...source,conversionEvent:"other"},{...source,day:"2026-10-01"},{...source,platform:"TikTok" as const}];
  for(const row of other.filter(r=>r.day===source.day))assert.throws(()=>ownedMetrics([source,row]),/Select one account/);
  assert.equal(ownedBenchmark([source,...other],{...source,from:"2026-11-01",to:"2026-11-04"}).Spend.value,100);
  assert.equal(ownedMetrics([]).Spend.status,"unavailable");
});
test("CA-02 restated rows replace older pulls without double counting",async()=>{
  const source=await row(),newer={...source,spend:120,pulledAt:"2026-11-05T00:00:00Z"};
  assert.equal(latestOwnedDays([newer,source]).length,1);
  assert.equal(ownedMetrics([newer,source]).Spend.value,120);
});
