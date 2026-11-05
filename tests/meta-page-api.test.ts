import {test} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {mkdtemp,rm,readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {openDatabase} from "../server/db.js";
import {basicAuth} from "../server/auth.js";
import {protectSettingsMutation} from "../server/request-guard.js";
import {attachMetaPageCandidates,savedPageLookupTarget} from "../server/infrastructure/meta-page-api.js";
import {MetaLibraryConnector} from "../server/connectors/meta-library.js";
import {lookupPool} from "./fixtures/meta-lookup-pool.js";
import type {Brand} from "../shared/types.js";
const brand:Brand={id:"fixture-workspace",name:"Fictional Candle House",domain:"fictional-candle.example",category:"Home fragrance & gifting",color:"#123456",initials:"FC",voice:[],competitors:["Fictional Rival"],mode:"imported",createdAt:"2026-11-01"};
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64"),env={META_ACCESS_TOKEN:"fixture-only-token",EXTER_META_LIBRARY_ENABLED:"false"};
const headers={authorization:`Basic ${Buffer.from("fixture:fixture-only").toString("base64")}`,"Content-Type":"application/json"};
async function fixture(configured=true){
 const db=openDatabase(":memory:",false);for(const b of [brand,{...brand,id:"fixture-rival",name:"Fictional Rival",domain:"fictional-rival.example"},{...brand,id:"sample-fixture",mode:"demo"}])db.prepare("INSERT INTO brands VALUES(?,?)").run(b.id,JSON.stringify(b));
 const root=await mkdtemp(join(tmpdir(),"exter-candidate-pictures-")),app=express(),{pool,state}=lookupPool();let searches=0,pictures=0,pictureMode="ok";
 const connector=new MetaLibraryConnector({token:env.META_ACCESS_TOKEN,fetch:async url=>{searches++;assert.equal(new URL(String(url)).searchParams.get("search_terms"),brand.name);return Response.json({data:[{id:"123",page_id:"99",page_name:"Fictional Studio",ad_creative_bodies:["A fictional example"],ad_creative_link_captions:[brand.domain]}]});}});
 app.use(basicAuth({EXTER_ADMIN_USER:"fixture",EXTER_ADMIN_PASSWORD:"fixture-only"}));app.use(express.json());app.use("/api/public/meta",protectSettingsMutation);
 attachMetaPageCandidates(app,db,()=>pool,{env:configured?env:{},connector,paceMs:0,logos:{root,resolve:async()=>[{address:"93.184.215.14",family:4}],convert:async bytes=>bytes,fetch:async()=>{pictures++;if(pictureMode==="rate")return Response.json({error:{code:4,message:env.META_ACCESS_TOKEN}},{status:400,headers:{"retry-after":"600"}});if(pictureMode==="svg")return new Response("<svg/>",{headers:{"content-type":"image/svg+xml"}});return new Response(png,{headers:{"content-type":"image/png"}});}}});
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 return {db,pool,state,root,app,base,counts:()=>({searches,pictures}),pictureMode:(mode:string)=>pictureMode=mode,post:(path:string,body:unknown,extra={})=>fetch(base+path,{method:"POST",headers:{...headers,...extra},body:JSON.stringify(body)}),close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();await rm(root,{recursive:true,force:true});}};
}
test("candidate API is authenticated and scoped, reads saved domains, and never saves an unconfirmed identity",async()=>{
 const f=await fixture();try{
  assert.equal(savedPageLookupTarget(f.db,brand.id,"fixture-rival")?.domain,"fictional-rival.example");assert.equal(savedPageLookupTarget(f.db,brand.id,"unrelated"),null);assert.equal(savedPageLookupTarget(f.db,"sample-fixture","sample-fixture"),null);
  const body={workspaceId:brand.id,brandKey:brand.id};
  assert.equal((await fetch(f.base+"/api/public/meta/page-candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).status,401);
  assert.equal((await f.post("/api/public/meta/page-candidates",body,{Origin:"https://foreign.example"})).status,403);
  assert.equal((await f.post("/api/public/meta/page-candidates",{...body,brandKey:"other"})).status,404);assert.equal(f.counts().searches,0);
  const before=f.db.prepare("SELECT total_changes() AS n").get();const response=await f.post("/api/public/meta/page-candidates",{...body,name:"Ignore caller search text",domain:"other.example"});assert.equal(response.status,200);const found=await response.json();assert.equal(found.candidates[0].domainMatchedAds,1);assert.equal(found.websiteDomain,brand.domain);
  assert.ok(!JSON.stringify(found).includes(env.META_ACCESS_TOKEN));assert.equal((await f.post(`/api/public/meta/page-candidates/${found.id}/picture`,{workspaceId:"other",pageId:"99"})).status,404);assert.equal(f.counts().pictures,0);
  const picture=await f.post(`/api/public/meta/page-candidates/${found.id}/picture`,{workspaceId:brand.id,pageId:"99"});assert.equal(picture.status,200);assert.equal(picture.headers.get("content-type"),"image/png");assert.deepEqual(Buffer.from(await picture.arrayBuffer()),png);
  assert.deepEqual(f.db.prepare("SELECT total_changes() AS n").get(),before);assert.ok(!f.state.sql.some(sql=>/INSERT INTO (watchlists|public_ads|ad_observations)/.test(sql)));assert.deepEqual(f.counts(),{searches:1,pictures:1});
  const manifests=(await readdir(join(f.root,"brand-logos"))).filter(name=>name.endsWith(".json"));assert.equal(manifests.length,1);assert.doesNotMatch(await readFile(join(f.root,"brand-logos",manifests[0]),"utf8"),/"metaPageId":"99"|https?:|access_token/);
 }finally{await f.close();}
});
test("token absence stops lookup and picture requests before database dispatch or source calls",async()=>{
 const f=await fixture(false);try{
  assert.equal((await f.post("/api/public/meta/page-candidates",{workspaceId:brand.id,brandKey:brand.id})).status,409);assert.equal((await f.post("/api/public/meta/page-candidates/unknown/picture",{workspaceId:brand.id,pageId:"99"})).status,409);
  assert.deepEqual(f.counts(),{searches:0,pictures:0});assert.equal(f.state.sql.length,0);
 }finally{await f.close();}
});
test("candidate pictures share request pacing, retry after a busy slot, then use the local monthly cache",async()=>{
 const f=await fixture();try{
  const result=await(await f.post("/api/public/meta/page-candidates",{workspaceId:brand.id,brandKey:brand.id})).json(),path=`/api/public/meta/page-candidates/${result.id}/picture`,body={workspaceId:brand.id,pageId:"99"};
  f.state.waitMs=20000;const waiting=await f.post(path,body);assert.equal(waiting.status,429);assert.equal(waiting.headers.get("retry-after"),"20");assert.equal(f.counts().pictures,0);
  f.state.waitMs=0;assert.equal((await f.post(path,body)).status,200);assert.equal(f.counts().pictures,1);
  f.state.waitMs=60000;assert.equal((await f.post(path,body)).status,200);assert.equal(f.counts().pictures,1,"cached previews make no provider call");
 }finally{await f.close();}
});

test("profile rate errors do not poison the monthly cache, and unsupported image types never become a preview",async()=>{
 const f=await fixture();try{
  const found=await(await f.post("/api/public/meta/page-candidates",{workspaceId:brand.id,brandKey:brand.id})).json(),path=`/api/public/meta/page-candidates/${found.id}/picture`,body={workspaceId:brand.id,pageId:"99"};
  f.pictureMode("rate");const response=await f.post(path,body);assert.equal(response.status,429);assert.equal(response.headers.get("retry-after"),"600");assert.ok(!(await response.text()).includes(env.META_ACCESS_TOKEN));assert.equal(f.state.waitMs,600000);
  f.state.waitMs=0;f.pictureMode("ok");assert.equal((await f.post(path,body)).status,200);assert.equal(f.counts().pictures,2);
 }finally{await f.close();}
 const bad=await fixture();try{
  const found=await(await bad.post("/api/public/meta/page-candidates",{workspaceId:brand.id,brandKey:brand.id})).json();bad.pictureMode("svg");assert.equal((await bad.post(`/api/public/meta/page-candidates/${found.id}/picture`,{workspaceId:brand.id,pageId:"99"})).status,204);
 }finally{await bad.close();}
});
