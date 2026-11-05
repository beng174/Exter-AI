// Destructive only to a dedicated disposable fixture database, never a deployed database.
import assert from "node:assert/strict";
import pg from "pg";
import {migrate} from "../../server/infrastructure/database.js";
import {enqueueCollection} from "../../server/infrastructure/jobs.js";
import {collectMetaPage,MetaLibraryConnector} from "../../server/connectors/meta-library.js";
assert.ok(process.env.TEST_DATABASE_URL,"Use a dedicated disposable TEST_DATABASE_URL.");
const fraction=Number(process.argv[2]??"0.1");assert.ok([0,.1,1].includes(fraction));
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
try{
 await migrate(pool);
 await pool.query("TRUNCATE watchlists,collection_runs,collection_jobs,collection_cursors,schedule_slots,ad_observations,public_ads CASCADE");
 await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='data_providers'");
 await pool.query("INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('size-fixture','size-fixture','size-fixture','[\"12\"]')");
 let day=0;
 const connector=new MetaLibraryConnector({token:"fixture-only",fetch:async target=>{
  const after=new URL(String(target)).searchParams.get("after"),offset=after?Number(after.split("-")[1]):0;
  const data=Array.from({length:100},(_,i)=>{const index=offset+i;return {id:String(10000+index),page_id:"12",page_name:"Fictional Candle House",ad_delivery_start_time:"2026-10-01",ad_creative_bodies:["Fictional source copy for a fragrance made for a quiet evening. ".repeat(28)],ad_creative_link_titles:["A fictional candle collection"],ad_creative_link_captions:["fictional-candle.example"],publisher_platforms:["facebook","instagram"],total_reach_by_location:[{key:"UK",value:100+ (index<1000*fraction?day:0)}],age_country_gender_reach_breakdown:[{country:"GB",age_gender_breakdowns:[{age_range:"25-34",female:50,male:50}]}]};});
  return Response.json({data,...(offset<900?{paging:{next:"fixture-next",cursors:{after:`batch-${offset+100}`}}}:{})});
 }});
 for(day=0;day<30;day++){const run=await enqueueCollection(pool,"size-fixture");while(!(await collectMetaPage(pool,run,connector)).complete){} }
 await pool.query("VACUUM (ANALYZE) ad_observations");
 const stats=(await pool.query(`SELECT count(*)::int AS observations,count(raw_payload)::int AS payloads,
   sum(pg_column_size(o))::bigint AS live_row_bytes,sum(pg_column_size(raw_payload))::bigint AS stored_payload_bytes,
   pg_total_relation_size('ad_observations') AS allocated_observation_bytes,pg_indexes_size('ad_observations') AS index_bytes
   FROM ad_observations o`)).rows[0];
 assert.equal(stats.observations,1000+29000*fraction);
 console.log(JSON.stringify({ads:1000,checks:30,changedFractionPerCheck:fraction,...stats},null,2));
}finally{await pool.end();}
