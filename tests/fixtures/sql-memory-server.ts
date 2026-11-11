import express from 'express';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {openDatabase} from '../../server/db.js';
import {createApp} from '../../server/app.js';
import {attachCreativeBrowser} from '../../server/demo/creative-browser.js';
import {attachInfrastructure} from '../../server/infrastructure/api.js';
import {attachAdMedia} from '../../server/ad-media/api.js';
import {enqueueAdMedia} from '../../server/ad-media/jobs.js';
import {processMemoryHealth,startHeapLogging} from '../../server/infrastructure/process-memory.js';
// The HTTP client is a separate process. This web process cannot call a provider.
globalThis.fetch=async()=>{throw new Error('Provider calls are disabled in this fixture.');};
const db=openDatabase(':memory:',false),brand={id:'workspace',name:'Fictional Candle House',domain:'fictional.example',category:'Home fragrance & gifting',primaryCategories:['candles'],color:'#123456',initials:'FC',voice:[],competitors:[],mode:'imported',createdAt:'2026-11-01'};
db.prepare('INSERT INTO brands VALUES(?,?)').run(brand.id,JSON.stringify(brand));
const production=createApp(db),app=express();app.locals=production.locals;
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:process.env.FIXTURE_SEARCH_PATH,max:5});
pool.on('connect',client=>{const original=client.query.bind(client);let batches=0;(client as any).query=(q:any,...args:any[])=>{const start=Date.now(),text=typeof q==='string'?q:q.text||'rows',result=(original as any)(q,...args);if(result&&typeof result.finally==='function')return result.finally(()=>{const ms=Date.now()-start;if(text.startsWith('FETCH FORWARD')){batches++;if(batches%20===0)console.error('Fixture index batches: '+batches);}if(ms>1000)console.error('Fixture SQL: '+text.slice(0,65).replaceAll('\n',' ')+' '+ms+'ms');});return result;};});
attachCreativeBrowser(app,db,{getPool:()=>pool,now:()=>new Date('2026-11-11T12:00:00Z'),onReadError:error=>console.error('Fixture read error:',error)});attachInfrastructure(app,db,()=>pool);attachAdMedia(app,db,()=>pool);
app.post('/fixture/media-batch',async(_q,res)=>{try{
 const id=await enqueueAdMedia(pool,'own',new Date('2026-11-11T12:00:00Z'));
 const run=(await pool.query('SELECT target_ids FROM ad_media_runs WHERE id=$1',[id])).rows[0];
 if(!run){res.status(500).json({error:'No bounded batch was queued.'});return;}
 await pool.query(`INSERT INTO ad_media_requests(run_id,native_id,requested_at,outcome) SELECT $1,n,'2026-11-11T12:00:00Z','not_returned' FROM jsonb_array_elements_text($2)n`,[id,JSON.stringify(run.target_ids)]);
 await pool.query("UPDATE ad_media_runs SET status='complete',finished_at=now() WHERE id=$1",[id]);
 res.json({count:run.target_ids.length,ids:run.target_ids});
}catch{res.status(500).json({error:'The fixture queue failed.'});}});
app.get('/health',(_q,r)=>r.json({ok:true,memory:processMemoryHealth()}));
const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const before=process.memoryUsage().heapUsed;let peak=before;const timer=setInterval(()=>peak=Math.max(peak,process.memoryUsage().heapUsed),5),stop=startHeapLogging(()=>{});
try{
 const output=await new Promise<string>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','tests/fixtures/sql-memory-client.ts',`http://127.0.0.1:${(server.address() as any).port}`],{stdio:['ignore','pipe','pipe']});let out='',errors='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>errors+=c);child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(new Error(errors.slice(-3000))));});
 console.log(JSON.stringify({...JSON.parse(output),heapBefore:before,heapAfter:process.memoryUsage().heapUsed,heapPeak:peak,heapLimit:processMemoryHealth().heapLimitBytes}));
}finally{clearInterval(timer);stop();await new Promise<void>(r=>server.close(()=>r()));await pool.end();db.close();}
