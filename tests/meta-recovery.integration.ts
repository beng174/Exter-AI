// Dedicated disposable Postgres only. All Meta responses and credentials are fictional fixtures.
import {test} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import express from "express";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {migrate} from "../server/infrastructure/database.js";
import {enqueueCollection,workOnce,CollectionBusyError} from "../server/infrastructure/jobs.js";
import {MetaLibraryConnector} from "../server/connectors/meta-library.js";
import {readMetaWatchlists} from "../server/infrastructure/meta-runs.js";
import {attachInfrastructure} from "../server/infrastructure/api.js";
import {openDatabase} from "../server/db.js";
import {basicAuth} from "../server/auth.js";
import {protectSettingsMutation} from "../server/request-guard.js";
const env={EXTER_META_LIBRARY_ENABLED:"true",META_ACCESS_TOKEN:"fixture-only"};
function testPool(){assert.ok(process.env.TEST_DATABASE_URL,"A dedicated disposable TEST_DATABASE_URL is required.");return new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});}
async function reset(pool:pg.Pool){await migrate(pool);await migrate(pool);await pool.query("TRUNCATE watchlists,collection_runs,collection_jobs,collection_cursors,schedule_slots,ad_observations,public_ads,meta_collection_failures CASCADE");await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='data_providers'");await pool.query("UPDATE meta_request_gate SET next_request_at=now()");await pool.query("INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('own','fixture','fixture','[\"12\"]')");}
async function tick(pool:pg.Pool){await pool.query("UPDATE meta_request_gate SET next_request_at=now()");await pool.query("UPDATE collection_jobs SET available_at=now()-interval '1 second' WHERE status='queued'");}
const dispatch=(pool:pg.Pool,connector:MetaLibraryConnector)=>workOnce(pool,connector,{env,paceMs:20000});

test("a successful smaller page is remembered per brand without reducing a different brand's page size",async()=>{
 const pool=testPool();try{
  await reset(pool);await pool.query("INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('rival','fixture','fixture-rival','[\"13\"]')");await enqueueCollection(pool,"own");await enqueueCollection(pool,"rival");
  const sizes:Record<string,number[]>={};const connector=new MetaLibraryConnector({token:"fixture-only",fetch:async target=>{const url=new URL(String(target)),page=JSON.parse(url.searchParams.get("search_page_ids")!)[0],size=Number(url.searchParams.get("limit"));(sizes[page]||=[]).push(size);return page==="12"&&size===100?Response.json({error:{code:1}},{status:400}):Response.json({data:[{id:page+"01",page_id:page}]});}});
  for(let i=0;i<3;i++){await tick(pool);await dispatch(pool,connector);}
  assert.deepEqual(sizes,{"12":[100,50],"13":[100]});const rows=(await pool.query("SELECT id,meta_page_size FROM watchlists ORDER BY id")).rows;assert.deepEqual(rows,[{id:"own",meta_page_size:50},{id:"rival",meta_page_size:100}]);
 }finally{await pool.end();}
});

test("a legacy 7,752-ad run resumes its exact cursor, shrinks in paced turns, remembers the successful size and keeps all history",async()=>{
 const pool=testPool();try{
  await reset(pool);const run=await enqueueCollection(pool,"own",undefined,new Date("2026-11-05"));
  await pool.query("INSERT INTO public_ads(platform,native_id,advertiser_id) SELECT 'Meta',(10000+n)::text,'12' FROM generate_series(1,7752) n");
  await pool.query(`INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload)
    SELECT 'Meta',native_id,$1,'fixture','unknown','{}',jsonb_build_object('id',native_id,'page_id','12') FROM public_ads`,[run]);
  await pool.query("INSERT INTO collection_cursors SELECT $1,0,'retained-cursor-'||n FROM generate_series(1,78) n",[run]);
  await pool.query("UPDATE collection_runs SET records_new=7752,pages_fetched=NULL,status='failed',cursor='retained-cursor-78',finished_at='2026-11-05T09:00:00Z',errors='[{\"message\":\"Meta collection reached its retry limit. Saved pages are retained; start a new collection explicitly.\"}]' WHERE id=$1",[run]);
  await pool.query("UPDATE collection_jobs SET status='failed',attempts=5 WHERE id=$1",[run]);
  const before=(await readMetaWatchlists(pool,"fixture"))[0].latestRun!;assert.equal(before.adsSaved,7752);assert.equal(before.pagesFetched,78);assert.equal(before.failures.length,0);
  assert.equal(await enqueueCollection(pool,"own"),run);assert.equal((await pool.query("SELECT cursor FROM collection_runs WHERE id=$1",[run])).rows[0].cursor,"retained-cursor-78");
  const sizes:number[]=[];let finish=false;
  const connector=new MetaLibraryConnector({token:"fixture-only",fetch:async target=>{
   const url=new URL(String(target)),limit=Number(url.searchParams.get("limit"));sizes.push(limit);
   assert.equal(url.searchParams.get("after"),finish?"next-cursor":"retained-cursor-78");assert.equal(url.searchParams.get("fields")!.includes("age_country_gender_reach_breakdown"),true);
   if(limit===100)return Response.json({error:{code:1,error_subcode:99,message:"private-provider-text fixture-only"}},{status:400});
   if(limit===50)return new Response("private-provider-text",{status:500});
   if(limit===25)throw new DOMException("private-provider-text","TimeoutError");
   return Response.json(finish?{data:[]}:{data:[{id:"99999",page_id:"12",total_reach_by_location:[{key:"UK",value:0}]}],paging:{next:"https://graph.facebook.com/private-provider-text",cursors:{after:"next-cursor"}}});
  }});
  for(const expected of [50,25,10]){
   assert.equal(await dispatch(pool,connector),true);const job=(await pool.query("SELECT attempts,page_size FROM collection_jobs WHERE id=$1",[run])).rows[0];assert.equal(job.attempts,0);assert.equal(job.page_size,expected);
   assert.equal(await dispatch(pool,connector),false,"the next smaller request still waits for the shared request gate");await tick(pool);
  }
  await dispatch(pool,connector);assert.deepEqual(sizes,[100,50,25,10]);assert.equal((await pool.query("SELECT count(*)::int AS n FROM ad_observations")).rows[0].n,7753);assert.equal((await pool.query("SELECT meta_page_size FROM watchlists WHERE id='own'")).rows[0].meta_page_size,10);
  let latest=(await readMetaWatchlists(pool,"fixture"))[0].latestRun!;assert.equal(latest.pagesFetched,79);assert.equal(latest.adsSaved,7753);assert.equal(latest.failureCount,4,"the legacy stop plus three diagnosed size probes are retained");assert.ok(!JSON.stringify(latest).includes("private-provider"));assert.ok(!JSON.stringify(latest).includes("retained-cursor"));assert.ok(!JSON.stringify(latest).includes("fixture-only"));
  assert.equal(latest.failures.find(f=>f.graphCode===1)?.graphSubcode,99);assert.ok(latest.failures.some(f=>f.timedOut));assert.ok(latest.failures.some(f=>f.kind==="legacy"&&f.at==="2026-11-05T09:00:00.000Z"));
  finish=true;await tick(pool);await dispatch(pool,connector);latest=(await readMetaWatchlists(pool,"fixture"))[0].latestRun!;assert.equal(latest.status,"complete");assert.equal(latest.pagesFetched,80);assert.ok(latest.stoppedAt);assert.equal(latest.message,null);
  const next=await enqueueCollection(pool,"own");assert.notEqual(next,run);await tick(pool);let limit=0;await dispatch(pool,new MetaLibraryConnector({token:"fixture-only",fetch:async target=>{limit=Number(new URL(String(target)).searchParams.get("limit"));return Response.json({data:[]});}}));assert.equal(limit,10);
 }finally{await pool.end();}
});

test("exhausting all sizes counts one failed-page attempt, then bounded retries stop with numeric diagnostics",async()=>{
 const pool=testPool();try{
  await reset(pool);const run=await enqueueCollection(pool,"own"),limits:number[]=[];
  const connector=new MetaLibraryConnector({token:"fixture-only",fetch:async target=>{limits.push(Number(new URL(String(target)).searchParams.get("limit")));return Response.json({error:{code:1,error_subcode:123,message:"private-provider-text"}},{status:500});}});
  for(let i=0;i<8;i++){await tick(pool);await dispatch(pool,connector);}
  assert.deepEqual(limits,[100,50,25,10,10,10,10,10]);const job=(await pool.query("SELECT status,attempts FROM collection_jobs WHERE id=$1",[run])).rows[0];assert.deepEqual(job,{status:"failed",attempts:5});
  const latest=(await readMetaWatchlists(pool,"fixture"))[0].latestRun!;assert.equal(latest.pagesFetched,0);assert.equal(latest.adsSaved,0);assert.equal(latest.failureCount,8);assert.equal(latest.failures[0].graphCode,1);assert.equal(latest.failures[0].graphSubcode,123);assert.equal(latest.failures[0].httpStatus,500);assert.ok(latest.stoppedAt);assert.equal(await dispatch(pool,connector),false);
  assert.equal((await pool.query("SELECT cursor FROM collection_runs WHERE id=$1",[run])).rows[0].cursor,null);
 }finally{await pool.end();}
});

test("permission, schema, rate limit, network, timeout and budget failures preserve their controlled numeric history",async()=>{
 const pool=testPool();try{
  for(const scenario of ["permission","schema","rate","network","timeout","budget"]){
   await reset(pool);const run=await enqueueCollection(pool,"own");if(scenario==="budget")await pool.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='data_providers'");let calls=0;
   const connector=new MetaLibraryConnector({token:"fixture-only",fetch:async()=>{calls++;if(scenario==="network")throw new Error("private-provider-text https://fixture.invalid");if(scenario==="timeout")throw new DOMException("private-provider-text","TimeoutError");return Response.json({error:{code:scenario==="permission"?190:scenario==="schema"?100:4,error_subcode:42,message:"private-provider-text"}},{status:scenario==="rate"?429:400,headers:{"retry-after":"120"}});}});
   await dispatch(pool,connector);const latest=(await readMetaWatchlists(pool,"fixture"))[0].latestRun!;assert.equal(latest.failureCount,1);assert.ok(!JSON.stringify(latest).includes("private-provider"));
   assert.equal(latest.status,scenario==="permission"||scenario==="budget"?"paused":scenario==="schema"?"failed":"queued");assert.equal(latest.failures[0].graphCode,scenario==="permission"?190:scenario==="schema"?100:scenario==="rate"?4:null);
   if(scenario==="budget")assert.equal(calls,0);if(scenario==="rate"){assert.equal(latest.failures[0].httpStatus,429);assert.equal((await pool.query("SELECT attempts FROM collection_jobs WHERE id=$1",[run])).rows[0].attempts,1);assert.equal(await dispatch(pool,connector),false);}
   if(scenario==="timeout")assert.equal((await pool.query("SELECT attempts,page_size FROM collection_jobs WHERE id=$1",[run])).rows[0].attempts,0);
  }
 }finally{await pool.end();}
});

test("the authenticated per-brand retry action enforces access, workspace, budget, cooldown and active-lease guards",async()=>{
 const pool=testPool(),db=openDatabase(":memory:",false),previous={enabled:process.env.EXTER_META_LIBRARY_ENABLED,token:process.env.META_ACCESS_TOKEN};let server:ReturnType<typeof createServer>|undefined;
 try{
  await reset(pool);const brand={id:"fixture",name:"Fictional Candle House",domain:"fictional.example",category:"Home fragrance & gifting",color:"#123456",initials:"FC",voice:[],competitors:[],mode:"imported",createdAt:"2026-11-01"};db.prepare("INSERT INTO brands VALUES(?,?)").run(brand.id,JSON.stringify(brand));
  const run=await enqueueCollection(pool,"own");await pool.query("UPDATE collection_runs SET status='failed',cursor='retained-fixture-cursor',finished_at=now() WHERE id=$1",[run]);await pool.query("UPDATE collection_jobs SET status='failed' WHERE id=$1",[run]);
  const app=express();app.use(basicAuth({EXTER_ADMIN_USER:"fixture",EXTER_ADMIN_PASSWORD:"fixture-only"}));app.use(express.json());app.use("/api/public/meta",protectSettingsMutation);attachInfrastructure(app,db,()=>pool);server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,headers={Authorization:`Basic ${Buffer.from("fixture:fixture-only").toString("base64")}`,"Content-Type":"application/json"};
  const request=(body:unknown={watchlistId:"own",workspaceId:"fixture"},extra={})=>fetch(base+"/api/public/meta/collect",{method:"POST",headers:{...headers,...extra},body:JSON.stringify(body)});
  process.env.EXTER_META_LIBRARY_ENABLED="false";process.env.META_ACCESS_TOKEN="fixture-only";assert.equal((await request()).status,409);
  process.env.EXTER_META_LIBRARY_ENABLED="true";delete process.env.META_ACCESS_TOKEN;assert.equal((await request()).status,409);process.env.META_ACCESS_TOKEN="fixture-only";
  assert.equal((await request(undefined,{Origin:"https://foreign.invalid"})).status,403);assert.equal((await fetch(base+"/api/public/meta/collect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({watchlistId:"own"})})).status,401);
  assert.equal((await request({watchlistId:"own",workspaceId:"other"})).status,404);
  await pool.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='data_providers'");assert.equal((await request()).status,409);await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='data_providers'");
  await pool.query("UPDATE collection_jobs SET lease_owner='active-fixture',lease_until=now()+interval '1 minute' WHERE id=$1",[run]);await assert.rejects(enqueueCollection(pool,"own"),CollectionBusyError);assert.equal((await request()).status,409);
  await pool.query("UPDATE collection_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[run]);await pool.query("UPDATE meta_request_gate SET next_request_at=now()+interval '2 minutes'");
  const resumed=await request();assert.equal(resumed.status,202);assert.equal((await resumed.json()).runId,run);assert.equal((await pool.query("SELECT cursor FROM collection_runs WHERE id=$1",[run])).rows[0].cursor,"retained-fixture-cursor");
  let calls=0;const connector=new MetaLibraryConnector({token:"fixture-only",fetch:async()=>{calls++;return Response.json({data:[]});}});assert.equal(await dispatch(pool,connector),false);assert.equal(calls,0);
  const lists=await (await fetch(base+"/api/public/meta/watchlists?workspaceId=fixture",{headers})).json();assert.equal(lists[0].latestRun.status,"queued");assert.ok(!JSON.stringify(lists).includes("retained-fixture-cursor"));
 }finally{if(previous.enabled===undefined)delete process.env.EXTER_META_LIBRARY_ENABLED;else process.env.EXTER_META_LIBRARY_ENABLED=previous.enabled;if(previous.token===undefined)delete process.env.META_ACCESS_TOKEN;else process.env.META_ACCESS_TOKEN=previous.token;if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));db.close();await pool.end();}
});

test("bounded Meta user errors are stored and projected safely, including a saved legacy end date",async()=>{
 const pool=testPool();try{
  await reset(pool);const run=await enqueueCollection(pool,'own');await pool.query("UPDATE collection_runs SET config=config||'{\"from\":\"2025-11-06\",\"to\":\"2099-01-01\"}'::jsonb WHERE id=$1",[run]);
  const connector=new MetaLibraryConnector({token:'fixture-only',fetch:async target=>{const url=new URL(String(target));assert.equal(url.searchParams.has('ad_delivery_date_max'),false);assert.equal(url.searchParams.get('ad_delivery_date_min'),'2025-11-06');return Response.json({error:{code:100,error_subcode:2334030,message:'never-store-generic',fbtrace_id:'never-store-trace',error_user_title:'Invalid end date fixture-only',error_user_msg:'Choose today. https://fixture.invalid/?access_token=fixture-only '+ 'x'.repeat(500)}},{status:400});}});
  await dispatch(pool,connector);const stored=(await pool.query('SELECT * FROM meta_collection_failures WHERE run_id=$1',[run])).rows[0];assert.equal(stored.error_user_title,'Invalid end date [redacted]');assert.equal(stored.error_user_msg.length,300);
  const saved=JSON.stringify(stored);for(const bad of ['fixture-only','https://','never-store'])assert(!saved.includes(bad));
  const latest=(await readMetaWatchlists(pool,'fixture'))[0].latestRun!;assert.equal(latest.failures[0].userTitle,stored.error_user_title);assert.equal(latest.failures[0].userMessage,stored.error_user_msg);assert.equal(latest.failures[0].graphSubcode,2334030);
 }finally{await pool.end();}
});
