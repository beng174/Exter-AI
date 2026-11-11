import assert from 'node:assert/strict';
const base=process.argv[2],headers={authorization:'Basic '+Buffer.from('fixture:fixture-only').toString('base64')};
async function read(path:string,method='GET'){console.error('Fixture request: '+path);const r=await fetch(base+path,{method,headers,signal:AbortSignal.timeout(90000)});assert.equal(r.status,200,`${path}: ${await (r.status===200?Promise.resolve(''):r.text())}`);return r.json();}
const batches:string[][]=[];for(let n=0;n<3;n++){const batch=await read('/fixture/media-batch','POST');assert.equal(batch.count,500);batches.push(batch.ids);}
assert.equal(new Set(batches.flat()).size,1500);assert(Array.from({length:50},(_,i)=>String(1000001+i)).every(id=>batches[0].includes(id)));
const response=[];
for(const query of ['screen=creatives&sort=days','screen=creatives&sort=days&offset=50','screen=creatives&search=Product+1050000','window=research&screen=overview','window=research&screen=winners&previews=all','window=research&screen=data']){
 const data=await read('/api/brands/workspace/creatives?'+query);assert.equal(data.sql.coverage.ads,50000);assert(data.creatives.length<=50);assert.equal(data.sql.page.totalAll,50000);if(query.includes('search=')){assert.equal(data.creatives.length,1);assert.equal(data.creatives[0].nativeId,'1050000');}
 response.push({query,count:data.creatives.length,total:data.sql.page.total,first:data.creatives[0]?.nativeId});
}
assert.notEqual(response[0].first,response[1].first);
const overlapping=await Promise.all(Array.from({length:3},()=>read('/api/brands/workspace/creatives?screen=creatives&limit=12')));assert(overlapping.every(data=>data.creatives.length===12&&data.sql.page.total===50000));
const missing=await read('/api/ad-media/missing?workspaceId=workspace');assert.equal(missing.total,50000);assert.equal(missing.ads.length,50);
const media=await read('/api/ad-media/status?workspaceId=workspace');assert.equal(media.coverage[0].official,50000);assert.equal(media.coverage[0].requested,1500);assert.equal(media.coverage[0].missing,50000);
const health=await read('/api/infrastructure/status');assert.equal(health.database,'connected');assert(health.memory.heapUsedBytes>0);assert.equal((await read('/health')).ok,true);
console.log(JSON.stringify({response,batches:batches.map(b=>b.length),missing:missing.total,requested:media.coverage[0].requested}));
