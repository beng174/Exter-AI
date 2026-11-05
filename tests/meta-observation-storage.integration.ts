// Dedicated disposable Postgres only. Every provider response is a fictional fixture.
import {test} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import express from "express";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {migrate} from "../server/infrastructure/database.js";
import {collectMetaPage,MetaLibraryConnector,MetaCollectionError} from "../server/connectors/meta-library.js";
import {enqueueCollection} from "../server/infrastructure/jobs.js";
import {readPublicObservations,mergePublicEvidence} from "../server/infrastructure/meta-evidence.js";
import {databaseStorageHealth} from "../server/infrastructure/storage-health.js";
import {attachInfrastructure} from "../server/infrastructure/api.js";
import {openDatabase} from "../server/db.js";
import {publishedReach,countryReach} from "../shared/meta-public.js";

const payload={id:"101",page_id:"12",ad_delivery_start_time:"2026-10-01",ad_creative_bodies:["A fictional candle for a quiet evening"],total_reach_by_location:[{key:"UK",value:0}],publisher_platforms:["facebook"]};
const connector=(rows:Record<string,unknown>[])=>new MetaLibraryConnector({token:"fixture-only",fetch:async()=>Response.json({data:rows})});
function testPool(){assert.ok(process.env.TEST_DATABASE_URL,"A dedicated disposable TEST_DATABASE_URL is required.");return new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});}
async function reset(pool:pg.Pool){await migrate(pool);await migrate(pool);await pool.query("TRUNCATE watchlists,collection_runs,collection_jobs,collection_cursors,schedule_slots,ad_observations,public_ads,database_size_samples CASCADE");await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='data_providers'");await watchlist(pool,"own","fixture");}
async function watchlist(pool:pg.Pool,id:string,workspace:string){await pool.query("INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES($1,$2,$2,'[\"12\"]')",[id,workspace]);}
async function scan(pool:pg.Pool,rows:Record<string,unknown>[]= [payload],list="own"){const run=await enqueueCollection(pool,list);assert.equal((await collectMetaPage(pool,run,connector(rows))).complete,true);return run;}
const observations=(pool:pg.Pool)=>pool.query("SELECT * FROM ad_observations ORDER BY observed_at,run_id");

test("thirty identical scans confirm one snapshot; every changed stored field and a later revert retain new evidence",async()=>{
 const pool=testPool();try{
  await reset(pool);await scan(pool);const first=(await observations(pool)).rows[0];assert.deepEqual(first.last_confirmed_at,first.observed_at,"the initial change and confirmation share one timestamp");
  for(let day=1;day<30;day++)await scan(pool,[{...payload,total_reach_by_location:[{value:0,key:"UK"}]}]);
  assert.equal((await observations(pool)).rowCount,1);let last=(await observations(pool)).rows[0];assert.ok(last.last_confirmed_at>first.last_confirmed_at);assert.deepEqual(last.raw_payload,first.raw_payload);assert.deepEqual(last.observed_at,first.observed_at);
  for(const change of [{total_reach_by_location:[{key:"UK",value:60}]},{ad_creative_bodies:["A new fictional copy line"]},{ad_delivery_start_time:"2026-10-02"},{ad_delivery_stop_time:"2026-11-04"},{publisher_platforms:["facebook","instagram"]},{ad_creative_link_descriptions:["Another saved field"]}])await scan(pool,[{...payload,...change}]);
  await scan(pool);const all=await observations(pool);assert.equal(all.rowCount,8);assert.equal(all.rows.filter(row=>row.raw_payload!==null).length,8);assert.deepEqual(all.rows[0].raw_payload,first.raw_payload);assert.deepEqual(all.rows[0].observed_at,first.observed_at);
  assert.equal((await pool.query("SELECT sum(records_updated)::int AS n FROM collection_runs")).rows[0].n,7,"confirmations are not reported as changed observations");
 }finally{await pool.end();}
});

test("legacy rows survive migration and unchanged checks; normalized-only changes reference one complete payload",async()=>{
 const pool=testPool(),db=openDatabase(":memory:",false);let server:ReturnType<typeof createServer>|undefined;
 try{
  await reset(pool);const run=await scan(pool);await pool.query("UPDATE ad_observations SET payload_hash=NULL,observation_hash=NULL,last_confirmed_at=NULL WHERE run_id=$1",[run]);
  const legacy=(await observations(pool)).rows[0];await migrate(pool);await migrate(pool);assert.deepEqual((await observations(pool)).rows[0],legacy);
  await scan(pool);assert.equal((await observations(pool)).rowCount,1);assert.deepEqual((await observations(pool)).rows[0].raw_payload,legacy.raw_payload);
  for(let i=0;i<2;i++){
   await pool.query("UPDATE ad_observations SET reach=$1,observation_hash=NULL WHERE run_id=(SELECT run_id FROM ad_observations ORDER BY observed_at DESC LIMIT 1)",[publishedReach({eu_total_reach:999})]);
   await scan(pool);
  }
  const rows=(await observations(pool)).rows;assert.equal(rows.length,3);assert.equal(rows[1].raw_payload,null);assert.equal(rows[2].raw_payload,null);assert.equal(rows[1].raw_payload_run_id,run);assert.equal(rows[2].raw_payload_run_id,run,"payload pointers never form chains");assert.deepEqual(rows[0].raw_payload,legacy.raw_payload);
  const publicRows=await readPublicObservations(pool,"fixture");assert.equal(publicRows.length,1);assert.deepEqual(publicRows[0].raw_payload,legacy.raw_payload);
  await pool.query("UPDATE ad_observations SET last_confirmed_at=observed_at+interval '3 days' WHERE run_id=$1",[rows[2].run_id]);
  const fresh=await readPublicObservations(pool,"fixture"),creative=mergePublicEvidence([],fresh,{id:"fixture",name:"Fictional Candle House",domain:"fictional.example"},[])[0];assert.equal(countryReach(creative.publicReach),0);assert.equal(creative.copy,payload.ad_creative_bodies[0]);assert.equal(creative.observedAt,new Date(fresh[0].last_confirmed_at!).toISOString());
  const app=express();attachInfrastructure(app,db,()=>pool);server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const history=await (await fetch(base+"/api/public/meta/observations?workspaceId=fixture")).json();assert.equal(history.observations.length,3);assert.ok(history.observations.every((row:any)=>row.raw_payload.ad_creative_bodies[0]===payload.ad_creative_bodies[0]));
 }finally{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));db.close();await pool.end();}
});

test("workspace and watchlist revision boundaries remain visible; concurrent scans do not duplicate a state",async()=>{
 const pool=testPool();try{
  await reset(pool);await watchlist(pool,"other","other-workspace");await scan(pool);await scan(pool,[payload],"other");const before=(await observations(pool)).rows;
  await scan(pool);const other=(await observations(pool)).rows.find(row=>row.workspace_id==="other-workspace");assert.deepEqual(other!.last_confirmed_at,before.find(row=>row.workspace_id==="other-workspace")!.last_confirmed_at);
  await pool.query("UPDATE watchlists SET revision=2 WHERE id='own'");await scan(pool);assert.equal((await readPublicObservations(pool,"fixture")).length,1);assert.equal((await observations(pool)).rowCount,3);
  await pool.query("INSERT INTO watchlists(id,workspace_id,purpose,search_terms) VALUES('discovery','fixture','discovery','[\"fictional candles\"]')");await scan(pool,[payload],"discovery");assert.equal((await readPublicObservations(pool,"fixture")).length,1);
  await pool.query("UPDATE watchlists SET revision=3 WHERE id='own'");
  for(const run of ["concurrent-a","concurrent-b"])await pool.query("INSERT INTO collection_runs(id,watchlist_id,config) VALUES($1,'own',$2)",[run,{page_ids:["12"],search_terms:[],countries:["GB"],revision:3,purpose:"brand"}]);
  const second={...payload,id:"102"};
  await Promise.all([collectMetaPage(pool,"concurrent-a",connector([payload,second])),collectMetaPage(pool,"concurrent-b",connector([second,payload]))]);
  assert.equal((await pool.query("SELECT * FROM ad_observations WHERE run_id IN ('concurrent-a','concurrent-b')")).rowCount,2);assert.equal((await readPublicObservations(pool,"fixture")).length,2);
 }finally{await pool.end();}
});

test("page replay and duplicates confirm without appending; conflicting duplicates roll back the page and checkpoint",async()=>{
 const pool=testPool();try{
  await reset(pool);const run=await enqueueCollection(pool,"own");let second=false;
  const pages=new MetaLibraryConnector({token:"fixture-only",fetch:async()=>Response.json(second?{data:[{...payload,id:"102"},payload]}:{data:[payload],paging:{next:"https://graph.facebook.com/fixture-next",cursors:{after:"fixture-cursor"}}})});
  assert.equal((await collectMetaPage(pool,run,pages)).complete,false);second=true;
  await collectMetaPage(pool,run,pages);assert.equal((await observations(pool)).rowCount,2);await collectMetaPage(pool,run,pages);assert.equal((await observations(pool)).rowCount,2);
  const next=await enqueueCollection(pool,"own");second=false;await collectMetaPage(pool,next,pages);const before=(await observations(pool)).rows;
  const conflict=connector([{...payload,id:"100"},{...payload,ad_creative_bodies:["Conflicting state in the same fixture run"]}]);
  // The next run first confirms old evidence, then a changed state is valid; a second conflicting state in that same run is rejected.
  const changed=connector([{...payload,ad_creative_bodies:["First changed state" ]}]);await collectMetaPage(pool,next,changed);
  const third=await enqueueCollection(pool,"own");second=false;await collectMetaPage(pool,third,pages);
  await assert.rejects(collectMetaPage(pool,third,conflict),MetaCollectionError);assert.equal((await pool.query("SELECT cursor FROM collection_runs WHERE id=$1",[third])).rows[0].cursor,"fixture-cursor");assert.equal((await pool.query("SELECT * FROM ad_observations WHERE native_id='100'")).rowCount,0);assert.ok((await observations(pool)).rowCount!>=before.length);
 }finally{await pool.end();}
});

test("health checks retain one physical size sample per hour and disclose the actual daily-growth interval",async()=>{
 const pool=testPool(),db=openDatabase(":memory:",false),savedUrl=process.env.DATABASE_URL;let server:ReturnType<typeof createServer>|undefined;
 try{
  await reset(pool);const first=await databaseStorageHealth(pool);assert.equal(first.status,"available");assert.ok(first.sizeBytes!>0);assert.equal(first.growthBytesPerDay,null);
  await Promise.all(Array.from({length:8},()=>databaseStorageHealth(pool)));assert.equal((await pool.query("SELECT * FROM database_size_samples")).rowCount,1);
  await pool.query("INSERT INTO database_size_samples SELECT sample_hour-interval '48 hours',measured_at-interval '48 hours',size_bytes-4096 FROM database_size_samples");const second=await databaseStorageHealth(pool);assert.equal(second.growthBytesPerDay,2048);assert.equal(second.intervalHours,48);assert.equal(second.measuredAt,first.measuredAt);
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  let unavailable=false;
  const checkedPool={query:(sql:string,args?:unknown[])=>unavailable&&sql.includes("database_size_samples")?Promise.reject(new Error("private-fixture-driver-error")):pool.query(sql,args),connect:()=>pool.connect()} as unknown as pg.Pool;
  const app=express();attachInfrastructure(app,db,()=>checkedPool);server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const status=await (await fetch(base+"/api/infrastructure/status")).json();assert.equal(status.database,"connected");assert.equal(status.storage.growthBytesPerDay,2048);assert.ok(!JSON.stringify(status.storage).includes("TEST_DATABASE_URL"));
  unavailable=true;const failure=await (await fetch(base+"/api/infrastructure/status")).json();assert.equal(failure.database,"connected");assert.equal(failure.storage.status,"unavailable");assert.equal(failure.storage.sizeBytes,null);assert.ok(!JSON.stringify(failure).includes("private-fixture"));
  delete process.env.DATABASE_URL;const missing=await (await fetch(base+"/api/infrastructure/status")).json();assert.equal(missing.database,"not_configured");assert.equal(missing.storage.sizeBytes,null);assert.equal(missing.storage.growthBytesPerDay,null);
 }finally{if(savedUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=savedUrl;if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));db.close();await pool.end();}
});
