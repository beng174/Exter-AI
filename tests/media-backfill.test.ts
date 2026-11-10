import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {previewPriority} from '../shared/ad-media.js';
import {creativeIdentity} from '../shared/creative-presentation.js';
import {sourceAdFormat} from '../shared/source-ad-format.js';
import {actorMedia,mediaActorInput} from '../server/ad-media/apify.js';
import {AdMediaStorage,mediaDiskMeasurement} from '../server/ad-media/storage.js';
import {mergeRetainedMedia} from '../server/ad-media/read.js';
import {browserCreative} from './fixtures/creative-browser.js';
import {mediaCoverage} from '../server/ad-media/coverage.js';

test('15,000 preview priorities put longest-running leaders first, with no newest-first starvation',()=>{
 const rows=Array.from({length:15000},(_,i)=>({nativeId:String(900000+i),daysRunning:15000-i,deliveryStartAt:new Date(Date.UTC(2025,0,1)+i*1000).toISOString(),deliveryStatus:i%2?'active':'unknown'}));
 const ranked=previewPriority([...rows].reverse());assert.deepEqual(ranked.slice(0,50).map(r=>r.nativeId),rows.slice(0,50).map(r=>r.nativeId));assert.equal(new Set(ranked.map(r=>r.nativeId)).size,15000);
});
test('catalogue placeholders use the first product card; the six reported archive IDs stay distinct',()=>{
 const ids=['4202123139999399','1654480715998688','794644396558199','748549117960441','2040543976838113','1885631332089043'];
 for(const id of ids){const media=actorMedia({adArchiveId:id,pageId:'12001',snapshot:{display_format:'DPA',cards:[{title:'Fictional candle set',body:'Two candles for quiet evenings.',original_image_url:'https://fixture.fbcdn.net/candle.webp'}]}})!;assert.equal(media.format,'catalogue');assert.equal(media.images.length,1);const row={adId:id,nativeId:id,title:'{{product.name}}',copy:'{{product.brand}}',brandName:'Fictional Candle House',adFormat:'catalogue' as const,catalogueProduct:media.product};assert.equal(creativeIdentity(row).title,'Fictional candle set');assert.equal(creativeIdentity({...row,catalogueProduct:null}).title,'Catalogue ad · product details loading');assert.equal(sourceAdFormat({ad_creative_bodies:['{{product.brand}}']}),'catalogue');}
 const input=mediaActorInput({pageId:'12001',ids:[ids[0]],from:'2025-11-10',to:'2026-11-10',cap:1,lookupMode:'ad_id'});assert.deepEqual(input.countries,['ALL']);assert.equal(input.fetchAdDetails,true);assert(!Object.hasOwn(input,'deliveredAfter'));
});
for(const [ext,type] of [['webp','image/webp'],['avif','image/avif'],['heic','image/heic']] as const)test(`${type} produces a verified JPEG preview using bounded local conversion`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'preview-types-')),bytes=await readFile(`tests/fixtures/preview-formats/candle.${ext}`);
 try{let calls=0;const storage=new AdMediaStorage({root,disk:async()=>mediaDiskMeasurement(10*1024**3,9*1024**3),images:{resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async()=>{calls++;return new Response(bytes,{headers:{'content-type':type}});}}});
  const media={adId:'9001',pageId:'12001',format:'image' as const,images:[`https://fixture.fbcdn.net/file.${ext}?temporary=NEVER-PERSIST`],videos:[],posters:[]};const result=await storage.retain('workspace',media,false);assert.equal(result.error,null);assert.equal(calls,1);assert.equal(result.assets[0].ref.mimeType,'image/jpeg');assert.equal(result.diagnostics?.[0].type,type);assert(!JSON.stringify(result).includes('NEVER-PERSIST'));assert(await storage.store.load(result.assets[0].ref));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('unsupported and failed-download counts are disjoint even when both totals happen to match',()=>{
 const official=Array.from({length:732},(_,i)=>({brandKey:'house',nativeId:String(i)})),attempts=official.map((row,i)=>({...row,returned:true,matched:true,outcome:i<366?'unsupported':'provider'}));
 const coverage=mediaCoverage(official,attempts,[],[{brandKey:'house',budget:false}])[0];assert.equal(coverage.reasons.unsupported,366);assert.equal(coverage.reasons.provider,366);assert.equal(Object.values(coverage.reasons).reduce((a,b)=>a+b),732);assert.equal(coverage.missing,732);
});

test('stored video metadata never blocks a later poster, and catalogue products override generic image format only',()=>{
 const row=browserCreative({brandId:'house',nativeId:'9001',mediaAvailable:true,thumbnailUrl:null,videoUrl:'/legacy/video',adFormat:'static_image',publicEvidence:true});
 const asset={role:'image' as const,index:0,ref:{artifactId:'a'.repeat(64)}} as any;
 const merged=mergeRetainedMedia([row],[{workspace_id:'workspace',brand_key:'house',native_id:'9001',format:'catalogue',product:{title:'Candle set',description:'Two candles.'},assets:[asset]}],'workspace')[0];
 assert(merged.thumbnailUrl?.includes('/api/ad-media/files/'));assert.equal(merged.videoUrl,'/legacy/video');assert.equal(merged.adFormat,'catalogue');assert.equal(merged.catalogueProduct?.title,'Candle set');assert.equal(merged.copy,row.copy);
});

test('several historical file errors never count one missing ad twice',()=>{
 const official=Array.from({length:366},(_,i)=>({brandKey:'house',nativeId:String(i)}));
 const attempts=official.flatMap(row=>[{...row,returned:true,matched:true,outcome:'unsupported'},{...row,returned:true,matched:true,outcome:'provider'}]);
 const result=mediaCoverage(official,attempts,[],[{brandKey:'house',budget:false}])[0];assert.equal(result.missing,366);assert.equal(result.reasons.provider,366);assert.equal(result.reasons.unsupported,0);assert.equal(Object.values(result.reasons).reduce((a,b)=>a+b),366);
});
