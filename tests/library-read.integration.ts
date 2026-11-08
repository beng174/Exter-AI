// Disposable Postgres schemas only. No live provider requests.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {randomUUID} from "node:crypto";
import {migrate} from "../server/infrastructure/database.js";
import {visitDatabaseRows} from "../server/infrastructure/read-rows.js";
import {readPublicCreatives,readPublicObservations,mergePublicEvidence} from "../server/infrastructure/meta-evidence.js";
import {readRetainedMedia} from "../server/ad-media/read.js";
async function fixture(work:(pool:pg.Pool)=>Promise<void>){
 assert(process.env.TEST_DATABASE_URL,'Use a dedicated disposable TEST_DATABASE_URL.');
 const schema='web_memory_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:2});
 try{await migrate(pool);await work(pool);}finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
test('real pg row events retain no result.rows array and release usable connections after visitor/query errors',async()=>fixture(async pool=>{
 let accumulated=-1,rows=0;
 const observed={connect:async()=>{const client=await pool.connect();return {query(q:pg.Query){q.on('end',(result:pg.QueryResult)=>{accumulated=result.rows.length;});return client.query(q);},release:()=>client.release()};}} as unknown as pg.Pool;
 await visitDatabaseRows<{id:number;data:{copy:string}}>(observed,"SELECT n AS id,jsonb_build_object('copy',repeat('x',1024)) AS data FROM generate_series(1,3000)n",[],row=>{assert.equal(row.data.copy.length,1024);rows++;});assert.equal(rows,3000);assert.equal(accumulated,0);
 await assert.rejects(()=>visitDatabaseRows(pool,'SELECT n FROM generate_series(1,1000)n',[],()=>{throw new Error('fixture visitor failure');}),/visitor failure/);
 await assert.rejects(()=>visitDatabaseRows(pool,'SELECT nonexistent_fixture_column',[],()=>{}));
 assert.equal((await pool.query('SELECT 1 AS healthy')).rows[0].healthy,1);assert.equal(pool.waitingCount,0);assert.equal(pool.idleCount,pool.totalCount);
}));
test('streamed latest public snapshots preserve revision/workspace, raw references, zero and missing values without changing history',async()=>fixture(async pool=>{
 await pool.query(`INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('own','fixture','fixture','["12"]'),('rival','fixture','rival','["13"]'),('other','other-workspace','other','["12"]');
 INSERT INTO collection_runs(id,watchlist_id,config,status) VALUES('old','own','{"revision":1}','complete'),('new','own','{"revision":1}','complete'),('rival','rival','{"revision":1}','complete'),('other','other','{"revision":1}','complete'),('wrong-revision','own','{"revision":0}','complete');
 INSERT INTO public_ads(platform,native_id,advertiser_id) VALUES('Meta','9001','12'),('Meta','9002','13'),('Meta','9003','12');
 INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,raw_payload,observed_at,active_status,reach) VALUES
 ('Meta','9001','old','fixture','{"ad_creative_bodies":["A quiet evening."],"eu_total_reach":0,"total_reach_by_location":[{"country":"GB","reach":0}]}','2026-11-07','unknown','{}'),
 ('Meta','9002','rival','fixture','{"ad_creative_bodies":["A second candle."]}','2026-11-08','unknown','{}'),
 ('Meta','9001','other','other-workspace','{"ad_creative_bodies":["Must never enter another workspace"]}','2026-11-09','unknown','{}'),
 ('Meta','9003','wrong-revision','fixture','{"ad_creative_bodies":["Old revision"]}','2026-11-09','unknown','{}');
 INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,raw_payload,raw_payload_run_id,observed_at,last_confirmed_at,active_status,reach) VALUES('Meta','9001','new','fixture',NULL,'old','2026-11-08','2026-11-09','unknown','{}');`);
 const before=(await pool.query('SELECT row_to_json(o)::text AS data FROM ad_observations o ORDER BY workspace_id,run_id,native_id')).rows;
 const brand={id:'fixture',name:'Fictional Candle House',domain:'fictional.example'},competitors:any[]=[{key:'rival',brandId:null,name:'Fictional Hearth',status:'collected'}];
 const rows=await readPublicCreatives(pool,'fixture',[],brand,competitors);assert.deepEqual(rows,mergePublicEvidence([],await readPublicObservations(pool,'fixture'),brand,competitors));assert.equal(rows.length,2);assert.equal(rows[0].copy,'A quiet evening.');assert.equal(rows[0].publicReach!.eu.value,0);assert.equal(rows[0].publicReach!.locations.value![0].reach,0);assert.equal(rows[1].publicReach!.eu.value,null);assert.equal(rows[0].reachObservedAt,'2026-11-09T00:00:00.000Z');
 assert.deepEqual((await pool.query('SELECT row_to_json(o)::text AS data FROM ad_observations o ORDER BY workspace_id,run_id,native_id')).rows,before);
}));
test('streamed media snapshots keep earlier posters and files while excluding a changed Page and another workspace',async()=>fixture(async pool=>{
 await pool.query(`INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('own','fixture','fixture','["12"]'),('other','other','other','["14"]');
 INSERT INTO ad_media_runs(id,watchlist_id,workspace_id,brand_key,revision,page_id,window_from,window_to,phase,cap,status) VALUES('one','own','fixture','fixture',1,'12','2025-11-01','2026-11-01','missing',1,'complete'),('two','own','fixture','fixture',1,'12','2025-11-01','2026-11-01','missing',1,'complete'),('other','other','other','other',1,'14','2025-11-01','2026-11-01','missing',1,'complete');`);
 const file=(role:string,hash:string)=>({role,index:0,ref:{workspaceId:'fixture',artifactId:hash.repeat(64),sha256:hash.repeat(64),bytes:64,mimeType:'image/png'}});
 for(const [id,run,workspace,brand,page,assets] of [['old','one','fixture','fixture','12',[file('poster','a')]],['new','two','fixture','fixture','12',[file('video','b')]],['excluded','other','other','other','14',[file('poster','c')]]] as const)await pool.query('INSERT INTO ad_media_creatives(id,run_id,workspace_id,brand_key,page_id,native_id,format,assets) VALUES($1,$2,$3,$4,$5,$6,\'video\',$7)',[id,run,workspace,brand,page,'9001',JSON.stringify(assets)]);
 const before=(await pool.query('SELECT row_to_json(c)::text AS data FROM ad_media_creatives c ORDER BY id')).rows;let rows=await readRetainedMedia(pool,'fixture');assert.equal(rows.length,1);assert.deepEqual(new Set(rows[0].assets.map(a=>a.role)),new Set(['poster','video']));
 await pool.query('UPDATE watchlists SET page_ids=\'["99"]\' WHERE id=\'own\'');rows=await readRetainedMedia(pool,'fixture');assert.equal(rows.length,0);
 assert.deepEqual((await pool.query('SELECT row_to_json(c)::text AS data FROM ad_media_creatives c ORDER BY id')).rows,before);
}));
