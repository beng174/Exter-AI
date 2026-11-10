import {test} from "node:test";
import assert from "node:assert/strict";
import {publishedReach,countryReach,displayedReach} from "../shared/meta-public.js";
import {reachShares,reachedAudience,audienceReachTable} from "../shared/meta-research.js";
import {browserFilters,filterBrowserCreatives,type CreativeBrowserResponse} from "../shared/creative-browser.js";
import {metaScheduleDay,rollingYearStart,workOnce,schedule} from "../server/infrastructure/jobs.js";
import {metaLibraryEnabled} from "../server/connectors/meta-library.js";
import {mergePublicEvidence,type PublicObservation} from "../server/infrastructure/meta-evidence.js";
import {browserCreative} from "./fixtures/creative-browser.js";
import type pg from "pg";

test("published reach preserves actual zero, KeyValue UK/GB identity and absent cells without inventing commercial outcomes",()=>{
 const reach=publishedReach({eu_total_reach:"0",total_reach_by_location:[{key:"UK",value:0},{key:"EU",value:400},{country:"FR",reach:"20"}],age_country_gender_reach_breakdown:[{country:"GB",age_gender_breakdowns:[{age_range:"25-34",female:0,male:"12"}]}]});
 assert.equal(countryReach(reach),0);assert.equal(countryReach(reach,"FR"),20);assert.deepEqual(reach.eu,{type:"observed",value:0});assert.deepEqual(reach.demographics.value,[{country:"GB",age:"25-34",gender:"female",reach:0},{country:"GB",age:"25-34",gender:"male",reach:12}]);
 assert.deepEqual(displayedReach(reach),{label:"UK reach",value:0});assert.equal(displayedReach(publishedReach({})),null);
 for(const bad of [undefined,null,-1,"",false,Number.MAX_SAFE_INTEGER+1,"12.1"]){assert.equal(publishedReach({eu_total_reach:bad}).eu.value,null);assert.equal(publishedReach({total_reach_by_location:[{key:"UK",value:bad}]}).locations.value,null);}
 assert.deepEqual(publishedReach({age_country_gender_reach_breakdown:[]}).demographics,{type:"unavailable",value:null});
});
test("reach shares use a common country, one latest observation per ad and source-linked demographic filters",()=>{
 const rows=[browserCreative({adId:"a",publicReach:publishedReach({total_reach_by_location:[{key:"UK",value:100},{key:"EU",value:900}],age_country_gender_reach_breakdown:[{country:"GB",age_gender_breakdowns:[{age_range:"25-34",female:60,male:40}]}]})}),browserCreative({adId:"b",brandId:"rival",workspaceBrand:false,publicReach:publishedReach({total_reach_by_location:[{key:"UK",value:300}]})}),browserCreative({adId:"missing",brandId:"rival",workspaceBrand:false})];
 const data={brand:{id:rows[0].brandId,name:"Fixture advertiser",domain:"fixture.example"},creatives:rows,competitors:[{key:"rival",brandId:"rival",name:"Fixture rival",status:"collected"},{key:"none",brandId:null,name:"Uncollected",status:"configured"}]} as CreativeBrowserResponse;
 const shares=reachShares(data);assert.deepEqual(shares.map(b=>b.measure.value),[25,75,null]);assert.equal(shares[0].total,400);assert.equal(shares[0].excluded,1);
 const zero=reachShares({...data,creatives:[{...rows[0],publicReach:publishedReach({total_reach_by_location:[{key:"UK",value:0}]})}]});assert.equal(zero[0].measure.value,null,"zero denominator is unavailable, never a fabricated share");
 const audience=reachedAudience(data);assert.equal(audience.length,2);assert.equal(audience.reduce((sum,r)=>sum+r.reach,0),100);
 const table=audienceReachTable(data);assert.deepEqual(table.ages,["25-34"]);assert.equal(table.rows[0].ages["25-34"],100);assert.equal(table.rows[0].women,60);
 const filters=browserFilters(new URLSearchParams({brand:rows[0].brandId,demographicCountry:"GB",reachAge:"25-34",reachGender:"female"}));assert.deepEqual(filterBrowserCreatives(rows,filters).map(r=>r.adId),["a"]);
 assert.deepEqual(filterBrowserCreatives(rows,{reachCountry:"GB"}).map(r=>r.adId),["a","b"]);
});
test("public evidence joins by saved advertiser Page and keeps media, analysis and workspace boundaries",()=>{
 const saved=browserCreative({nativeId:"111",thumbnailUrl:"/retained.png"}),brand={id:saved.brandId,name:saved.brandName,domain:"fixture.example"};
 const make=(native_id:string,brand_key:string,page="12"):PublicObservation=>({native_id,brand_key,advertiser_id:page,page_ids:["12"],observed_at:"2026-11-05T12:00:00Z",first_seen_at:"2026-11-04",start_time:"2026-10-01",stop_time:null,raw_payload:{total_reach_by_location:[{key:"UK",value:0}],ad_creative_bodies:["Fixture full copy"]}});
 const rows=mergePublicEvidence([saved],[make("111",brand.id),make("222","name:fixture rival"),make("333","unrelated"),make("444",brand.id,"99")],brand,[{key:"name:fixture rival",brandId:null,name:"Fixture rival",status:"configured"}]);
 assert.equal(rows.length,2);assert.equal(rows[0].thumbnailUrl,"/retained.png");assert.equal(rows[0].analysis,saved.analysis);assert.equal(countryReach(rows[0].publicReach),0);assert.equal(rows[1].brandId,"name:fixture rival");assert.equal(rows[1].deliveryStatus,"unknown");assert.equal(rows[1].performance.length,0);assert.equal(saved.publicReach,undefined,"read model never rewrites saved SQLite data");
});
test("public collection switch defaults off before any database access; UK daily slots survive both clock changes",async()=>{
 const pool={query(){throw new Error("must not read database");},connect(){throw new Error("must not enqueue");}} as unknown as pg.Pool;
 assert.equal(metaLibraryEnabled({}),false);assert.equal(metaLibraryEnabled({EXTER_META_LIBRARY_ENABLED:"TRUE"}),false);assert.equal(metaLibraryEnabled({EXTER_META_LIBRARY_ENABLED:"true"}),true);
 assert.equal(await workOnce(pool,undefined,{env:{}}),false);
 // Owned scheduling and creator retention are independent; no public watchlist SQL is allowed.
 const previous=process.env.EXTER_OWNED_SYNC_ENABLED;delete process.env.EXTER_OWNED_SYNC_ENABLED;
 try{await schedule({query:async(sql:string)=>{if(sql.startsWith("DELETE FROM creator_discovery_results"))assert.match(sql,/^DELETE FROM creator_discovery_results WHERE NOT saved AND used_at<\$1::timestamptz-interval '90 days'$/);else assert.match(sql,/^SELECT id FROM owned_accounts/);return {rows:[]};}} as unknown as pg.Pool,new Date("2026-11-05T03:00:00Z"),{});}finally{if(previous!==undefined)process.env.EXTER_OWNED_SYNC_ENABLED=previous;}
 for(const [time,day] of [["2026-03-29T01:59:00Z",null],["2026-03-29T02:00:00Z","2026-03-29"],["2026-10-25T02:00:00Z",null],["2026-10-25T03:00:00Z","2026-10-25"],["2026-07-01T02:00:00Z","2026-07-01"]])assert.equal(metaScheduleDay(new Date(time!)),day);
 assert.equal(rollingYearStart("2026-11-05"),"2025-11-05");assert.equal(rollingYearStart("2024-02-29"),"2023-02-28");
});
