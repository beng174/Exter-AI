import { sampleCreatorResearch, sampleBriefReport } from "../shared/sample/research.js";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { attachSampleWorkspace } from "../server/sample.js";
import { sampleBrands, sampleCreatives, sampleLibrary, sampleValues, SAMPLE_BRAND_ID } from "../shared/sample/workspace.js";
import { brandContext } from "../src/lib/brand-context.js";
import { filterBrowserCreatives } from "../shared/creative-browser.js";

test("Sample fixtures contain only fictional, isolated brands and a complete reference workspace",()=>{
 assert.equal(sampleBrands.length,6);assert.equal(sampleBrands[0].name,"Northwick Candle Co.");
 assert.ok(sampleBrands.every(brand=>brand.mode==="demo"&&brand.id.startsWith("sample-")&&brand.domain.endsWith(".example")&&brand.competitors.length===5));
 assert.equal(brandContext(sampleBrands[0]),"Sample · 5 competitors");
 const library=sampleLibrary();assert.equal(library.creatives.length,260);assert.equal(library.creatives.filter(row=>row.workspaceBrand).length,46);
 assert.deepEqual(sampleBrands.map(brand=>library.creatives.filter(row=>row.brandId===brand.id).length),[46,58,41,49,33,33]);
 assert.equal(Object.keys(library.presentation!).length,15);assert.ok(library.conversation!.every(answer=>answer.sources.every(id=>library.creatives.some(row=>row.adId===id))));
 assert.ok(library.creatives.every(row=>row.adId.startsWith("sample-")&&row.sourceUrl!.startsWith("https://ads.example/")&&row.thumbnailUrl!.startsWith("data:image/svg+xml,")));
 assert.deepEqual(library.creatives.slice(0,8).map(row=>row.copy.split("\n")[0]),sampleValues.Creatives.cards.map(row=>row.title));
 assert.equal(sampleCreatorResearch().candidates.length,6);assert.equal(sampleBriefReport().opportunities.length,7);assert.equal(sampleBriefReport().prediction.trainingStatus,"not-trained");
 assert.equal(sampleValues.Main.priorities.length,3);assert.equal(sampleValues.Main.scorecard.length,8);assert.equal(sampleValues.Briefs.opps.length,7);assert.equal(sampleValues.Creators.creators.length,6);assert.equal(sampleValues.DataSources.sources.length,9);assert.equal(sampleValues.Reports.weeks.length,4);
 const competitor=sampleLibrary(sampleBrands[1].id);assert.equal(competitor.creatives.filter(row=>row.workspaceBrand).length,58);assert.ok(competitor.creatives.filter(row=>!row.workspaceBrand).every(row=>row.performance.length===0&&!row.owned));
 assert.equal(filterBrowserCreatives(library.creatives,{show:"yours"}).length,46);assert.equal(filterBrowserCreatives(library.creatives,{show:"competitors"}).length,214);
 assert.equal(sampleCreatives.filter(row=>row.workspaceBrand).length,46,"per-request scoping must not mutate shared fixtures");
});

test("Sample API is flag-gated, read-only and cannot fall through to providers or real records",async()=>{
 const app=express();app.use(express.json());let downstream=0;
 attachSampleWorkspace(app);
 app.use((_req,res)=>{downstream++;res.json({real:true});});
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const get=async(path:string)=>(await fetch(base+path));
 try {
  assert.deepEqual(await (await get("/api/brands")).json(),{real:true});assert.equal(downstream,1);
  const list=await (await get("/api/brands?demo=1")).json();assert.equal(list.length,6);assert.ok(list.every((brand:{mode:string})=>brand.mode==="demo"));
  for(const path of [`/api/brands/${SAMPLE_BRAND_ID}/creatives`,`/api/owned/accounts?workspaceId=${SAMPLE_BRAND_ID}`,`/api/reports/sample-report-0/download`])assert.equal((await get(path)).status,404,path);
  for(const path of [`/api/brands/real-workspace/creatives?demo=1`,`/api/reports?demo=1&brandId=real-workspace`,`/api/owned/accounts?demo=1&workspaceId=real-workspace`])assert.equal((await get(path)).status,404,path);
  const library=await (await get(`/api/brands/${SAMPLE_BRAND_ID}/creatives?demo=1`)).json();assert.equal(library.creatives.length,260);assert.ok(library.presentation);
  for(const path of ["/api/brand-identities","/api/infrastructure/status","/api/connections","/api/budgets","/api/creator-research","/api/brand-research","/api/owned/accounts","/api/reports","/api/public/meta/watchlists",`/api/brands/${SAMPLE_BRAND_ID}/demo`,`/api/brands/${SAMPLE_BRAND_ID}/creative-competitors`]){const response=await get(path+"?demo=1");assert.equal(response.status,200,path);assert.match(response.headers.get("cache-control")!,/no-store/);}
  for(const [method,path] of [["POST","/api/brand-logos/sample-northwick"],["POST","/api/brands"],["POST","/api/brand-research"],["POST","/api/creator-research/search"],["POST","/api/creator-research/fit"],["POST","/api/creator-research/shortlist"],["POST","/api/reports"],["POST","/api/owned/accounts"],["POST","/api/owned/accounts/sample-account/sync"],["POST","/api/gemini-smoke/video"],["POST","/api/public/meta/collect"],["PUT","/api/budgets/inference"],["DELETE",`/api/brands/${SAMPLE_BRAND_ID}`]]){
   const response=await fetch(base+path+"?demo=1",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({brandId:SAMPLE_BRAND_ID,workspaceId:SAMPLE_BRAND_ID,monthly_budget_gbp:100})});assert.equal(response.status,403,`${method} ${path}`);
  }
  const bypass=await fetch(base+"/api/budgets/inference",{method:"PUT",headers:{"Content-Type":"application/json",referer:base+"/?demo=1&brandId="+SAMPLE_BRAND_ID},body:JSON.stringify({monthly_budget_gbp:100})});assert.equal(bypass.status,403);
  const lookup=await fetch(base+"/api/ask?demo=1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({brandId:SAMPLE_BRAND_ID,question:"Which hooks are competitors scaling?"})});assert.equal(lookup.status,200);const answer=await lookup.json();assert.equal(answer.sources.length,4);assert.ok(answer.sources.every((id:string)=>id.startsWith("sample-")));
  assert.equal(downstream,1,"no sample request reaches any real database/provider route");
 } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
