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
