import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openDatabase} from "../server/db.js";
import {basicAuth} from "../server/auth.js";
import {attachSampleWorkspace} from "../server/sample.js";
import {attachAdMedia,attachMediaStep} from "../server/ad-media/api.js";
import {AdMediaStorage,mediaDiskMeasurement} from "../server/ad-media/storage.js";
const token="fixture-only-media-machine-".repeat(2);
const credentials={Authorization:`Basic ${Buffer.from("fixture:fixture-only").toString("base64")}`};
test("media endpoints isolate machine auth, real workspaces, sample actions, fixed files and same-origin mutations",async()=>{
  const db=openDatabase(":memory:",false),root=await mkdtemp(join(tmpdir(),"exter-media-http-"));
  const previous={root:process.env.MEDIA_STORAGE_PATH,enabled:process.env.EXTER_AD_MEDIA_ENABLED,token:process.env.APIFY_TOKEN};
  process.env.MEDIA_STORAGE_PATH=root;process.env.EXTER_AD_MEDIA_ENABLED="false";process.env.APIFY_TOKEN="fixture-only";
  const brand={id:"fixture-media",name:"Fictional Candle House",domain:"fictional.example",category:"Home",color:"#123456",initials:"FC",voice:[],competitors:[],mode:"imported",createdAt:"2026-11-01"};db.prepare("INSERT INTO brands VALUES(?,?)").run(brand.id,JSON.stringify(brand));
  db.prepare("INSERT INTO brands VALUES(?,?)").run("sample-fixture",JSON.stringify({...brand,id:"sample-fixture",mode:"demo"}));
  let queries=0,scope="fixture-media";let assets:any[]=[];
  const pool:any={query:async(sql:string,params:any[])=>{queries++;if(sql.includes("SELECT workspace_id,brand_key"))return{rows:[{workspace_id:scope,brand_key:scope}]};if(sql.includes("SELECT assets"))return{rows:params[0]===brand.id&&params[1]===brand.id&&params[2]==="9001"?[{assets}]:[]};throw new Error("Unexpected fixture query");}};
  const env={EXTER_AD_MEDIA_ENABLED:"false",EXTER_AD_MEDIA_BROKER_TOKEN:token};
  const app=express();attachMediaStep(app,db,()=>pool,env);app.use(basicAuth({EXTER_ADMIN_USER:"fixture",EXTER_ADMIN_PASSWORD:"fixture-only"}));app.use(express.json());attachSampleWorkspace(app);attachAdMedia(app,db,()=>pool);
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,step=`/api/ad-media/step/${randomUUID()}/${randomUUID()}`;
  try{
    assert.equal((await fetch(base+step,{method:"POST"})).status,401);assert.equal(queries,0);
    assert.equal((await fetch(base+step,{method:"POST",headers:{"X-Exter-Ad-Media-Token":token}})).status,409);assert.equal(queries,0);
    env.EXTER_AD_MEDIA_ENABLED="true";scope="sample-fixture";assert.equal((await fetch(base+step,{method:"POST",headers:{"X-Exter-Ad-Media-Token":token}})).status,404);scope=brand.id;
    assert.equal((await fetch(base+"/api/ad-media/status?workspaceId="+brand.id)).status,401);
    for(const path of ["/api/ad-media/status?demo=1","/api/ad-media/collect?demo=1"]){const res=await fetch(base+path,{method:path.includes("collect")?"POST":"GET",headers:credentials});assert.equal(res.status,path.includes("collect")?403:404);}
    let response=await fetch(base+"/api/ad-media/collect",{method:"POST",headers:{...credentials,"Content-Type":"application/json",Origin:"https://foreign.example"},body:JSON.stringify({workspaceId:brand.id})});assert.equal(response.status,403);
    response=await fetch(base+"/api/ad-media/collect",{method:"POST",headers:credentials,body:"plain"});assert.equal(response.status,415);
    response=await fetch(base+"/api/ad-media/collect",{method:"POST",headers:{...credentials,"Content-Type":"application/json"},body:JSON.stringify({workspaceId:brand.id})});assert.equal(response.status,409);
    const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]),storage=new AdMediaStorage({root,disk:async()=>mediaDiskMeasurement(10*1024**3,9*1024**3),images:{fetch:async()=>new Response(png,{headers:{"content-type":"image/png"}}),resolve:async()=>[{address:"8.8.8.8",family:4}],probe:async()=>({width:40,height:30})}});
    assets=(await storage.retain(brand.id,{adId:"9001",pageId:"12001",format:"image",images:["https://image.fixture.fbcdn.net/file.png"],posters:[],videos:[]},false)).assets;
    const path=`/api/ad-media/files/${brand.id}/${brand.id}/9001/${assets[0].ref.artifactId}`;
    assert.equal((await fetch(base+path)).status,401);response=await fetch(base+path,{headers:credentials});assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"image/png");assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
    assert.equal((await fetch(base+path.replace("/9001/","/9002/"),{headers:credentials})).status,404);assert.equal((await fetch(base+path.replace("/fixture-media/fixture-media/","/sample-fixture/sample-fixture/"),{headers:credentials})).status,404);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();await rm(root,{recursive:true,force:true});for(const[key,value]of Object.entries({MEDIA_STORAGE_PATH:previous.root,EXTER_AD_MEDIA_ENABLED:previous.enabled,APIFY_TOKEN:previous.token})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
