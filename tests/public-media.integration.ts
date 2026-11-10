// Disposable local Postgres only. Every provider/file response is fictional.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../server/infrastructure/database.js';
import {enqueueAdMedia,claimAdMedia,stepAdMedia} from '../server/ad-media/jobs.js';
import {AdMediaActor} from '../server/ad-media/apify.js';
import {AdMediaStorage,mediaDiskMeasurement} from '../server/ad-media/storage.js';
import {mergePreviewState} from '../server/ad-media/read.js';
import {enqueueCategoryBatch,claimCategoryBatch,stepCategoryBatch,mergeProductCategories} from '../server/public-categories/jobs.js';
import {PublicCategoryProvider} from '../server/public-categories/provider.js';
import {browserCreative} from './fixtures/creative-browser.js';
const env={EXTER_AD_MEDIA_ENABLED:'true',APIFY_TOKEN:'fixture-only',EXTER_AD_MEDIA_GBP_PER_USD:'1',GEMINI_API_KEY:'fixture-only',GEMINI_REQUEST_RESERVE_GBP:'.1'};
async function fixture(work:(pool:pg.Pool)=>Promise<void>,count=12){
 assert(process.env.TEST_DATABASE_URL,'Use a dedicated disposable TEST_DATABASE_URL.');const schema='public_media_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:5});
 try{await migrate(pool);await migrate(pool);await pool.query("UPDATE budget_settings SET monthly_budget_gbp=20");
  await pool.query(`INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('own','workspace','house','["12"]'),('rival','workspace','rival','["13"]');
   INSERT INTO collection_runs(id,watchlist_id,config,status) VALUES('official','own','{"revision":1}','complete');`);
  await pool.query(`INSERT INTO public_ads(platform,native_id,advertiser_id,start_time,first_seen_at) SELECT 'Meta',(1000+n)::text,'12','2026-10-20','2026-11-01' FROM generate_series(1,$1::integer)n`,[count]);
  await pool.query(`INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,raw_payload,reach,active_status,observed_at,last_confirmed_at) SELECT 'Meta',native_id,'official','workspace',jsonb_build_object('ad_creative_bodies',jsonb_build_array('A candle for a quiet evening. Product '||native_id),'ad_creative_link_titles',jsonb_build_array('A warm home'),'ad_creative_link_captions',jsonb_build_array('https://fictional.example/candles?do_not_save=private'),'eu_total_reach',1234),'{}','unknown','2026-11-09','2026-11-09' FROM public_ads`);
  await work(pool);
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
const emptyActor=(started:()=>void)=>new AdMediaActor({env,fetch:async(_url,init)=>{if(init?.method==='POST'){started();return Response.json({data:{id:'fixtureRun10000001',defaultDatasetId:'fixtureData100001'}});}if(String(_url).includes('/items'))return Response.json([]);return Response.json({data:{id:'fixtureRun10000001',status:'SUCCEEDED'}});}});
async function mediaTick(pool:pg.Pool,actor:AdMediaActor){await pool.query("UPDATE ad_media_runs SET available_at=now(),lease_until=NULL,lease_owner=NULL WHERE status IN ('queued','running')");const owner=randomUUID(),run=await claimAdMedia(pool,owner);assert(run);await stepAdMedia(pool,run.id,owner,{env,actor,storage:new AdMediaStorage({disk:async()=>mediaDiskMeasurement(10*1024**3,9*1024**3)})});return run.id;}
async function categoryTick(pool:pg.Pool,provider:PublicCategoryProvider){await pool.query("UPDATE public_category_batches SET available_at=now(),lease_until=NULL,lease_owner=NULL WHERE status IN ('queued','running')");const owner=randomUUID(),run=await claimCategoryBatch(pool,owner);assert(run);await stepCategoryBatch(pool,run.id,owner,{env,provider});return run.id;}
function categoryProvider(onStart?:(requests:any[])=>void){let requests:any[]=[];return new PublicCategoryProvider({env,fetch:async(_url,init)=>{if(init?.method==='POST'){requests=JSON.parse(String(init.body)).batch.input_config.requests.requests;onStart?.(requests);return Response.json({name:'batches/fixture-1'});}return Response.json({done:true,metadata:{state:'JOB_STATE_SUCCEEDED'},response:{inlinedResponses:{inlinedResponses:[...requests].reverse().map(item=>({metadata:item.metadata,response:{modelVersion:'gemini-2.5-flash-lite',usageMetadata:{promptTokenCount:10,candidatesTokenCount:2},candidates:[{content:{parts:[{text:'{"categories":["candles","home fragrance"]}'}]}}]}}))}}});}});}

test('daily missing-preview attempts count distinct UK days and keep reasons, without altering official history',async()=>fixture(async pool=>{
 const before=(await pool.query('SELECT row_to_json(o)::text AS data FROM ad_observations o ORDER BY native_id')).rows;let starts=0;const actor=emptyActor(()=>starts++);
 for(let day=1;day<=7;day++){
  const date=`2026-11-${String(day+8).padStart(2,'0')}`;assert(await enqueueAdMedia(pool,'own',new Date(date+'T12:00:00Z')));const id=await mediaTick(pool,actor);
  await pool.query("UPDATE ad_media_requests SET requested_at=$2::timestamptz WHERE run_id=$1",[id,date+'T12:00:00Z']);await mediaTick(pool,actor);
  assert.equal(await enqueueAdMedia(pool,'own',new Date(date+'T20:00:00Z')),null);
  const rows=await mergePreviewState(pool,'workspace',[browserCreative({brandId:'house',nativeId:'1001'})]);assert.equal(rows[0].previewState?.failedDays,day);assert.equal(rows[0].previewState?.reason,'not_returned');
 }
 assert.equal(starts,7);assert.deepEqual((await pool.query('SELECT row_to_json(o)::text AS data FROM ad_observations o ORDER BY native_id')).rows,before);
}));
test('budget pauses and missing keys make no provider calls and add no failed preview day',async()=>fixture(async pool=>{
 await pool.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='data_providers'");let calls=0;await enqueueAdMedia(pool,'own');await mediaTick(pool,emptyActor(()=>calls++));assert.equal(calls,0);assert.equal((await pool.query('SELECT count(*)::integer AS n FROM ad_media_preview_days')).rows[0].n,0);
}));
test('video upgrades preserve priority, then newest ordering, and stop queuing at the 80 percent limit',async()=>fixture(async pool=>{
 const assets=JSON.stringify([{role:'poster',index:0,ref:{artifactId:'a'.repeat(64),workspaceId:'workspace',mimeType:'image/jpeg',bytes:1,sha256:'a'.repeat(64)}}]);
 await pool.query(`INSERT INTO ad_media_runs(id,watchlist_id,workspace_id,brand_key,revision,page_id,window_from,window_to,phase,cap,status) VALUES('prior','own','workspace','house',1,'12','2025-11-09','2026-11-09','missing',12,'complete');
 UPDATE ad_observations SET raw_payload=raw_payload-'eu_total_reach';
 UPDATE public_ads SET start_time=CASE native_id WHEN '1001' THEN '2026-10-01'::timestamptz WHEN '1002' THEN '2026-10-30'::timestamptz ELSE '2026-10-20'::timestamptz END;`);
 await pool.query("INSERT INTO ad_media_creatives(id,run_id,workspace_id,brand_key,page_id,native_id,format,assets,expected_videos,created_at) SELECT native_id,'prior','workspace','house','12',native_id,'video',$1,1,now()-interval '2 days' FROM public_ads",[assets]);
 await pool.query('INSERT INTO ad_media_disk_health(id,data) VALUES(1,$1)',[JSON.stringify(mediaDiskMeasurement(10*1024**3,9*1024**3))]);
 const id=await enqueueAdMedia(pool,'own',new Date('2026-11-09T12:00:00Z'));const run=(await pool.query('SELECT * FROM ad_media_runs WHERE id=$1',[id])).rows[0];assert.equal(run.download_videos,true);assert.equal(run.target_ids[0],'1001');assert.equal(run.target_ids[1],'1002');
 await pool.query("UPDATE ad_media_runs SET status='complete' WHERE id=$1",[id]);await pool.query('UPDATE ad_media_disk_health SET data=$1',[JSON.stringify(mediaDiskMeasurement(10*1024**3,2*1024**3))]);assert.equal(await enqueueAdMedia(pool,'own',new Date('2026-11-09T12:00:00Z')),null);
}));
test('classification batches are fenced, affordable and keyed to exact ads, not output order; labels preserve reach/dates',async()=>fixture(async pool=>{
 const before=(await pool.query('SELECT row_to_json(o)::text AS data FROM ad_observations o ORDER BY native_id')).rows;
 const id=await enqueueCategoryBatch(pool,'workspace');assert(id);assert.equal(await enqueueCategoryBatch(pool,'workspace'),null);let starts=0;const provider=categoryProvider(()=>starts++);
 await categoryTick(pool,provider);assert.equal((await pool.query('SELECT status FROM cost_ledger')).rows[0].status,'reserved');await categoryTick(pool,provider);
 assert.equal(starts,1);assert.equal((await pool.query('SELECT count(*)::integer AS n FROM public_ad_categories')).rows[0].n,12);assert.equal((await pool.query('SELECT status FROM cost_ledger')).rows[0].status,'settled');
 const rows=await mergeProductCategories(pool,'workspace',[browserCreative({brandId:'house',nativeId:'1001',copy:'A candle for a quiet evening. Product 1001',headlines:['A warm home'],landingPaths:['/candles']})]);assert.deepEqual(rows[0].productCategories,['candles','home fragrance']);assert.equal(rows[0].publicReach,undefined);
 assert.deepEqual((await pool.query('SELECT row_to_json(o)::text AS data FROM ad_observations o ORDER BY native_id')).rows,before);
 const all=JSON.stringify((await pool.query('SELECT row_to_json(c) AS data FROM public_ad_categories c UNION ALL SELECT row_to_json(b) FROM public_category_batches b')).rows);assert.ok(!all.includes('fixture-only')&&!all.includes('https://')&&!all.includes('do_not_save'));
 assert.equal(await enqueueCategoryBatch(pool,'workspace'),null);assert.equal((await mergeProductCategories(pool,'other',rows))[0].productCategories?.length,2,'caller-owned rows are unchanged by another empty workspace read');
}));
test('520 ads queue across batches without overlapping targets or a 24-hour serial bottleneck',async()=>fixture(async pool=>{
 const ids=await Promise.all([enqueueCategoryBatch(pool,'workspace'),enqueueCategoryBatch(pool,'workspace')]);assert(ids.every(Boolean));const batches=(await pool.query('SELECT items FROM public_category_batches ORDER BY jsonb_array_length(items) DESC')).rows;assert.deepEqual(batches.map(r=>r.items.length),[500,20]);assert.equal(new Set(batches.flatMap(r=>r.items.map((i:any)=>i.key))).size,520);assert.equal(await enqueueCategoryBatch(pool,'workspace'),null);
},520));
test('category budget/missing-key and uncertain-start paths retain guards without duplicate paid dispatch',async()=>fixture(async pool=>{
 const id=await enqueueCategoryBatch(pool,'workspace');let calls=0;const provider=categoryProvider(()=>calls++);
 await pool.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='inference'");await categoryTick(pool,provider);assert.equal(calls,0);assert.equal((await pool.query('SELECT error_kind FROM public_category_batches WHERE id=$1',[id])).rows[0].error_kind,'budget');
 await pool.query("UPDATE budget_settings SET monthly_budget_gbp=20 WHERE cost_type='inference'");await pool.query("UPDATE public_category_batches SET status='queued'");
 const failed=new PublicCategoryProvider({env,fetch:async()=>{calls++;throw new Error('private provider error fixture-only');}});await categoryTick(pool,failed);assert.equal(calls,1);assert.equal((await pool.query('SELECT status FROM public_category_batches WHERE id=$1',[id])).rows[0].status,'uncertain');assert.equal((await pool.query('SELECT status FROM cost_ledger')).rows[0].status,'reserved');
 assert.equal(await claimCategoryBatch(pool,randomUUID()),null);assert.equal(calls,1);
}));

test('known rejected category starts release their hold; malformed keyed results retain it and never mislabel an ad',async()=>fixture(async pool=>{
 const id=await enqueueCategoryBatch(pool,'workspace');let starts=0;
 const rejected=new PublicCategoryProvider({env,fetch:async()=>{starts++;return new Response('private text must not be saved',{status:400});}});
 await categoryTick(pool,rejected);assert.equal(starts,1);assert.equal((await pool.query('SELECT status FROM public_category_batches WHERE id=$1',[id])).rows[0].status,'failed');assert.equal((await pool.query('SELECT status FROM cost_ledger')).rows[0].status,'released');
 await pool.query("UPDATE public_category_batches SET created_at=now()-interval '2 days',available_at=now()-interval '2 days',finished_at=now()-interval '2 days'");await enqueueCategoryBatch(pool,'workspace');
 const malformed=new PublicCategoryProvider({env,fetch:async(_url,init)=>init?.method==='POST'?Response.json({name:'batches/fixture-bad'}):Response.json({done:true,metadata:{state:'JOB_STATE_SUCCEEDED'},response:{inlinedResponses:[{metadata:{key:'unrequested'},response:{candidates:[{content:{parts:[{text:'{"categories":["fashion"]}'}]}}]}}]}})});
 await categoryTick(pool,malformed);await categoryTick(pool,malformed);assert.equal((await pool.query('SELECT count(*)::integer AS n FROM public_ad_categories')).rows[0].n,0);assert.equal((await pool.query("SELECT status FROM public_category_batches WHERE provider_name IS NOT NULL")).rows[0].status,'failed');assert.equal((await pool.query("SELECT count(*)::integer AS n FROM cost_ledger WHERE status='reserved'")).rows[0].n,1);
}));
test('changed copy invalidates category labels, while reach restatements do not',async()=>fixture(async pool=>{
 await enqueueCategoryBatch(pool,'workspace');const provider=categoryProvider();await categoryTick(pool,provider);await categoryTick(pool,provider);
 const original=browserCreative({brandId:'house',nativeId:'1001',copy:'A candle for a quiet evening. Product 1001',headlines:['A warm home'],landingPaths:['/candles']});
 assert.equal((await mergeProductCategories(pool,'workspace',[original]))[0].productCategories?.length,2);
 assert.equal((await mergeProductCategories(pool,'workspace',[{...original,copy:'A cotton shirt for summer.'}]))[0].productCategories,undefined);
 assert.equal((await mergeProductCategories(pool,'workspace',[{...original,deliveryStartAt:'2026-10-21',daysRunning:40}]))[0].productCategories?.length,2);
 await pool.query("UPDATE ad_observations SET raw_payload=jsonb_set(raw_payload,'{ad_creative_bodies}','[\"A cotton shirt for summer.\"]') WHERE native_id='1001'");
 const next=await enqueueCategoryBatch(pool,'workspace');assert(next);assert.equal((await pool.query('SELECT jsonb_array_length(items) AS n FROM public_category_batches WHERE id=$1',[next])).rows[0].n,1);
}));
test('legacy video posters remain eligible for full-video upgrades without re-buying known full videos',async()=>fixture(async pool=>{
 const id=await enqueueAdMedia(pool,'own'),owner=randomUUID();await claimAdMedia(pool,owner);
 await stepAdMedia(pool,id!,owner,{env,actor:emptyActor(()=>assert.fail('Known posters need no paid preview call.')),existingIds:new Set(Array.from({length:12},(_,i)=>String(1001+i))),existingVideoCandidates:new Set(['1001','1002']),existingVideoIds:new Set(['1002'])});
 await pool.query('INSERT INTO ad_media_disk_health(id,data) VALUES(1,$1)',[JSON.stringify(mediaDiskMeasurement(10*1024**3,9*1024**3))]);
 const next=await enqueueAdMedia(pool,'own');assert(next);const run=(await pool.query('SELECT download_videos,target_ids FROM ad_media_runs WHERE id=$1',[next])).rows[0];assert(run.download_videos);assert.deepEqual(run.target_ids,['1001']);
}));
test('a failed media poll records one controlled failed day and cannot increment it twice',async()=>fixture(async pool=>{
 const id=await enqueueAdMedia(pool,'own');await mediaTick(pool,emptyActor(()=>{}));
 const failed=new AdMediaActor({env,fetch:async()=>{throw new Error('private-provider-text https://do-not-store.example/ fixture-only');}});
 await mediaTick(pool,failed);const rows=(await pool.query('SELECT native_id,reason FROM ad_media_preview_days')).rows;assert.equal(rows.length,12);assert(rows.every(row=>row.reason==='provider'));
 await pool.query("UPDATE ad_media_runs SET status='running'");await mediaTick(pool,failed);assert.equal((await pool.query('SELECT count(*)::integer AS n FROM ad_media_preview_days')).rows[0].n,12);
 const run=(await pool.query('SELECT error_kind FROM ad_media_runs WHERE id=$1',[id])).rows[0];assert.equal(run.error_kind,'provider');
}));

test('completing an official collection automatically hands its new ads to the media queue without a paid media start',async()=>fixture(async pool=>{
 const {enqueueCollection,workOnce}=await import('../server/infrastructure/jobs.js'),{MetaLibraryConnector}=await import('../server/connectors/meta-library.js');
 const run=await enqueueCollection(pool,'own');let calls=0;
 const connector=new MetaLibraryConnector({token:'fixture-only',fetch:async()=>{calls++;return Response.json({data:[{id:'9999',page_id:'12',ad_creative_bodies:['A new fictional candle.'],ad_delivery_start_time:'2026-11-09'}]});}});
 assert(await workOnce(pool,connector,{env:{...env,EXTER_META_LIBRARY_ENABLED:'true'},paceMs:0}));assert.equal(calls,1);assert.equal((await pool.query('SELECT status FROM collection_runs WHERE id=$1',[run])).rows[0].status,'complete');
 const queued=(await pool.query('SELECT status,target_ids FROM ad_media_runs')).rows;assert.equal(queued.length,1);assert.equal(queued[0].status,'queued');assert.equal(queued[0].target_ids[0],'9999');assert.equal((await pool.query("SELECT count(*)::integer AS n FROM cost_ledger WHERE provider='apify_ad_media'")).rows[0].n,0);
}));

test('text tagging runs independently of the media switch, quotes one bounded batch and never exceeds its reviewed reserve',async()=>fixture(async pool=>{
 const {categoryQuote,workPublicCategoriesOnce}=await import('../server/public-categories/jobs.js');
 const configured={...env,EXTER_AD_MEDIA_ENABLED:'false'},quote=await categoryQuote(pool,'workspace',configured);assert.equal(quote.ads,12);assert(quote.estimatedGbp>0);assert(quote.reserveGbp>=quote.estimatedGbp);
 const id=await enqueueCategoryBatch(pool,'workspace',new Date(),{hash:quote.hash,env:configured});assert(id);assert.equal(Number((await pool.query('SELECT max_cost_gbp FROM public_category_batches WHERE id=$1',[id])).rows[0].max_cost_gbp),quote.reserveGbp);
 let starts=0;const provider=categoryProvider(()=>starts++);
 await workPublicCategoriesOnce(pool,{env:configured,provider});assert.equal(starts,1);await pool.query('UPDATE public_category_batches SET available_at=now()');await workPublicCategoriesOnce(pool,{env:configured,provider});
 assert.equal((await pool.query('SELECT count(*)::integer AS n FROM public_ad_categories')).rows[0].n,12);assert.equal((await pool.query('SELECT status FROM public_category_batches WHERE id=$1',[id])).rows[0].status,'complete');
 await assert.rejects(()=>enqueueCategoryBatch(pool,'workspace',new Date(),{hash:quote.hash,env:configured}));assert.equal(starts,1);
}));
test('a paused tagging batch can be resumed from a fresh quote without holding another reserve',async()=>fixture(async pool=>{
 const {categoryQuote}=await import('../server/public-categories/jobs.js'),id=await enqueueCategoryBatch(pool,'workspace');
 await pool.query("UPDATE public_category_batches SET status='paused',error_kind='configuration' WHERE id=$1",[id]);
 const quote=await categoryQuote(pool,'workspace',env);assert.equal(quote.ads,12);assert.equal('resume' in quote&&quote.resume,true);
 assert.equal(await enqueueCategoryBatch(pool,'workspace',new Date(),{hash:quote.hash,env}),id);assert.equal((await pool.query('SELECT status FROM public_category_batches WHERE id=$1',[id])).rows[0].status,'queued');assert.equal((await pool.query('SELECT count(*)::integer AS n FROM cost_ledger')).rows[0].n,0);
}));
