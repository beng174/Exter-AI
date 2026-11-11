// Disposable Postgres, local HTTP and fictional provider responses only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import pg from "pg";
import { openDatabase } from "../server/db.js";
import { migrate } from "../server/infrastructure/database.js";
import { attachCreatorDiscovery } from "../server/creators/discovery-api.js";
import { ApifyCreatorProvider } from "../server/creators/apify.js";
import { briefDigest, discoverySnapshot } from "../server/creators/discovery-store.js";
import { workCreatorDiscoveryOnce } from "../server/creators/discovery-jobs.js";
import { CREATOR_RULE_VERSION, evaluateCreator, type DiscoveryProfile } from "../shared/creator-discovery.js";
import { creatorBrief, creatorProfile } from "./fixtures/creator-discovery.js";
const env={APIFY_TOKEN:"fixture-first-provider",APIFY_INSTAGRAM_ACTOR_ID:"apify/instagram-scraper",APIFY_REQUEST_RESERVE_GBP:"0.75",EXTER_AD_MEDIA_GBP_PER_USD:"0.8"};
test("saved results rescreen without paid work; stop drains partial data and settles only real usage",async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;assert.ok(connectionString);
  const admin=new pg.Pool({connectionString}),schema=`creator_first_${randomUUID().replaceAll("-","")}`;await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString,options:`-c search_path=${schema},public`,max:5}),db=openDatabase(":memory:",false),now=new Date();
  for(const id of ["saved","stop","queued","other"])db.prepare("INSERT INTO brands VALUES(?,?)").run(id,JSON.stringify({id,name:"Hearth Box",mode:"imported",category:"candles",primaryCategories:["home fragrance","candles"],competitors:["Birch Glow","Reed Garden","Willow Scent"]}));
  const app=express();app.use(express.json());attachCreatorDiscovery(app,db,{pool,env,now:()=>now});
  const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const call=async(path:string,body?:unknown)=>{const response=await fetch(origin+path,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json",Origin:origin}:{},body:body?JSON.stringify(body):undefined});return{status:response.status,body:await response.json()};};
  try{
    await migrate(pool);await migrate(pool);await pool.query("UPDATE budget_settings SET monthly_budget_gbp=100");
    const brief={...creatorBrief,minFollowers:5000,seeds:[]},version=briefDigest(brief);
    await pool.query("INSERT INTO creator_discovery_settings(workspace_id,brief,brief_version) VALUES('saved',$1,'old-rules')",[JSON.stringify(brief)]);
    const observed=(patch:Partial<DiscoveryProfile>)=>creatorProfile({verification:"Observed (public profile)",growth:{...creatorProfile().growth!,source:"Observed (public profile)"},...patch});
    const profiles=[observed({handle:"genuine_person"}),observed({handle:"01londonclothing",name:"London Clothing",bio:"UK clothing shop",screening:{...creatorProfile().screening!,category:"Clothing store"}}),observed({handle:"anika16115",followers:1000,verification:"Unverified"}),observed({handle:"low_follower",followers:50}),observed({handle:"brand_page",accountKind:"brand"}),observed({handle:"unknown_count",followers:null}),observed({handle:"founder_person",bio:"I am a UK creator and founder of my shop. My favourite candles tutorial.",screening:{...creatorProfile().screening!,shopOwner:true,linkKind:"shop"}})];
    for(const profile of profiles){const evaluation={...evaluateCreator(creatorProfile(),brief,[],now),ruleVersion:"old-rules"};await pool.query("INSERT INTO creator_discovery_results(workspace_id,handle,profile,evaluation,brief_version) VALUES('saved',$1,$2,$3,'old-rules')",[profile.handle,JSON.stringify(profile),JSON.stringify(evaluation)]);}
    const snapshot=(await call("/api/creator-discovery?workspaceId=saved")).body;
    assert.equal(snapshot.briefVersion,version);assert.equal(snapshot.creators.length,2);assert.equal(snapshot.rejected.length,5);
    assert.equal(snapshot.creators.find((r:any)=>r.profile.handle==="genuine_person").evaluation.screen.disposition,"Results");
    assert.equal(snapshot.creators.find((r:any)=>r.profile.handle==="founder_person").evaluation.screen.disposition,"Needs review");
    for(const handle of ["01londonclothing","anika16115"]){const rejected=snapshot.rejected.find((r:any)=>r.handle===handle);assert.ok(rejected);assert.equal(rejected.evaluation.ruleVersion,CREATOR_RULE_VERSION);}
    assert.ok(snapshot.rejected.find((r:any)=>r.handle==="anika16115").evaluation.screen.rejectedReasons.includes("Outside follower range"));
    assert.ok(snapshot.suggestions.hashtags.length>=10);assert.equal(snapshot.suggestions.competitors.length,3);
    assert.equal((await call("/api/creator-discovery/rescreen",{workspaceId:"saved"})).status,200);
    const dated=(await pool.query("SELECT profile FROM creator_discovery_results WHERE workspace_id='saved' AND handle='genuine_person'")).rows[0].profile;
    assert.equal(dated.checkedAt,profiles[0].checkedAt);assert.equal(dated.verification,"Observed (public profile)");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM cost_ledger")).rows[0].n,0);

    const start=async(workspaceId:string)=>{const q=await call("/api/creator-discovery/quote",{workspaceId,brief});assert.equal(q.status,200);const r=await call("/api/creator-discovery/run",{workspaceId,quoteId:q.body.id});assert.equal(r.status,202);return r.body.id as string;};
    const queued=await start("queued");assert.equal((await call("/api/creator-discovery/stop",{workspaceId:"other",searchId:queued})).status,409);
    assert.equal((await call("/api/creator-discovery/stop",{workspaceId:"queued",searchId:queued})).status,202);
    const never={researchConfiguration:()=>({configured:true,reserveGbp:.75,conversion:.8,reason:"Fixture"}),collectPublic:async()=>{throw new Error("Stopped queued work must not start a paid run");}};
    await workCreatorDiscoveryOnce(pool,{env,discovery:never});assert.equal((await discoverySnapshot(pool,"queued",now)).runs[0].status,"cancelled");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM cost_ledger")).rows[0].n,0);

    const searchId=await start("stop");let starts=0,aborts=0,reads=0,deletes=0,stopSent=false;
    const run={id:"fixture-stop-run",status:"RUNNING",defaultDatasetId:"fixture-stop-data"};
    const provider=new ApifyCreatorProvider({env,pool,sleep:async()=>{},progress:async row=>{if(!stopSent && row.runId){stopSent=true;assert.equal((await call("/api/creator-discovery/stop",{workspaceId:"stop",searchId})).status,202);}},fetch:async(input,init)=>{
      const u=new URL(String(input));assert.equal(new Headers(init?.headers).get("Authorization"),`Bearer ${env.APIFY_TOKEN}`);assert.ok(!u.href.includes(env.APIFY_TOKEN));
      if(u.pathname.endsWith("/runs")){starts++;return Response.json({data:run});}
      if(u.pathname.endsWith("/abort")){aborts++;assert.equal(init?.method,"POST");return Response.json({data:{...run,status:"ABORTED",usageTotalUsd:.125}});}
      if(init?.method==="DELETE"){deletes++;return new Response(null,{status:204});}
      if(u.pathname.endsWith("/items")){reads++;return Response.json([{ownerUsername:"partial_person",ownerFullName:"Harper Rowan",caption:"#ad @fictional_shop candles tutorial",shortCode:"partial",timestamp:now.toISOString()}]);}
      if(u.pathname.includes("actor-runs"))return Response.json({data:{...run,status:"ABORTED",usageTotalUsd:.125}});
      return Response.json({data:{itemCount:1}});
    }});
    await workCreatorDiscoveryOnce(pool,{env,discovery:provider,now:()=>now});
    const stopped=await discoverySnapshot(pool,"stop",now);assert.equal(stopped.runs[0].status,"cancelled");assert.equal(stopped.runs[0].stopRequested,true);
    assert.equal(starts,1);assert.equal(aborts,1);assert.equal(reads,1);assert.equal(deletes,1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM creator_discovery_results WHERE workspace_id='stop' AND handle='partial_person'")).rows[0].n,1);
    const cost=(await pool.query("SELECT * FROM cost_ledger WHERE provider='apify'")).rows[0];assert.equal(cost.status,"settled");assert.equal(Number(cost.cost_gbp),.1);assert.equal(Number(cost.initial_reserved_gbp),.75);
    assert.equal(await workCreatorDiscoveryOnce(pool,{env,discovery:provider}),false);assert.equal(starts,1);
    assert.equal((await call("/api/creator-discovery/stop",{workspaceId:"stop",searchId})).status,202);
  }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
