import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import express from "express";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import type pg from "pg";
import {LibraryReadGate} from "../server/infrastructure/library-read-gate.js";
import {visitDatabaseRows} from "../server/infrastructure/read-rows.js";
import {writeJsonRows} from "../server/infrastructure/json-rows.js";
import {readPublicCreatives,mergePublicEvidence,type PublicObservation} from "../server/infrastructure/meta-evidence.js";
import {readRetainedMedia} from "../server/ad-media/read.js";
import {browserCreative} from "./fixtures/creative-browser.js";
const open=()=>new AbortController();
test("full-library builds have bounded waiting, cancellation and idempotent release",async()=>{
 const gate=new LibraryReadGate(1),a=open(),b=open(),c=open();const first=await gate.acquire(a.signal);assert(first);
 const queued=gate.acquire(b.signal);assert.equal(await gate.acquire(c.signal),null);b.abort();assert.equal(await queued,null);first();
 const second=await gate.acquire(c.signal);assert(second);first();const waiting=gate.acquire(open().signal);let granted=false;void waiting.then(()=>{granted=true;});await Promise.resolve();assert.equal(granted,false);second();const third=await waiting;assert(third);third();
});
test("a waiting deadline or an already-closed request cannot occupy the library gate",async()=>{
 const gate=new LibraryReadGate(1,5),controller=open();controller.abort();assert.equal(await gate.acquire(controller.signal),null);const active=await gate.acquire(open().signal);assert(active);
 const waiting=gate.acquire(open().signal);await new Promise(r=>setTimeout(r,15));assert.equal(await waiting,null);active();const next=await gate.acquire(open().signal);assert(next);next();
});
function rowPool(rows:unknown[],mode="ok"){
 let releases=0,visits=0;
 const pool={async connect(){return {query(q:any){if(mode==='throw')throw new Error('fixture query failed');queueMicrotask(()=>{if(mode==='error'){q.emit('error',new Error('fixture query failed'));return;}for(const row of rows){q.emit('row',row);visits++;}q.emit('end',{rows:[]});});return q;},release(){releases++;}};}} as unknown as pg.Pool;
 return {pool,get releases(){return releases;},get visits(){return visits;}};
}
test("row callback and limit failures drain the query and release the connection",async()=>{
 for(const limit of [false,true]){const f=rowPool([1,2,3]);let visits=0;await assert.rejects(()=>visitDatabaseRows(f.pool,'SELECT fixture',[],()=>{visits++;if(!limit)throw new Error('fixture visitor failed');},limit?1:100),limit?/read limit/:/visitor failed/);assert.equal(f.releases,1);assert.equal(f.visits,3);assert.equal(visits,1);}
 for(const mode of ['error','throw']){const f=rowPool([],mode);await assert.rejects(()=>visitDatabaseRows(f.pool,'SELECT fixture',[],()=>{}),/query failed/);assert.equal(f.releases,1);}
});
const brand={id:'fixture',name:'Fictional Candle House',domain:'fictional.example'},competitors:any[]=[];
const observation=(patch:Partial<PublicObservation>={}):PublicObservation=>({native_id:'9001',advertiser_id:'12',observed_at:'2026-11-08T12:00:00Z',first_seen_at:'2026-11-01T00:00:00Z',start_time:'2026-10-01',stop_time:null,raw_payload:{ad_creative_bodies:['A quiet evening.'],eu_total_reach:0,total_reach_by_location:[{country:'GB',reach:0}]},brand_key:brand.id,page_ids:['12'],...patch});
test("streamed public evidence matches the original projection and never leaks partial results on failure",async()=>{
 const rows=[observation(),observation({native_id:'9002',raw_payload:{ad_creative_bodies:['Second ad.']}}),observation({native_id:'9999',brand_key:'another-workspace'})],legacy=[browserCreative({brandId:'fixture',nativeId:'9001'})];
 const original=JSON.stringify(legacy),f=rowPool(rows);assert.deepEqual(await readPublicCreatives(f.pool,'fixture',legacy,brand,competitors),mergePublicEvidence(legacy,rows,brand,competitors));assert.equal(JSON.stringify(legacy),original);
 const broken=rowPool([observation(),null]);await assert.rejects(()=>readPublicCreatives(broken.pool,'fixture',legacy,brand,competitors));assert.equal(JSON.stringify(legacy),original);assert.equal(broken.releases,1);
});
test("retained history groups streamed snapshots and keeps older missing asset roles",async()=>{
 const file=(role:string)=>({role,index:0,ref:{artifactId:role}}),base={workspace_id:'fixture',brand_key:'fixture',native_id:'9001',format:'video'};
 const f=rowPool([{...base,assets:[file('video')]},{...base,assets:[file('poster')]},{...base,assets:[file('poster')]}]);const rows=await readRetainedMedia(f.pool,'fixture');assert.equal(rows.length,1);assert.deepEqual(rows[0].assets.map(a=>a.role),['video','poster']);assert.equal(f.releases,1);
});
test("incremental JSON preserves the full response and releases after backpressured writes",async()=>{
 const value={before:{observed:0,unknown:null},creatives:Array.from({length:500},(_,i)=>({id:i,copy:'A <quiet> evening. '+ 'x'.repeat(1024)})),after:'done',omitted:undefined},app=express();
 app.get('/',(_req,res)=>void writeJsonRows(res,value,'creatives'));const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);assert.match(response.headers.get('content-type')!,/application\/json/);assert.equal(await response.text(),JSON.stringify(value));}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test("three overlapping pages retain the 7,800-ad total under a fixed 192 MB fixture heap",{timeout:60000},async()=>{
 const result=await new Promise<{code:number|null;signal:NodeJS.Signals|null;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn('bash',['-c','ulimit -c 0; exec "$@"','memory-fixture',process.execPath,'--max-old-space-size=192','--import','tsx','tests/fixtures/library-memory-server.ts'],{env:{...process.env,NODE_ENV:'production',EXTER_ADMIN_USER:'fixture',EXTER_ADMIN_PASSWORD:'fixture-only',FIXTURE_REQUESTS:'3',FIXTURE_RAW_BYTES:'24000',EXTER_META_LIBRARY_ENABLED:'false',EXTER_AD_MEDIA_ENABLED:'false',EXTER_OWNED_SYNC_ENABLED:'false',EXTER_KERNEL_WORKER_ENABLED:'false'},stdio:['ignore','pipe','pipe'],signal:AbortSignal.timeout(45000)});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal,stdout,stderr}));});
 assert.equal(result.code,0,result.stderr.slice(-2000));assert.equal(result.signal,null);const stats=JSON.parse(result.stdout.trim().split('\n').at(-1)!);assert.equal(stats.responses.length,3);assert(stats.responses.every((r:any)=>r.status===200&&r.count===50&&r.total===7800));assert.equal(new Set(stats.responses.map((r:any)=>r.hash)).size,1);assert.equal(stats.projected,7950);assert(stats.heapPeak<200_000_000);
});

test('queued web requests can disconnect and overload without blocking health or starting extra library reads',{timeout:10000},async()=>{
 const {openDatabase}=await import('../server/db.js'),{attachCreativeBrowser}=await import('../server/demo/creative-browser.js');
 const db=openDatabase(':memory:',false),app=express();db.prepare('INSERT INTO brands VALUES(?,?)').run('fixture',JSON.stringify({...brand,category:'Home fragrance & gifting',color:'#123456',initials:'FC',voice:[],competitors:[],mode:'imported',createdAt:'2026-11-01'}));
 let calls=0,arrived=0,unblock!:()=>void;const blocked=new Promise<void>(r=>{unblock=r;});app.locals.creativeGallery={async selected(){calls++;if(calls===1)await blocked;return [];}};app.locals.brandDemo={report(){return {scores:[]};}};
 app.use('/api/brands/fixture/creatives',(_q,_r,next)=>{arrived++;next();});attachCreativeBrowser(app,db,{getPool:()=>null});app.get('/health',(_q,r)=>r.json({ok:true}));
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,controllers=Array.from({length:9},open);
 const pending=controllers.map(c=>fetch(base+'/api/brands/fixture/creatives',{signal:c.signal}).then(r=>r.json()).catch(()=>null));
 try{
  const deadline=Date.now()+3000;while(arrived<9&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.equal(arrived,9);assert.equal(calls,1);
  assert.equal((await fetch(base+'/health')).status,200);const busy=await fetch(base+'/api/brands/fixture/creatives');assert.equal(busy.status,503);assert.equal(busy.headers.get('retry-after'),'2');assert.match((await busy.json()).error,/library is busy/);
  for(const c of controllers.slice(1))c.abort();await new Promise(r=>setTimeout(r,20));unblock();await Promise.all(pending);
  const healthy=await fetch(base+'/api/brands/fixture/creatives');assert.equal(healthy.status,200);assert.equal((await healthy.json()).creatives.length,0);assert.equal(calls,2);
 }finally{unblock();controllers.forEach(c=>c.abort());server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();}
});

test('a closed streaming response completes cleanup and leaves the server healthy',{timeout:5000},async()=>{
 const app=express(),copy='x'.repeat(65536),value={creatives:Array.from({length:1000},(_,id)=>({id,copy}))};let settled!:()=>void;const done=new Promise<void>(r=>{settled=r;});
 app.get('/large',(_req,res)=>{void writeJsonRows(res,value,'creatives').catch(()=>{}).finally(settled);});app.get('/health',(_req,res)=>res.json({ok:true}));const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,response=await fetch(base+'/large');await response.body!.cancel();await done;assert.equal((await fetch(base+'/health')).status,200);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
