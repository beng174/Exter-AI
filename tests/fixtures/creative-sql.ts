import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../../server/infrastructure/database.js';
import {openDatabase} from '../../server/db.js';
import {CreativeGalleryService} from '../../server/demo/gallery.js';
import type {Brand} from '../../shared/types.js';
export async function creativeFixture(work:(pool:pg.Pool,db:ReturnType<typeof openDatabase>,brand:Brand,gallery:CreativeGalleryService)=>Promise<void>,count=120){
 assert(process.env.TEST_DATABASE_URL,'Use a dedicated disposable TEST_DATABASE_URL.');
 const schema='creative_page_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:5}),db=openDatabase(':memory:',false);
 const brand={id:'workspace',name:'Fictional Candle House',domain:'fictional.example',category:'Home fragrance & gifting',primaryCategories:['candles'],color:'#123456',initials:'FC',voice:[],competitors:[],mode:'imported',createdAt:'2026-11-01'} as Brand;
 db.prepare('INSERT INTO brands VALUES(?,?)').run(brand.id,JSON.stringify(brand));
 try{await migrate(pool);await pool.query(`INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('own','workspace','workspace','["12"]'); INSERT INTO collection_runs(id,watchlist_id,config,status) VALUES('official','own','{"revision":1}','complete');`);
 await pool.query(`INSERT INTO public_ads(platform,native_id,advertiser_id,start_time,first_seen_at) SELECT 'Meta',(1000000+n)::text,'12','2026-10-01'::timestamptz+n*interval '1 minute','2026-11-01' FROM generate_series(1,$1::integer)n`,[count]);
 await pool.query(`INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,raw_payload,reach,active_status,observed_at,last_confirmed_at)
 SELECT 'Meta',native_id,'official','workspace',jsonb_build_object('ad_creative_bodies',jsonb_build_array('A quiet evening. Product '||native_id),'display_format','VIDEO','total_reach_by_location',jsonb_build_array(jsonb_build_object('country','GB','reach',native_id::integer%10)),'beneficiary_payers',jsonb_build_array(jsonb_build_object('payer',repeat('x',24000)))),'{}','unknown','2026-11-09','2026-11-09' FROM public_ads`);
 await work(pool,db,brand,new CreativeGalleryService(db));
 }finally{db.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
