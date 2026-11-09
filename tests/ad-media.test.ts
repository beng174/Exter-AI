import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {AD_MEDIA_BUILD,mediaEnabled,mediaMaximumUsd,priorityVideoIds} from "../shared/ad-media.js";
import {AdMediaActor,actorMedia,mediaActorInput,finalMediaCostUsd} from "../server/ad-media/apify.js";
import {AdMediaStorage,mediaDiskMeasurement,missingMediaDisk,videoFitsDisk} from "../server/ad-media/storage.js";
import {mediaBrokerConfig,workAdMediaOnce} from "../server/ad-media/api.js";
import {scheduleAdMedia,stepAdMedia} from "../server/ad-media/jobs.js";
import {mergeRetainedMedia} from "../server/ad-media/read.js";
import {sampleLibrary} from "../shared/sample/workspace.js";
const scope={pageId:"12001",from:"2025-11-05",to:"2026-11-05",ids:[],cap:500};
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]);
const url="https://image.fixture.fbcdn.net/file.png?temporary=never-save-this";
const disk=async()=>mediaDiskMeasurement(10*1024**3,9*1024**3);
const imageOptions={resolve:async()=>[{address:"8.8.8.8",family:4}],fetch:async()=>new Response(png,{headers:{"Content-Type":"image/png"}}),probe:async()=>({width:40,height:30})};

test("media is opt-in on all services; missing credentials and disabled scheduling/worker make no calls",async()=>{
  for(const value of [undefined,"false","1","TRUE"]){const env={EXTER_AD_MEDIA_ENABLED:value};assert.equal(mediaEnabled(env),false);const pool:any={query(){assert.fail("No database/provider work while off");}};await scheduleAdMedia(pool,env);assert.equal(await workAdMediaOnce(pool,{env,fetch:async()=>{assert.fail();}}),false);assert.equal(await stepAdMedia(pool,"x","y",{env}),false);}
  const actor=new AdMediaActor({env:{},fetch:async()=>{assert.fail();}});await assert.rejects(()=>actor.start(scope),/configuration/);
  const render=await readFile(new URL("../render.yaml",import.meta.url),"utf8");
  const services=new Map(render.split(/^  - type:/m).slice(1).map(block=>[block.match(/^    name: (\S+)$/m)?.[1],block]));
  for(const key of ["EXTER_AD_MEDIA_ENABLED","EXTER_META_LIBRARY_ENABLED"]){
    const values=["exter-ai","exter-worker","exter-scheduler"].map(name=>{
      const block=services.get(name);assert.ok(block,`Render service ${name} must exist.`);
      const entries=[...block.matchAll(new RegExp(`^      - key: ${key}\\r?\\n        value: (.+)$`,"gm"))];
      assert.equal(entries.length,1,`${name} must define ${key} once.`);
      const value=entries[0][1].trim().replace(/^("|')(.*)\1$/,"$2");
      assert.ok(["true","false"].includes(value),`${name} ${key} must be true or false.`);
      return value;
    });
    assert.equal(new Set(values).size,1,`${key} must agree across web, worker and scheduler.`);
  }
});
test("actor uses confirmed Page, GB, year window, exact later IDs, pinned build and charge ceiling without URL credentials",async()=>{
  const input:any=mediaActorInput(scope);assert.deepEqual(input.pageIds,["12001"]);assert.deepEqual(input.countries,["GB"]);assert.equal(input.deliveredAfter,"2025-11-05");assert.equal(input.activeStatus,"all");for(const key of ["fetchAdDetails","fetchPageDetails","resolveLandingPages","includePageMatches"]as const)assert.equal(input[key],false);
  assert.deepEqual((mediaActorInput({...scope,ids:["9001"]}) as any).adArchiveIds,["9001"]);assert.equal((mediaActorInput({...scope,ids:["9001"]}) as any).pageIds,undefined);
  let calls=0;const actor=new AdMediaActor({env:{APIFY_TOKEN:"fixture-only",EXTER_AD_MEDIA_GBP_PER_USD:"1"},fetch:async(target,init)=>{calls++;const u=new URL(String(target));assert.equal(u.origin,"https://api.apify.com");assert.equal(u.searchParams.get("build"),AD_MEDIA_BUILD);assert.equal(u.searchParams.get("maxTotalChargeUsd"),String(mediaMaximumUsd(500)));assert(!u.href.includes("fixture-only"));assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer fixture-only");assert.equal(init?.redirect,"manual");return Response.json({data:{id:"fixtureRun10000001",defaultDatasetId:"fixtureData100001"}});}});await actor.start(scope);assert.equal(calls,1);assert.equal(mediaMaximumUsd(1000),.50005);
  await assert.rejects(()=>actor.start({...scope,pageId:"wrong"}),/configuration/);
});
test("actor redirects, error bodies, malformed, oversized and timed-out responses expose only controlled errors",async()=>{
  for(const result of [()=>new Response("private-provider-text fixture-only",{status:403}),()=>new Response(null,{status:302,headers:{location:"https://elsewhere.example/"}}),()=>new Response("bad-json"),()=>new Response("x",{headers:{"content-length":String(3*1024**2)}}),()=>{throw new Error("private-provider-text fixture-only");}]){
    const actor=new AdMediaActor({env:{APIFY_TOKEN:"fixture-only",EXTER_AD_MEDIA_GBP_PER_USD:"1"},fetch:async()=>result()});await assert.rejects(()=>actor.start(scope),(e:Error)=>{assert(!e.message.includes("private-provider")&&!e.message.includes("fixture-only")&&!e.message.includes("https:"));return true;});
  }
});
test("only exact string archive/Page IDs, format and media are normalised; private/public evidence fields are ignored",()=>{
  const result=actorMedia({adArchiveId:"9001",pageId:"12001",displayFormat:"DPA",imageUrls:[url,url],videoPreviewImageUrls:[url],videoUrls:["https://video.fixture.fbcdn.net/x.mp4"],reach:999,spend:20,startDate:"2020-01-01",adText:"Actor copy must not replace official text"});assert.equal(result?.format,"catalogue");assert.deepEqual(result?.images,[url]);assert.deepEqual(result?.posters,[url]);assert(!JSON.stringify(result).includes("spend"));assert(!JSON.stringify(result).includes("Actor copy"));assert.equal(actorMedia({adArchiveId:9001,pageId:"12001"}),null);
});
test("video priorities are 30+ days, brand top 20 published reach or newly launched; missing/zero and separate brands stay honest",()=>{
  const now=new Date("2026-11-05"),rows=Array.from({length:25},(_,i)=>({nativeId:String(i),brandId:"a",daysRunning:10,deliveryStartAt:"2026-10-20",publicReach:{eu:{type:"observed" as const,value:i},locations:{type:"unavailable" as const,value:null},demographics:{type:"unavailable" as const,value:null}}}));
  let ids=priorityVideoIds(rows,now);assert.equal(ids.size,20);assert(!ids.has("0"));assert(ids.has("24"));assert(priorityVideoIds([{...rows[0],daysRunning:30}],now).has("0"));assert(priorityVideoIds([{...rows[0],deliveryStartAt:"2026-11-03"}],now).has("0"));assert.equal(priorityVideoIds([{...rows[0],publicReach:undefined}],now).size,0);assert.equal(priorityVideoIds([...rows,{...rows[0],brandId:"b",nativeId:"other"}],now).size,21);
});
test("disk fail-closed measurement and worst-case video capacity stop at 80%, preserving raster retention",()=>{
  assert.equal(videoFitsDisk(missingMediaDisk()),false);assert.equal(mediaDiskMeasurement(1000,200).videoDownloadsPaused,true);assert.equal(videoFitsDisk(mediaDiskMeasurement(1000,300),101),false);assert.equal(videoFitsDisk(mediaDiskMeasurement(1000,300),100),true);assert.throws(()=>mediaDiskMeasurement(0,0));
});
test("bounded raster retention deduplicates across ads, does not retain URLs and downloads no non-priority video",async()=>{
  const root=await mkdtemp(join(tmpdir(),"exter-ad-media-test-"));let videos=0;
  try{const store=new AdMediaStorage({root,images:imageOptions,disk,videos:{fetch:async()=>{videos++;assert.fail();}}});const media={adId:"9001",pageId:"12001",format:"video" as const,images:[url],posters:[url],videos:["https://video.fixture.fbcdn.net/file.mp4"]};
    const first=await store.retain("workspace-one",media,false),second=await store.retain("workspace-one",{...media,adId:"9002"},false);assert.equal(first.assets.length,2);assert.equal(first.assets[0].ref.artifactId,second.assets[1].ref.artifactId);assert.equal(videos,0);assert(!JSON.stringify(first).includes("temporary"));const objects=await readdir(join(root,"public-ad-files"),{recursive:true});assert.equal(objects.filter(p=>/^[a-f0-9]{64}\/[a-f0-9]{64}$/.test(String(p))).length,1);
    const paused=new AdMediaStorage({root,images:imageOptions,disk:async()=>mediaDiskMeasurement(10*1024**3,2*1024**3),videos:{fetch:async()=>{videos++;assert.fail();}}});const result=await paused.retain("workspace-one",media,true);assert.equal(result.error,"disk");assert.equal(result.assets.length,2);assert.equal(videos,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
test("raster host, redirects, MIME, size and expiring-link failures preserve earlier content",async()=>{
  const root=await mkdtemp(join(tmpdir(),"exter-ad-media-limits-"));
  try{for(const [reason,response] of [["expired",()=>new Response(null,{status:410})],["unsupported",()=>new Response("<svg/>",{headers:{"content-type":"image/svg+xml"}})],["unsupported",()=>new Response(png,{headers:{"content-type":"image/png","content-length":String(9*1024**2)}})],["provider",()=>new Response(null,{status:302,headers:{location:"https://unapproved.example/file.png"}})]] as const){const store=new AdMediaStorage({root,images:{...imageOptions,fetch:async()=>response()},disk});const result=await store.retain("workspace-one",{adId:"9001",pageId:"12001",format:"image",images:[url],posters:[],videos:[]},false);assert.equal(result.assets.length,0);assert.equal(result.error,reason);}
    let calls=0;const store=new AdMediaStorage({root,images:{...imageOptions,fetch:async()=>{calls++;return new Response(png);}},disk});await store.retain("workspace-one",{adId:"9001",pageId:"12001",format:"image",images:["https://127.0.0.1/private"],posters:[],videos:[]},false);assert.equal(calls,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
test("eligible videos are locally re-encoded to bounded 720p H.264, deduplicated and survive a store restart",async()=>{
  const root=await mkdtemp(join(tmpdir(),"exter-ad-media-video-"));
  try{const original=join(root,"fixture.mp4");assert.equal(spawnSync("ffmpeg",["-v","error","-f","lavfi","-i","color=c=blue:s=1920x1080:r=1","-t","1","-c:v","libx264","-threads","1","-pix_fmt","yuv420p","-y",original]).status,0);const bytes=await readFile(original),store=new AdMediaStorage({root,disk,videos:{resolve:imageOptions.resolve,fetch:async()=>new Response(bytes,{headers:{"content-type":"video/mp4"}})}});const media={adId:"9001",pageId:"12001",format:"video" as const,images:[],posters:[],videos:["https://video.fixture.fbcdn.net/file.mp4?temporary=private"]};
    const result=await store.retain("workspace-one",media,true);assert.equal(result.error,null);assert.equal(result.assets.length,2);assert(result.assets.some(a=>a.role==="poster"));const file=await new AdMediaStorage({root}).store.load(result.assets.find(a=>a.role==="video")!.ref);assert(file);const probe=spawnSync("ffprobe",["-v","error","-show_streams","-of","json",file.absolutePath],{encoding:"utf8"});const info=JSON.parse(probe.stdout).streams[0];assert.equal(info.codec_name,"h264");assert.equal(info.width,1280);assert.equal(info.height,720);
    const again=await store.retain("workspace-one",{...media,adId:"9002"},true);assert.equal(again.assets[0].ref.artifactId,result.assets[0].ref.artifactId);
  }finally{await rm(root,{recursive:true,force:true});}
});
test("media projection is workspace/ad scoped, preserves existing media and analyses and never changes official evidence",()=>{
  const library=sampleLibrary(),row={...library.creatives[0],mediaAvailable:false,publicEvidence:true,platform:"Meta",thumbnailUrl:null,videoUrl:null,imageUrls:[]},asset:any={role:"poster",index:0,ref:{workspaceId:library.brand.id,artifactId:"a".repeat(64),sha256:"b".repeat(64),bytes:40,mimeType:"image/png"}};
  const saved={workspace_id:library.brand.id,brand_key:row.brandId,native_id:row.nativeId,format:"video",assets:[asset]};const merged=mergeRetainedMedia([row],[saved],library.brand.id)[0];assert(merged.thumbnailUrl?.startsWith("/api/ad-media/files/"));assert.equal(merged.videoUrl,null);assert.equal(merged.mediaSha256,null,"posters never establish full creative identity");assert.deepEqual(merged.publicReach,row.publicReach);assert.deepEqual(merged.analysis,row.analysis);assert.equal(mergeRetainedMedia([row],[saved],"other")[0],row);assert.equal(mergeRetainedMedia([{...row,mediaAvailable:true}],[saved],library.brand.id)[0].thumbnailUrl,null);
});
test("the worker machine destination has a dedicated fixed HTTPS origin and token",()=>{
  const token="fixture-only-".repeat(4);assert(mediaBrokerConfig({EXTER_AD_MEDIA_BROKER_TOKEN:token,EXTER_AD_MEDIA_BROKER_ORIGIN:"https://exter-fixture.example"}));for(const origin of ["http://exter-fixture.example","https://user:pass@exter-fixture.example","https://127.0.0.1","https://exter-fixture.example/path","https://exter-fixture.example?token=private"]){assert.equal(mediaBrokerConfig({EXTER_AD_MEDIA_BROKER_TOKEN:token,EXTER_AD_MEDIA_BROKER_ORIGIN:origin}),null);}
});

test("cost settlement counts all billed results and retains unknown, changed-price or over-cap accounting",()=>{
 const state={chargedEventCounts:{"ad-result":8,"apify-actor-start":1},pricingInfo:{pricingModel:"PAY_PER_EVENT",pricingPerEvent:{actorChargeEvents:{"ad-result":{eventPriceUsd:.0005},"apify-actor-start":{eventPriceUsd:.00005}}}}};
 assert.equal(finalMediaCostUsd(state,1,10),.00405);assert.equal(finalMediaCostUsd(state,10,10),.00505);assert.equal(finalMediaCostUsd({},1,10),null);assert.equal(finalMediaCostUsd({...state,chargedEventCounts:{...state.chargedEventCounts,unexpected:1}},1,10),null);assert.equal(finalMediaCostUsd({...state,chargedEventCounts:{"ad-result":11,"apify-actor-start":1}},1,10),null);assert.equal(finalMediaCostUsd({...state,pricingInfo:{...state.pricingInfo,isPPEPlatformUsagePaidByUser:true}},1,10),null);
});

test("the diskless worker uses only the authenticated fixed-origin step and bounded acknowledgements",async()=>{
 const env={EXTER_AD_MEDIA_ENABLED:"true",EXTER_AD_MEDIA_BROKER_TOKEN:"fixture-only-service-".repeat(3),EXTER_AD_MEDIA_BROKER_ORIGIN:"https://exter-fixture.example"};let queries=0,calls=0;
 const pool:any={query:async(sql:string)=>{queries++;return sql.includes("RETURNING *")?{rows:[{id:"00000000-0000-4000-8000-000000000001",watchlist_id:"fixture-watch"}]}:sql.startsWith("SELECT status")?{rows:[{status:"running"}]}:{rows:[]};}};
 assert.equal(await workAdMediaOnce(pool,{env,fetch:async(url,init)=>{calls++;assert(String(url).startsWith(env.EXTER_AD_MEDIA_BROKER_ORIGIN+"/api/ad-media/step/"));assert(!String(url).includes(env.EXTER_AD_MEDIA_BROKER_TOKEN));assert.equal(init?.method,"POST");assert.equal(init?.redirect,"error");assert.equal(new Headers(init?.headers).get("X-Exter-Ad-Media-Token"),env.EXTER_AD_MEDIA_BROKER_TOKEN);assert(!new Headers(init?.headers).has("Authorization"));return Response.json({worked:true});}}),true);assert.equal(calls,1);assert.equal(queries,3);
});

test('video-only results keep a JPEG poster for non-priority ads without retaining a full video at the disk limit',async()=>{
 const root=await mkdtemp(join(tmpdir(),'exter-poster-only-'));
 try{
  const original=join(root,'fixture.mp4');assert.equal(spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=320x240:r=1','-t','1','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-y',original]).status,0);const bytes=await readFile(original);let calls=0;
  const store=new AdMediaStorage({root,disk:async()=>mediaDiskMeasurement(10*1024**3,2*1024**3),videos:{resolve:imageOptions.resolve,fetch:async()=>{calls++;return new Response(bytes,{headers:{'content-type':'video/mp4'}});}}});
  const result=await store.retain('workspace',{adId:'9001',pageId:'12001',format:'video',images:[],posters:[],videos:['https://video.fixture.fbcdn.net/temporary.mp4']},false);
  assert.equal(calls,1);assert.equal(result.error,null);assert.deepEqual(result.assets.map(a=>[a.role,a.ref.mimeType]),[['poster','image/jpeg']]);assert(await store.store.load(result.assets[0].ref));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('nested catalogue snapshot media supplies product images and keeps its observed format',()=>{
 const row=actorMedia({adArchiveId:'9001',pageId:'12001',snapshot:{display_format:'DPA',cards:[{original_image_url:url}],videos:[],images:[]}});
 assert.equal(row?.format,'catalogue');assert.deepEqual(row?.images,[url]);
});
