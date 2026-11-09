import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonCohorts,comparableAds,similarCompetitors,primaryCategories,comparableBriefs,cohortLabel} from '../shared/public-comparisons.js';
import {categoryText} from '../shared/public-category-input.js';
import {categoryBatchInput,categoryResult,CATEGORY_MODEL,PublicCategoryProvider} from '../server/public-categories/provider.js';
import {previewMessage,publicMediaCoverage} from '../shared/ad-media.js';
import {browserCreative} from './fixtures/creative-browser.js';
const ad=(patch:Parameters<typeof browserCreative>[0]={})=>browserCreative({adFormat:'video',productCategories:['candles'],publicEvidence:true,...patch});
const cohort=(format:'video'|'static_image'|'carousel'|'catalogue',you:number,competitors:number)=>Array.from({length:you+competitors},(_,i)=>ad({adId:`${format}-${i}`,nativeId:`${format}-${i}`,adFormat:format,workspaceBrand:i<you,brandId:i<you?'workspace-a':'rival',brandName:i<you?'Fictional Candle House':'Fictional Hearth'}));
test('My categories includes only known, matching public categories and media types',()=>{
 const rows=[ad(),ad({adId:'fashion',productCategories:['fashion']}),ad({adId:'unknown',productCategories:null}),ad({adId:'unknown-format',adFormat:null,mediaAvailable:false}),ad({adId:'private',owned:true,publicEvidence:false})];
 const before=JSON.stringify(rows);assert.deepEqual(comparableAds(rows,['candles']).map(r=>r.adId),['creative-a']);
 assert.deepEqual(comparableAds(rows,['candles'],{category:'all'}).map(r=>r.adId),['creative-a','fashion']);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(comparableAds(rows,[]),[]);assert.deepEqual(primaryCategories({category:'Home fragrance & gifting',domain:'valentte.com'}),['home fragrance','candles']);assert.deepEqual(primaryCategories({category:'Fashion',domain:'fictional.example',primaryCategories:[]}),[]);
});
test('same-format groups order by own count, keep a side with ten, and hide only when both are below ten',()=>{
 const rows=[...cohort('video',46,12),...cohort('static_image',12,312),...cohort('carousel',9,9),...cohort('catalogue',0,10)];
 const groups=comparisonCohorts(rows,['candles']);assert.deepEqual(groups.map(g=>g.format),['video','static_image','carousel','catalogue']);
 assert.deepEqual(groups.map(g=>g.hidden),[false,false,true,false]);assert.equal(cohortLabel(groups[0]),'Video · you 46 ads · competitors 12');
 assert.deepEqual(comparisonCohorts(rows,['candles'],{adFormat:'static_image'}).map(g=>[g.format,g.yours,g.competitors]),[['static_image',12,312]]);
});
test('detail always uses its own format/category and ranks matching angle then offer without excluding other valid angles',()=>{
 const selected=ad({adId:'selected',angle:'gifting',offerType:'bundle'}),rows=[
  ad({adId:'other-angle',brandId:'rival',workspaceBrand:false,angle:'newness',offerType:'none'}),
  ad({adId:'offer',brandId:'rival',workspaceBrand:false,angle:'newness',offerType:'bundle'}),
  ad({adId:'angle',brandId:'rival',workspaceBrand:false,angle:'gifting',offerType:'none'}),
  ad({adId:'wrong-format',brandId:'rival',workspaceBrand:false,adFormat:'static_image'}),
  ad({adId:'wrong-category',brandId:'rival',workspaceBrand:false,productCategories:['fashion']}),selected];
 assert.deepEqual(similarCompetitors(selected,rows,{adFormat:'static_image'},['candles']).map(r=>r.adId),['angle','offer','other-angle']);
 assert.deepEqual(similarCompetitors(selected,rows,{},['fashion']),[]);
});
test('briefs require every cited ad in one eligible format cohort',()=>{
 const rows=[...cohort('video',10,10),...cohort('static_image',10,10)],briefs=[{id:'valid',evidence:[{adId:'video-0'},{adId:'video-11'}]},{id:'mixed',evidence:[{adId:'video-0'},{adId:'static_image-11'}]},{id:'unknown',evidence:[{adId:'missing'}]}];
 assert.deepEqual(comparableBriefs(briefs,rows,['candles']).map(r=>r.brief.id),['valid']);
});
test('category inputs use copy, headlines and paths with no URL query or fragment',()=>{
 const input=categoryText({ad_creative_bodies:['A scented candle'],ad_creative_link_titles:['A quiet evening'],ad_creative_link_captions:['https://fictional.example/collections/candles?access_token=private#secret'],eu_total_reach:999999});
 assert.deepEqual(input,{copy:'A scented candle',headlines:['A quiet evening'],landingPaths:['/collections/candles']});assert.ok(!JSON.stringify(input).includes('private'));
 const request=categoryBatchInput([{key:'fixture-1',input}]).batch.input_config.requests.requests[0];assert.equal(request.request.generationConfig.thinkingConfig.thinkingBudget,0);assert.equal(CATEGORY_MODEL,'gemini-2.5-flash-lite');
 assert.throws(()=>categoryBatchInput([]));assert.throws(()=>categoryBatchInput(new Array(501).fill({key:'x',input})));
});
test('category output rejects unknown fields/categories, and missing usage remains unpriced',()=>{
 const response=(text:string)=>({candidates:[{content:{parts:[{text}]}}]});
 assert.deepEqual(categoryResult(response('{"categories":["candles","gifting"]}'))?.categories,['candles','gifting']);
 assert.equal(categoryResult(response('{"categories":["invented"]}')),null);assert.equal(categoryResult(response('{"categories":["candles"],"reach":9000}')),null);assert.equal(categoryResult(response('not JSON')),null);assert.equal(categoryResult(response('{"categories":[]}'))?.inputTokens,null);
});
test('category provider uses genuine asynchronous batches with header-only keys and no generation fallback',async()=>{
 const paths:string[]=[];const provider=new PublicCategoryProvider({env:{GEMINI_API_KEY:'fixture-only'},fetch:async(url,init)=>{const u=new URL(String(url));paths.push(u.pathname);assert.equal(init?.headers&&new Headers(init.headers).get('x-goog-api-key'),'fixture-only');assert.ok(!u.href.includes('fixture-only'));return Response.json(init?.method==='POST'?{name:'batches/fixture-1'}:{done:false,metadata:{state:'JOB_STATE_RUNNING'}});}});
 const name=await provider.start([{key:'1',input:{copy:'A candle',headlines:[],landingPaths:[]}}]);assert.equal(name,'batches/fixture-1');await provider.poll(name);assert.deepEqual(paths,[`/v1beta/models/${CATEGORY_MODEL}:batchGenerateContent`,'/v1beta/batches/fixture-1']);
 let calls=0;await assert.rejects(new PublicCategoryProvider({env:{},fetch:async()=>{calls++;throw new Error();}}).start([{key:'1',input:{copy:'x',headlines:[],landingPaths:[]}}]));assert.equal(calls,0);
});
test('preview rejection requires seven actual failed days and a reason; coverage counts only public ads',()=>{
 assert.equal(previewMessage({failedDays:6,reason:'expired',lastAttemptAt:null}),'Preview being retried');assert.equal(previewMessage({failedDays:7,reason:null,lastAttemptAt:null}),'Preview being retried');assert.equal(previewMessage({failedDays:7,reason:'expired',lastAttemptAt:null}),'No preview from Meta');
 assert.deepEqual(publicMediaCoverage([ad({thumbnailUrl:'/poster',videoUrl:'/video'}),ad({nativeId:'other',imageUrls:['/image']}),ad({nativeId:'private',owned:true,publicEvidence:false})]),{ads:2,images:2,videos:1});
});
