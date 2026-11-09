import test from "node:test";
import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";
import {ReadCache, invalidateWorkspaceReads} from "../src/lib/read-cache.js";
import {workspaceRead} from "../src/lib/workspace-read.js";
import {api} from "../src/lib/api.js";
import express from "express";
import {createServer, get} from "node:http";
import {gunzipSync} from "node:zlib";
import type {AddressInfo} from "node:net";
import {writeJsonRows} from "../server/infrastructure/json-rows.js";

test("navigation shares a pending read and a fresh result, but expiry and explicit refresh read again",async()=>{
  let now=0, calls=0, resolve!:(value:object)=>void;
  const cache=new ReadCache(2,30,()=>now),load=()=>{calls++;return new Promise<object>(r=>resolve=r);};
  const first=cache.acquire("workspace-a:week",load),second=cache.acquire("workspace-a:week",load);
  await Promise.resolve();assert.equal(calls,1);
  const value={ads:7800};resolve(value);
  assert.strictEqual(await first.promise,value);assert.strictEqual(await second.promise,value);
  first.release();second.release();
  const next=cache.acquire("workspace-a:week",load);assert.strictEqual(await next.promise,value);next.release();assert.equal(calls,1);
  now=31;const expired=cache.acquire("workspace-a:week",async()=>{calls++;return {ads:7801};});assert.equal((await expired.promise).ads,7801);expired.release();
  cache.clear();const refreshed=cache.acquire("workspace-a:week",async()=>{calls++;return {ads:7802};});assert.equal((await refreshed.promise).ads,7802);refreshed.release();assert.equal(calls,3);
});

test("only two unused large reads are retained and a failed read remains retryable",async()=>{
  const cache=new ReadCache(2,30_000);let calls=0;
  const load=async()=>++calls;
  for(const key of ["a","b","c"]){const lease=cache.acquire(key,load);await lease.promise;lease.release();}
  const kept=cache.acquire("b",load);assert.equal(await kept.promise,2);kept.release();
  const evicted=cache.acquire("a",load);assert.equal(await evicted.promise,4);evicted.release();
  const failed=cache.acquire("error",async()=>{throw new Error("Fixture read failed");});await assert.rejects(failed.promise,/Fixture read failed/);failed.release();
  const retry=cache.acquire("error",async()=>7800);assert.equal(await retry.promise,7800);retry.release();
});

test("a new screen takes over an in-flight request; abandoned requests and invalidated reads abort",async()=>{
  const cache=new ReadCache(2,30_000);let signal:AbortSignal|undefined,calls=0;
  const load=(s:AbortSignal)=>{calls++;signal=s;return new Promise<number>((_resolve,reject)=>s.addEventListener("abort",()=>reject(new Error("aborted")),{once:true}));};
  const first=cache.acquire("a",load);await Promise.resolve();first.release();
  const takeover=cache.acquire("a",load);await delay(5);assert.equal(signal!.aborted,false);assert.equal(calls,1);
  const rejected=assert.rejects(takeover.promise,/aborted/);takeover.release();await rejected;
  const refreshed=cache.acquire("a",load);await Promise.resolve();const cancelled=assert.rejects(refreshed.promise,/aborted/);cache.clear();await cancelled;refreshed.release();assert.equal(calls,2);
});

test("workspace, reporting dates and sample mode never share cached results; successful writes invalidate reads",async()=>{
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,"window"),originalFetch=globalThis.fetch;
  let search="",calls=0;const paths:string[]=[];
  Object.defineProperty(globalThis,"window",{configurable:true,value:{location:{origin:"http://fixture.local",get search(){return search;}}}});
  globalThis.fetch=async(input,options)=>{calls++;paths.push(String(input));return Response.json({call:calls,path:String(input),method:options?.method||"GET"});};
  const read=async(path:string)=>{const lease=workspaceRead<{call:number;path:string}>(path,true);try{return await lease.promise;}finally{lease.release();}};
  try{
    invalidateWorkspaceReads();const url="/api/brands/one/creatives?from=2026-11-01&to=2026-11-07";
    const one=await read(url);assert.deepEqual(await read(url),one);
    assert.notEqual((await read(url.replace("one","two"))).call,one.call);
    assert.notEqual((await read(url.replace("11-01","11-02"))).call,one.call);
    search="?demo=1";const sample=workspaceRead<{path:string}>(url,true);search="";
    assert.equal(new URL((await sample.promise).path,"http://fixture.local").searchParams.get("demo"),"1","mode captured before the request starts");sample.release();
    const real=await read(url);assert.ok(!real.path.includes("demo"));
    await api("/api/watchlist",{pageId:"12"});assert.notEqual((await read(url)).call,real.call);
    search="?demo=1";const before=calls;await assert.rejects(api("/api/watchlist",{pageId:"12"}),/read-only/);assert.equal(calls,before);
    assert.ok(paths.every(path=>path.startsWith("/api/")));
  }finally{invalidateWorkspaceReads();globalThis.fetch=originalFetch;if(originalWindow)Object.defineProperty(globalThis,"window",originalWindow);else Reflect.deleteProperty(globalThis,"window");}
});

test("streaming gzip shrinks a full library without changing any JSON values, and disconnects clean up",async()=>{
  const value={brand:{id:"fixture"},creatives:Array.from({length:7800},(_,id)=>({id,copy:"A candle makes a quiet evening feel special.",reach:1234,unknown:null,observed:0}))};
  const app=express();let closed!:()=>void;const cleanup=new Promise<void>(r=>closed=r);
  app.get("/",(req,res)=>{res.vary("Accept-Encoding");void writeJsonRows(res,value,"creatives",{gzip:req.acceptsEncodings("gzip")==="gzip"}).catch(()=>{});});
  app.get("/cancel",(_req,res)=>void writeJsonRows(res,{creatives:Array.from({length:10000},(_,id)=>({id,copy:String(id).repeat(1000)}))},"creatives",{gzip:true}).catch(()=>{}).finally(closed));
  const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const raw=(encoding:string)=>new Promise<{body:Buffer;encoding:string|undefined}>(resolve=>get(base,{headers:{"Accept-Encoding":encoding}},response=>{const parts:Buffer[]=[];response.on("data",part=>parts.push(part));response.on("end",()=>resolve({body:Buffer.concat(parts),encoding:response.headers["content-encoding"]}));}));
  try{
    const identity=await raw("identity"),gzip=await raw("gzip");assert.equal(identity.encoding,undefined);assert.equal(gzip.encoding,"gzip");assert.equal(gunzipSync(gzip.body).toString(),identity.body.toString());assert.deepEqual(JSON.parse(identity.body.toString()),value);assert(gzip.body.length<identity.body.length/10);
    const response=await fetch(base+"/cancel");await response.body!.cancel();await cleanup;assert.equal((await fetch(base)).status,200);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
