import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Ad, Brand } from "../shared/types.js";
import type { VideoAnalysisResult, VideoAnalysisAccounting } from "../shared/video-analysis.js";
import type { PatternLabelOverlay } from "../shared/pattern-labelling.js";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { VideoProviderError } from "../server/video/types.js";
import { PatternLabellingService, applyPatternLabelOverlay, readPatternLabelOverlay, patternLabelInput, patternLabelSourceHash, type PatternLabelInput, type PatternLabelOutput } from "../server/demo/pattern-labelling.js";
import { attachPatternLabelling } from "../server/demo/pattern-labelling-api.js";

const field=(value:string)=>({value,confidence:.95,timestamps:[{startSeconds:0,endSeconds:2}]});
const env={ NODE_ENV:"production", RENDER:"true", GEMINI_API_KEY:"fixture-only-key", DATABASE_URL:"postgres://fixture.invalid/fixture", GEMINI_REQUEST_RESERVE_GBP:"0.01" };
const accounting=(attempts=1,rejected=0):VideoAnalysisAccounting=>({usage:{inputTokens:100,outputTokens:100,totalTokens:200},tokenCostGbp:.001,reservedCostGbp:0,estimatedCostGbp:.001,costBasis:"token_estimate",pricing:null,requestAttempts:attempts,rejectedAttempts:rejected});
function fixture() {
  const db=openDatabase(":memory:",false);
  const brand:Brand={id:"pattern-fixture",name:"Pattern fixture",domain:"example.com",category:"Home fragrance & gifting",color:"#123",initials:"PF",voice:[],competitors:[],mode:"imported",createdAt:"2026-11-03T00:00:00Z"};
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id,JSON.stringify(brand));
  const ad={id:"saved-ad",brandId:brand.id,brand:brand.name,platform:"Meta",source:"public",sourceUrl:"https://www.facebook.com/ads/library/?id=123456789",providerAdId:"123456789",advertiserPageId:"987654321",category:brand.category,title:"Three diffusers",copy:"Mix and match three diffusers for £30",format:"Video",active:true,publishedAt:"2026-10-30T00:00:00Z",observedAt:"2026-10-30T00:00:00Z",image:"",color:"#123",impressions:0,engagements:0,spend:null,conversions:null,revenue:null,owned:false} as Ad;
  db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id,ad.brandId,ad.source,ad.platform,ad.publishedAt,JSON.stringify(ad));
  const analysis={id:"paid-v1",brandId:brand.id,adId:ad.id,mediaId:"media-original",mediaSha256:"a".repeat(64),provider:"gemini",model:"gemini-fixture-flash",modelVersion:null,processingMode:"static-high-fps-hook",promptVersion:"exter-native-video-v1",createdAt:"2026-11-02T00:00:00Z",coverage:{durationSeconds:10,fullVideo:true,segments:[]},fields:{format:field("Product montage"),hook:field("Mix and match three diffusers"),angle:field("Volume discount deal promotion"),keyClaims:[field("3 diffusers for £30")],spokenTranscript:[field("Mix and match three diffusers")],onScreenText:[field("3 diffusers for £30")],cta:field("Shop now"),creatorEvidence:[],personTalkingToCamera:{...field("false"),value:false}},confidenceThreshold:0,accounting:accounting()} as unknown as VideoAnalysisResult;
  db.exec("CREATE TABLE video_analysis_runs (id TEXT PRIMARY KEY,brand_id TEXT NOT NULL,ad_id TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL)");
  const original=JSON.stringify(analysis);
  db.prepare("INSERT INTO video_analysis_runs VALUES (?,?,?,?,?)").run(analysis.id,brand.id,ad.id,analysis.createdAt,original);
  return {db,brand,ad,analysis,original};
}
function output(input:PatternLabelInput):PatternLabelOutput {
  const source=(name:string)=>input.sources.find(source=>source.sourceField===name)!.text;
  return {requestedModel:"gemini-fixture-flash",servedModel:"gemini-fixture-flash-001",generation:{temperature:0,seed:42},accounting:accounting(),fields:{
    format:{value:"studio",reason:"The saved description records product production.",evidence:[{sourceField:"format",quote:source("format")}]},
    hook_type:{value:"offer-led",reason:"The opening presents a multi-buy.",evidence:[{sourceField:"hook",quote:source("hook")}]},
    angle:{value:"value-bundle",reason:"The saved angle describes a volume deal.",evidence:[{sourceField:"angle",quote:source("angle")}]},
    offer_type:{value:"bundle",reason:"Multiple products are offered for one price.",evidence:[{sourceField:"keyClaims.0",quote:source("keyClaims.0")}]},
  }};
}

test("explicit serial text labels preserve paid originals, cite exact sources and project stale-safe canonical fields",async()=>{
  const f=fixture();let calls=0;
  const service=new PatternLabellingService(f.db,{env,analyse:async input=>{calls++;return output(input);}});
  try {
    const before=f.db.prepare("SELECT total_changes() AS n").get();
    assert.equal(service.snapshot(f.brand.id).remainingCount,1);assert.equal(calls,0);
    assert.deepEqual(f.db.prepare("SELECT total_changes() AS n").get(),before,"GET snapshots do not write or start jobs");
    await service.start(f.brand.id);await service.idle();
    const status=service.snapshot(f.brand.id);assert.equal(status.labelledCount,1);assert.equal(status.remainingCount,0);assert.equal(calls,1);
    const projected=applyPatternLabelOverlay(f.db,f.ad,f.analysis);
    assert.equal(projected.fields.hook_type?.value,"offer-led");assert.equal(projected.fields.angle.value,"value-bundle");assert.equal(projected.fields.offer_type?.value,"bundle");
    assert.equal(projected.fields.angle_explanation?.value,"Volume discount deal promotion");assert.deepEqual(projected.fields.hook_type?.timestamps,f.analysis.fields.hook.timestamps);
    assert.equal(projected.patternLabels?.provenance,"modelled");assert.equal(projected.patternLabels?.basis,"recorded-analysis-text");
    for(const key of ["id","adId","brandId","mediaId","mediaSha256","model","promptVersion","createdAt"] as const)assert.equal(projected[key],f.analysis[key]);
    assert.equal(JSON.stringify(f.analysis),f.original);assert.equal(f.db.prepare("SELECT data FROM video_analysis_runs WHERE id=?").get(f.analysis.id)!.data,f.original);
    assert.equal(readPatternLabelOverlay(f.db,{...f.ad,copy:"Changed source copy"},f.analysis),null);
    assert.equal(readPatternLabelOverlay(f.db,{...f.ad,brandId:"another-brand"},f.analysis),null);
    assert.equal(applyPatternLabelOverlay(f.db,{...f.ad,copy:"Changed source copy"},f.analysis),f.analysis);
    await service.start(f.brand.id);await service.idle();assert.equal(calls,1,"Repeated explicit starts reuse completed labels");
  }finally{f.db.close();}
});

test("native canonical values cannot be replaced, unknown stays unknown and absent timestamps are never invented",async()=>{
  const f=fixture();
  f.analysis.fields.format=field("studio") as any;
  f.analysis.fields.hook.timestamps=[];
  f.db.prepare("UPDATE video_analysis_runs SET data=? WHERE id=?").run(JSON.stringify(f.analysis),f.analysis.id);
  const service=new PatternLabellingService(f.db,{env,analyse:async input=>{const result=output(input);result.fields.format.value="animation";result.fields.offer_type={value:"unsure",reason:"The saved evidence is ambiguous.",evidence:[]};return result;}});
  try{
    await service.start(f.brand.id);await service.idle();
    const projected=applyPatternLabelOverlay(f.db,f.ad,f.analysis);
    assert.equal(projected.fields.format.value,"studio");assert.equal(projected.fields.offer_type,undefined);
    assert.deepEqual(projected.fields.hook_type?.timestamps,[]);
    assert.ok(!projected.patternLabels?.fields.includes("format"));
  }finally{f.db.close();}
});

test("unsupported citations, false none labels, invented founders and unsupported UGC fail without rewriting or silently charging again",async()=>{
  for(const kind of ["quote","none","founder","UGC"]){
    const f=fixture();let calls=0;
    const service=new PatternLabellingService(f.db,{env,analyse:async input=>{calls++;const result=output(input);if(kind==="quote")result.fields.hook_type.evidence[0].quote="Invented statement";else if(kind==="none")result.fields.offer_type.value="none";else result.fields.format.value=kind==="founder"?"founder-led":"UGC";return result;}});
    try{await service.start(f.brand.id);await service.idle();const snapshot=service.snapshot(f.brand.id);assert.equal(snapshot.labelledCount,0);assert.equal(snapshot.blockedCount,1);assert.equal(snapshot.lastRun?.items[0].possibleCharge,true);assert.equal(f.db.prepare("SELECT data FROM video_analysis_runs").get()!.data,f.original);await service.start(f.brand.id);await service.idle();assert.equal(calls,1);}finally{f.db.close();}
  }
});

test("budget pauses with zero dispatched calls are explicitly resumable, ambiguous requests remain blocked after restart",async()=>{
  for(const ambiguous of [false,true]){
    const f=fixture();let calls=0;
    const service=new PatternLabellingService(f.db,{env,analyse:async input=>{calls++;if(calls===1)throw new VideoProviderError(ambiguous?"unavailable":"budget_paused","Fixture provider stopped.",accounting(ambiguous?1:0));return output(input);}});
    try{
      await service.start(f.brand.id);await service.idle();assert.equal(service.snapshot(f.brand.id).blockedCount,ambiguous?1:0);
      const restarted=new PatternLabellingService(f.db,{env,analyse:async input=>{calls++;return output(input);}});
      await restarted.start(f.brand.id);await restarted.idle();assert.equal(calls,ambiguous?1:2);assert.equal(restarted.snapshot(f.brand.id).labelledCount,ambiguous?0:1);
    }finally{f.db.close();}
  }
});

test("restart never replays claimed requests while not-yet-dispatched work remains eligible",async()=>{
  const f=fixture();let release!:(value:PatternLabelOutput)=>void;let calls=0;
  const first=new PatternLabellingService(f.db,{env,analyse:input=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  try{
    await first.start(f.brand.id);await new Promise(resolve=>setTimeout(resolve,0));
    const restarted=new PatternLabellingService(f.db,{env,analyse:async input=>{calls++;return output(input);}});
    assert.equal(restarted.snapshot(f.brand.id).lastRun?.status,"interrupted");assert.equal(restarted.snapshot(f.brand.id).blockedCount,1);
    await restarted.start(f.brand.id);await restarted.idle();assert.equal(calls,1);
    release(output(patternLabelInput(f.ad,f.analysis)));await first.idle();
  }finally{f.db.close();}
});

test("non-hosted and unconfigured requests cannot start an analyser",async()=>{
  for(const state of [{}, {RENDER:"true"}]){
    const f=fixture();let calls=0;
    const service=new PatternLabellingService(f.db,{env:state,analyse:async input=>{calls++;return output(input);}});
    try{await assert.rejects(service.start(f.brand.id));assert.equal(calls,0);assert.equal(service.snapshot(f.brand.id).lastRun,null);}finally{f.db.close();}
  }
});

test("pattern-label endpoints require authentication and same-origin JSON; reads never dispatch",async()=>{
  const f=fixture(),previous={user:process.env.EXTER_ADMIN_USER,password:process.env.EXTER_ADMIN_PASSWORD};
  process.env.EXTER_ADMIN_USER="pattern-fixture";process.env.EXTER_ADMIN_PASSWORD="pattern-fixture-only";
  const app=express();app.use(basicAuth());app.use(express.json());let calls=0;
  const service=attachPatternLabelling(app,f.db,{env,analyse:async input=>{calls++;return output(input);}});
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers={authorization:`Basic ${Buffer.from("pattern-fixture:pattern-fixture-only").toString("base64")}`};
  try{
    assert.equal((await fetch(`${base}/api/pattern-labels?brandId=${f.brand.id}`)).status,401);
    assert.equal((await fetch(`${base}/api/pattern-labels?brandId=${f.brand.id}`,{headers})).status,200);assert.equal(calls,0);
    assert.equal((await fetch(`${base}/api/pattern-labels/start`,{method:"POST",headers,body:"brandId=x"})).status,415);
    assert.equal((await fetch(`${base}/api/pattern-labels/start`,{method:"POST",headers:{...headers,"Content-Type":"application/json",Origin:"https://foreign.example"},body:JSON.stringify({brandId:f.brand.id})})).status,403);
    const response=await fetch(`${base}/api/pattern-labels/start`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({brandId:f.brand.id})});assert.equal(response.status,202);await service.idle();assert.equal(calls,1);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));f.db.close();if(previous.user===undefined)delete process.env.EXTER_ADMIN_USER;else process.env.EXTER_ADMIN_USER=previous.user;if(previous.password===undefined)delete process.env.EXTER_ADMIN_PASSWORD;else process.env.EXTER_ADMIN_PASSWORD=previous.password;}
});
