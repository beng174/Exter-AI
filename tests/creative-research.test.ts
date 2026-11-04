import test from "node:test";
import assert from "node:assert/strict";
import { brandSnapshots, brandVoice, comparisonGroups, competitorAverage, dimensionValues, evidenceUrl, launchShareTrend, longestRunning, median, mixGroups, productionFacts, researchWindow, selectResearchAds, selectionFromParams, staleCapture, type EvidenceSelection } from "../shared/creative-research.js";
import { browserFilters,filterBrowserCreatives } from "../shared/creative-browser.js";
import { researchFixture } from "./fixtures/research.js";

test("UI-04/UI-06 saved chronology uses the latest real capture, equal periods and explicit events",()=>{
  const {library}=researchFixture(),window=researchWindow(library.creatives,undefined,undefined,new Date("2026-11-05"));
  assert.deepEqual(window,{from:"2026-10-29",to:"2026-11-04",previousFrom:"2026-10-22",previousTo:"2026-10-28",asOf:"2026-11-04"});
  const brands=brandSnapshots(library,window);
  assert.equal(brands[0].active.value,2);assert.equal(brands[0].launched.value,1);assert.equal(brands[0].stopped.value,1);assert.equal(brands[0].medianDays.value,10);assert.equal(brands[0].previousLaunches.value,1);
  assert.equal(brands[1].active.value,2);assert.equal(brands[0].shareActive.value,50);assert.equal(competitorAverage(brands,"active").value,2);
  const old=brandSnapshots(library,researchWindow(library.creatives,"2026-10-22","2026-10-28"));assert.equal(old[0].active.value,null,"future capture status cannot reconstruct the old week");
  assert.equal(staleCapture(library.lastChecked,new Date("2026-11-06")),true);
});
test("UI-04/UI-06 missing competitor/status/date fields remain unavailable; genuine zero stays zero",()=>{
  const {library,make}=researchFixture(),window=researchWindow(library.creatives);
  const missing={...library,competitors:[...library.competitors,{key:"pending",brandId:null,name:"Pending brand",status:"not-started"}]};
  assert.equal(brandSnapshots(missing,window)[2].active.value,null);assert.equal(brandSnapshots(missing,window)[0].shareActive.value,null);
  const knownInactive=make("inactive",{deliveryStatus:"inactive",deliveryStopAt:"2026-11-02T00:00:00Z"});
  const zero=brandSnapshots({...library,creatives:[knownInactive],competitors:[]},window)[0];assert.equal(zero.active.value,0);
  const partial=brandSnapshots({...library,creatives:[knownInactive,make("unknown",{deliveryStatus:"unknown",deliveryStartAt:null,deliveryStopAt:null,daysRunning:null})],competitors:[]},window)[0];assert.equal(partial.active.value,null);assert.equal(partial.active.excluded,1);
  assert.equal(median([0,null,NaN,10]),5);assert.equal(median([null,undefined,NaN]),null);
});
test("UI-06/UI-07/UI-08 shares retain the full sample denominator and deduplicate claim types per ad",()=>{
  const {library,make}=researchFixture(),unknown=make("unclassified",{creativeFormat:null,hookType:null,angle:null,offerType:null,analysis:null});
  const rows=[...library.creatives,unknown],mix=mixGroups(rows,"format",{show:"yours"});
  assert.equal(mix.sample,4);assert.equal(mix.classified,3);assert.equal(mix.unclassified,1);assert.equal(mix.groups.find(group=>group.value==="studio")?.share,50);
  assert.deepEqual(dimensionValues(library.creatives[0],"claim"),["performance"]);
  assert.equal(mixGroups(library.creatives,"claim").groups[0].count,5);
  const none=comparisonGroups([unknown,...library.creatives.filter(row=>!row.workspaceBrand)],"format");assert.ok(none.every(row=>row.yourShare===null&&row.gap===null));
  const patterns=comparisonGroups(library.creatives,"format");assert.equal(patterns.find(row=>row.value==="UGC")?.gap,50-100/3);
});
test("UI-07 trend is an explicit launch-share comparison; production facts never infer captions or demographics",()=>{
  const {library}=researchFixture(),window=researchWindow(library.creatives);
  assert.equal(launchShareTrend(library.creatives,"format","UGC",window),0);
  const facts=productionFacts(library.creatives,{kind:"running",take:"2"});assert.equal(facts.talkingShare,100);assert.equal(facts.duration,2);
  assert.ok(!("captions" in facts)&&!("demographics" in facts));
  assert.equal(brandVoice(library.creatives,{show:"yours",kind:"active"}).claim,"Saved source claim");
});
test("UI-04 through UI-10 all evidence URLs select exactly the supporting ads in Creatives, including claim groups and limits",()=>{
  const {library}=researchFixture(),window=researchWindow(library.creatives);
  const selections:EvidenceSelection[]=[{},{kind:"all"},...brandSnapshots(library,window).flatMap(brand=>[brand.active.selection,brand.launched.selection,brand.stopped.selection,brand.medianDays.selection,brand.previousLaunches.selection]),...mixGroups(library.creatives,"claim").groups.map(group=>group.selection),{kind:"running",take:"2"},{kind:"running",take:"2",measure:"duration"},{kind:"running",take:"2",measure:"talkingKnown"},{ad:"own-new"},{dimension:"format",value:"classified"},{dimension:"format",value:"unclassified"}];
  for(const selection of selections){const url=new URL(evidenceUrl(library.brand.id,selection),"http://exter.local"),params=url.searchParams;const expected=selectResearchAds(library.creatives,selection).map(row=>row.adId).sort();const actual=filterBrowserCreatives(library.creatives,browserFilters(params)).map(row=>row.adId).sort();assert.deepEqual(actual,expected,JSON.stringify(selection));assert.deepEqual(selectionFromParams(params),selection);}
});
test("UI-04/UI-10 never turn private-only account rows into public winners or compare currencies",()=>{
  const {library,make}=researchFixture();
  const privateOnly=make("private",{owned:true,publicEvidence:false,sourceKind:"owned",daysRunning:999});
  assert.ok(!longestRunning([...library.creatives,privateOnly]).some(row=>row.adId==="private"));
  assert.ok(longestRunning(library.creatives).some(row=>row.adId==="own-new"),"public source evidence remains available after a scoped owned match");
  assert.equal(library.creatives[0].performance.length,2);assert.notEqual(library.creatives[0].performance[0].currency,library.creatives[0].performance[1].currency);
});

test("UI-06 longest-running examples retain their active-only group",()=>{
  const {library}=researchFixture();
  assert.ok(longestRunning(library.creatives,{kind:"active"}).every(row=>row.deliveryStatus==="active"));
  assert.equal(selectResearchAds(library.creatives,{dimension:"format",value:"classified"}).length,5);
});
