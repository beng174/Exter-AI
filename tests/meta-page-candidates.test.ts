import {test} from "node:test";
import assert from "node:assert/strict";
import {captionDomain,rankPageCandidates,candidateExcerpt,type CandidateAd} from "../shared/meta-page-candidates.js";
import {MetaPageCandidates} from "../server/connectors/meta-page-candidates.js";
import {MetaCollectionError,MetaLibraryConnector} from "../server/connectors/meta-library.js";
import {lookupPool} from "./fixtures/meta-lookup-pool.js";
const target={workspaceId:"fixture-workspace",brandKey:"fixture-workspace",name:"Fictional Candle Co.",domain:"fictional-candle.example"},env={META_ACCESS_TOKEN:"fixture-only-token",EXTER_META_LIBRARY_ENABLED:"false"};
const ad=(id:string,page:string,name:string,caption?:string):CandidateAd=>({id,page_id:page,page_name:name,ad_creative_bodies:["A fictional example ad"],ad_creative_link_captions:caption?[caption]:[]});

test("Page ranking prioritises distinct ads with the saved website, then name match and ad count",()=>{
 const ads=[ad("1","10",target.name,"unrelated.example"),ad("2","20","Fictional Workshop",target.domain),ad("3","20","Fictional Workshop",`shop.${target.domain}/gift`),ad("3","20","Fictional Workshop",target.domain),ad("4","30",target.name),ad("5","30",target.name),ad("6","40","Unrelated advertiser"),ad("7","40","Unrelated advertiser"),ad("8","40","Unrelated advertiser")];
 const ranked=rankPageCandidates(ads,target.name,target.domain);assert.deepEqual(ranked.map(c=>c.pageId),["20","30","10","40"]);assert.equal(ranked[0].adCount,2);assert.equal(ranked[0].domainMatchedAds,2);assert.equal(ranked[0].example.url,"https://www.facebook.com/ads/library/?id=2");
 assert.equal(rankPageCandidates(ads,target.name,"")[0].domainMatchedAds,null,"missing website is unavailable, never zero");
});
test("domain evidence rejects lookalikes, credentials, paths, unsafe schemes and words in captions",()=>{
 for(const bad of [`${target.domain}.attacker.example`,`other.example/path/${target.domain}`,`${target.domain}@other.example`,`Visit ${target.domain}`,`javascript:${target.domain}`,`https://${target.domain}:444/`]){
  const page=rankPageCandidates([ad("1","20",target.name,bad)],target.name,target.domain)[0];assert.equal(page.domainMatchedAds,0,bad);
 }
 assert.equal(captionDomain(`HTTPS://WWW.${target.domain.toUpperCase()}/gift`),target.domain);
 assert.equal(rankPageCandidates([ad("1","20",target.name,`https://${target.domain}/gift`)],target.name,target.domain)[0].domainMatchedAds,1);
 assert.ok(candidateExcerpt("a complete word ".repeat(100)).endsWith("…"));assert.ok(candidateExcerpt("a complete word ".repeat(100)).length<=600);
});
test("Page lookup uses UK/ALL requests, resumes opaque pagination, deduplicates ads and caches only suggestions",async()=>{
 const {pool,state}=lookupPool();let calls=0;
 const connector=new MetaLibraryConnector({token:env.META_ACCESS_TOKEN,fetch:async(targetUrl,init)=>{
  calls++;const url=new URL(String(targetUrl));assert.equal(url.pathname,"/v26.0/ads_archive");assert.equal(url.searchParams.get("search_terms"),target.name);assert.equal(url.searchParams.get("search_page_ids"),null);assert.equal(url.searchParams.get("ad_type"),"ALL");assert.equal(url.searchParams.get("ad_active_status"),"ALL");assert.equal(url.searchParams.get("ad_reached_countries"),'["GB"]');assert.equal((init?.headers as Record<string,string>).Authorization,`Bearer ${env.META_ACCESS_TOKEN}`);
  const next=url.searchParams.get("after");assert.ok(!next||next==="fixture-next");
  return Response.json({data:next?[ad("2","20","Fictional Studio",target.domain),ad("3","20","Fictional Studio",target.domain)]:[ad("1","10",target.name),ad("2","20","Fictional Studio",target.domain)],...(!next?{paging:{next:`https://graph.facebook.com/private?access_token=${env.META_ACCESS_TOKEN}`,cursors:{after:"fixture-next"}}}:{})});
 }});
 const lookup=new MetaPageCandidates(()=>pool,{env,connector,paceMs:0});const first=await lookup.search(target);assert.equal(first.result.complete,false);assert.equal(first.result.adsSearched,2);
 const second=await lookup.search(target);assert.equal(second.result.complete,true);assert.equal(second.result.adsSearched,3);assert.equal(second.result.candidates[0].adCount,2);assert.equal(calls,2);
 assert.equal((await lookup.search(target)).result.id,first.result.id);assert.equal(calls,2,"reopening uses cached suggestions");assert.equal(lookup.snapshot("other-workspace",first.result.id),null);assert.ok(!JSON.stringify(second).includes(env.META_ACCESS_TOKEN));assert.ok(!JSON.stringify(second).includes("private?"));assert.ok(!JSON.stringify(second).includes("cursor"));
 assert.equal(state.reservations,2);assert.ok(!state.sql.some(sql=>/INSERT INTO (watchlists|public_ads|ad_observations)/.test(sql)));
});
test("missing or revoked token never saves a Page or hides the provider failure as an empty success",async()=>{
 const {pool,state}=lookupPool();let calls=0;
 const connector=new MetaLibraryConnector({token:env.META_ACCESS_TOKEN,fetch:async()=>{calls++;return Response.json({error:{code:190,message:env.META_ACCESS_TOKEN}},{status:400});}});
 await assert.rejects(new MetaPageCandidates(()=>pool,{env:{},connector}).search(target),/Meta not connected/);assert.equal(calls,0);assert.equal(state.sql.length,0);
 await assert.rejects(new MetaPageCandidates(()=>pool,{env,connector}).search(target),(error:unknown)=>error instanceof MetaCollectionError&&error.reason==="permission"&&!error.message.includes(env.META_ACCESS_TOKEN));assert.equal(calls,1);
});
test("lookup honours the shared gate and Graph cooldown while token-only lookup leaves collection disabled",async()=>{
 const {pool,state}=lookupPool();state.waitMs=20000;let calls=0;
 const connector=new MetaLibraryConnector({token:env.META_ACCESS_TOKEN,fetch:async()=>{calls++;return Response.json({data:[]},{headers:{"x-app-usage":'{"call_count":85}',"Retry-After":"90"}});}});
 const lookup=new MetaPageCandidates(()=>pool,{env,connector,paceMs:0});const waiting=await lookup.search(target);assert.equal(waiting.status,429);assert.equal(calls,0);assert.equal(state.reservations,0);
 state.waitMs=0;assert.equal((await lookup.search(target)).result.complete,true);assert.equal(calls,1);assert.equal(state.waitMs,90000);assert.equal(env.EXTER_META_LIBRARY_ENABLED,"false");
});
test("concurrent lookups share one cursor and expired suggestions restart without changing saved records",async()=>{
 const {pool}=lookupPool();let calls=0,release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let now=new Date("2026-11-05T00:00:00Z");
 const connector=new MetaLibraryConnector({token:env.META_ACCESS_TOKEN,fetch:async()=>{calls++;await held;return Response.json({data:[ad("1","20",target.name)]});}});
 const lookup=new MetaPageCandidates(()=>pool,{env,connector,paceMs:0,now:()=>now});const first=lookup.search(target);assert.equal((await lookup.search(target)).status,202);release();const ready=await first;assert.equal(calls,1);
 now=new Date(now.getTime()+31*60000);const again=await lookup.search(target);assert.notEqual(again.result.id,ready.result.id);assert.equal(calls,2);
});
test("coverage limits are explicit and further pages require a separate request",async()=>{
 const {pool}=lookupPool();let calls=0;
 const connector=new MetaLibraryConnector({token:env.META_ACCESS_TOKEN,fetch:async()=>{calls++;return Response.json({data:Array.from({length:100},(_,i)=>ad(String(calls*100+i),"20",target.name,target.domain)),paging:{next:"https://graph.facebook.com/unused",cursors:{after:`fixture-${calls}`}}});}});
 const lookup=new MetaPageCandidates(()=>pool,{env,connector,paceMs:0});let result=await lookup.search(target);for(let i=1;i<10;i++)result=await lookup.search(target);
 assert.equal(result.result.adsSearched,1000);assert.equal(result.result.limited,true);assert.equal(result.result.complete,false);await lookup.search(target);assert.equal(calls,10);
 assert.equal((await lookup.search(target,true)).result.adsSearched,1100);assert.equal(calls,11);
});
