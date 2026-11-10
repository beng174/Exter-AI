// Only a disposable Postgres schema and fictional provider/file responses.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {migrate} from "../server/infrastructure/database.js";
import {enqueueAdMedia,claimAdMedia,stepAdMedia} from "../server/ad-media/jobs.js";
import {AdMediaActor} from "../server/ad-media/apify.js";
import {AdMediaStorage,mediaDiskMeasurement} from "../server/ad-media/storage.js";
import {readRetainedMedia} from "../server/ad-media/read.js";
import {adMediaRuns} from "../server/ad-media/api.js";
import {readMediaCoverage} from "../server/ad-media/coverage.js";
const env={EXTER_AD_MEDIA_ENABLED:"true",APIFY_TOKEN:"fixture-only",EXTER_AD_MEDIA_GBP_PER_USD:"1"};
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]);
const assetUrl="https://image.fixture.fbcdn.net/file.png?token=NEVER-PERSIST";
async function fixture(fn:(pool:pg.Pool,storage:AdMediaStorage)=>Promise<void>,count=10){
  assert(process.env.TEST_DATABASE_URL,"Use a dedicated disposable TEST_DATABASE_URL.");
  const schema="ad_media_test_"+randomUUID().replaceAll("-",""),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:5}),root=await mkdtemp(join(tmpdir(),"exter-ad-media-pg-"));
  try{await migrate(pool);await migrate(pool);await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='data_providers'");
    await pool.query(`INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('watch','workspace','fictional-brand','["12001"]');
      INSERT INTO collection_runs(id,watchlist_id,config,status) VALUES('official','watch','{"revision":1}','complete');
      INSERT INTO public_ads(platform,native_id,advertiser_id,start_time) SELECT 'Meta',(9000+n)::text,'12001',now()-interval '40 days' FROM generate_series(1,${count})n;
      INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload)
        SELECT 'Meta',native_id,'official','workspace','unknown','{}',jsonb_build_object('id',native_id,'page_id','12001','ad_creative_bodies',jsonb_build_array('Fictional source copy'),'total_reach_by_location',jsonb_build_array(jsonb_build_object('country','GB','reach',100))) FROM public_ads;`);
    const storage=new AdMediaStorage({root,disk:async()=>mediaDiskMeasurement(10*1024**3,9*1024**3),images:{fetch:async()=>new Response(png,{headers:{"content-type":"image/png"}}),resolve:async()=>[{address:"8.8.8.8",family:4}],probe:async()=>({width:40,height:30})}});
    await fn(pool,storage);
  }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(root,{recursive:true,force:true});}
}
async function tick(pool:pg.Pool,actor:AdMediaActor,storage:AdMediaStorage,customEnv=env){await pool.query("UPDATE ad_media_runs SET available_at=now(),lease_until=NULL,lease_owner=NULL WHERE status IN ('queued','running','starting')");const owner=randomUUID(),run=await claimAdMedia(pool,owner);if(!run)return false;return stepAdMedia(pool,run.id,owner,{actor,storage,env:customEnv});}
const actorFixture=(items:unknown[],start?:()=>void)=>new AdMediaActor({env,fetch:async(url,init)=>{const target=new URL(String(url));if(init?.method==="POST"){start?.();return Response.json({data:{id:"fixtureRun10000001",defaultDatasetId:"fixtureData100001"}});}if(target.pathname.endsWith("/items")){const offset=Number(target.searchParams.get("offset"));return Response.json(items.slice(offset,offset+1));}return Response.json({data:{id:"fixtureRun10000001",status:"SUCCEEDED",usageTotalUsd:items.length*.0005+.00005,chargedEventCounts:{"ad-result":items.length,"apify-actor-start":1},pricingInfo:{pricingModel:"PAY_PER_EVENT",pricingPerEvent:{actorChargeEvents:{"ad-result":{eventPriceUsd:.0005},"apify-actor-start":{eventPriceUsd:.00005}}}}}});}});

test("media batches retain official history, match Page/archive/workspace IDs, count every result and target only gaps afterwards",async()=>fixture(async(pool,storage)=>{
  const before=(await pool.query("SELECT row_to_json(o)::text AS data FROM ad_observations o ORDER BY native_id")).rows;
  const id=await enqueueAdMedia(pool,"watch");assert(id);assert.equal(await enqueueAdMedia(pool,"watch"),null);assert.equal((await readMediaCoverage(pool,"workspace"))[0].requested,0,"Queued plans are not submitted requests.");
  const items=[{type:"ad",adArchiveId:"9001",pageId:"12001",displayFormat:"IMAGE",imageUrls:[assetUrl],reach:999999,spend:999,startDate:"2000-01-01"},{type:"ad",adArchiveId:"9999",pageId:"12001",displayFormat:"IMAGE",imageUrls:[assetUrl]},{type:"ad",adArchiveId:"9002",pageId:"12002",imageUrls:[assetUrl]},{type:"ad",adArchiveId:"9001",pageId:"12001",displayFormat:"IMAGE",imageUrls:[assetUrl]}];let starts=0;
  const actor=actorFixture(items,()=>starts++);for(let i=0;i<6;i++)await tick(pool,actor,storage);
  const run=(await adMediaRuns(pool,"workspace")).find(run=>run.id===id)!;assert.equal(run.status,"complete");assert.equal(run.results,4);assert.equal(run.adsWithMedia,1);assert.equal(starts,1);assert.equal(run.costStatus,"settled");assert.equal(run.costGbp,.00205);
  const coverage=(await readMediaCoverage(pool,"workspace"))[0];assert.equal(coverage.requested,10);assert.equal(coverage.returned,2);assert.equal(coverage.matched,1);assert.equal(coverage.reasons.queued,1,"wrong-Page result queues one exact-ID fallback");assert.equal(coverage.reasons.not_returned,8);
  const stored=await readRetainedMedia(pool,"workspace");assert.equal(stored.length,1);assert.equal(stored[0].native_id,"9001");assert.equal((await readRetainedMedia(pool,"other")).length,0);
  assert.deepEqual((await pool.query("SELECT row_to_json(o)::text AS data FROM ad_observations o ORDER BY native_id")).rows,before);
  const all=JSON.stringify((await pool.query("SELECT row_to_json(c) FROM ad_media_creatives c UNION ALL SELECT row_to_json(r) FROM ad_media_runs r")).rows);assert(!all.includes("NEVER-PERSIST")&&!all.includes("https://")&&!all.includes("fixture-only"));
  const next=await enqueueAdMedia(pool,"watch");assert.equal(next,null,"Dispatched IDs wait one day, including IDs not returned.");
  const retry=(await pool.query("SELECT id FROM ad_media_runs WHERE watchlist_id='watch' AND status='queued'")).rows[0]?.id||await enqueueAdMedia(pool,"watch",new Date(Date.now()+25*3600000));assert(retry);const config=(await pool.query("SELECT phase,target_ids FROM ad_media_runs WHERE id=$1",[retry])).rows[0];assert.equal(config.phase,"missing");assert(!config.target_ids.includes("9001"));assert(config.target_ids.includes("9002"));
}));
test("budget and token failures make zero paid calls; an ambiguous start keeps its hold and can never automatically start twice",async()=>fixture(async(pool,storage)=>{
  let calls=0;const actor=actorFixture([],()=>calls++);const id=await enqueueAdMedia(pool,"watch");await pool.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='data_providers'");await tick(pool,actor,storage);assert.equal(calls,0);assert.equal((await pool.query("SELECT status,error_kind FROM ad_media_runs WHERE id=$1",[id])).rows[0].error_kind,"budget");assert.equal((await pool.query("SELECT count(*)::int n FROM cost_ledger")).rows[0].n,0);assert.equal((await readMediaCoverage(pool,"workspace"))[0].reasons.budget,10);
  await pool.query("UPDATE ad_media_runs SET status='queued'");await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='data_providers'");await tick(pool,actor,storage,{...env,APIFY_TOKEN:""});assert.equal(calls,0);assert.equal((await pool.query("SELECT error_kind FROM ad_media_runs WHERE id=$1",[id])).rows[0].error_kind,"configuration");
  await pool.query("UPDATE ad_media_runs SET status='queued'");const ambiguous=new AdMediaActor({env,fetch:async()=>{calls++;throw new Error("private-provider-text fixture-only");}});await tick(pool,ambiguous,storage);assert.equal(calls,1);assert.equal((await pool.query("SELECT status,error_kind FROM ad_media_runs WHERE id=$1",[id])).rows[0].status,"uncertain");assert.equal((await pool.query("SELECT status FROM cost_ledger")).rows[0].status,"reserved");assert.equal(await tick(pool,ambiguous,storage),false);assert.equal(await enqueueAdMedia(pool,"watch"),null);assert.equal(calls,1);
}));
test("an interrupted pre-dispatch checkpoint fails closed without a second paid start",async()=>fixture(async(pool,storage)=>{
  const id=await enqueueAdMedia(pool,"watch");await pool.query("UPDATE ad_media_runs SET status='starting' WHERE id=$1",[id]);let starts=0;const actor=actorFixture([],()=>starts++);await tick(pool,actor,storage);assert.equal(starts,0);assert.equal((await pool.query("SELECT status FROM ad_media_runs WHERE id=$1",[id])).rows[0].status,"uncertain");
}));
test("replaying a retained result checkpoint never downloads or counts the same creative twice",async()=>fixture(async(pool,storage)=>{
  const id=await enqueueAdMedia(pool,"watch"),actor=actorFixture([{type:"ad",adArchiveId:"9001",pageId:"12001",displayFormat:"IMAGE",imageUrls:[assetUrl]}]);
  await tick(pool,actor,storage);await tick(pool,actor,storage);
  await pool.query("UPDATE ad_media_runs SET result_offset=0,results=0,ads_with_media=0 WHERE id=$1",[id]);
  storage.retain=async()=>{assert.fail("Already retained result must not fetch again.");};
  await tick(pool,actor,storage);assert.equal((await pool.query("SELECT ads_with_media FROM ad_media_runs WHERE id=$1",[id])).rows[0].ads_with_media,1);assert.equal((await pool.query("SELECT count(*)::int n FROM ad_media_creatives")).rows[0].n,1);
}));
test("already retained legacy media can finish a missing batch without any actor call or cost hold",async()=>fixture(async(pool,storage)=>{
  const id=await enqueueAdMedia(pool,"watch"),owner=randomUUID();await claimAdMedia(pool,owner);
  const actor=new AdMediaActor({env,fetch:async()=>{assert.fail("No paid call for known retained files.");}});
  await stepAdMedia(pool,id!,owner,{env,actor,storage,existingIds:new Set(Array.from({length:10},(_,i)=>String(9001+i)))});
  assert.equal((await pool.query("SELECT status FROM ad_media_runs WHERE id=$1",[id])).rows[0].status,"complete");assert.equal((await pool.query("SELECT count(*)::int n FROM cost_ledger")).rows[0].n,0);
}));
test("current Page revision and live lease fence every download; expired files stay missing without deleting evidence",async()=>fixture(async(pool,storage)=>{
  const id=await enqueueAdMedia(pool,"watch");let starts=0;const actor=actorFixture([],()=>starts++);await pool.query("UPDATE watchlists SET revision=revision+1");await tick(pool,actor,storage);assert.equal(starts,0);assert.equal((await pool.query("SELECT error_kind FROM ad_media_runs WHERE id=$1",[id])).rows[0].error_kind,"changed");assert.equal(await stepAdMedia(pool,id!,randomUUID(),{env,actor,storage}),false);
  assert.equal((await pool.query("SELECT count(*)::int n FROM ad_observations")).rows[0].n,10);
}));
test("results with no retained media are bounded to one paid attempt per day; a later day can retry the exact missing IDs",async()=>fixture(async(pool,storage)=>{
  const id=await enqueueAdMedia(pool,"watch"),actor=actorFixture([{type:"ad",adArchiveId:"9001",pageId:"12001",displayFormat:"IMAGE",imageUrls:["https://unapproved.example/expired.png"]}]);for(let i=0;i<3;i++)await tick(pool,actor,storage);assert.equal((await pool.query("SELECT jsonb_array_length(assets) n FROM ad_media_creatives")).rows[0].n,0);
  assert.equal(await enqueueAdMedia(pool,"watch"),null,"Every dispatched ID has a daily cooldown, even if not returned.");
  await pool.query("UPDATE ad_media_runs SET status='complete'");const tomorrow=await enqueueAdMedia(pool,"watch",new Date(Date.now()+25*3600000));assert(tomorrow);assert((await pool.query("SELECT target_ids FROM ad_media_runs WHERE id=$1",[tomorrow])).rows[0].target_ids.includes("9001"));assert(id);
},1));
test("separate media batches share the existing monthly budget guard and cannot reserve beyond its threshold",async()=>fixture(async(pool,storage)=>{
  await pool.query(`UPDATE budget_settings SET monthly_budget_gbp=.01 WHERE cost_type='data_providers';
    INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('second','workspace','second-fictional','["12002"]');
    INSERT INTO collection_runs(id,watchlist_id,config,status) VALUES('second-official','second','{"revision":1}','complete');
    INSERT INTO public_ads(platform,native_id,advertiser_id) SELECT 'Meta',(9100+n)::text,'12002' FROM generate_series(1,10)n;
    INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload) SELECT 'Meta',native_id,'second-official','workspace','unknown','{}',jsonb_build_object('id',native_id,'page_id','12002') FROM public_ads WHERE advertiser_id='12002';`);
  const first=await enqueueAdMedia(pool,"watch"),second=await enqueueAdMedia(pool,"second");let starts=0;const actor=actorFixture([],()=>starts++);
  const owner=randomUUID();await pool.query("UPDATE ad_media_runs SET lease_owner=$2,lease_until=now()+interval '6 minutes' WHERE id=$1",[first,owner]);await stepAdMedia(pool,first!,owner,{env,actor,storage});
  await pool.query("UPDATE ad_media_runs SET lease_owner=$2,lease_until=now()+interval '6 minutes' WHERE id=$1",[second,owner]);await stepAdMedia(pool,second!,owner,{env,actor,storage});
  assert.equal(starts,1);assert.equal((await pool.query("SELECT error_kind FROM ad_media_runs WHERE id=$1",[second])).rows[0].error_kind,"budget");assert((await pool.query("SELECT sum(cost_gbp)::float8 n FROM cost_ledger")).rows[0].n<=.009);
}));

for(const limit of [Infinity,20])test(`1,200 official ads and another brand progress across exact batches with ${limit===Infinity?'full':'partial'} actor responses and worker restarts`,async()=>fixture(async(pool,storage)=>{
  await pool.query(`INSERT INTO public_ads(platform,native_id,advertiser_id,start_time) SELECT 'Meta',(9000+n)::text,'12001',now()-interval '40 days' FROM generate_series(11,1200)n;
    INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload)
      SELECT 'Meta',native_id,'official','workspace','unknown','{}',jsonb_build_object('id',native_id,'page_id','12001') FROM public_ads WHERE native_id::int>9010;
    INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('second','workspace','second-fictional','["12002"]');
    INSERT INTO collection_runs(id,watchlist_id,config,status) VALUES('second-official','second','{"revision":1}','complete');
    INSERT INTO public_ads(platform,native_id,advertiser_id) SELECT 'Meta',(20000+n)::text,'12002' FROM generate_series(1,4)n;
    INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload) SELECT 'Meta',native_id,'second-official','workspace','unknown','{}',jsonb_build_object('id',native_id,'page_id','12002') FROM public_ads WHERE advertiser_id='12002';`);
  const {workAdMediaOnce}=await import('../server/ad-media/api.js'),{readMediaCoverage}=await import('../server/ad-media/coverage.js');
  const known=await storage.retain('workspace',{adId:'9001',pageId:'12001',format:'image',images:[assetUrl],posters:[],videos:[]},false);
  storage.retain=async()=>known;
  const inputs:any[]=[],data=new Map<string,unknown[]>(),requested=new Map<string,string[]>();
  const actor=new AdMediaActor({env,fetch:async(target,init)=>{
    const url=new URL(String(target));
    if(init?.method==='POST'){
      const input=JSON.parse(String(init.body));inputs.push(input);assert(input.adArchiveIds?.length<=500);assert(!input.pageIds);assert.equal(input.activeStatus,'all');assert.deepEqual(input.countries,input.adArchiveIds.length===1&&input.countries[0]==='ALL'?['ALL']:['GB']);assert.equal(input.maxAds,input.adArchiveIds.length);assert(Number(url.searchParams.get('maxTotalChargeUsd'))<=.25005);
      const suffix=String(inputs.length).padStart(8,'0'),run='fixtureRun'+suffix,dataset='fixtureData'+suffix,store='fixtureStore'+suffix,page=input.adArchiveIds[0]<20000?'12001':'12002';
      const returned=input.adArchiveIds.slice(0,limit).map((id:string)=>({type:'ad',adArchiveId:id,pageId:page,displayFormat:'IMAGE',imageUrls:[assetUrl]}));
      data.set(dataset,[...returned,{type:'run-summary',requested:input.adArchiveIds.length,queries:[{delivered:returned.length,stopReason:'end_of_results'}]}]);requested.set(store,input.adArchiveIds);
      return Response.json({data:{id:run,defaultDatasetId:dataset}});
    }
    if(url.pathname.endsWith('/records/INPUT'))return Response.json({adArchiveIds:requested.get(url.pathname.split('/')[3])});
    if(url.pathname.endsWith('/items'))return Response.json(data.get(url.pathname.split('/')[3])!.slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+1));
    const run=url.pathname.split('/').at(-1)!,suffix=run.slice(-8),count=requested.get('fixtureStore'+suffix)!.length;
    return Response.json({data:{id:run,status:'SUCCEEDED',defaultKeyValueStoreId:'fixtureStore'+suffix,chargedEventCounts:{'ad-result':Math.min(count,limit),'apify-actor-start':1},pricingInfo:{pricingModel:'PAY_PER_EVENT',pricingPerEvent:{actorChargeEvents:{'ad-result':{eventPriceUsd:.0005},'apify-actor-start':{eventPriceUsd:.00005}}}}}});
  }});
  const workerEnv={...env,EXTER_AD_MEDIA_BROKER_ORIGIN:'https://exter-fixture.example',EXTER_AD_MEDIA_BROKER_TOKEN:'fixture-only-service-'.repeat(3)};
  const work=()=>workAdMediaOnce(pool,{env:workerEnv,fetch:async(target)=>{const parts=new URL(String(target)).pathname.split('/');return Response.json({worked:await stepAdMedia(pool,parts.at(-2)!,parts.at(-1)!,{env,actor,storage})});}});
  // The worker starts with an empty queue. Its idle refill must discover both brands.
  let ticks=0;while(await work()){assert(++ticks<6500);await pool.query("UPDATE ad_media_runs SET available_at=now() WHERE status IN ('queued','running')");}
  assert.deepEqual(inputs.filter(i=>i.adArchiveIds[0]<20000&&i.countries[0]==='GB').map(i=>i.adArchiveIds.length),[500,500,200]);assert.equal(inputs.filter(i=>i.adArchiveIds[0]>=20000).length,1);
  const ids=inputs.flatMap(i=>i.adArchiveIds);assert.equal(ids.length,limit===Infinity?1204:2344);assert.equal(new Set(ids).size,1204);
  const coverage=await readMediaCoverage(pool,'workspace'),first=coverage.find(c=>c.brandKey==='fictional-brand')!,second=coverage.find(c=>c.brandKey==='second-fictional')!;
  assert.equal(first.official,1200);assert.equal(first.requested,1200);assert.equal(first.returned,1200);assert.equal(first.matched,first.returned);assert.equal(first.images,first.returned);assert.equal(first.reasons.not_requested,0);assert.equal(first.reasons.not_returned,0);assert.equal(inputs.filter(i=>i.countries[0]==='ALL').length,limit===Infinity?0:1140);assert.equal(second.requested,4);assert.equal(second.images,4);
  for(const run of await adMediaRuns(pool,'workspace')){assert.equal(run.status,'complete');assert.equal(run.diagnostics?.requested,run.diagnostics?.actorInput);assert.equal(run.diagnostics?.requested,run.diagnostics?.actorRequested);assert.equal(run.diagnostics?.actorReturned,run.diagnostics?.returned);assert((run.reservedGbp??Infinity)<=.25005);}
  // Simulate a missed completion acknowledgement: clear the refill timer and
  // append new official ads. A fresh idle worker recovers without a manual enqueue.
  await pool.query("UPDATE ad_media_refill_gate SET next_check=now()-interval '1 minute'");
  await pool.query(`INSERT INTO public_ads(platform,native_id,advertiser_id) VALUES('Meta','30001','12001'); INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload) VALUES('Meta','30001','official','workspace','unknown','{}','{}')`);
  assert.equal(await work(),true);assert.equal(inputs.at(-1).adArchiveIds[0],'30001');
}));

test("status and summary rows do not consume the ad cap; excess ad rows fail closed with the cost hold intact",async()=>fixture(async(pool,storage)=>{
 const id=await enqueueAdMedia(pool,'watch');const actor=actorFixture(Array.from({length:11},(_,i)=>({type:'ad',adArchiveId:String(9001+i),pageId:'12002'})));
 for(let i=0;i<12;i++)await tick(pool,actor,storage);
 const run=(await adMediaRuns(pool,'workspace'))[0];assert.equal(run.id,id);assert.equal(run.status,'paused');assert.equal(run.costStatus,'reserved');assert.equal(run.diagnostics?.returned,10);assert.equal(run.adsWithMedia,0);
}));

test("missing-media diagnostics cover every ad, active and inactive, with disk-aware coverage and scoped pagination",async()=>fixture(async(pool,storage)=>{
 const {readMissingMedia}=await import('../server/ad-media/coverage.js'),{checkedRetainedMedia}=await import('../server/ad-media/file-health.js'),{mergePreviewState}=await import('../server/ad-media/read.js'),{browserCreative}=await import('./fixtures/creative-browser.js');
 const fresh=await readMissingMedia(pool,'workspace');assert.equal(fresh.total,10);assert(fresh.ads.every(ad=>ad.reason==='not_requested'));
 await pool.query("UPDATE public_ads SET start_time='2025-08-21',stop_time='2025-09-01' WHERE native_id='9001'");
 const id=await enqueueAdMedia(pool,'watch');assert((await readMissingMedia(pool,'workspace')).ads.every(ad=>ad.reason==='queued'));assert.equal((await readMediaCoverage(pool,'workspace'))[0].requested,0);
 assert((await pool.query('SELECT target_ids FROM ad_media_runs WHERE id=$1',[id])).rows[0].target_ids.includes('9001'));
 await pool.query("UPDATE ad_media_runs SET status='complete' WHERE id=$1",[id]);
 await pool.query(`INSERT INTO ad_media_requests(run_id,native_id,returned_at,matched_at,outcome) VALUES
  ($1,'9001',now(),now(),'no_media'),($1,'9002',NULL,NULL,'not_returned'),($1,'9003',now(),now(),'expired'),($1,'9004',now(),now(),'provider')`,[id]);
 const kept=await storage.retain('workspace',{adId:'9005',pageId:'12001',format:'image',images:['https://image.fixture.fbcdn.net/file.png'],posters:[],videos:[]},false);
 await pool.query(`INSERT INTO ad_media_creatives(id,run_id,workspace_id,brand_key,native_id,page_id,format,assets) VALUES('saved-file',$1,'workspace','fictional-brand','9005','12001','image',$2)`,[id,JSON.stringify(kept.assets)]);
 await checkedRetainedMedia(pool,await readRetainedMedia(pool,'workspace'),storage,1);
 let coverage=(await readMediaCoverage(pool,'workspace'))[0];assert.equal(coverage.images,1);assert.equal(coverage.reasons.no_media,1);assert.equal(coverage.reasons.not_returned,1);assert.equal(coverage.reasons.expired,1);assert.equal(coverage.reasons.provider,1);assert.equal(coverage.missing,9);
 const {unlink}=await import('node:fs/promises'),file=await storage.store.load(kept.assets[0].ref);await unlink(file!.absolutePath);await checkedRetainedMedia(pool,await readRetainedMedia(pool,'workspace'),storage,60002);
 coverage=(await readMediaCoverage(pool,'workspace'))[0];assert.equal(coverage.images,0);assert.equal(coverage.reasons.file_missing,1);assert.equal(Object.values(coverage.reasons).reduce((a,b)=>a+b),10);
 const missing=await readMissingMedia(pool,'workspace',{reason:'file_missing'});assert.equal(missing.total,1);assert.equal(missing.ads[0].nativeId,'9005');assert.equal(missing.ads[0].copy,'Fictional source copy');assert.equal((await readMissingMedia(pool,'other-workspace')).total,0);
 const cards=await mergePreviewState(pool,'workspace',[browserCreative({brandId:'fictional-brand',nativeId:'9005'}),browserCreative({brandId:'fictional-brand',nativeId:'9001'})]);assert.equal(cards[0].previewState?.reason,'file_missing');assert.equal(cards[1].previewState?.reason,'no_media');
 const retry=await enqueueAdMedia(pool,'watch',new Date(Date.now()+25*3600000));assert(retry);assert((await pool.query('SELECT target_ids FROM ad_media_runs WHERE id=$1',[retry])).rows[0].target_ids.includes('9006'),'initial never-requested ads precede daily failed retries');assert.equal((await readMissingMedia(pool,'workspace',{reason:'file_missing'})).ads[0].nativeId,'9005');
}));
