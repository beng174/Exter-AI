import {creativeFixture} from './fixtures/creative-sql.js';
// Disposable Postgres only. No provider requests or production data.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../server/infrastructure/database.js';
import {refreshCreativeIndex} from '../server/infrastructure/creative-index.js';
import {readCreativePage} from '../server/infrastructure/creative-pages.js';
import {openDatabase} from '../server/db.js';
import {CreativeGalleryService} from '../server/demo/gallery.js';
import {mergePublicEvidence} from '../server/infrastructure/meta-evidence.js';
import {brandSnapshots} from '../shared/creative-research.js';
import {sqlSnapshots} from '../shared/creative-read-model.js';
import {ownedPagePerformance} from '../server/infrastructure/owned-read.js';
import {ownedMetrics} from '../shared/owned-metrics.js';
import {ownedDay,browserCreative} from './fixtures/creative-browser.js';
import {CATEGORY_VERSION} from '../server/public-categories/provider.js';
import {mixGroups,comparisonGroups} from '../shared/creative-research.js';
import {sourceFormatSql} from '../server/infrastructure/public-rows-sql.js';
import {sourceAdFormat} from '../shared/source-ad-format.js';
import type {Brand} from '../shared/types.js';

test('SQL pages keep complete totals, stable order and filters without transferring raw payloads',async()=>creativeFixture(async(pool,db,brand,gallery)=>{
 await refreshCreativeIndex(pool,db,brand,[],gallery);const first=await readCreativePage(pool,brand,[],{screen:'creatives',sort:'days'},new Date('2026-11-10'));
 assert.equal(first.rows.length,50);assert.equal(first.model.page.total,120);assert.equal(first.model.coverage.ads,120);assert.equal(first.model.coverage.formatKnown,120);assert.equal(first.model.page.hasNext,true);
 assert(!JSON.stringify(first).includes('beneficiary_payers'));assert(!JSON.stringify(first).includes('x'.repeat(100)));
 const second=await readCreativePage(pool,brand,[],{screen:'creatives',sort:'days',offset:'50'},new Date('2026-11-10'));assert.equal(second.rows.length,50);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.adId)).size,100);
 const filtered=await readCreativePage(pool,brand,[],{screen:'creatives',search:'Product 1000120'},new Date('2026-11-10'));assert.equal(filtered.model.page.total,1);assert.equal(filtered.rows[0].nativeId,'1000120');
 const old=(await pool.query(`SELECT o.*,a.*,w.brand_key,w.page_ids FROM ad_observations o JOIN public_ads a USING(platform,native_id) JOIN collection_runs r ON r.id=o.run_id JOIN watchlists w ON w.id=r.watchlist_id`)).rows;
 const rows=mergePublicEvidence([],old,brand,[]),library={brand,creatives:rows,competitors:[]} as any;
 assert.deepEqual(sqlSnapshots(first.model,brand.id,[{id:brand.id,name:brand.name,status:'saved'}],first.model.window),brandSnapshots(library,first.model.window));
 const count=(await pool.query('SELECT count(*)::integer AS n FROM web_creative_index')).rows[0].n;
 await refreshCreativeIndex(pool,db,brand,[],gallery);assert.equal((await pool.query('SELECT count(*)::integer AS n FROM web_creative_index')).rows[0].n,count);
 await pool.query(`INSERT INTO public_category_batches(id,workspace_id,items,status,model) VALUES('labels','workspace','[]','complete','fixture')`);
 await pool.query(`INSERT INTO public_ad_categories SELECT workspace_id,brand_key,page_id,native_id,category_hash,$1,'fixture','["candles"]','labels',now() FROM web_creative_index WHERE source_type='official'`,[CATEGORY_VERSION]);
 await refreshCreativeIndex(pool,db,brand,[],gallery);
 const grouped=await readCreativePage(pool,brand,[],{screen:'formats'},new Date('2026-11-10'));assert.equal(grouped.model.cohorts[0].yours,120);assert.equal(grouped.model.cohorts[0].hidden,false);assert.equal(grouped.model.coverage.tagged,120);
 assert.equal((await readCreativePage(pool,brand,[],{screen:'overview'},new Date('2026-11-10'))).rows.length,5);
 const detail=await readCreativePage(pool,brand,[],{screen:'detail',ad:'public:Meta:1000060',sort:'days'},new Date('2026-11-10'));assert.equal(detail.model.detailOrder?.length,3);assert(detail.rows.some(r=>r.nativeId==='1000060'));assert(detail.rows.length<=9);
 for(const screen of ['overview','competitors','formats','patterns','audience','winners','data']){const page=await readCreativePage(pool,brand,[],{screen,previews:'all'},new Date('2026-11-10'));assert(page.rows.length<=100);assert.equal(page.model.coverage.ads,120);}
 await pool.query(`UPDATE ad_observations SET raw_payload=jsonb_set(raw_payload,'{ad_creative_bodies}','["The same full candle copy."]'),payload_hash=md5(native_id||'changed-copy') WHERE native_id IN ('1000001','1000120')`);
 await refreshCreativeIndex(pool,db,brand,[],gallery);
 const versioned=await readCreativePage(pool,brand,[],{screen:'detail',ad:'public:Meta:1000001'},new Date('2026-11-10'));assert.equal(versioned.rows.find(r=>r.nativeId==='1000001')!.publicVersionCount,2,'Versions include matching ads outside the bounded detail examples.');
 await pool.query(`UPDATE web_creative_index SET data=jsonb_set(data,'{score}','{"analysedAt":"2026-01-01"}') WHERE native_id='1000120'`);
 const scores=await readCreativePage(pool,brand,[],{screen:'scores'},new Date('2026-11-10'));assert.equal(scores.model.page.total,1);assert.equal(scores.rows[0].nativeId,'1000120','A saved older score is not displaced by newer unanalysed ads.');
 const referenced=await readCreativePage(pool,brand,[],{screen:'briefs',refs:JSON.stringify(['public:Meta:1000060']),limit:'100'},new Date('2026-11-10'));assert.equal(referenced.rows.length,1);assert.equal(referenced.rows[0].nativeId,'1000060');assert(referenced.model.cohorts[0].yours>=10);
}));
test('SQL format metadata matches the existing source-format rules for cards, snapshots and missing fields',async()=>creativeFixture(async pool=>{
 const fixtures=[{}, {source_format:'VIDEO'},{display_format:'DPA'},{ad_creative_bodies:['{{product.name}}']},{snapshot:{cards:[{video_sd_url:'https://fixture.invalid/video'}]}},{snapshot:{cards:[{imageUrl:'https://fixture.invalid/image'}]}},{cards:[{},{}]}, {video_hd_url:false},{video_hd_url:''},{videos:[],snapshot:{videos:[{}]}},{source_format:false,displayFormat:'VIDEO'},{cards:null,snapshot:{cards:[{},{}]}},{images:[{}]}];
 for(const value of fixtures){const result=await pool.query(`SELECT ${sourceFormatSql('$1::jsonb')} AS format`,[JSON.stringify(value)]);assert.equal(result.rows[0].format,sourceAdFormat(value),JSON.stringify(value));}
},1));
test('SQL-owned aggregates match every existing formula, preserving null, zero, sample gates and scopes',async()=>creativeFixture(async(pool,_db,brand)=>{
 await pool.query(`INSERT INTO owned_accounts(id,workspace_id,platform,account_id,currency,attribution,conversion_event) VALUES('a','workspace','Meta','account-a','GBP','7d_click','purchase'),('b','workspace','Meta','account-b','USD','7d_click','purchase')`);
 const days=[ownedDay({adId:'1000001'}),ownedDay({adId:'1000001',day:'2026-11-02',spend:0,purchases:0,earlyViews:null}),ownedDay({adId:'1000002',purchases:1,spend:null,impressions:20}),ownedDay({accountId:'account-b',currency:'USD',adId:'1000001',spend:999})];
 for(const d of days)await pool.query(`INSERT INTO owned_ad_days VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[d.accountId==='account-a'?'a':'b',d.platform,d.adId,d.day,d.attribution,d.currency,d.conversionEvent,d.pulledAt,JSON.stringify(d)]);
 const result=await ownedPagePerformance(pool,brand.id,[browserCreative({nativeId:'1000001',workspaceBrand:true}),browserCreative({nativeId:'1000002',workspaceBrand:false})],'2026-11-01','2026-11-09');
 assert.equal(result.rows[0].performance.length,2);assert.equal(result.rows[1].performance.length,0);
 for(const p of result.rows[0].performance){const scope=days.filter(d=>d.accountId===p.accountId);assert.deepEqual(p.benchmark,ownedMetrics(scope));assert.deepEqual(p.metrics,ownedMetrics(scope.filter(d=>d.adId==='1000001')));assert.equal(p.benchmarkSampleSize,new Set(scope.map(d=>d.adId)).size);}
 assert.equal(result.scopes.length,2);
}));
test('the read index preserves imported copy and analysis identity when official observations match it',async()=>creativeFixture(async(pool,db,brand,gallery)=>{
 const ad={id:'immutable-import',brandId:brand.id,brand:brand.name,providerAdId:'1000001',source:'import',platform:'Meta',category:brand.category,title:'Imported title',copy:'An imported candle message.',format:'Video',owned:false,active:true,deliveryStatus:'active',deliveryStartAt:'2026-10-01T00:00:00Z',observedAt:'2026-11-08T00:00:00Z',publishedAt:'2026-10-01',publisherPlatforms:['facebook']};
 db.prepare('INSERT INTO ads VALUES(?,?,?,?,?,?)').run(ad.id,brand.id,ad.source,ad.platform,ad.observedAt,JSON.stringify(ad));
 const before=db.prepare('SELECT data FROM ads WHERE id=?').get(ad.id);
 await refreshCreativeIndex(pool,db,brand,[],gallery);const page=await readCreativePage(pool,brand,[],{screen:'creatives',ad:'immutable-import'},new Date('2026-11-10'));
 assert.equal(page.model.page.total,1);assert.equal(page.rows[0].adId,ad.id);assert.equal(page.rows[0].copy,ad.copy);assert.equal(page.rows[0].observedAt,'2026-11-09T00:00:00.000Z');assert.equal(page.rows[0].publicEvidence,true);assert.equal(page.rows[0].publicReach?.locations.value?.[0].reach,1);
 assert.deepEqual(db.prepare('SELECT data FROM ads WHERE id=?').get(ad.id),before);
},1));

import express from 'express';
import {createServer} from 'node:http';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {indexCreativeChunk,firstIndexCheckpoint} from '../server/infrastructure/creative-index.js';
import {enqueueCreativeIndex,attachCreativeIndexStep,workCreativeIndexOnce} from '../server/infrastructure/creative-index-jobs.js';
import {attachCreativeBrowser} from '../server/demo/creative-browser.js';
import {apiFailureLogging} from '../server/infrastructure/api-errors.js';

test('20,000 real-shaped ads: pages stay fast during committed indexing and a cancelled chunk resumes', {timeout:240000},async()=>creativeFixture(async(pool,db,brand,gallery)=>{
 await pool.query(`UPDATE ad_observations SET raw_payload=raw_payload||jsonb_build_object(
  'ad_creative_link_titles',jsonb_build_array('A candle for quiet evenings'),
  'ad_creative_link_captions',jsonb_build_array('fictional.example'),
  'ad_creative_link_urls',jsonb_build_array('https://fictional.example/collections/candles'),
  'publisher_platforms',jsonb_build_array('facebook','instagram'),'languages',jsonb_build_array('en'),
  'eu_total_reach',12000+native_id::integer%1000,
  'target_ages',jsonb_build_array('25','65+'),'target_gender','All',
  'target_locations',jsonb_build_array(jsonb_build_object('name','United Kingdom')),
  'age_country_gender_reach_breakdown',jsonb_build_array(jsonb_build_object('country','GB','age_gender_breakdowns',jsonb_build_array(jsonb_build_object('age_range','25-34','male',120,'female',180)))),
  'snapshot',jsonb_build_object('display_format','VIDEO','cards',jsonb_build_array(jsonb_build_object('title','Quiet evenings','video_sd_url','https://media.fixture.example/preview.mp4'))))`);
 const app=express(),logs:string[]=[];app.use(apiFailureLogging(line=>logs.push(line)));attachCreativeBrowser(app,db,{getPool:()=>pool,now:()=>new Date('2026-11-10')});
 const env={EXTER_AD_MEDIA_BROKER_TOKEN:'fixture-index-machine-key-1234567890',EXTER_AD_MEDIA_BROKER_ORIGIN:'https://index.fixture.example'};
 attachCreativeIndexStep(app,db,()=>pool,env);
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`;
 const request=async(screen:string)=>{const start=performance.now(),res=await fetch(`${base}/api/brands/workspace/creatives?window=research&screen=${screen}&previews=all`);assert.equal(res.status,200,await(res.ok?Promise.resolve(''):res.text()));const data=await res.json();assert(data.creatives.length<=50);return {data,ms:performance.now()-start};};
 try{
  await enqueueCreativeIndex(pool,brand.id);
  const cold=await request('creatives');assert(cold.ms<2000,`Cold page ${cold.ms}ms`);assert.equal(cold.data.creatives.length,48);assert.equal(cold.data.sql.indexing.total,20000);assert.equal(cold.data.sql.indexing.indexed,0);assert.equal(cold.data.sql.indexing.fallback,true);
  const brokerFetch:typeof fetch=async(input,init)=>{const url=new URL(String(input));return fetch(base+url.pathname,init);};
  await workCreativeIndexOnce(pool,{env,fetch:brokerFetch});await workCreativeIndexOnce(pool,{env,fetch:brokerFetch});await workCreativeIndexOnce(pool,{env,fetch:brokerFetch});
  const before=(await pool.query('SELECT checkpoint,processed FROM creative_index_jobs WHERE id=$1',[brand.id])).rows[0];assert.equal(before.processed,500);
  const partial=await request('creatives');assert(partial.ms<2000,`Partial page ${partial.ms}ms`);assert.equal(partial.data.sql.indexing.indexed,500);assert.equal(partial.data.sql.coverage.ads,500);
  await assert.rejects(indexCreativeChunk(pool,db,brand,[],gallery,{checkpoint:before.checkpoint,beforeWrite:async client=>{await client.query("SET LOCAL statement_timeout='10ms'");await client.query('SELECT pg_sleep(0.1)');}}),{code:'57014'});
  assert.equal((await pool.query('SELECT count(*)::integer AS n FROM web_creative_index')).rows[0].n,500,'Earlier committed chunks survive a timeout.');
  assert.deepEqual((await pool.query('SELECT checkpoint,processed FROM creative_index_jobs WHERE id=$1',[brand.id])).rows[0],before,'The failed chunk never advances its durable cursor.');
  // A live read overlaps a deliberately delayed worker write transaction.
  let inside!:()=>void;const entered=new Promise<void>(resolve=>inside=resolve);
  const chunk=indexCreativeChunk(pool,db,brand,[],gallery,{checkpoint:before.checkpoint,beforeWrite:async client=>{inside();await client.query('SELECT pg_sleep(0.2)');}});
  await entered;const during=await request('creatives');assert(during.ms<2000,`Concurrent page ${during.ms}ms`);await chunk;
  for(let n=0;n<50;n++){const status=(await pool.query('SELECT status FROM creative_index_jobs WHERE id=$1',[brand.id])).rows[0].status;if(status==='complete')break;assert(await workCreativeIndexOnce(pool,{env,fetch:brokerFetch}));}
  assert.equal((await pool.query('SELECT status FROM creative_index_jobs WHERE id=$1',[brand.id])).rows[0].status,'complete');assert.equal((await pool.query('SELECT count(*)::integer AS n FROM web_creative_index')).rows[0].n,20000);
  const captures:Record<string,unknown>={cold:cold.data,partial:partial.data};
  const timings:Record<string,number>={cold:cold.ms,partial:partial.ms,during:during.ms};
  for(const screen of ['brands','competitors','creatives','formats','patterns','audience','winners','briefs','creators','scores','data']){const result=await request(screen);assert.equal(result.data.sql.coverage.ads,20000);assert.equal(result.data.sql.indexing.indexed,20000);timings[screen]=Math.round(result.ms);captures[screen]=result.data;}
  if(process.env.INDEX_FIXTURE_OUTPUT)await writeFile(process.env.INDEX_FIXTURE_OUTPUT,JSON.stringify({brand,pages:captures}));
  const max=(await pool.query('SELECT max(octet_length(data::text)) AS n FROM web_creative_index')).rows[0].n;assert(max<24000);assert.equal(logs.length,0,logs.join('\n'));console.log('20,000-ad indexing page timings (ms): '+JSON.stringify(timings));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
},20000));

import {workerCycle} from '../server/infrastructure/worker-loop.js';
import {retryWorkerFailure} from '../server/infrastructure/worker-recovery.js';
test('background index failures back off and pause without losing the checkpoint; manual retry resumes it',async()=>creativeFixture(async(pool,_db,brand)=>{
 await enqueueCreativeIndex(pool,brand.id);const checkpoint={...firstIndexCheckpoint(),phase:'official',key:['workspace','Meta','1000000']};
 await pool.query("UPDATE creative_index_jobs SET checkpoint=$2,processed=500,started_at=now() WHERE id=$1",[brand.id,JSON.stringify(checkpoint)]);
 const env={EXTER_AD_MEDIA_BROKER_TOKEN:'fixture-index-machine-key-1234567890',EXTER_AD_MEDIA_BROKER_ORIGIN:'https://index.fixture.example'},logs:string[]=[],seen:string[]=[];
 const tasks=[{type:'index' as const,run:(observer:any)=>workCreativeIndexOnce(pool,{...observer,env,fetch:async()=>new Response(JSON.stringify({diagnostic:{message:'Statement cancelled',code:'57014'}}),{status:503})})},{type:'creators' as const,run:async()=>{seen.push('creators');return true;}}];
 for(let n=0;n<3;n++){await pool.query("UPDATE worker_job_failures SET next_attempt_at=now()-interval '1 second'");await pool.query("UPDATE creative_index_jobs SET available_at=now()-interval '1 second'");await workerCycle(pool,tasks,{log:line=>logs.push(line)});}
 const job=(await pool.query('SELECT * FROM creative_index_jobs WHERE id=$1',[brand.id])).rows[0],failure=(await pool.query("SELECT * FROM worker_job_failures WHERE job_type='index'")).rows[0];
 assert.equal(job.status,'paused');assert.deepEqual(job.checkpoint,checkpoint);assert.equal(job.processed,500);assert.equal(failure.last_error.code,'57014');assert.equal(failure.failures,3);assert.equal(seen.length,3);
 assert(await retryWorkerFailure(pool,brand.id,'index',brand.id));const resumed=(await pool.query('SELECT * FROM creative_index_jobs WHERE id=$1',[brand.id])).rows[0];assert.equal(resumed.status,'queued');assert.deepEqual(resumed.checkpoint,checkpoint);assert(logs.every(line=>!line.includes('fixture-index-machine-key')));
},1));

test('an obsolete index revision falls back to bounded ads rather than claiming completion',async()=>creativeFixture(async(pool,db,brand,gallery)=>{
 await refreshCreativeIndex(pool,db,brand,[],gallery);await enqueueCreativeIndex(pool,brand.id);await pool.query("UPDATE creative_index_jobs SET status='complete'");await pool.query('UPDATE web_creative_index SET revision=0');
 const page=await readCreativePage(pool,brand,[],{screen:'creatives'},new Date('2026-11-10'));assert.equal(page.rows.length,1);assert.equal(page.model.indexing?.indexed,0);assert.equal(page.model.indexing?.total,1);assert.equal(page.model.indexing?.status,'queued');assert.equal(page.model.indexing?.fallback,true);
},1));
