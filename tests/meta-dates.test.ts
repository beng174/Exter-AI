import test from "node:test";
import assert from "node:assert/strict";
import {MetaLibraryConnector,MetaCollectionError} from "../server/connectors/meta-library.js";
import {pacificDay,providerEndDate} from "../shared/provider-dates.js";
import {metaUserText} from "../shared/meta-collection.js";
import {mediaActorInput} from "../server/ad-media/apify.js";
const token="fixture-only-private-token";
const times=[
 ["2026-01-15T00:30:00Z","00:30","2026-01-14"],["2026-01-15T03:00:00Z","03:00","2026-01-14"],["2026-01-15T09:00:00Z","09:00","2026-01-15"],
 ["2026-07-14T23:30:00Z","00:30","2026-07-14"],["2026-07-15T02:00:00Z","03:00","2026-07-14"],["2026-07-15T08:00:00Z","09:00","2026-07-15"]
];
for(const [instant,london,pacific] of times)test(`UK collection at ${instant} (${london} London) never sends a future upper date`,async()=>{
 const now=new Date(instant),ukDay=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
 assert.equal(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now),london);
 assert.equal(pacificDay(now),pacific);assert.equal(providerEndDate(ukDay,now),pacific);assert.equal(providerEndDate("2020-01-01",now),"2020-01-01");
 for(const phase of ["daily","backfill"]){
  const from=ukDay.replace(/^2026/,"2025");let calls=0;
  const connector=new MetaLibraryConnector({token,fetch:async target=>{calls++;const url=new URL(String(target));assert.equal(url.searchParams.get("ad_delivery_date_min"),from);assert.equal(url.searchParams.has("ad_delivery_date_max"),false,phase);assert.equal(url.searchParams.get("ad_type"),"ALL");return Response.json({data:[]});}});
  await connector.page({pageIds:["12001"],countries:["GB"],from,to:ukDay,...(phase==="backfill"?{after:"fixture-saved-cursor"}:{})});assert.equal(calls,1);
 }
 assert.equal(mediaActorInput({pageId:"12001",from:"2025-01-01",to:ukDay,ids:["9001"],cap:1},now).deliveredBefore,pacific);
});
test("Meta user diagnostics remove credentials, URLs and control characters before the 300-character limit",()=>{
 for(const link of ["https://graph.fixture.invalid/path?access_token="+token,"www.fixture.invalid/path", "fixture.invalid/path",encodeURIComponent("https://fixture.invalid/path?token="+token),encodeURIComponent(encodeURIComponent("https://fixture.invalid/path"))]){
  const value=metaUserText(`Bad date. ${link} ${token} access_token=another-secret Bearer other-secret 100% invalid%QQ. \u202e`+"😀".repeat(400),token)!;
  for(const forbidden of [token,"another-secret","other-secret","fixture.invalid","https", "\u202e"])assert(!value.includes(forbidden),forbidden);
  assert(Array.from(value).length<=300);assert(value.startsWith("Bad date."));assert.equal(metaUserText(value,token),value);
 }
 for(const invalid of [undefined,null,0,{},[]])assert.equal(metaUserText(invalid,token),null);
});
test("only explicitly authorised Graph user fields survive; generic messages and trace do not",async()=>{
 const connector=new MetaLibraryConnector({token,fetch:async()=>Response.json({error:{code:100,error_subcode:2334030,message:"never-keep-generic-text",fbtrace_id:"never-keep-trace",error_user_title:"Invalid date "+token,error_user_msg:"Choose today's date. https://fixture.invalid/?token="+token+" "+"x".repeat(400)}},{status:400})});
 await assert.rejects(()=>connector.page({pageIds:["12001"],countries:["GB"]}),(error:unknown)=>{
  assert(error instanceof MetaCollectionError);assert.equal(error.graphCode,100);assert.equal(error.graphSubcode,2334030);assert.equal(error.userTitle,"Invalid date [redacted]");assert(error.userMessage?.startsWith("Choose today's date."));assert.equal(error.userMessage?.length,300);
  const saved=JSON.stringify(error);for(const bad of [token,"https://","never-keep"])assert(!saved.includes(bad));return true;
 });
});
