// Disposable local database and recorded provider replies only.
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import express from "express";
import pg from "pg";
import {openDatabase} from "../server/db.js";
import {migrate} from "../server/infrastructure/database.js";
import {reserveCost} from "../server/infrastructure/budget.js";
import {basicAuth} from "../server/auth.js";
import {attachCreatorDiscovery} from "../server/creators/discovery-api.js";
import {workCreatorDiscoveryOnce} from "../server/creators/discovery-jobs.js";
import {ApifyCreatorProvider} from "../server/creators/apify.js";
import {actorDiscoveryInput,briefDigest,discoverySteps,discoverySnapshot} from "../server/creators/discovery-store.js";
import {creatorBrief} from "./fixtures/creator-discovery.js";
const env={APIFY_TOKEN:"fixture-recovery-provider",APIFY_INSTAGRAM_ACTOR_ID:"apify/instagram-scraper",APIFY_REQUEST_RESERVE_GBP:"0.75",EXTER_AD_MEDIA_GBP_PER_USD:"0.8"};
test("durable runs resume without a paid restart, save partial data, settle usage and reconcile old holds",async()=>{
 const connectionString=process.env.TEST_DATABASE_URL;assert.ok(connectionString);
 const admin=new pg.Pool({connectionString}),schema=`creator_recovery_${randomUUID().replaceAll("-","")}`;await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString,options:`-c search_path=${schema},public`,max:6}),db=openDatabase(":memory:",false);
 for(const id of ["recover","legacy","sample"])db.prepare("INSERT INTO brands VALUES(?,?)").run(id,JSON.stringify({id,name:"Fictional recovery brand",mode:id==="sample"?"demo":"imported"}));
 const app=express();app.use(express.json());app.use(basicAuth({EXTER_ADMIN_USER:"fixture-owner",EXTER_ADMIN_PASSWORD:"fixture-pass"}));attachCreatorDiscovery(app,db,{pool,env});
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const origin=`http://127.0.0.1:${(server.address() as any).port}`,auth="Basic "+Buffer.from("fixture-owner:fixture-pass").toString("base64");
 const call=async(path:string,body?:unknown,headers:Record<string,string>={})=>{const r=await fetch(origin+path,{method:body?"POST":"GET",headers:{Authorization:auth,...(body?{"Content-Type":"application/json",Origin:origin}:{}),...headers},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json()};};
 let starts=0,statusReads=0,deletes=0,temporary=true,pendingOnly=false,checkedLive=false,searchId="";const legacyRuns=new Map<string,Record<string,unknown>>();
 const provider:ApifyCreatorProvider=new ApifyCreatorProvider({env,pool,sleep:async():Promise<void>=>{
  if(!checkedLive&&searchId){checkedLive=true;await pool.query("UPDATE creator_discovery_runs SET lease_until=now()+interval '20 milliseconds' WHERE id=$1",[searchId]);await new Promise(r=>setTimeout(r,75));
   assert.equal(await workCreatorDiscoveryOnce(pool,{env,discovery:provider}),false,"heartbeat must keep another worker from claiming a paid step");
   const snapshot=await call("/api/creator-discovery?workspaceId=recover");assert.equal(snapshot.body.runs[0].providerRuns[0].found,2);
  }
 },fetch:async(input,init)=>{
  const u=new URL(String(input));assert.equal(new Headers(init?.headers).get("Authorization"),`Bearer ${env.APIFY_TOKEN}`);assert.ok(!u.href.includes(env.APIFY_TOKEN));
  if(u.pathname.endsWith("/runs")){starts++;assert.equal(u.searchParams.get("timeout"),"900");return Response.json({data:{id:`fixture-run-${starts}`,status:"RUNNING",defaultDatasetId:`fixture-data-${starts}`}});}
  if(init?.method==="DELETE"){deletes++;return new Response(null,{status:204});}
  if(u.pathname==="/v2/acts/apify~instagram-scraper")return Response.json({data:{id:"fixture-actor"}});
  if(u.pathname.includes("key-value-stores"))return Response.json(actorDiscoveryInput(discoverySteps(creatorBrief)[0],"GB",8));
  if(u.pathname.includes("actor-runs")){const id=u.pathname.split("/").at(-1)!;if(legacyRuns.has(id))return Response.json({data:legacyRuns.get(id)});statusReads++;if(temporary)return Response.json({},{status:500});return Response.json({data:{id,status:pendingOnly?"RUNNING":"TIMED-OUT",defaultDatasetId:id.replace("run","data"),usageTotalUsd:id.endsWith("1")?.125:.25}});}
  if(u.pathname.endsWith("/items"))return Response.json([{username:"fixture_partial_one",private:false},{username:"fixture_partial_two",private:false}]);
  return Response.json({data:{itemCount:2}});
 }});
 try{
  await migrate(pool);await migrate(pool);await pool.query("UPDATE budget_settings SET monthly_budget_gbp=100");
  const quote=await call("/api/creator-discovery/quote",{workspaceId:"recover",brief:creatorBrief});assert.equal(quote.status,200);
  const started=await call("/api/creator-discovery/run",{workspaceId:"recover",quoteId:quote.body.id});searchId=started.body.id;
  await workCreatorDiscoveryOnce(pool,{env,discovery:provider,heartbeatMs:5});
  assert.equal(starts,1);assert.equal(statusReads,6);assert.ok(checkedLive);
  let row=(await pool.query("SELECT * FROM creator_discovery_runs WHERE id=$1",[searchId])).rows[0];assert.equal(row.status,"queued");assert.equal(row.step,0);
  const hold=(await pool.query("SELECT * FROM cost_ledger WHERE provider='apify'")).rows[0];assert.equal(hold.status,"reserved");
  temporary=false;pendingOnly=true;
  await call("/api/creator-discovery/reconcile",{workspaceId:"recover",searchId});await workCreatorDiscoveryOnce(pool,{env,discovery:provider});
  assert.equal((await pool.query("SELECT status FROM cost_ledger WHERE id=$1",[hold.id])).rows[0].status,"reserved","a running provider total cannot release its hold");assert.equal(starts,1);
  pendingOnly=false;await pool.query("UPDATE creator_discovery_runs SET available_at=now() WHERE id=$1",[searchId]);await workCreatorDiscoveryOnce(pool,{env,discovery:provider});
  row=(await pool.query("SELECT * FROM creator_discovery_runs WHERE id=$1",[searchId])).rows[0];assert.equal(row.step,1);assert.equal(starts,1);assert.equal(deletes,1);
  let cost=(await pool.query("SELECT * FROM cost_ledger WHERE id=$1",[hold.id])).rows[0];assert.equal(Number(cost.cost_gbp),.1);assert.equal(Number(cost.initial_reserved_gbp),.75);assert.equal(cost.status,"settled");assert.equal(cost.cost_basis,"observed");
  assert.equal((await discoverySnapshot(pool,"recover")).creators.length,2);
  await workCreatorDiscoveryOnce(pool,{env,discovery:provider});assert.equal(starts,2,"the next step can run after partial results are saved");
  for(let n=0;n<2;n++){assert.equal((await call("/api/creator-discovery/reconcile",{workspaceId:"recover",searchId})).status,202);await workCreatorDiscoveryOnce(pool,{env,discovery:provider});}
  assert.equal(starts,2);assert.equal((await pool.query("SELECT count(*)::int AS n FROM cost_ledger WHERE provider='apify'")).rows[0].n,2);
  assert.equal((await call("/api/creator-discovery/reconcile",{workspaceId:"sample",searchId})).status,409);
  assert.equal((await call("/api/creator-discovery/reconcile",{workspaceId:"recover",searchId},{Origin:"https://other.example"})).status,403);
  await pool.query("UPDATE creator_discovery_runs SET status='cancelled' WHERE id=$1",[searchId]);
  const legacyHold=await reserveCost(pool,"data_providers","apify",.75),at=(await pool.query("SELECT created_at FROM cost_ledger WHERE id=$1",[legacyHold])).rows[0].created_at as Date,legacyId=randomUUID();
  await pool.query("INSERT INTO creator_discovery_runs(id,workspace_id,kind,status,brief,brief_version,steps,created_at,available_at,reserved_gbp,conversion) VALUES($1,'legacy','discovery','failed',$2,$3,$4,$5,$6,.75,.8)",[legacyId,JSON.stringify(creatorBrief),briefDigest(creatorBrief),JSON.stringify(discoverySteps(creatorBrief)),new Date(at.getTime()-1000),new Date(at.getTime()+5000)]);
  legacyRuns.set("fixture-legacy",{id:"fixture-legacy",actId:"fixture-actor",defaultKeyValueStoreId:"fixture-input",defaultDatasetId:"fixture-legacy-data",status:"ABORTED",startedAt:new Date(at.getTime()+1000).toISOString(),usageTotalUsd:.05});
  assert.equal((await call("/api/creator-discovery/reconcile",{workspaceId:"legacy",searchId:legacyId,mappings:[{reservationId:legacyHold,actorRunId:"fixture-legacy"}]})).status,202);
  await workCreatorDiscoveryOnce(pool,{env,discovery:provider});cost=(await pool.query("SELECT * FROM cost_ledger WHERE id=$1",[legacyHold])).rows[0];assert.equal(Number(cost.cost_gbp),.04);assert.equal(cost.status,"settled");assert.equal(starts,2);
  const legacy=(await discoverySnapshot(pool,"legacy")).runs[0];assert.equal(legacy.providerRuns![0].runId,"fixture-legacy");assert.match(legacy.reconcileNote!,/1 charges checked/);
  const badHold=await reserveCost(pool,"data_providers","apify",.75);legacyRuns.set("fixture-unrelated",{...legacyRuns.get("fixture-legacy"),id:"fixture-unrelated",actId:"other-actor"});
  await pool.query("UPDATE creator_discovery_runs SET reconcile_window_end=now()+interval '5 seconds' WHERE id=$1",[legacyId]);
  await call("/api/creator-discovery/reconcile",{workspaceId:"legacy",searchId:legacyId,mappings:[{reservationId:badHold,actorRunId:"fixture-unrelated"}]});await workCreatorDiscoveryOnce(pool,{env,discovery:provider});
  assert.equal((await pool.query("SELECT status FROM cost_ledger WHERE id=$1",[badHold])).rows[0].status,"reserved");assert.equal(starts,2);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
