// Disposable Postgres and fictional provider fixtures only; no live calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrate} from '../server/infrastructure/database.js';
import {enqueueAdMedia,claimAdMedia,stepAdMedia} from '../server/ad-media/jobs.js';
import {AdMediaActor} from '../server/ad-media/apify.js';
import {AdMediaStorage,mediaDiskMeasurement} from '../server/ad-media/storage.js';
import {readMediaCoverage,readMissingMedia} from '../server/ad-media/coverage.js';
const env={EXTER_AD_MEDIA_ENABLED:'true',APIFY_TOKEN:'fixture-only',EXTER_AD_MEDIA_GBP_PER_USD:'1'};
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]);
async function fixture(work:(pool:pg.Pool,storage:AdMediaStorage)=>Promise<void>,count=1){
 assert(process.env.TEST_DATABASE_URL);const schema='preview_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:8}),root=await mkdtemp(join(tmpdir(),'preview-'));
 const storage=new AdMediaStorage({root,disk:async()=>mediaDiskMeasurement(10*1024**3,9*1024**3),images:{resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async()=>new Response(png,{headers:{'content-type':'image/png'}}),probe:async()=>({width:40,height:40})}});
 try{await migrate(pool);await pool.query("UPDATE budget_settings SET monthly_budget_gbp=20 WHERE cost_type='data_providers'");await pool.query(`INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('watch','workspace','brand','["12001"]');INSERT INTO collection_runs(id,watchlist_id,config,status) VALUES('official','watch','{"revision":1}','complete');`);await pool.query(`INSERT INTO public_ads(platform,native_id,advertiser_id,start_time) SELECT 'Meta',(900000+n)::text,'12001',now()-((366-n/50.0)*interval '1 day') FROM generate_series(1,$1::int)n`,[count]);
 await pool.query(`INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload) SELECT 'Meta',native_id,'official','workspace','unknown','{}',jsonb_build_object('ad_creative_bodies',jsonb_build_array('A fictional candle.')) FROM public_ads`);await work(pool,storage);
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(root,{recursive:true,force:true});}
}
const actor=(rows:unknown[],starts:unknown[]=[])=>new AdMediaActor({env,fetch:async(target,init)=>{const u=new URL(String(target));if(init?.method==='POST'){starts.push(JSON.parse(String(init.body)));return Response.json({data:{id:'fixtureRun10000001',defaultDatasetId:'fixtureData100001'}});}if(u.pathname.endsWith('/items'))return Response.json(rows.slice(Number(u.searchParams.get('offset')),Number(u.searchParams.get('offset'))+1));return Response.json({data:{id:'fixtureRun10000001',status:'SUCCEEDED',chargedEventCounts:{'ad-result':rows.length,'apify-actor-start':1},pricingInfo:{pricingModel:'PAY_PER_EVENT',pricingPerEvent:{actorChargeEvents:{'ad-result':{eventPriceUsd:.0005},'apify-actor-start':{eventPriceUsd:.00005}}}}}});}});
async function tick(pool:pg.Pool,storage:AdMediaStorage,provider:AdMediaActor){await pool.query("UPDATE ad_media_runs SET available_at=now(),lease_until=NULL,lease_owner=NULL WHERE status IN ('queued','running')");const owner=randomUUID(),run=await claimAdMedia(pool,owner);assert(run);await stepAdMedia(pool,run.id,owner,{env,storage,actor:provider});return run.id;}

test('15,000 official ads backfill in 30 immediate batches; the longest-running 50 are in the first batch',async()=>fixture(async(pool,storage)=>{
 let id=await enqueueAdMedia(pool,'watch');assert(id);const seen=new Set<string>();const expected=(await pool.query('SELECT native_id FROM public_ads ORDER BY start_time,native_id LIMIT 50')).rows.map(r=>r.native_id);
 for(let batch=0;batch<30;batch++){
  const run:any=(await pool.query('SELECT * FROM ad_media_runs WHERE id=$1',[id])).rows[0];assert.equal(run.target_ids.length,500);if(batch===0)for(const native of expected)assert(run.target_ids.includes(native));
  for(const native of run.target_ids){assert(!seen.has(native));seen.add(native);}
  // Simulate the actor's already downloaded checkpoint, then execute its real terminal step.
  await pool.query("UPDATE ad_media_runs SET status='running',actor_run_id='fixtureRun10000001',dataset_id='fixtureData100001',result_offset=500,results=500,returned_ads=500 WHERE id=$1",[id]);
  await pool.query("INSERT INTO ad_media_requests(run_id,native_id,returned_at,matched_at,outcome,reprocess_version) SELECT $1,unnest($2::text[]),now(),now(),'stored','preview-v2'",[id,run.target_ids]);
  await pool.query(`INSERT INTO ad_media_creatives(id,run_id,workspace_id,brand_key,native_id,page_id,format,assets) SELECT $1||n,$1,'workspace','brand',n,'12001','image','[{"role":"image","index":0,"ref":{"artifactId":"fixture"}}]' FROM unnest($2::text[])n`,[id,run.target_ids]);
  const terminal=new AdMediaActor({env,fetch:async target=>new URL(String(target)).pathname.endsWith('/items')?Response.json([]):Response.json({data:{id:'fixtureRun10000001',status:'SUCCEEDED',chargedEventCounts:{'ad-result':500,'apify-actor-start':1},pricingInfo:{pricingModel:'PAY_PER_EVENT',pricingPerEvent:{actorChargeEvents:{'ad-result':{eventPriceUsd:.0005},'apify-actor-start':{eventPriceUsd:.00005}}}}}})});
  await tick(pool,storage,terminal);id=(await pool.query("SELECT id FROM ad_media_runs WHERE status='queued'")).rows[0]?.id||null;if(batch<29)assert(id,'next initial batch is queued by the terminal step itself');
 }
 assert.equal(seen.size,15000);assert.equal(id,null);const c=(await readMediaCoverage(pool,'workspace'))[0];assert.equal(c.requested,15000);assert.equal(c.images,15000);assert.equal(c.reasons.not_requested,0);
},15000));

test('not-found ads use one single-ID detail lookup without date or country filters, preserving official Page matching',async()=>fixture(async(pool,storage)=>{
 await enqueueAdMedia(pool,'watch');const starts:unknown[]=[];await tick(pool,storage,actor([],starts));await tick(pool,storage,actor([],starts));
 const fallback=(await pool.query("SELECT * FROM ad_media_runs WHERE status='queued'")).rows[0];assert.equal(fallback.lookup_mode,'ad_id');assert.deepEqual(fallback.target_ids,['900001']);
 const found={adArchiveId:'900001',pageId:'12001',displayFormat:'DPA',cards:[{title:'Fictional candle set',body:'Two candles for quiet evenings.',originalImageUrl:'https://fixture.fbcdn.net/product.webp'}]};
 const provider=actor([found],starts);await tick(pool,storage,provider);await tick(pool,storage,provider);await tick(pool,storage,provider);
 const input=starts[1] as any;assert.deepEqual(input.adArchiveIds,['900001']);assert.deepEqual(input.countries,['ALL']);assert.equal(input.fetchAdDetails,true);assert(!('deliveredAfter'in input));assert(!('deliveredBefore'in input));
 const c=(await readMediaCoverage(pool,'workspace'))[0];assert.equal(c.images,1);assert.equal(c.missing,0);assert.equal((await pool.query('SELECT product FROM ad_media_creatives')).rows[0].product.title,'Fictional candle set');
}));

test('legacy unsupported results reuse their paid dataset with zero new starts and retain file diagnostics',async()=>fixture(async(pool,storage)=>{
 const id=await enqueueAdMedia(pool,'watch');await pool.query("UPDATE ad_media_runs SET status='complete',actor_run_id='fixtureRun10000001',dataset_id='fixtureData100001' WHERE id=$1",[id]);await pool.query("INSERT INTO ad_media_requests(run_id,native_id,returned_at,outcome) VALUES($1,'900001',now(),'unsupported')",[id]);
 const replay=await enqueueAdMedia(pool,'watch');assert(replay);assert.equal((await pool.query('SELECT lookup_mode FROM ad_media_runs WHERE id=$1',[replay])).rows[0].lookup_mode,'reprocess');const starts:unknown[]=[];
 const provider=actor([{adArchiveId:'900001',pageId:'12001',displayFormat:'IMAGE',imageUrls:['https://fixture.fbcdn.net/product.png']}],starts);await tick(pool,storage,provider);await tick(pool,storage,provider);assert.equal(starts.length,0);assert.equal((await readMediaCoverage(pool,'workspace'))[0].images,1);assert.equal((await pool.query('SELECT count(*)::int n FROM cost_ledger')).rows[0].n,0);
 const files=(await pool.query('SELECT diagnostics FROM ad_media_creatives')).rows[0].diagnostics;assert.equal(files[0].type,'image/png');assert.equal(files[0].code,'stored');assert(!JSON.stringify(files).includes('https://'));
}));

test('an expired saved dataset queues a fresh exact-ID lookup without an unguarded paid restart',async()=>fixture(async(pool,storage)=>{
 const original=await enqueueAdMedia(pool,'watch');await pool.query("UPDATE ad_media_runs SET status='complete',actor_run_id='fixtureRun10000001',dataset_id='fixtureData100001' WHERE id=$1",[original]);await pool.query("INSERT INTO ad_media_requests(run_id,native_id,returned_at,outcome) VALUES($1,'900001',now(),'unsupported')",[original]);
 const replay=await enqueueAdMedia(pool,'watch');assert(replay);const expired=new AdMediaActor({env,fetch:async()=>Response.json({error:'private provider text fixture-only https://private.example/'},{status:404})});await tick(pool,storage,expired);
 const fresh=(await pool.query("SELECT * FROM ad_media_runs WHERE status='queued'")).rows[0];assert.equal(fresh.lookup_mode,'ad_id');assert.deepEqual(fresh.target_ids,['900001']);assert.equal((await pool.query('SELECT count(*)::int n FROM cost_ledger')).rows[0].n,0);
 await pool.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='data_providers'");let calls=0;await tick(pool,storage,new AdMediaActor({env,fetch:async()=>{calls++;assert.fail('No paid start after budget refusal');}}));assert.equal(calls,0);assert.equal((await pool.query('SELECT error_kind FROM ad_media_runs WHERE id=$1',[fresh.id])).rows[0].error_kind,'budget');
 const diagnostics=JSON.stringify((await readMissingMedia(pool,'workspace')).ads);assert(!diagnostics.includes('private provider')&&!diagnostics.includes('fixture-only'));
}));

test('legacy undispatched newest-first plans are retained and replaced before any paid dispatch',async()=>fixture(async(pool,storage)=>{
 const old=await enqueueAdMedia(pool,'watch');await pool.query("UPDATE ad_media_runs SET preview_policy='legacy',target_ids='[\"900060\"]' WHERE id=$1",[old]);const owner=randomUUID();await pool.query("UPDATE ad_media_runs SET lease_owner=$2,lease_until=now()+interval '6 minutes' WHERE id=$1",[old,owner]);
 let starts=0;await stepAdMedia(pool,old!,owner,{env,storage,actor:actor([],[])});const prior=(await pool.query('SELECT status FROM ad_media_runs WHERE id=$1',[old])).rows[0];assert.equal(prior.status,'failed');const current=(await pool.query("SELECT * FROM ad_media_runs WHERE status='queued'")).rows[0];assert.equal(current.preview_policy,'preview-v2');assert.equal(current.target_ids[0],'900001');assert.equal((await pool.query('SELECT count(*)::int n FROM cost_ledger')).rows[0].n,0);
},60));
