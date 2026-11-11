import express from 'express';
import {createServer} from 'node:http';
import {openDatabase} from '../../server/db.js';
import {attachCreativeBrowser} from '../../server/demo/creative-browser.js';
import {createApp} from '../../server/app.js';
import {CreativeGalleryService} from '../../server/demo/gallery.js';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
globalThis.fetch=async()=>{throw new Error('Provider access is disabled in this fixture.');};
const root=await mkdtemp(join(tmpdir(),'exter-sqlite-memory-')),db=openDatabase(join(root,'fixture.sqlite'),false);db.exec('PRAGMA cache_size=-8192');
const count=7800,brand={id:'memory-fixture',name:'Fictional Candle House',domain:'fictional.example',category:'Home fragrance & gifting',color:'#123456',initials:'FC',voice:[],competitors:[],mode:'imported',createdAt:'2026-11-01'};db.prepare('INSERT INTO brands VALUES(?,?)').run(brand.id,JSON.stringify(brand));
const insert=db.prepare('INSERT INTO ads VALUES(?,?,?,?,?,?)');db.exec('BEGIN');for(let i=0;i<count;i++){const id=String(1000000+i),ad={id,providerAdId:id,brandId:brand.id,source:'public',platform:'Meta',category:brand.category,title:'A quiet evening.',copy:'A quiet evening, with a candle made for home.',format:'Video',owned:false,active:false,observedAt:'2026-11-08T20:00:00Z',publishedAt:'2026-11-01T00:00:00Z',deliveryStartAt:'2026-10-01T00:00:00Z',beneficiary_payers:[{payer:'x'.repeat(Number(process.env.FIXTURE_RAW_BYTES||24000))}]};insert.run(id,brand.id,'public','Meta',ad.observedAt,JSON.stringify(ad));}db.exec('COMMIT');
const production=createApp(db),app=express();app.locals=production.locals;const gallery=new CreativeGalleryService(db),selected=gallery.selected.bind(gallery);let projected=0;gallery.selected=async(brand,ids)=>{projected+=ids.length;return selected(brand,ids);};app.locals.creativeGallery=gallery;
attachCreativeBrowser(app,db,{getPool:()=>null});const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const before=process.memoryUsage();let peak=before.heapUsed;const timer=setInterval(()=>peak=Math.max(peak,process.memoryUsage().heapUsed),5);
try{
 const output=await new Promise<string>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','tests/fixtures/library-memory-client.ts',`http://127.0.0.1:${(server.address() as any).port}`,String(count),String(process.env.FIXTURE_REQUESTS||1)],{stdio:['ignore','pipe','pipe']});let out='',errors='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>errors+=c);child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(new Error(errors)));});
 console.log(JSON.stringify({...JSON.parse(output),projected,heapBefore:before.heapUsed,heapAfter:process.memoryUsage().heapUsed,heapPeak:peak}));
}finally{clearInterval(timer);await new Promise<void>(r=>server.close(()=>r()));db.close();await rm(root,{recursive:true,force:true});}
