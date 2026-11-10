import test from "node:test";
import assert from "node:assert/strict";
import {ApifyCreatorProvider,type ApifyCreatorOptions} from "../server/creators/apify.js";
import {CreatorProviderError} from "../server/creators/types.js";
import type {CreatorActorRun} from "../server/creators/run-store.js";
import {creatorRunInputMatches} from "../server/creators/run-reconciliation.js";
import {creatorBrief} from "./fixtures/creator-discovery.js";
const env={APIFY_TOKEN:"fixture-creator-provider",APIFY_INSTAGRAM_ACTOR_ID:"apify/instagram-scraper",APIFY_REQUEST_RESERVE_GBP:"0.75",EXTER_AD_MEDIA_GBP_PER_USD:"0.8"};
const json=(v:unknown,status=200)=>Response.json(v,{status});
const running={id:"fixture-run",status:"RUNNING",defaultDatasetId:"fixture-data"};
const final=(status="SUCCEEDED",usageTotalUsd:number|null=.125)=>({...running,status,usageTotalUsd});
const base:ApifyCreatorOptions={env,reserve:async()=>({reservationId:"fixture-hold",reservedGbp:.75}),sleep:async()=>{}};
test("Instagram runs can finish at fifteen minutes with 5s polling backed off to 15s and live counts",async()=>{
 let time=Date.parse("2026-11-10T12:00:00Z"),polls=0,starts=0,settled=0;const sleeps:number[]=[],counts:number[]=[];
 const provider=new ApifyCreatorProvider({...base,now:()=>new Date(time),sleep:async ms=>{sleeps.push(ms);time+=ms;},progress:async r=>{if(r.found!==null)counts.push(r.found);},settle:async r=>{settled++;assert.equal(r.usageUsd,.125);},fetch:async(input,init)=>{const u=new URL(String(input));assert.equal(new Headers(init?.headers).get("Authorization"),`Bearer ${env.APIFY_TOKEN}`);assert.ok(!u.href.includes(env.APIFY_TOKEN));if(u.pathname.endsWith("/runs")){starts++;assert.equal(u.searchParams.get("timeout"),"900");assert.equal(u.searchParams.get("maxTotalChargeUsd"),"0.93");return json({data:running});}if(u.pathname.includes("actor-runs")){polls++;return json({data:polls===70?final():running});}if(u.pathname.endsWith("/items"))return json([{username:"fixture_creator"}]);return json({data:{itemCount:polls}});}});
 const result=await provider.collectPublic({},20);assert.equal(starts,1);assert.equal(polls,70);assert.equal(settled,1);assert.ok(sleeps.includes(5000)&&sleeps.includes(10000)&&sleeps.includes(15000));assert.ok(time-Date.parse("2026-11-10T12:00:00Z")>=900000);assert.equal(result.rows.length,1);assert.equal(result.accounting.billedCostGbp,.1);assert.ok(counts.includes(50));
});
test("status reads retry 429, 5xx and network failures without restarting or aborting paid work",async()=>{
 for(const kind of [429,500,503,"network"] as const){let starts=0,reads=0,aborts=0;const sleeps:number[]=[];
  const p=new ApifyCreatorProvider({...base,pollIntervalMs:0,sleep:async ms=>{sleeps.push(ms);},fetch:async(input)=>{const u=new URL(String(input));if(u.pathname.endsWith("/runs")){starts++;return json({data:{id:"fixture-run",status:"RUNNING"}});}if(u.pathname.endsWith("/abort")){aborts++;throw new Error("No abort expected");}if(u.pathname.includes("actor-runs")){reads++;if(reads<4){if(kind==="network")throw new Error("fixture transport failure");return json({error:{message:"do not save provider text"}},kind);}return json({data:final()});}return json([{username:"fixture_creator"}]);}});
  const r=await p.collectPublic({},20);assert.equal(r.rows.length,1);assert.equal(starts,1);assert.equal(reads,4);assert.equal(aborts,0);assert.deepEqual(sleeps.filter(n=>n>0),[1000,2000,4000]);
 }
});
test("five failed status retries keep a durable run and its reserve for another check",async()=>{
 let starts=0,reads=0,aborts=0;
 const p=new ApifyCreatorProvider({...base,pollIntervalMs:0,fetch:async(input)=>{const u=new URL(String(input));if(u.pathname.endsWith("/runs")){starts++;return json({data:{id:"fixture-run",status:"RUNNING"}});}if(u.pathname.endsWith("/abort"))aborts++;reads++;return json({},429);}});
 await assert.rejects(p.collectPublic({},20),(e:unknown)=>e instanceof CreatorProviderError&&e.code==="pending"&&e.accounting?.runIds[0]==="fixture-run"&&e.accounting.billedCostGbp===null);
 assert.equal(starts,1);assert.equal(reads,6);assert.equal(aborts,0);
});
test("dataset reads retry temporary responses and retain earlier pages if retries run out",async()=>{
 let reads=0,starts=0;let last:CreatorActorRun|undefined;
 const p=new ApifyCreatorProvider({...base,progress:async r=>{last={...r};},fetch:async(input)=>{const u=new URL(String(input));if(u.pathname.endsWith("/runs")){starts++;return json({data:final()});}if(u.searchParams.get("offset")==="0")return json(Array.from({length:100},(_,i)=>({username:`fixture_${i}`})));reads++;return json({},500);}});
 await assert.rejects(p.collectPublic({},199),(e:unknown)=>e instanceof CreatorProviderError&&e.code==="pending"&&e.partialRows?.length===100&&e.accounting?.billedCostUsd===.125);
 assert.equal(reads,6);assert.equal(starts,1);assert.ok(last);
 const resume=new ApifyCreatorProvider({...base,resume:last,reserve:async()=>{throw new Error("A resumed run cannot reserve again");},fetch:async input=>{const u=new URL(String(input));assert.ok(!u.pathname.endsWith("/runs"));if(u.pathname.includes("actor-runs"))return json({data:final()});return json(Array.from({length:Number(u.searchParams.get("limit"))},()=>({username:"fixture_creator"})));}});
 assert.equal((await resume.collectPublic({},199)).rows.length,199);
});
test("aborted, failed and timed-out actors return partial rows and real charges",async()=>{
 for(const status of ["ABORTED","TIMED-OUT","FAILED"]){let settled=0;
 const p=new ApifyCreatorProvider({...base,settle:async r=>{assert.equal(r.status,status);settled++;},fetch:async input=>new URL(String(input)).pathname.endsWith("/runs")?json({data:final(status)}):json([{username:"fixture_partial"}])});
 const result=await p.collectPublic({},20);assert.equal(result.rows.length,1);assert.equal(result.accounting.runStatus,status);assert.equal(result.accounting.billedCostUsd,.125);assert.equal(settled,1);
 }
});
test("the twenty-minute polling bound does not abort a run and keeps available partial rows",async()=>{
 let time=0,aborts=0;const p=new ApifyCreatorProvider({...base,pollWindowMs:20000,now:()=>new Date(time),sleep:async ms=>{time+=ms;},fetch:async input=>{const u=new URL(String(input));if(u.pathname.endsWith("/abort"))aborts++;if(u.pathname.endsWith("/runs")||u.pathname.includes("actor-runs"))return json({data:running});if(u.pathname.endsWith("/items"))return json([{username:"fixture_partial"}]);return json({data:{itemCount:1}});}});
 await assert.rejects(p.collectPublic({},20),(e:unknown)=>e instanceof CreatorProviderError&&e.code==="pending"&&e.partialRows?.length===1&&e.accounting?.billedCostGbp===null);assert.equal(time,20000);assert.equal(aborts,0);
});
test("absent billing is never zero and an ambiguous paid start is never retried",async()=>{
 let settlements=0;const p=new ApifyCreatorProvider({...base,settle:async()=>{settlements++;},fetch:async input=>{const u=new URL(String(input));return u.pathname.endsWith("/items")?json([]):json({data:final("TIMED-OUT",null)});}});
 assert.equal((await p.collectPublic({},20)).accounting.billedCostGbp,null);assert.equal(settlements,0);
 let starts=0;const ambiguous=new ApifyCreatorProvider({...base,fetch:async()=>{starts++;throw new Error("fixture secret transport");}});await assert.rejects(ambiguous.collectPublic({},20));assert.equal(starts,1);
});
test("legacy confirmations must match the saved brief or an exact known enrichment batch",()=>{
 const job={brief:creatorBrief,steps:[],handles:["fixture_creator"]};
 assert.ok(creatorRunInputMatches(job,{directUrls:["https://www.instagram.com/explore/tags/candlefixture/"],resultsType:"posts",resultsLimit:8,addParentData:true}));
 assert.ok(creatorRunInputMatches(job,{directUrls:["https://www.instagram.com/fixture_creator/"],resultsType:"details",resultsLimit:1}));
 assert.equal(creatorRunInputMatches(job,{directUrls:["https://www.instagram.com/other_creator/"],resultsType:"details",resultsLimit:1}),false);
 assert.equal(creatorRunInputMatches(job,{search:"different brief UK",resultsType:"details"}),false);
});

test("dataset 429, 5xx and network failures recover through safe GET retries",async()=>{
 for(const kind of [429,503,"network"] as const){let reads=0;
 const p=new ApifyCreatorProvider({...base,fetch:async input=>{const u=new URL(String(input));if(u.pathname.endsWith("/runs"))return json({data:final()});reads++;if(reads<3){if(kind==="network")throw new Error("fixture disconnect");return json({},kind);}return json([{username:"fixture_creator"}]);}});
 assert.equal((await p.collectPublic({},20)).rows.length,1);assert.equal(reads,3);
 }
});
test("a confirmed zero charge is valid billing rather than missing data",async()=>{
 let settled=false;const p=new ApifyCreatorProvider({...base,settle:async r=>{assert.equal(r.usageUsd,0);settled=true;},fetch:async input=>new URL(String(input)).pathname.endsWith("/runs")?json({data:final("ABORTED",0)}):json([])});
 const result=await p.collectPublic({},20);assert.equal(result.accounting.billedCostGbp,0);assert.ok(settled);
});

test("a real polling deadline still reads the available partial dataset without aborting",async()=>{
 const p=new ApifyCreatorProvider({...base,pollWindowMs:20,sleep:async ms=>{await new Promise(r=>setTimeout(r,ms));},fetch:async input=>{const u=new URL(String(input));if(u.pathname.endsWith("/runs")||u.pathname.includes("actor-runs"))return json({data:running});if(u.pathname.endsWith("/items"))return json([{username:"fixture_partial"}]);return json({data:{itemCount:1}});}});
 await assert.rejects(p.collectPublic({},20),(e:unknown)=>e instanceof CreatorProviderError&&e.code==="pending"&&e.partialRows?.length===1);
});

test("safe 429 retries respect a bounded Retry-After without retrying paid starts",async()=>{
 let reads=0;const sleeps:number[]=[];
 const p=new ApifyCreatorProvider({...base,sleep:async ms=>{sleeps.push(ms);},fetch:async input=>{const u=new URL(String(input));if(u.pathname.endsWith("/runs"))return json({data:final()});reads++;return reads===1?new Response("{}",{status:429,headers:{"Retry-After":"3"}}):json([]);}});
 await p.collectPublic({},20);assert.deepEqual(sleeps,[3000]);assert.equal(reads,2);
});

test("an aborted or timed-out run without a dataset can advance without inventing a result count",async()=>{
 for(const status of ["ABORTED","TIMED-OUT"]){let last:CreatorActorRun|undefined;
 const p=new ApifyCreatorProvider({...base,progress:async r=>{last={...r};},fetch:async()=>json({data:{id:"fixture-run",status,usageTotalUsd:0}})});
 const result=await p.collectPublic({},20);assert.equal(result.rows.length,0);assert.equal(result.accounting.runStatus,status);assert.equal(last!.found,null);
 }
});
