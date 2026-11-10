import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,unlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {sourceAdFormat} from "../shared/source-ad-format.js";
import {mediaActorInput} from "../server/ad-media/apify.js";
import {AdMediaStorage,mediaDiskMeasurement} from "../server/ad-media/storage.js";
import {checkedRetainedMedia} from "../server/ad-media/file-health.js";
import {mergeRetainedMedia} from "../server/ad-media/read.js";
import {missingMediaReason,mediaCoverage} from "../server/ad-media/coverage.js";
import {winnersCoverage,unqualifiedWinners} from "../shared/winners-recovery.js";
import {browserCreative} from "./fixtures/creative-browser.js";
import {MetaLibraryConnector} from "../server/connectors/meta-library.js";
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]);
const disk=async()=>mediaDiskMeasurement(10*1024**3,9*1024**3);
const media={adId:"9001",pageId:"12",format:"image" as const,images:["https://image.fixture.fbcdn.net/file.png"],videos:[],posters:[]};
test("exact saved IDs, including inactive historical ads, are never excluded by a fresh date window",()=>{
 const input=mediaActorInput({pageId:"12",ids:["9001","9002"],from:"2025-11-10",to:"2026-11-10",cap:2});
 assert("adArchiveIds" in input);assert.deepEqual(input.adArchiveIds,["9001","9002"]);assert.equal(input.activeStatus,"all");assert.deepEqual(input.countries,["GB"]);assert.equal(input.maxAds,2);
 assert(!Object.hasOwn(input,"deliveredAfter"));assert(!Object.hasOwn(input,"deliveredBefore"));
 const page=mediaActorInput({pageId:"12",ids:[],from:"2025-11-10",to:"2026-11-10",cap:2},new Date("2026-11-10T03:00Z"));assert.equal(page.deliveredAfter,"2025-11-10");assert.equal(page.deliveredBefore,"2026-11-09");
});
test("every missing ad has one controlled cause; queued work is not a paid actor request",()=>{
 const ad={brandKey:"house",nativeId:"9001"},attempt={...ad,returned:true,matched:true,outcome:"no_media"};
 assert.equal(missingMediaReason(undefined,undefined),"not_requested");assert.equal(missingMediaReason({...attempt,queued:true},undefined),"queued");
 assert.equal(missingMediaReason(attempt,undefined),"no_media");assert.equal(missingMediaReason({...attempt,returned:false,outcome:"not_returned"},undefined),"not_returned");
 assert.equal(missingMediaReason({...attempt,outcome:"provider"},undefined),"provider");assert.equal(missingMediaReason(attempt,{...ad,image:false,video:false,missingFile:true}),"file_missing");
 const coverage=mediaCoverage([ad],[{...attempt,returned:false,matched:false,queued:true,requested:false}],[],[{brandKey:"house",budget:false}])[0];assert.equal(coverage.requested,0);assert.equal(coverage.reasons.queued,1);assert.equal(Object.values(coverage.reasons).reduce((a,b)=>a+b),coverage.missing);
});
test("failed downloads retry the same paid result three times, then keep a controlled reason",async()=>{
 const root=await mkdtemp(join(tmpdir(),"exter-media-retries-"));let calls=0;
 try{const storage=new AdMediaStorage({root,disk,images:{resolve:async()=>[{address:"8.8.8.8",family:4}],probe:async()=>({width:40,height:30}),fetch:async()=>{calls++;return calls<=3?new Response(null,{status:503}):new Response(png,{headers:{"content-type":"image/png"}});}}});
  assert.equal((await storage.retain("retry-workspace",media,false)).assets.length,1);assert.equal(calls,4);
  calls=0;const failing=new AdMediaStorage({root,disk,images:{resolve:async()=>[{address:"8.8.8.8",family:4}],fetch:async()=>{calls++;throw new Error("fixture private failure");}}});
  const result=await failing.retain("retry-workspace",media,false);assert.equal(calls,4);assert.equal(result.error,"provider");assert.equal(result.assets.length,0);assert(!JSON.stringify(result).includes("private failure"));
 }finally{await rm(root,{recursive:true,force:true});}
});
test("web disk audit removes missing assets from previews, persists availability and preserves official format",async()=>{
 const root=await mkdtemp(join(tmpdir(),"exter-media-audit-")),storage=new AdMediaStorage({root}),workspace=`audit-${root.split('/').at(-1)}`;
 try{const saved=await storage.store.put(workspace,"image/png",(async function*(){yield png;})()),row={workspace_id:workspace,brand_key:"house",native_id:"9001",format:"image",assets:[{ref:saved.ref,role:"image" as const,index:0}]},writes:any[]=[];
  const pool:any={query:async(_sql:string,params:any[])=>{writes.push(JSON.parse(params[0]));return {rows:[]};}};
  assert.equal((await checkedRetainedMedia(pool,[row],storage,1))[0].assets.length,1);await unlink(saved.absolutePath);
  const checked=await checkedRetainedMedia(pool,[row],storage,60002);assert.equal(checked[0].assets.length,0);assert.equal(writes.at(-1)[0].available,false);assert.equal(row.assets.length,1,"history is untouched");
  const creative=browserCreative({brandId:"house",nativeId:"9001",publicEvidence:true,adFormat:"video"});assert.equal(mergeRetainedMedia([creative],checked,workspace)[0].thumbnailUrl,null);assert.equal(mergeRetainedMedia([creative],[row],workspace)[0].adFormat,"video");
 }finally{await rm(root,{recursive:true,force:true});}
});
test("source snapshot/cards determine observed format without downloads or changed reach/dates",async()=>{
 for(const [raw,expected] of [[{snapshot:{display_format:"DPA"}},"catalogue"],[{cards:[{image_url:"x"},{image_url:"y"}]},"carousel"],[{snapshot:{videos:[{video_sd_url:"x"}]}},"video"],[{snapshot:{images:[{original_image_url:"x"}]}},"static_image"],[{},null]] as const)assert.equal(sourceAdFormat(raw),expected);
 const source={id:"9001",page_id:"12",ad_delivery_start_time:"2025-08-21",total_reach_by_location:[{country:"GB",reach:1234}],snapshot:{display_format:"VIDEO"}};
 const connector=new MetaLibraryConnector({token:"fixture-only",fetch:async()=>Response.json({data:[source]})});
 const page=await connector.page({pageIds:["12"],countries:["GB"]});assert.equal(page.rows[0].source_format,"video");assert.deepEqual(page.rows[0].total_reach_by_location,source.total_reach_by_location);assert.equal(page.rows[0].ad_delivery_start_time,source.ad_delivery_start_time);assert.equal(source.snapshot.display_format,"VIDEO");
});
test("Winners keeps untagged ads, unknown formats and saved start-date durations while preserving comparison gates",()=>{
 const ads=Array.from({length:12},(_,i)=>browserCreative({adId:String(i),nativeId:String(i),workspaceBrand:i<6,brandId:i<6?"house":"rival",daysRunning:100-i,creativeFormat:null,adFormat:i<3?"video":null,productCategories:i<2?["candles"]:[],publicEvidence:true}));
 const before=JSON.stringify(ads),coverage=winnersCoverage(ads,["candles"]);assert.equal(coverage.tagged,2);assert.equal(coverage.known,3);assert.equal(coverage.media,0);assert(coverage.groups.every(group=>group.hidden));assert(coverage.gaps.includes("10 ads need a category tag"));assert(coverage.gaps.includes("9 ads have unknown format"));
 assert.equal(unqualifiedWinners(ads).length,12);assert.equal(unqualifiedWinners(ads)[0].adId,"0");assert.equal(unqualifiedWinners(ads,{brand:"rival"}).length,6);assert.equal(JSON.stringify(ads),before);
});
