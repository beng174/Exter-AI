import {test,after} from "node:test";
import assert from "node:assert/strict";
import {mkdir,mkdtemp,writeFile,rm} from "node:fs/promises";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {adMediaRuns} from "../server/ad-media/api.js";
import {mediaCoverage} from "../server/ad-media/coverage.js";
import {actorCounts,AdMediaActor,mediaInputDetails} from "../server/ad-media/apify.js";
const official=Array.from({length:8},(_,i)=>({brandKey:"candle",nativeId:String(i)}));
const attempts=[{...official[0],returned:false,matched:false,outcome:"requested"},...(["expired","unsupported","wrong_page","stored"] as const).map((outcome,i)=>({...official[i+1],returned:true,matched:outcome!=="wrong_page",outcome}))];
const coverage=mediaCoverage([...official,official[0],{brandKey:"budget",nativeId:"1"}],attempts,[{...official[4],image:true,video:true}],[{brandKey:"candle",budget:false},{brandKey:"budget",budget:true}]);
test("coverage counts distinct official ads, actual requests, matching and files; missing reasons add up",()=>{
 const row=coverage[0];assert.equal(row.official,8);assert.equal(row.requested,5);assert.equal(row.returned,4);assert.equal(row.matched,3);assert.equal(row.images,1);assert.equal(row.videos,1);assert.equal(row.missing,7);
 assert.deepEqual(row.reasons,{not_requested:3,not_returned:1,expired:1,unsupported:1,wrong_page:1,budget:0,disk:0,provider:0});assert.equal(Object.values(row.reasons).reduce((a,b)=>a+b),row.missing);assert.equal(coverage[1].reasons.budget,1);
 const legacy=mediaCoverage([official[0]],[],[{...official[0],image:true,video:false,legacy:true}],[{brandKey:"candle",budget:false,historyIncomplete:true}])[0];assert.equal(legacy.requested,1);assert.equal(legacy.matched,1);assert.equal(legacy.missing,0);assert.equal(legacy.historyIncomplete,true);
});
test("actor summaries keep recognised own counts only, with unknowns left unknown",async()=>{
 assert.equal(actorCounts({type:"status",requested:500}),null);
 assert.deepEqual(actorCounts({type:"run-summary",queries:[{delivered:20,totalCount:7800,stopReason:"cap"},{delivered:4,totalCount:100,stopReason:"https://private.invalid"}],token:"never-keep"}),{requested:null,returned:24,queries:2,stopReasons:["cap"]});
 assert.equal(actorCounts({type:"run-summary",requested:-1,returned:"20"})?.returned,null);
 const actor=new AdMediaActor({env:{APIFY_TOKEN:"fixture-only"},fetch:async target=>{assert(new URL(String(target)).pathname.endsWith("/records/INPUT"));return Response.json({adArchiveIds:["9001","9002"],token:"never-keep"});}});assert.equal(await actor.requestedCount("fixtureStore10001"),2);
});
await mkdir(resolve("work"),{recursive:true});const dir=await mkdtemp(resolve("work/media-coverage-render-"));
const bundle=await build({entryPoints:["src/components/workspace/AdMediaRuns.tsx"],bundle:true,format:"esm",platform:"node",write:false,external:["react","react-dom","lucide-react"],loader:{".css":"empty"}});
const file=join(dir,"components.mjs");await writeFile(file,bundle.outputFiles[0].contents);const ui=await import(pathToFileURL(file).href);after(()=>rm(dir,{recursive:true,force:true}));
test("coverage and run Details render counts, gap reasons, safe input and unknown actor counts",()=>{
 const html=renderToStaticMarkup(createElement(ui.MediaCoverageLines,{coverage}));for(const label of ["Official ads","Image or poster","Video","Requested","Returned","Matched","Still missing","3 not requested yet","1 wrong Page","1 budget"])assert(html.includes(label),label);
 const details=renderToStaticMarkup(createElement(ui.MediaRunDetails,{run:{brandKey:"candle",startedAt:"2026-11-06T12:00:00Z",error:null,diagnostics:{requested:500,returned:20,matched:20,actorInput:500,actorRequested:null,actorReturned:20,actorQueries:500,stopReasons:["end_of_results"],input:{pageId:"12001",countries:["GB"],from:"2025-11-06",to:"2026-11-06",maxAds:500,maxAdsPerQuery:500}}}}));for(const value of ["Details","Actor input IDs","Actor reported returned","Not recorded","Page 12001","GB","maximum 500","all ads, active and inactive"])assert(details.includes(value),value);
});

test("persisted actor diagnostics project only fixed input fields and valid counters",()=>{
 const input={pageId:"12001",countries:["GB"],from:"2025-11-06",to:"2026-11-06",activeStatus:"all",adType:"all",maxAds:500,maxAdsPerQuery:500,mode:"adArchiveIds",requested:500};
 assert.deepEqual(mediaInputDetails({...input,token:"never-keep",url:"https://private.invalid"}),input);assert.equal(mediaInputDetails({...input,pageId:"https://private.invalid"}),null);assert.equal(mediaInputDetails({...input,maxAds:501}),null);assert.equal(actorCounts({type:"run-summary",queries:[{delivered:2147483647},{delivered:2147483647}]})?.returned,null);
});

test("legacy run Details preserve the saved Page-search cap and dates without inventing request counts",async()=>{
 const pool:any={query:async()=>({rows:[{id:"old-run",page_id:"12001",phase:"page",cap:20,window_from:"2025-11-06",window_to:"2026-11-06",brand_key:"candle",status:"complete",started_at:"2026-11-06T03:00:00Z",results:20,ads_with_media:4}]})};
 const run=(await adMediaRuns(pool,"workspace"))[0];assert.equal(run.diagnostics?.requested,null);assert.equal(run.diagnostics?.returned,null);assert.equal(run.diagnostics?.plan?.cap,20);
 const html=renderToStaticMarkup(createElement(ui.MediaRunDetails,{run}));for(const value of ["Page 12001","Page search","maximum 20 ads","Exact actor input was not recorded"])assert(html.includes(value),value);
});
