// Dedicated disposable Postgres only. All Graph responses below are fictional fixtures.
import {test} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import express from "express";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {migrate} from "../server/infrastructure/database.js";
import {enqueueCollection,schedule,workOnce} from "../server/infrastructure/jobs.js";
import {MetaLibraryConnector,collectMetaPage} from "../server/connectors/meta-library.js";
import {attachCreativeBrowser} from "../server/demo/creative-browser.js";
import {metaSourceHealth,readPublicObservations,mergePublicEvidence} from "../server/infrastructure/meta-evidence.js";
import {attachInfrastructure} from "../server/infrastructure/api.js";
import {resolvedBrandIdentities} from "../server/brand-logos.js";
import {protectSettingsMutation} from "../server/request-guard.js";
import {basicAuth} from "../server/auth.js";
import {openDatabase} from "../server/db.js";
import type {Brand} from "../shared/types.js";
import {countryReach} from "../shared/meta-public.js";
import {MetaPageCandidates} from "../server/connectors/meta-page-candidates.js";
const enabled={EXTER_META_LIBRARY_ENABLED:"true",META_ACCESS_TOKEN:"fixture-only"};
const poolForTest=()=>{assert.ok(process.env.TEST_DATABASE_URL,"A dedicated disposable TEST_DATABASE_URL is required.");return new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});};
async function reset(pool:pg.Pool){await migrate(pool);await migrate(pool);await pool.query("TRUNCATE watchlists,collection_runs,collection_jobs,collection_cursors,schedule_slots,ad_observations,public_ads CASCADE");await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='data_providers'");await pool.query("UPDATE meta_request_gate SET next_request_at=now()");}
const fixtureBrand:Brand={id:"meta-workspace",name:"Fictional Candle House",domain:"fictional-candle.example",category:"Home fragrance & gifting",color:"#123456",initials:"FC",voice:[],competitors:["Fictional Rival"],mode:"imported",createdAt:"2026-11-01"};

test("Meta gates, per-brand backfill checkpoints, daily slots, restatements and app-wide rate limits use the existing queue",async()=>{
 const pool=poolForTest();try{
  await reset(pool);
  for(const [id,key,page] of [["own",fixtureBrand.id,"12"],["rival","name:fictional rival","13"]])await pool.query("INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES($1,$2,$3,$4)",[id,fixtureBrand.id,key,JSON.stringify([page])]);
  await schedule(pool,new Date("2026-07-01T02:00:00Z"),{});assert.equal((await pool.query("SELECT * FROM collection_runs")).rowCount,0);
  await schedule(pool,new Date("2026-07-01T01:59:00Z"),enabled);assert.equal((await pool.query("SELECT * FROM collection_runs")).rowCount,0);
  await schedule(pool,new Date("2026-07-01T02:00:00Z"),enabled);await schedule(pool,new Date("2026-07-01T03:00:00Z"),enabled);
  assert.equal((await pool.query("SELECT * FROM collection_runs")).rowCount,2,"separate Page jobs, one UK day slot each");
  let calls=0;
  const connector=new MetaLibraryConnector({token:"fixture-only",fetch:async target=>{
    calls++;const url=new URL(String(target)),page=JSON.parse(url.searchParams.get("search_page_ids")!)[0],after=url.searchParams.get("after");
    assert.equal(url.searchParams.get("ad_type"),"ALL");assert.equal(url.searchParams.get("ad_delivery_date_min"),"2025-07-01");assert.equal(url.searchParams.get("ad_delivery_date_max"),null);assert.equal(url.searchParams.has("search_terms"),false);
    return Response.json({data:[{id:page+(after?"02":"01"),page_id:page,ad_delivery_start_time:"2026-05-01",eu_total_reach:0,total_reach_by_location:[{key:"UK",value:after?30:10}],age_country_gender_reach_breakdown:[{country:"GB",age_gender_breakdowns:[{age_range:"25-34",female:10,male:0}]}]}],...(!after?{paging:{next:"https://graph.facebook.com/private?access_token=fixture-only",cursors:{after:"saved-next"}}}:{})});
  }});
  assert.equal(await workOnce(pool,connector,{env:{}}),false);assert.equal(calls,0);assert.equal((await pool.query("SELECT sum(attempts)::int AS attempts FROM collection_jobs")).rows[0].attempts,0);
  assert.equal(await workOnce(pool,connector,{env:enabled}),true);assert.equal(calls,1);
  assert.equal(await workOnce(pool,connector,{env:enabled}),false,"shared pacing stops another watchlist immediately");
  const checkpoint=(await pool.query("SELECT id,cursor,config FROM collection_runs WHERE cursor IS NOT NULL")).rows[0];assert.equal(checkpoint.cursor,"saved-next");assert.equal(checkpoint.config.phase,"backfill");
  for(let i=0;i<3;i++){await pool.query("UPDATE meta_request_gate SET next_request_at=now()");await workOnce(pool,connector,{env:enabled,paceMs:0});}
  assert.equal(calls,4);assert.equal((await pool.query("SELECT * FROM ad_observations")).rowCount,4);assert.equal((await pool.query("SELECT * FROM collection_runs WHERE status='complete'")).rowCount,2);
  const health=await metaSourceHealth(pool,fixtureBrand.id,enabled);assert.equal(health.status,"connected");assert.ok(health.lastSuccessfulCheck);assert.equal((await metaSourceHealth(pool,fixtureBrand.id,{})).status,"off");
  const firstRows=await readPublicObservations(pool,fixtureBrand.id);assert.equal(firstRows.length,4);assert.ok(!JSON.stringify(firstRows).includes("access_token"));assert.ok(!JSON.stringify(firstRows).includes("fixture-only"));
  await schedule(pool,new Date("2026-07-02T02:00:00Z"),enabled);assert.equal((await pool.query("SELECT * FROM collection_runs WHERE config->>'phase'='daily'")).rowCount,2);
  const restated=new MetaLibraryConnector({token:"fixture-only",fetch:async target=>{const page=JSON.parse(new URL(String(target)).searchParams.get("search_page_ids")!)[0];return Response.json({data:[{id:page+"01",page_id:page,total_reach_by_location:page==="12"?[{key:"UK",value:70}]:undefined}]});}});
  await workOnce(pool,restated,{env:enabled,paceMs:0});await workOnce(pool,restated,{env:enabled,paceMs:0});
  const rows=mergePublicEvidence([],await readPublicObservations(pool,fixtureBrand.id),fixtureBrand,[{key:"name:fictional rival",brandId:null,name:"Fictional Rival",status:"configured"}]);
  assert.equal(countryReach(rows.find(row=>row.nativeId==="1201")!.publicReach),70);assert.equal(countryReach(rows.find(row=>row.nativeId==="1301")!.publicReach),null,"latest missing reach does not reuse the previous value or turn it into zero");
  assert.equal((await pool.query("SELECT * FROM ad_observations")).rowCount,6,"restatements retain earlier history");
  const run=await enqueueCollection(pool,"own");
  const revoked=new MetaLibraryConnector({token:"fixture-only",fetch:async()=>Response.json({error:{code:190,message:"fixture-secret-provider-text"}},{status:400})});
  await workOnce(pool,revoked,{env:enabled,paceMs:0});const paused=(await pool.query("SELECT status,errors FROM collection_runs WHERE id=$1",[run])).rows[0];assert.equal(paused.status,"paused");assert.ok(!JSON.stringify(paused).includes("fixture-secret-provider-text"));
  await schedule(pool,new Date("2026-07-03T02:00:00Z"),enabled);assert.equal((await pool.query("SELECT status FROM collection_runs WHERE id=$1",[run])).rows[0].status,"paused");
  assert.equal(await enqueueCollection(pool,"own"),run,"explicit resume uses the existing run and cursor");
  const limited=new MetaLibraryConnector({token:"fixture-only",fetch:async()=>Response.json({error:{code:4,message:"fixture-secret-provider-text"}},{status:429,headers:{"Retry-After":"600"}})});
  await workOnce(pool,limited,{env:enabled,paceMs:0});const wait=(await pool.query("SELECT extract(epoch FROM (next_request_at-now()))::float8 AS seconds FROM meta_request_gate")).rows[0].seconds;assert.ok(wait>590&&wait<=600);
  const before=calls;assert.equal(await workOnce(pool,connector,{env:enabled}),false);assert.equal(calls,before,"rate limits block all brand jobs, not just the current cursor");
 }finally{await pool.end();}
});

test("unconfirmed Page searches share the real collection gate and only an explicit watchlist save adopts a candidate",async()=>{
 const pool=poolForTest(),db=openDatabase(":memory:",false),app=express();let server:ReturnType<typeof createServer>|undefined;
 try{
  await reset(pool);db.prepare("INSERT INTO brands VALUES(?,?)").run(fixtureBrand.id,JSON.stringify(fixtureBrand));
  const env={META_ACCESS_TOKEN:"fixture-only",EXTER_META_LIBRARY_ENABLED:"false"};let searches=0;
  const connector=new MetaLibraryConnector({token:env.META_ACCESS_TOKEN,fetch:async url=>{
    searches++;const params=new URL(String(url)).searchParams;assert.equal(params.get("search_terms"),fixtureBrand.name);assert.equal(params.get("ad_type"),"ALL");assert.equal(params.get("ad_active_status"),"ALL");assert.equal(params.get("ad_reached_countries"),'["GB"]');
    return Response.json({data:[{id:"6001",page_id:"61",page_name:"Fictional Studio",ad_creative_link_captions:[fixtureBrand.domain],ad_creative_bodies:["A fictional gift ad"]}]});
  }});
  app.use(express.json());app.use("/api/public/meta",protectSettingsMutation);attachInfrastructure(app,db,()=>pool,{env,connector,paceMs:0});server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,headers={"Content-Type":"application/json"};
  const before=db.prepare("SELECT total_changes() AS n").get();const request=()=>fetch(base+"/api/public/meta/page-candidates",{method:"POST",headers,body:JSON.stringify({workspaceId:fixtureBrand.id,brandKey:fixtureBrand.id})});
  const suggestions=await request();assert.equal(suggestions.status,200);const found=await suggestions.json();assert.equal(found.candidates[0].pageId,"61");assert.equal(searches,1);
  assert.equal((await request()).status,200);assert.equal(searches,1,"cached candidates do not repeat provider calls");
  for(const table of ["watchlists","public_ads","ad_observations","collection_runs"])assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0,table);
  assert.deepEqual(db.prepare("SELECT total_changes() AS n").get(),before);
  const confirmed=await fetch(base+"/api/public/meta/watchlists/confirmed-fixture",{method:"PUT",headers,body:JSON.stringify({workspaceId:fixtureBrand.id,brandKey:fixtureBrand.id,purpose:"brand",pageIds:[found.candidates[0].pageId],countries:["GB"]})});assert.equal(confirmed.status,200);assert.deepEqual((await pool.query("SELECT page_ids FROM watchlists WHERE id='confirmed-fixture'")).rows[0].page_ids,["61"]);
  assert.equal((await request()).status,409,"configured brands are not automatically searched again");
  assert.equal(await workOnce(pool,connector,{env}),false,"finding a Page does not enable live collection");

  // A collection dispatch blocks lookup dispatch and vice versa through the same durable row.
  const run=await enqueueCollection(pool,"confirmed-fixture");
  const collector=new MetaLibraryConnector({token:"fixture-only",fetch:async()=>Response.json({data:[]})});
  await workOnce(pool,collector,{env:enabled});
  const lookup=new MetaPageCandidates(()=>pool,{env,connector});const target={workspaceId:fixtureBrand.id,brandKey:"other-fixture",name:fixtureBrand.name,domain:fixtureBrand.domain};
  assert.equal((await lookup.search(target)).status,429);assert.equal(searches,1);
  await pool.query("UPDATE meta_request_gate SET next_request_at=now()");assert.equal((await lookup.search(target)).status,200);assert.equal(searches,2);
  assert.notEqual(await enqueueCollection(pool,"confirmed-fixture"),run);assert.equal(await workOnce(pool,collector,{env:enabled}),false,"lookup pacing also stops the collection worker");
 }finally{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));db.close();await pool.end();}
});

test("Page ID editing is authenticated, scoped, separate from discovery and feeds the existing automatic logo fallback",async()=>{
 const pool=poolForTest(),db=openDatabase(":memory:",false),app=express();let server:ReturnType<typeof createServer>|undefined;
 try{
  await reset(pool);for(const brand of [fixtureBrand,{...fixtureBrand,id:"other-workspace",name:"Other fictional advertiser",competitors:[]}])db.prepare("INSERT INTO brands VALUES(?,?)").run(brand.id,JSON.stringify(brand));
  app.use(basicAuth({EXTER_ADMIN_USER:"fixture",EXTER_ADMIN_PASSWORD:"fixture-only"}));app.use(express.json());app.use("/api/public/meta",protectSettingsMutation);attachInfrastructure(app,db,()=>pool);
  app.locals.creativeGallery={async list(){return {creatives:[]};}};app.locals.brandDemo={report(){return {scores:[]};}};attachCreativeBrowser(app,db,{getPool:()=>pool});
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers={Authorization:`Basic ${Buffer.from("fixture:fixture-only").toString("base64")}`,"Content-Type":"application/json"};
  const save=(id:string,body:unknown,extra={})=>fetch(base+"/api/public/meta/watchlists/"+id,{method:"PUT",headers:{...headers,...extra},body:JSON.stringify(body)});
  const own={workspaceId:fixtureBrand.id,brandKey:fixtureBrand.id,pageIds:["12"],purpose:"brand"};
  assert.equal((await fetch(base+"/api/public/meta/watchlists?workspaceId="+fixtureBrand.id)).status,401);
  assert.equal((await save("own",own,{Origin:"https://foreign.invalid"})).status,403);
  assert.equal((await save("own",{...own,pageIds:["not-a-page"]})).status,400);
  assert.equal((await save("own",{...own,searchTerms:["fictional"]})).status,400);
  assert.equal((await save("own",own)).status,200);assert.equal((await save("rival",{...own,brandKey:"name:fictional rival",pageIds:["13"]})).status,200);
  assert.equal((await save("rival",{...own,brandKey:"name:fictional rival",pageIds:["12"]})).status,409,"one Page cannot inflate two brands' watchlist reach");
  assert.equal((await save("category",{workspaceId:fixtureBrand.id,purpose:"discovery",searchTerms:["candles"]})).status,200);
  assert.equal((await save("own",{...own,workspaceId:"other-workspace",brandKey:"other-workspace"})).status,409);
  const identities=await resolvedBrandIdentities(db,fixtureBrand.id,undefined,pool);assert.equal(identities.find(b=>b.name===fixtureBrand.name)?.metaPageId,"12");assert.equal(identities.find(b=>b.name==="Fictional Rival")?.metaPageId,"13");
  const run=await enqueueCollection(pool,"own",undefined,new Date("2026-11-05"));await pool.query("UPDATE collection_runs SET cursor='retained-old-page' WHERE id=$1",[run]);
  assert.equal((await save("own",own)).status,200);assert.equal((await pool.query("SELECT cursor,status FROM collection_runs WHERE id=$1",[run])).rows[0].status,"queued","saving unchanged Page IDs preserves the checkpoint");
  await pool.query("UPDATE collection_runs SET status='failed' WHERE id=$1",[run]);
  assert.equal((await save("own",{...own,pageIds:["14"]})).status,200);assert.equal((await pool.query("SELECT cursor,status FROM collection_runs WHERE id=$1",[run])).rows[0].status,"superseded");assert.equal((await pool.query("SELECT cursor FROM collection_runs WHERE id=$1",[run])).rows[0].cursor,"retained-old-page");
  const fresh=await enqueueCollection(pool,"own",undefined,new Date("2026-11-05"));const config=(await pool.query("SELECT config,cursor FROM collection_runs WHERE id=$1",[fresh])).rows[0];assert.equal(config.cursor,null);assert.equal(config.config.phase,"backfill");assert.deepEqual(config.config.page_ids,["14"]);
  await collectMetaPage(pool,fresh,new MetaLibraryConnector({token:"fixture-only",fetch:async()=>Response.json({data:[{id:"9001",page_id:"14",total_reach_by_location:[{key:"UK",value:200}],ad_creative_bodies:["A fictional ad for the read-path fixture"]}]})}));
  const library=await (await fetch(base+`/api/brands/${fixtureBrand.id}/creatives`,{headers})).json();assert.equal(library.creatives.length,1);assert.equal(countryReach(library.creatives[0].publicReach),200);assert.equal(library.creatives[0].brandId,fixtureBrand.id);assert.equal(library.creatives[0].performance.length,0);assert.equal(library.metaSource.status,"off");assert.ok(library.metaSource.lastSuccessfulCheck);
  assert.equal((await save("rival",{...own,brandKey:"name:fictional rival",pageIds:[]})).status,200);assert.equal((await pool.query("SELECT enabled FROM watchlists WHERE id='rival'")).rows[0].enabled,false);
  assert.equal((await fetch(base+"/api/public/meta/collect",{method:"POST",headers,body:JSON.stringify({watchlistId:"own"})})).status,409,"web actions cannot bypass the default-off live gate");
 }finally{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));db.close();await pool.end();}
});
