import { attachAccuracy } from "../server/accuracy/api.js";
// Local disposable Postgres and recorded provider fixtures only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import pg from "pg";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { migrate } from "../server/infrastructure/database.js";
import { reserveCost } from "../server/infrastructure/budget.js";
import { attachCreatorDiscovery } from "../server/creators/discovery-api.js";
import { enqueueCreatorDiscovery, workCreatorDiscoveryOnce, scheduleCreatorRefresh } from "../server/creators/discovery-jobs.js";
import { briefDigest, discoveryBatchCount, discoverySnapshot, upsertDiscoveryProfile, deleteDiscoveryCreator } from "../server/creators/discovery-store.js";
import { CreatorProviderError } from "../server/creators/types.js";
import { CreatorVerificationError } from "../server/creators/discovery-provider.js";
import { creatorBrief, creatorProfile } from "./fixtures/creator-discovery.js";
import type { CreatorBrief, DiscoveryProfile } from "../shared/creator-discovery.js";
import { retainCreatorPreviews } from "../server/creators/discovery-previews.js";

const env={APIFY_TOKEN:"fixture-not-a-provider-key",APIFY_INSTAGRAM_ACTOR_ID:"apify/instagram-scraper",APIFY_REQUEST_RESERVE_GBP:"0.1",EXTER_AD_MEDIA_GBP_PER_USD:"0.8",EXTER_INSTAGRAM_ACCESS_TOKEN:"fixture-not-an-official-key",EXTER_INSTAGRAM_ACCOUNT_ID:"123"};
test("creator API, queue, budgets, monthly refresh, deletion and precision use isolated durable fixtures",async()=>{
 const connectionString=process.env.TEST_DATABASE_URL;assert.ok(connectionString,"Use a dedicated local fixture database.");
 const admin=new pg.Pool({connectionString}),schema=`creator_fixture_${randomUUID().replaceAll("-","")}`;await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString,options:`-c search_path=${schema},public`,max:5});const db=openDatabase(":memory:",false);
 const app=express();app.use(express.json());const authEnv={EXTER_ADMIN_USER:"fixture-owner",EXTER_ADMIN_PASSWORD:"fixture-password"};app.use(basicAuth(authEnv));
 const at=new Date();
 for(const id of ["one","two","budget","crash","permission"]){db.prepare("INSERT INTO brands VALUES(?,?)").run(id,JSON.stringify({id,name:"Fictional Candle Studio",mode:"imported"}));}
 db.prepare("INSERT INTO brands VALUES(?,?)").run("sample",JSON.stringify({id:"sample",name:"Fictional sample",mode:"demo"}));
 attachCreatorDiscovery(app,db,{pool,env,now:()=>at,fixtureLabels:true,labels:async()=>"handle,good_fit,is_uk,notes\nfixture_creator,yes,yes,\n"});
 attachAccuracy(app,db,{getPool:()=>pool,now:()=>at});
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const origin=`http://127.0.0.1:${(server.address() as any).port}`;
 const auth="Basic "+Buffer.from("fixture-owner:fixture-password").toString("base64");
 async function call(path:string,body?:unknown,headers:Record<string,string>={}){const r=await fetch(origin+path,{method:body?"POST":"GET",headers:{Authorization:auth,...(body?{"Content-Type":"application/json",Origin:origin}:{}),...headers},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json().catch(()=>null)};}
 let paidCalls=0,verifiedCalls=0;
 const raw=(handle:string)=>({username:handle,fullName:"Harper Rowan",private:false,businessCategoryName:"Digital creator",biography:creatorProfile().bio,externalUrl:"https://fixture-example.co.uk/blog",relatedProfiles:handle==="fixture_seed"?[{username:"fixture_lookalike"}]:[],latestPosts:creatorProfile().posts.map(p=>({id:p.id,url:p.url,timestamp:p.at,caption:p.caption,alt:p.altText,locationName:p.location}))});
 const discovery={researchConfiguration:()=>({configured:true,reserveGbp:.1,conversion:.8,reason:"Fixture"}),collectPublic:async(input:Record<string,unknown>,max:number)=>{paidCalls++;await reserveCost(pool,"data_providers","fixture",.1);const urls=input.directUrls as string[]|undefined,handles=input.resultsType==="details"&&urls?urls.map(u=>new URL(u).pathname.replaceAll("/","")):Array.from({length:Math.min(max,40)},(_,i)=>`fixture_${i}`);return{rows:handles.map(raw),accounting:{reservedCostGbp:.1,billedCostGbp:null as null,requestAttempts:1,runIds:["fixture-run"]}};}};
 const verifier={configured:()=>true,verify:async(p:DiscoveryProfile)=>{verifiedCalls++;return creatorProfile({handle:p.handle,appearsInAds:p.appearsInAds});}};
 const work=()=>workCreatorDiscoveryOnce(pool,{env,discovery,verifier,paceMs:0,now:()=>at});
 async function quote(id:string,brief:CreatorBrief=creatorBrief){const r=await call("/api/creator-discovery/quote",{workspaceId:id,brief});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
 try{
  await migrate(pool);await migrate(pool);await pool.query("UPDATE budget_settings SET monthly_budget_gbp=100");
  assert.equal((await call("/api/creator-discovery?workspaceId=one",undefined,{Authorization:""})).status,401);
  assert.equal((await call("/api/creator-discovery/quote",{workspaceId:"one",brief:creatorBrief},{Origin:"https://wrong.example"})).status,403);
  assert.equal((await call("/api/creator-discovery?workspaceId=sample")).status,422);assert.equal(paidCalls,0);
  db.prepare("INSERT INTO ads VALUES(?,?,?,?,?,?)").run("public:Meta:fixture-ad","one","public","Meta","2026-11-10",JSON.stringify({videoAnalysis:{fields:{creatorEvidence:[{kind:"visible-creator-handle",value:"@fixture_ad_creator",timestamps:[{startSeconds:1,endSeconds:2}]}]}}}));
  const q=await quote("one");assert.equal(q.maxCostGbp,discoveryBatchCount(creatorBrief)*.1);
  assert.equal((await call("/api/creator-discovery/run",{workspaceId:"one",quoteId:q.id})).status,202);
  assert.equal((await call("/api/creator-discovery/run",{workspaceId:"one",quoteId:q.id})).status,409);
  for(let i=0;i<100;i++){if(!await work())break;const s=await discoverySnapshot(pool,"one");if(s.runs[0].status==="complete")break;}
  const s=await discoverySnapshot(pool,"one");assert.equal(s.runs[0].status,"complete",JSON.stringify(s.runs));assert.ok(s.creators.length>=8);assert.ok(s.creators.some(c=>c.profile.handle==="fixture_lookalike"));assert.ok(s.creators.some(c=>c.profile.handle==="fixture_ad_creator"&&c.profile.appearsInAds.includes("public:Meta:fixture-ad")));assert.ok(s.creators.every(c=>c.profile.verification==="Verified"));assert.ok(s.runs[0].reservedGbp<=q.maxCostGbp+.000001);assert.ok(paidCalls<=q.batches);assert.ok(verifiedCalls>=8);
  assert.equal((await call("/api/creator-discovery?workspaceId=two")).body.creators.length,0);
  const saved=s.creators[0];assert.equal((await call("/api/creator-discovery/save",{workspaceId:"one",handle:saved.profile.handle,saved:true})).status,200);
  assert.equal((await call("/api/creator-discovery/segments",{workspaceId:"one",name:"UK micro",filters:{uk:"High",tier:"Micro"}})).status,201);assert.ok((await discoverySnapshot(pool,"one")).segments[0].count>=8);
  const labels=await call("/api/creator-discovery/validate",{workspaceId:"one"});assert.equal(labels.status,200);assert.ok(labels.body.every((c:any)=>!c.clientReady));
  const accuracy=await call("/api/accuracy?workspaceId=one");assert.equal(accuracy.status,200);assert.ok(accuracy.body.rows.some((r:any)=>r.field==="Individual creator precision" && r.status!=="Live" && r.detail.includes("85%")));
  const preview=await retainCreatorPreviews(pool,"one",{...saved.profile,posts:[{...saved.profile.posts[0],thumbnail:"https://scontent.cdninstagram.com/fixture.png"}]},{resolve:async()=>[{address:"93.184.216.34",family:4}],fetch:async()=>new Response(Buffer.from([137,80,78,71,13,10,26,10,0]),{headers:{"Content-Type":"image/png"}}),convert:async()=>Buffer.from([137,80,78,71,13,10,26,10,1])});assert.ok(preview.posts[0].thumbnail?.startsWith("/api/creator-discovery/preview?"));
  const paidBefore=paidCalls;await scheduleCreatorRefresh(pool,new Date("2026-11-30"),env);assert.equal(await work(),false);await scheduleCreatorRefresh(pool,new Date("2026-12-11"),env);assert.ok((await discoverySnapshot(pool,"one")).runs.some(r=>r.kind==="refresh"));for(let i=0;i<5;i++)await work();assert.equal(paidCalls,paidBefore);
  await deleteDiscoveryCreator(pool,"one",saved.profile.handle);assert.equal(await upsertDiscoveryProfile(pool,"one",saved.profile,creatorBrief,briefDigest(creatorBrief),true,at.toISOString()),false);assert.equal((await pool.query("SELECT 1 FROM creator_discovery_previews WHERE workspace_id='one' AND handle=$1",[saved.profile.handle])).rowCount,0);assert.equal((await discoverySnapshot(pool,"one")).creators.some(c=>c.profile.handle===saved.profile.handle),false);
  await deleteDiscoveryCreator(pool,"one","fixture_seed");const afterSeed=await discoverySnapshot(pool,"one");assert.ok(!afterSeed.brief!.seeds.includes("fixture_seed"));assert.notEqual(afterSeed.briefVersion,briefDigest(creatorBrief));assert.ok(afterSeed.creators.every(c=>c.briefVersion===afterSeed.briefVersion&&c.evaluation.parts.find(p=>p.key==="seeds")!.points===null));
  const repeat=await quote("one",{...creatorBrief,keywords:["home fragrance","different category"],hashtags:[],seeds:[],target:5});await enqueueCreatorDiscovery(pool,"one",repeat.id);
  await workCreatorDiscoveryOnce(pool,{env,discovery:{...discovery,collectPublic:async()=>({rows:[raw("fixture_new_search")],accounting:{reservedCostGbp:.1,billedCostGbp:null,requestAttempts:1,runIds:[]}})},verifier,paceMs:0});
  assert.ok((await discoverySnapshot(pool,"one")).creators.some(c=>c.profile.handle==="fixture_new_search"));for(let i=0;i<8;i++)await work();assert.equal((await discoverySnapshot(pool,"one")).creators.find(c=>c.profile.handle==="fixture_new_search")!.profile.verification,"Verified");await pool.query("UPDATE creator_discovery_runs SET status='cancelled' WHERE workspace_id='one' AND status IN ('queued','running')");
  await pool.query("INSERT INTO creator_discovery_settings(workspace_id,brief,brief_version) VALUES('strict',$1,$2)",[JSON.stringify(creatorBrief),briefDigest(creatorBrief)]);
  db.prepare("INSERT INTO brands VALUES(?,?)").run("strict",JSON.stringify({id:"strict",name:"Fictional fixture",mode:"imported"}));
  const strictVersion=briefDigest(creatorBrief);
  for(const p of [creatorProfile({handle:"fixture_pass"}),creatorProfile({handle:"fixture_review",growth:undefined}),creatorProfile({handle:"fixture_business",accountKind:"brand"}),creatorProfile({handle:"fixture_repost",accountKind:"repost"})])await upsertDiscoveryProfile(pool,"strict",p,creatorBrief,strictVersion,true,at.toISOString());
  let strict=await discoverySnapshot(pool,"strict");assert.equal(strict.creators.length,2);assert.equal(strict.rejected.length,2);assert.ok(strict.rejected.some(r=>r.evaluation.screen.rejectedReasons.includes("Business page")));assert.ok(strict.rejected.some(r=>r.evaluation.screen.rejectedReasons.includes("Repost page")));
  await upsertDiscoveryProfile(pool,"strict",creatorProfile({handle:"fixture_stale_history"}),creatorBrief,strictVersion,true,at.toISOString());
  await upsertDiscoveryProfile(pool,"strict",creatorProfile({handle:"fixture_stale_history",followers:200000}),creatorBrief,strictVersion,true,at.toISOString());
  assert.equal(await upsertDiscoveryProfile(pool,"strict",creatorProfile({handle:"fixture_stale_history"}),creatorBrief,strictVersion,false,at.toISOString()),false);
  const aged=await discoverySnapshot(pool,"strict",new Date(at.getTime()+2*86400000));assert.ok(!aged.creators.some(c=>c.profile.handle==="fixture_stale_history"));assert.ok(aged.rejected.some(c=>c.handle==="fixture_stale_history"));assert.equal((await pool.query("SELECT official_followers::int AS followers FROM creator_discovery_rejected WHERE workspace_id='strict' AND handle='fixture_stale_history'")).rows[0].followers,200000);
  await deleteDiscoveryCreator(pool,"strict","fixture_stale_history");
  const minimal=(await pool.query("SELECT * FROM creator_discovery_rejected WHERE workspace_id='strict' LIMIT 1")).rows[0];assert.ok(!("profile" in minimal));assert.ok(!JSON.stringify(minimal).includes("home fragrance tutorials"));
  for(const handle of ["fixture_review","fixture_business","fixture_repost"])assert.equal((await call("/api/creator-discovery/save",{workspaceId:"strict",handle,saved:true})).status,409);
  const exported=await fetch(origin+"/api/creator-discovery/export?workspaceId=strict",{headers:{Authorization:auth}});const exportText=await exported.text();assert.ok(exportText.includes("fixture_pass"));assert.ok(!exportText.includes("fixture_review"));assert.ok(!exportText.includes("fixture_business"));
  await call("/api/creator-discovery/segments",{workspaceId:"strict",name:"Qualified only",filters:{}});assert.equal((await discoverySnapshot(pool,"strict")).segments[0].count,1);
  await pool.query("UPDATE creator_discovery_results SET evaluation=jsonb_set(evaluation,'{ruleVersion}','\"creator-discovery-v1\"'),brief_version='legacy' WHERE workspace_id='strict' AND handle='fixture_pass'");
  const paidBeforeRescreen=paidCalls;strict=await discoverySnapshot(pool,"strict");assert.equal(paidCalls,paidBeforeRescreen);assert.equal(strict.creators.find(c=>c.profile.handle==="fixture_pass")!.evaluation.ruleVersion,"creator-discovery-v2-strict");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM creator_discovery_results WHERE workspace_id='strict'")).rows[0].n,2);
  await pool.query("UPDATE creator_discovery_settings SET brief_version='legacy-v1' WHERE workspace_id='strict'");
  const obsoleteJob=randomUUID();await pool.query("INSERT INTO creator_discovery_runs(id,workspace_id,kind,brief,brief_version,steps) VALUES($1,'strict','discovery',$2,'legacy-v1','[]')",[obsoleteJob,JSON.stringify(creatorBrief)]);
  await discoverySnapshot(pool,"strict");assert.equal((await pool.query("SELECT status FROM creator_discovery_runs WHERE id=$1",[obsoleteJob])).rows[0].status,"cancelled");assert.equal(paidCalls,paidBeforeRescreen);
  await deleteDiscoveryCreator(pool,"strict","fixture_business");assert.equal((await discoverySnapshot(pool,"strict")).rejected.length,1);
  const large=await quote("two",{...creatorBrief,target:1000});assert.ok(large.batches>=51);
  const qb=await quote("budget");await enqueueCreatorDiscovery(pool,"budget",qb.id);await workCreatorDiscoveryOnce(pool,{env,discovery:{...discovery,collectPublic:async()=>{throw new CreatorProviderError("budget_paused","Budget paused.");}},verifier});assert.equal((await discoverySnapshot(pool,"budget")).runs[0].status,"paused");
  const qc=await quote("crash");const crash=await enqueueCreatorDiscovery(pool,"crash",qc.id);await pool.query("UPDATE creator_discovery_runs SET dispatch_started=true WHERE id=$1",[crash]);const calls=paidCalls;await work();assert.equal(paidCalls,calls);assert.equal((await discoverySnapshot(pool,"crash")).runs[0].status,"failed");
  await upsertDiscoveryProfile(pool,"two",creatorProfile({handle:"fixture_expired"}),creatorBrief,briefDigest(creatorBrief),true,at.toISOString());await pool.query("UPDATE creator_discovery_results SET used_at=now()-interval '91 days' WHERE workspace_id='two'");await scheduleCreatorRefresh(pool,new Date(),{});assert.equal((await pool.query("SELECT 1 FROM creator_discovery_results WHERE workspace_id='two'")).rowCount,0);
  const qp=await quote("permission");const permission=await enqueueCreatorDiscovery(pool,"permission",qp.id);await upsertDiscoveryProfile(pool,"permission",creatorProfile(),creatorBrief,briefDigest(creatorBrief),true,at.toISOString());await pool.query("UPDATE creator_discovery_runs SET steps=$2,phase='verify' WHERE id=$1",[permission,JSON.stringify([{kind:"verify",value:"fixture_creator"}])]);await workCreatorDiscoveryOnce(pool,{env,discovery,verifier:{configured:()=>true,verify:async()=>{throw new CreatorVerificationError("permissions");}},paceMs:0});assert.equal((await discoverySnapshot(pool,"permission")).runs[0].status,"paused");assert.equal((await discoverySnapshot(pool,"permission")).creators[0].profile.verification,"Unverified");
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
