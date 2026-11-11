import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {creativeFixture} from './fixtures/creative-sql.js';
test('50,000 ads: repeated media batches and page loads stay below 200 MB web heap',{timeout:300000},async()=>creativeFixture(async(pool)=>{
 const result=await new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
  const child=spawn(process.execPath,['--max-old-space-size=160','--max-semi-space-size=8','--import','tsx','tests/fixtures/sql-memory-server.ts'],{env:{...process.env,NODE_ENV:'production',DATABASE_URL:process.env.TEST_DATABASE_URL,FIXTURE_SEARCH_PATH:pool.options.options,EXTER_ADMIN_USER:'fixture',EXTER_ADMIN_PASSWORD:'fixture-only',EXTER_META_LIBRARY_ENABLED:'false',EXTER_AD_MEDIA_ENABLED:'false',EXTER_OWNED_SYNC_ENABLED:'false',EXTER_KERNEL_WORKER_ENABLED:'false'},stdio:['ignore','pipe','pipe'],signal:AbortSignal.timeout(240000)});
  let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>{stderr+=c;process.stderr.write(c);});child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));
 });
 assert.equal(result.code,0,result.stderr.slice(-4000));const stats=JSON.parse(result.stdout.trim().split('\n').at(-1)!);assert(stats.heapPeak<200_000_000,JSON.stringify(stats));assert.equal(stats.response.length,6);assert.deepEqual(stats.batches,[500,500,500]);assert.equal(stats.requested,1500);assert.equal(stats.missing,50000);
 const size=(await pool.query("SELECT pg_total_relation_size('web_creative_index')::float8 AS bytes,max(octet_length(data::text)) AS largest FROM web_creative_index")).rows[0];assert(size.largest<24000,'Ignored 24 KB payload fields never enter the metadata cache.');console.log('50,000-ad fixture: '+JSON.stringify({heapPeak:stats.heapPeak,heapLimit:stats.heapLimit,cacheBytes:size.bytes}));
},50000));
