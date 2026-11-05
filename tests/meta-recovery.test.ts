import {test,after} from "node:test";
import assert from "node:assert/strict";
import {mkdir,mkdtemp,writeFile,rm} from "node:fs/promises";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {MetaLibraryConnector,MetaCollectionError,META_FIELDS,META_REQUEST_TIMEOUT_MS} from "../server/connectors/meta-library.js";
import {metaRunProjection} from "../server/infrastructure/meta-runs.js";
import {smallerMetaPage,diagnosticNumber,META_CONTROLLED_ERRORS} from "../shared/meta-collection.js";
const token="fixture-private-token",query={pageIds:["12"],countries:["GB"],after:"retained-cursor",from:"2025-11-05",to:"2026-11-05"};
await mkdir(resolve("work"),{recursive:true});const dir=await mkdtemp(resolve("work/meta-recovery-render-"));
const bundle=await build({entryPoints:["src/components/research/MetaRunStatus.tsx"],bundle:true,format:"esm",platform:"node",write:false,external:["react","react-dom","lucide-react"],loader:{".css":"empty"}});
const file=join(dir,"components.mjs");await writeFile(file,bundle.outputFiles[0].contents);const ui=await import(pathToFileURL(file).href);after(()=>rm(dir,{recursive:true,force:true}));
async function failure(response:()=>Response|Promise<Response>,pageSize:100|50|25|10=100){try{await new MetaLibraryConnector({token,fetch:async()=>response()}).page({...query,pageSize});assert.fail("Expected fixture failure");}catch(error){assert.ok(error instanceof MetaCollectionError);assert.ok(!error.message.includes(token));assert.ok(!JSON.stringify(error).includes("private-provider"));return error;}}

test("page fallback has four bounded sizes and diagnostics admit only bounded integer numbers",()=>{
 assert.deepEqual([100,50,25,10].map(smallerMetaPage),[50,25,10,null]);
 for(const value of [undefined,null,-1,1.2,Infinity,2147483648,"1 private-provider","https://fixture.invalid",{},true])assert.equal(diagnosticNumber(value),null);
 assert.equal(diagnosticNumber("190"),190);assert.equal(diagnosticNumber(0),0);
});
test("code 1 and HTTP 500 retain numeric diagnostics and request a smaller page without copying provider text",async()=>{
 for(const http of [200,400,500]){
  const error=await failure(()=>Response.json({error:{code:"1",error_subcode:"99",message:`private-provider ${token}`,fbtrace_id:"private-provider"}},{status:http}));
  assert.equal(error.reducePage,true);assert.equal(error.graphCode,1);assert.equal(error.graphSubcode,99);assert.equal(error.httpStatus,http);assert.equal(error.pageSize,100);
 }
 const nonJson=await failure(()=>new Response("private-provider",{status:500}));assert.equal(nonJson.httpStatus,500);assert.equal(nonJson.graphCode,null);assert.equal(nonJson.reducePage,true);
 const oversized=await failure(()=>new Response("private-provider",{status:500,headers:{"content-length":"10000001"}}));assert.equal(oversized.reducePage,true);
});
test("permission, rate limits, unsupported schemas and other transient failures keep their distinct recovery rules",async()=>{
 for(const [code,http,reason,shrink] of [[190,400,"permission",false],[4,429,"rate_limited",false],[100,400,"schema",false],[2,503,"unavailable",false],[2,500,"unavailable",true]] as const){
  const error=await failure(()=>Response.json({error:{code,error_subcode:"private-provider",message:token}},{status:http,headers:{"retry-after":"123"}}));assert.equal(error.reason,reason);assert.equal(error.reducePage,shrink);assert.equal(error.graphSubcode,null);assert.equal(error.retryAfterMs,123000);
 }
 const invalid=await failure(()=>new Response("private-provider",{status:200}));assert.equal(invalid.reason,"schema");assert.equal(invalid.httpStatus,200);assert.equal(invalid.reducePage,false);
 const network=await failure(async()=>{throw new TypeError(`private-provider ${token}`);});assert.equal(network.reducePage,false);assert.equal(network.httpStatus,null);
});
test("whole requests use a 90-second deadline and timeouts at headers or body can shrink safely",async t=>{
 const timeout=AbortSignal.timeout;let duration=0;t.mock.method(AbortSignal,"timeout",(value:number)=>{duration=value;return timeout(value);});
 for(const atBody of [false,true]){
  const error=await failure(()=>{if(!atBody)throw new DOMException(`private-provider ${token}`,"TimeoutError");return new Response(new ReadableStream({start(controller){controller.error(new DOMException("private-provider","TimeoutError"));}}));},25);
  assert.equal(error.timedOut,true);assert.equal(error.reducePage,true);assert.equal(error.pageSize,25);assert.equal(error.httpStatus,atBody?200:null);
 }
 assert.equal(duration,90000);assert.equal(META_REQUEST_TIMEOUT_MS,90000);
  const lowerLevel=await failure(async()=>{throw new TypeError("private-provider",{cause:{code:"UND_ERR_HEADERS_TIMEOUT"}});});assert.equal(lowerLevel.timedOut,true);assert.equal(lowerLevel.reducePage,true);
});
test("smaller page requests change only the limit and preserve fields, Page, UK window and cursor",async()=>{
 for(const pageSize of [100,50,25,10] as const){
  const connector=new MetaLibraryConnector({token,fetch:async target=>{const url=new URL(String(target));assert.equal(url.searchParams.get("limit"),String(pageSize));assert.equal(url.searchParams.get("fields"),META_FIELDS);assert.equal(url.searchParams.get("after"),query.after);assert.equal(url.searchParams.get("ad_type"),"ALL");assert.equal(url.searchParams.get("ad_active_status"),"ALL");assert.equal(url.searchParams.get("ad_delivery_date_min"),query.from);assert.equal(url.searchParams.get("ad_delivery_date_max"),query.to);assert.equal(url.searchParams.get("ad_reached_countries"),'["GB"]');return Response.json({data:[]});}});
  assert.equal((await connector.page({...query,pageSize})).pageSize,pageSize);
 }
});
test("legacy progress remains readable while persisted unknown text and nonnumeric diagnostics never reach the UI",()=>{
 const legacy=metaRunProjection({run_id:"local-run",run_status:"failed",records_new:7752,records_updated:0,pages_fetched:78,finished_at:"2026-11-05T09:00:00Z",errors:[{message:`private-provider ${token}`}],failures:[{id:1,attempted_at:"2026-11-05T09:00:00Z",kind:"page_size",graph_code:"1",graph_subcode:"private-provider",http_status:500,page_size:100}]})!;
 assert.equal(legacy.adsSaved,7752);assert.equal(legacy.pagesFetched,78);assert.equal(legacy.failures[0].graphCode,1);assert.equal(legacy.failures[0].graphSubcode,null);assert.ok(!JSON.stringify(legacy).includes(token));assert.ok(!JSON.stringify(legacy).includes("private-provider"));assert.equal(legacy.message,META_CONTROLLED_ERRORS.page_size);
 const noCodes=metaRunProjection({run_id:"old",run_status:"failed",errors:[{message:token}]})!;assert.equal(noCodes.failures.length,0);assert.equal(noCodes.adsSaved,null);assert.equal(noCodes.pagesFetched,null);assert.ok(!noCodes.message!.includes(token));
});
const data:any={library:{brand:{id:"fixture"},metaSource:{enabled:true}},infrastructure:{meta:{status:"configured"}},budgets:[{cost_type:"data_providers",paused:false}]};
const watchlist:any={id:"fixture-list",page_ids:["12"],enabled:true,latestRun:{status:"failed"}};
test("per-brand retry guards stay disabled for samples, missing Page/access/budget and active work",()=>{
 assert.equal(ui.metaRetryReason(data,watchlist),null);
 for(const blocked of [{...data,library:{...data.library,presentation:{}}},{...data,library:{...data.library,metaSource:{enabled:false}}},{...data,infrastructure:{meta:{status:"not_connected"}}},{...data,budgets:[]}])assert.ok(ui.metaRetryReason(blocked,watchlist));
 assert.ok(ui.metaRetryReason(data,{...watchlist,enabled:false}));assert.ok(ui.metaRetryReason(data,{...watchlist,latestRun:{status:"running"}}));
 const html=renderToStaticMarkup(createElement(ui.MetaRetryButton,{data,watchlist,onSaved:()=>{}}));assert.match(html,/type="button"/);assert.match(html,/Retry collection/);assert.ok(!html.includes(" disabled"));
});
test("brand progress uses readable counts, stopping time and numeric Graph details",()=>{
 const run=metaRunProjection({run_id:"local-run",run_status:"failed",records_new:7752,records_updated:0,pages_fetched:78,finished_at:"2026-11-05T09:00:00Z",failures:[{id:1,attempted_at:"2026-11-05T09:00:00Z",kind:"page_size",graph_code:1,graph_subcode:99,http_status:500,page_size:100}]});
 const html=renderToStaticMarkup(createElement(ui.MetaRunDetails,{run}));for(const value of ["7,752","78","Graph code 1","subcode 99","HTTP 500","Stopped 5 Nov 2026"])assert.ok(html.includes(value),value);assert.ok(!html.includes("local-run"));
});
