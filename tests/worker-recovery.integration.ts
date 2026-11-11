import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import express from "express";
import pg from "pg";
import {creativeFixture} from "./fixtures/creative-sql.js";
import {workerCycle,runWorkerLoop,type WorkerTask} from "../server/infrastructure/worker-loop.js";
import {readWorkerFailures,recordWorkerFailure,retryWorkerFailure} from "../server/infrastructure/worker-recovery.js";
import {workerDiagnostic} from "../server/infrastructure/worker-diagnostics.js";
import {workOnboardingOnce} from "../server/onboarding/worker.js";
import {claimOnboarding} from "../server/onboarding/queue.js";
import {workAdMediaOnce} from "../server/ad-media/api.js";
import {claimAdMedia,enqueueAdMedia,stepAdMedia} from "../server/ad-media/jobs.js";
import {AdMediaActor} from "../server/ad-media/apify.js";
import {AdMediaStorage,mediaDiskMeasurement} from "../server/ad-media/storage.js";
import {claimJob} from "../server/infrastructure/jobs.js";
import {claimCategoryBatch} from "../server/public-categories/jobs.js";
import {workOwnedOnce} from "../server/owned/jobs.js";
import {workCreatorDiscoveryOnce} from "../server/creators/discovery-jobs.js";
import {claimKernelJob} from "../server/kernel/jobs.js";
import {attachWorkerRoutes} from "../server/infrastructure/worker-api.js";
import {basicAuth} from "../server/auth.js";
import {visitPublicCategoryInputs} from "../server/infrastructure/meta-evidence.js";
const broker={EXTER_AD_MEDIA_BROKER_TOKEN:"fixture-only-broker-credential-not-a-key",EXTER_AD_MEDIA_BROKER_ORIGIN:"https://fixture.example",EXTER_AD_MEDIA_ENABLED:"true"};
const silent={log:(_line:string)=>{}};
async function due(pool:pg.Pool){await pool.query("UPDATE worker_job_failures SET next_attempt_at=now()-interval '1 second' WHERE status='retrying'");for(const table of ["brand_onboarding_runs","ad_media_runs","collection_jobs","public_category_batches"])await pool.query(`UPDATE ${table} SET available_at=now()-interval '1 second'`);}
async function mediaRun(pool:pg.Pool,id:string){await pool.query(`INSERT INTO ad_media_runs(id,watchlist_id,workspace_id,brand_key,revision,page_id,window_from,window_to,phase,cap,status,actor_run_id,dataset_id,result_offset) VALUES($1,'own','workspace','workspace',1,'12','2025-11-01','2026-11-01','missing',10,'running','fixtureRun10000001','fixtureData100001',7)`,[id]);}

test("a throwing job does not stop other queues; three failures pause only its durable claim",async()=>creativeFixture(async(pool)=>{
 const job=randomUUID();await pool.query("INSERT INTO brand_onboarding_runs(id,workspace_id,kind) VALUES($1,'workspace','initial')",[job]);
 const logs:string[]=[],seen:string[]=[];
 const tasks:WorkerTask[]=[{type:"onboarding",run:async observer=>{
  const owner=randomUUID(),row=await claimOnboarding(pool,owner);if(!row)return false;observer.onClaim?.({id:row.id,owner,workspaceId:row.workspace_id});
  const client=await pool.connect();try{await client.query("BEGIN; SET LOCAL statement_timeout='5ms'");await client.query("SELECT pg_sleep(0.05)");return true;}finally{await client.query("ROLLBACK");client.release();}
 }},...(["collection","owned","media","creators","categories","kernel"] as const).map(type=>({type,run:async()=>{seen.push(type);return true;}}))];
 for(let attempt=1;attempt<=3;attempt++){
  await due(pool);await workerCycle(pool,tasks,{log:line=>logs.push(line)});
  const failure=(await readWorkerFailures(pool,"workspace")).find(row=>row.jobId===job)!;assert.equal(failure.failures,attempt);assert.equal(failure.status,attempt===3?"paused":"retrying");assert.equal(failure.error.code,"57014");
  assert.equal((await pool.query("SELECT lease_owner FROM brand_onboarding_runs WHERE id=$1",[job])).rows[0].lease_owner,null);
 }
 await due(pool);await workerCycle(pool,tasks,{log:line=>logs.push(line)});assert.equal(logs.length,3);assert.equal(seen.length,24);assert.equal((await pool.query("SELECT status FROM brand_onboarding_runs WHERE id=$1",[job])).rows[0].status,"paused");
 const restarted=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:pool.options.options});try{assert.equal(await claimOnboarding(restarted,"new-worker"),null);}finally{await restarted.end();}
 const event=JSON.parse(logs[0]);assert.equal(event.jobType,"onboarding");assert.equal(event.jobId,job);assert.equal(event.error.code,"57014");assert.equal((await pool.query("SELECT count(*)::integer AS n FROM ad_observations")).rows[0].n,10);
},10));

test("broker SQL failures preserve media checkpoints and paid holds; scoped retry reuses the run",async()=>creativeFixture(async(pool,db)=>{
 const id=randomUUID();await mediaRun(pool,id);await pool.query("INSERT INTO cost_ledger(id,cost_type,provider,cost_gbp,cost_basis,status) VALUES('held','data_providers','fixture',0.1,'estimated','reserved')");await pool.query("UPDATE ad_media_runs SET reservation_id='held' WHERE id=$1",[id]);
 let calls=0,others=0;
 for(let n=0;n<3;n++){await due(pool);await workerCycle(pool,[{type:"media",run:observer=>workAdMediaOnce(pool,{...observer,env:broker,fetch:async()=>{calls++;return Response.json({error:"do not echo this body",diagnostic:workerDiagnostic(Object.assign(new Error("timeout"),{code:"57014",stack:"server/ad-media/jobs.ts:20:4"}))},{status:503});}})},{type:"creators",run:async()=>{others++;return true;}}],silent);}
 assert.equal(calls,3);assert.equal(others,3);assert.equal((await readWorkerFailures(pool,"workspace"))[0].status,"paused");assert.equal(await claimAdMedia(pool,"another-worker"),null);
 assert.equal(await retryWorkerFailure(pool,"other-workspace","media",id),false);
 assert.equal(await retryWorkerFailure(pool,"workspace","media",id),true);
 const run=(await pool.query("SELECT * FROM ad_media_runs WHERE id=$1",[id])).rows[0];assert.equal(run.status,"running");assert.equal(run.actor_run_id,"fixtureRun10000001");assert.equal(run.result_offset,7);assert.equal(run.reservation_id,"held");assert.equal((await pool.query("SELECT status,cost_gbp::float8 AS cost FROM cost_ledger WHERE id='held'")).rows[0].status,"reserved");
 assert.equal((await pool.query("SELECT count(*)::integer AS n FROM ad_media_runs")).rows[0].n,1);
 for(let n=0;n<3;n++)await recordWorkerFailure(pool,"media",{id,owner:"fixture-owner",workspaceId:"workspace",status:"running"},workerDiagnostic(Object.assign(new Error("statement cancelled"),{code:"57014"})));
 const app=express();app.use(express.json());app.use(basicAuth({EXTER_ADMIN_USER:"fixture",EXTER_ADMIN_PASSWORD:"fixture-only"}));attachWorkerRoutes(app,db,()=>pool);
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const root=`http://127.0.0.1:${(server.address() as any).port}`,auth="Basic "+Buffer.from("fixture:fixture-only").toString("base64");
 try{
  assert.equal((await fetch(root+"/api/infrastructure/worker?workspaceId=workspace")).status,401);
  assert.equal((await fetch(root+"/api/infrastructure/worker?workspaceId=missing",{headers:{Authorization:auth}})).status,400);
  const health=await fetch(root+"/api/infrastructure/worker?workspaceId=workspace",{headers:{Authorization:auth}});assert.equal(health.status,200);const state=await health.json();assert.equal(state.failures[0].status,"paused");assert.equal(state.failures[0].jobId,id);assert.equal(state.failures[0].error.code,"57014");
  assert.equal((await fetch(root+"/api/infrastructure/worker?workspaceId=workspace&demo=1",{headers:{Authorization:auth}})).status,400);
  const cross=await fetch(root+"/api/infrastructure/worker/retry",{method:"POST",headers:{Authorization:auth,"Content-Type":"application/json",Origin:"https://elsewhere.invalid"},body:JSON.stringify({workspaceId:"workspace",type:"media",jobId:id})});assert.equal(cross.status,403);
  const retried=await fetch(root+"/api/infrastructure/worker/retry",{method:"POST",headers:{Authorization:auth,"Content-Type":"application/json",Origin:root},body:JSON.stringify({workspaceId:"workspace",type:"media",jobId:id})});assert.equal(retried.status,202);assert.deepEqual(await readWorkerFailures(pool,"workspace"),[]);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
},10));

test("successful work resets a failure streak and healthy database survives provider network errors",async()=>creativeFixture(async(pool)=>{
 const id=randomUUID();await pool.query("INSERT INTO brand_onboarding_runs(id,workspace_id,kind) VALUES($1,'workspace','initial')",[id]);
 let fails=true;
 const task:WorkerTask={type:"onboarding",run:observer=>workOnboardingOnce(pool,{...observer,env:broker,fetch:async()=>{if(fails)throw Object.assign(new Error("socket closed"),{code:"ECONNRESET"});return Response.json({worked:true});}})};
 await workerCycle(pool,[task],silent);assert.equal((await readWorkerFailures(pool,"workspace"))[0].failures,1);await due(pool);fails=false;await workerCycle(pool,[task],silent);assert.deepEqual(await readWorkerFailures(pool,"workspace"),[]);
 await due(pool);fails=true;await workerCycle(pool,[task],silent);assert.equal((await readWorkerFailures(pool,"workspace"))[0].failures,1);
},0));

test("a follow-up media SQL timeout preserves the finished paid run and backs off queue refill",async()=>creativeFixture(async(pool)=>{
 const id=randomUUID();await mediaRun(pool,id);await pool.query("INSERT INTO cost_ledger(id,cost_type,provider,cost_gbp,initial_reserved_gbp,cost_basis,status) VALUES('paid','data_providers','apify_ad_media',0.1,0.1,'estimated','reserved')");await pool.query("UPDATE ad_media_runs SET reservation_id='paid',gbp_per_usd=0.8,preview_policy='preview-v2',requested_ids='[\"1000001\"]',target_ids='[\"1000001\"]' WHERE id=$1",[id]);
 const env={...broker,APIFY_TOKEN:"fixture-not-a-provider-key",EXTER_AD_MEDIA_GBP_PER_USD:"0.8"};
 const actor=new AdMediaActor({env,fetch:async url=>String(url).includes("/items")?Response.json([]):Response.json({data:{id:"fixtureRun10000001",status:"SUCCEEDED",usageTotalUsd:0,chargedEventCounts:{"ad-result":0,"apify-actor-start":1},pricingInfo:{pricingModel:"PAY_PER_EVENT",pricingPerEvent:{actorChargeEvents:{"ad-result":{eventPriceUsd:0.0005},"apify-actor-start":{eventPriceUsd:0.00005}}}}}})});
 let broken=0,healthy=0;const logs:string[]=[];
 const failingPool={query:pool.query.bind(pool),connect:async()=>{
  const client=await pool.connect();return new Proxy(client,{get(target,key){if(key==="query")return(query:any,...args:any[])=>{if(typeof query==="string"&&query.startsWith("WITH watches AS MATERIALIZED")){broken++;return Promise.reject(Object.assign(new Error("canceling statement due to statement timeout"),{code:"57014"}));}return(target.query as any)(query,...args);};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
 }} as unknown as pg.Pool;
 await workerCycle(pool,[{type:"media",run:observer=>workAdMediaOnce(pool,{...observer,env,fetch:async()=>{
  const owner=(await pool.query("SELECT lease_owner FROM ad_media_runs WHERE id=$1",[id])).rows[0].lease_owner;
  try{return Response.json({worked:await stepAdMedia(failingPool,id,owner,{env,actor,storage:new AdMediaStorage({disk:async()=>mediaDiskMeasurement(10*1024**3,9*1024**3)})})});}
  catch(error){return Response.json({diagnostic:workerDiagnostic(error)},{status:503});}
 }})},{type:"creators",run:async()=>{healthy++;return true;}}],{log:line=>logs.push(line)});
 assert.equal(broken,1,`Do not repeat the failed refill in the same worker turn: ${JSON.stringify({logs,run:(await pool.query("SELECT status,error_kind,result_offset FROM ad_media_runs WHERE id=$1",[id])).rows[0]})}`);assert.equal(healthy,1);
 const finished=(await pool.query("SELECT status,error_kind FROM ad_media_runs WHERE id=$1",[id])).rows[0];assert.equal(finished.status,"complete");assert.notEqual(finished.error_kind,"provider");assert.equal((await pool.query("SELECT status FROM cost_ledger WHERE id='paid'")).rows[0].status,"settled");
 const failure=(await readWorkerFailures(pool,"workspace"))[0];assert.equal(failure.jobId,"@queue");assert.equal(failure.error.code,"57014");assert.equal(failure.status,"retrying");assert.equal((await pool.query("SELECT count(*)::integer AS n FROM ad_media_runs")).rows[0].n,1);
},10));

test("queue faults back off, shutdown is clean, and only lost database connectivity ends the loop",async()=>creativeFixture(async(pool)=>{
 const stop=new AbortController();let broken=0,healthy=0;
 await runWorkerLoop(pool,[{type:"media",run:async()=>{broken++;throw new TypeError("Cannot select a media page.");}},{type:"categories",run:async()=>{healthy++;if(healthy===2)stop.abort();return true;}}],{signal:stop.signal,...silent});
 assert.equal(broken,1);assert.equal(healthy,2);assert.equal((await readWorkerFailures(pool,"workspace"))[0].jobId,"@queue");
 const gone=Object.assign(new Error("Connection terminated unexpectedly"),{code:"08006"});let next=0;
 const failedPool={query:async()=>{throw gone;}} as unknown as pg.Pool;
 await assert.rejects(workerCycle(failedPool,[{type:"media",run:async()=>false},{type:"creators",run:async()=>{next++;return true;}}],silent),gone);assert.equal(next,0);
 await assert.rejects(runWorkerLoop(pool,[{type:"kernel",run:async()=>{pool.emit("error",gone);return false;}}],silent),gone);assert.equal(pool.listenerCount("error"),0);
},0));

test("stale failures cannot release another lease, and all claim queries respect paused jobs",async()=>creativeFixture(async(pool)=>{
 const id=randomUUID();await mediaRun(pool,id);await pool.query("UPDATE ad_media_runs SET lease_owner='new-owner',lease_until=now()+interval '5 minutes' WHERE id=$1",[id]);
 assert.equal(await recordWorkerFailure(pool,"media",{id,owner:"old-owner"},workerDiagnostic(new Error("fixture failure"))),null);assert.deepEqual(await readWorkerFailures(pool,"workspace"),[]);
 await pool.query("INSERT INTO collection_jobs(id) VALUES('official'); INSERT INTO public_category_batches(id,workspace_id,items,model) VALUES('tag','workspace','[]','fixture')");
 for(const [type,jobId] of [["collection","official"],["categories","tag"]])await pool.query("INSERT INTO worker_job_failures(job_type,job_id,workspace_id,failures,status,last_error) VALUES($1,$2,'workspace',3,'paused','{}')",[type,jobId]);
 assert.equal(await claimJob(pool,"worker"),null);assert.equal(await claimCategoryBatch(pool,"worker"),null);
 await pool.query("INSERT INTO creator_discovery_runs(id,workspace_id,kind,brief,brief_version,steps) VALUES('search','workspace','discovery','{}','fixture','[]')");
 await pool.query("INSERT INTO owned_accounts(id,workspace_id,platform,account_id,currency,attribution,conversion_event) VALUES('account','workspace','Meta','12','GBP','fixture','purchase'); INSERT INTO owned_sync_jobs(id,account_id,since_day,until_day) VALUES('sync','account','2026-11-01','2026-11-07')");
 const kernel=randomUUID();await pool.query("INSERT INTO kernel_jobs(id,workspace_id,platform,native_ad_id,idempotency_key,artifact,pipeline_version,config,context_hash) VALUES($1,'workspace','meta','1',$2,'{\"workspaceId\":\"workspace\"}','fixture','{}',$3)",[kernel,'a'.repeat(64),'b'.repeat(64)]);
 for(const [type,jobId] of [["creators","search"],["owned","sync"],["kernel",kernel]])await pool.query("INSERT INTO worker_job_failures(job_type,job_id,workspace_id,failures,status,last_error) VALUES($1,$2,'workspace',3,'paused','{}')",[type,jobId]);
 assert.equal(await workCreatorDiscoveryOnce(pool,{env:{}}),false);
 assert.equal(await workOwnedOnce(pool,{env:{EXTER_OWNED_SYNC_ENABLED:"true"},fetch:async()=>{assert.fail("A paused sync cannot call a provider.");}}),false);
 assert.equal(await claimKernelJob(pool,"worker",{pipelineVersions:["fixture"]}),null);
 await pool.query("UPDATE kernel_jobs SET status='paused',paid_dispatch_in_flight=true WHERE id=$1",[kernel]);assert.equal(await retryWorkerFailure(pool,"workspace","kernel",kernel),false);
},0));

test("history-heavy media and category reads use the latest observation without sorting raw payloads",async()=>creativeFixture(async(pool)=>{
 await pool.query(`INSERT INTO collection_runs(id,watchlist_id,config,status,started_at) SELECT 'history-'||n,'own','{"revision":1}','complete','2026-10-01'::timestamptz+n*interval '1 day' FROM generate_series(1,8)n`);
 await pool.query(`INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,raw_payload,reach,active_status,observed_at,last_confirmed_at)
  SELECT o.platform,o.native_id,r.id,o.workspace_id,jsonb_build_object('ad_creative_bodies',jsonb_build_array('Old copy'), 'ignored',repeat(md5(o.native_id||r.id),300)),'{}','unknown',r.started_at,r.started_at FROM ad_observations o CROSS JOIN collection_runs r WHERE o.run_id='official' AND r.id LIKE 'history-%'`);
 await pool.query("ANALYZE ad_observations");
 const started=Date.now(),run=await enqueueAdMedia(pool,"own",new Date("2026-11-11T12:00:00Z"));assert(run);
 const selected=(await pool.query("SELECT target_ids FROM ad_media_runs WHERE id=$1",[run])).rows[0].target_ids;assert.equal(selected.length,500);assert.equal(selected[0],"1000001");
 let total=0;await visitPublicCategoryInputs(pool,"workspace",row=>{total++;assert.deepEqual(row.raw_payload.ad_creative_bodies,[`A quiet evening. Product ${row.native_id}`]);assert(!("ignored" in row.raw_payload));});assert.equal(total,2000);
 assert.equal((await pool.query("SELECT count(*)::integer AS n FROM ad_observations")).rows[0].n,18000);
 console.log(`History fixture: 18,000 observations, 2,000 ads, ${Date.now()-started}ms for bounded media selection and category input streaming.`);
},2000));

test("worker retry cannot reopen an uncertain paid start or release its hold",async()=>creativeFixture(async(pool)=>{
 const id=randomUUID();await mediaRun(pool,id);await pool.query("INSERT INTO cost_ledger(id,cost_type,provider,cost_gbp,cost_basis,status) VALUES('uncertain-hold','data_providers','fixture',0.1,'estimated','reserved')");await pool.query("UPDATE ad_media_runs SET status='uncertain',actor_run_id=NULL,reservation_id='uncertain-hold' WHERE id=$1",[id]);
 await recordWorkerFailure(pool,"media",{id,owner:"fixture",workspaceId:"workspace",status:"starting"},workerDiagnostic(Object.assign(new Error("statement timed out"),{code:"57014"})));
 assert.equal((await readWorkerFailures(pool,"workspace"))[0].status,"paused");assert.equal(await retryWorkerFailure(pool,"workspace","media",id),false);assert.equal((await pool.query("SELECT status FROM ad_media_runs WHERE id=$1",[id])).rows[0].status,"uncertain");assert.equal((await pool.query("SELECT status FROM cost_ledger WHERE id='uncertain-hold'")).rows[0].status,"reserved");
},0));

test("three handled provider failures pause the same paid run without another actor start",async()=>creativeFixture(async(pool)=>{
 const id=randomUUID();await mediaRun(pool,id);
 const env={...broker,APIFY_TOKEN:"fixture-not-a-provider-key",EXTER_AD_MEDIA_GBP_PER_USD:"0.8"};let polls=0,others=0;
 const actor=new AdMediaActor({env,fetch:async(_url,init)=>{assert.notEqual(init?.method,"POST");polls++;return new Response("private provider response",{status:500});}});
 for(let n=0;n<3;n++){await due(pool);await workerCycle(pool,[{type:"media",run:observer=>workAdMediaOnce(pool,{...observer,env,fetch:async()=>{
  const owner=(await pool.query("SELECT lease_owner FROM ad_media_runs WHERE id=$1",[id])).rows[0].lease_owner;let diagnostic;
  const worked=await stepAdMedia(pool,id,owner,{env,actor,onFailure:error=>{diagnostic=workerDiagnostic(error);}});return Response.json({worked,diagnostic});
 }})},{type:"collection",run:async()=>{others++;return true;}}],silent);}
 assert.equal(polls,3);assert.equal(others,3);const failure=(await readWorkerFailures(pool,"workspace"))[0];assert.equal(failure.failures,3);assert.equal(failure.status,"paused");assert.equal(failure.error.httpStatus,500);assert(!JSON.stringify(failure).includes("private provider response"));assert.equal((await pool.query("SELECT actor_run_id FROM ad_media_runs WHERE id=$1",[id])).rows[0].actor_run_id,"fixtureRun10000001");assert.equal((await pool.query("SELECT count(*)::integer AS n FROM ad_media_runs")).rows[0].n,1);
},10));
