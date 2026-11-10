import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryList,identityMatch,rankIdentity,competitorDecision,nextMonth,priceRange} from '../shared/onboarding/rules.js';
import {extractWebsite,crawlLinks,readWebsite} from '../server/onboarding/website.js';
import {parseUnderstanding,understandingRequest,understandingBatch,understandingBatchResult,OnboardingAI} from '../server/onboarding/ai.js';
import {categoryBatchInput,categoryResult,categoryHash} from '../server/public-categories/provider.js';
import {mergeDiscoveredPages} from '../server/onboarding/meta.js';
import type {BrandUnderstanding,DiscoveredPage} from '../shared/onboarding/types.js';
const page:DiscoveredPage={pageId:'1001',name:'Fictional Bottle Works',website:'bottle-workshop.example',username:'fictionalbottle',ukAds:4,domainAds:4,domain:'bottle-workshop.example',reach:400,examples:[]};
const source=extractWebsite('<html><title>Fictional Bottle Works</title><main><h1>Reusable water bottles</h1><p>We design reusable water bottles for families. UK delivery is available. Our bottles keep drinks cold.</p></main><script type="application/ld+json">{"@type":"Product","offers":{"price":"24.00","priceCurrency":"GBP"}}</script></html>','https://bottle-workshop.example/');
const profile:BrandUnderstanding={categories:['reusable water bottles','kids water bottles'],keywords:['reusable water bottles'],audience:'Families',ukPresence:'yes',ukReasons:['UK delivery'],claims:[{text:'Reusable bottles',quote:'We design reusable water bottles for families.',source:0}],businessType:'own_brand',ownRange:true,matchedCategories:['reusable water bottles'],suggestions:[]};
test('Page auto-confirmation requires domain proof; name/username alone and deceptive suffixes stay for review',()=>{
 assert(identityMatch(page,'Fictional Bottle Works','bottle-workshop.example').highConfidence);
 assert(identityMatch({...page,name:'Fictional Bottle Works Kids',website:null},'Fictional Bottle Works','bottle-workshop.example').highConfidence);
 assert(identityMatch({...page,ukAds:0,domainAds:0,domain:null},'Fictional Bottle Works','bottle-workshop.example').highConfidence,'exact name plus own website supports a no-ad brand');
 assert(!identityMatch({...page,domainAds:0,website:null,domain:null},'Fictional Bottle Works','bottle-workshop.example').highConfidence);
 assert(!identityMatch({...page,domainAds:0,website:'bottle-workshop.example.evil.example',domain:null},'Fictional Bottle Works','bottle-workshop.example').highConfidence);
 const matches=rankIdentity([page,{...page,pageId:'1002',name:'Fictional Bottle Works UK'},{...page,pageId:'1003',name:'Fictional Bottle Works Kids'}],'Fictional Bottle Works','bottle-workshop.example');assert.equal(matches.filter(page=>page.highConfidence).length,3);
});
test('competitors require a matching category, UK ads, a confirmed identity and their own range; never pad with retailers or self',()=>{
 const input={name:'Fictional Flask',domain:'flask-maker.example',pages:[identityMatch({...page,domain:'flask-maker.example',website:'flask-maker.example'},'Fictional Bottle Works','flask-maker.example')],profile,ownDomain:'bottle-workshop.example',ownCategories:profile.categories,ownPrices:{min:20,max:30,currency:'GBP',products:2},prices:{min:24,max:35,currency:'GBP',products:2},keywords:profile.keywords,source:'ads' as const};
 const result=competitorDecision(input);assert(result);assert.equal(result.state,'automatic');assert(result.reasons.includes('Product prices overlap yours'));assert(result.confidence>=90);
 assert.equal(competitorDecision({...input,domain:input.ownDomain}),null);assert.equal(competitorDecision({...input,profile:{...profile,businessType:'retailer',ownRange:false}}),null);assert.equal(competitorDecision({...input,profile:{...profile,matchedCategories:[]}}),null);assert.equal(competitorDecision({...input,pages:input.pages.map(p=>({...p,ukAds:0}))}),null);
 assert.equal(competitorDecision({...input,profile:{...profile,businessType:'unknown',ownRange:false}})?.state,'needs_review');
});
test('generic crawl keeps prices from Product offers only, bounds product/collection/About pages and strips scripts',()=>{
 const html='<html><title>Bottles</title><main><p>Reusable insulated water bottles for kids and adults. UK delivery from £3.</p></main>'+Array.from({length:10},(_,i)=>`<a href="/products/bottle-${i}">Product</a>`).join('')+'<a href="/collections/bottles">Bottles</a><a href="/about">About</a><a href="https://other.example/products/x">Other</a><script>private script must disappear</script><script type="application/ld+json">{"@type":"Product","offers":{"price":"29.00","priceCurrency":"GBP"}}</script></html>';
 const root=extractWebsite(html,'https://bottle-workshop.example/');assert(!root.text.includes('private script'));assert.deepEqual(priceRange([root]),{min:29,max:29,currency:'GBP',products:1});
 const links=crawlLinks([root],'bottle-workshop.example');assert.equal(links.filter(link=>link.includes('/products/')).length,3);assert(links.some(link=>link.endsWith('/about')));assert(!links.some(link=>link.includes('other.example')));
 const visited=[root,...links.filter(link=>link.includes('/products/')).map(url=>({...root,url}))];assert.equal(crawlLinks(visited,'bottle-workshop.example').filter(link=>link.includes('/products/')).length,0);
});
test('website crawl rejects private hosts, unrelated redirects and oversized HTML without network calls',async()=>{
 let calls=0;const options={resolve:async()=>[{address:'127.0.0.1',family:4}],fetch:async()=>{calls++;return new Response('x');}};
 await assert.rejects(()=>readWebsite('https://bottle-workshop.example/','bottle-workshop.example',options));assert.equal(calls,0);
 await assert.rejects(()=>readWebsite('https://bottle-workshop.example/','bottle-workshop.example',{resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async()=>new Response(null,{status:302,headers:{location:'https://private.example/'}})}));
 await assert.rejects(()=>readWebsite('https://bottle-workshop.example/','bottle-workshop.example',{resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async()=>new Response('x',{headers:{'content-type':'text/html','content-length':'3000000'}})}));
});
test('understanding validates source quotes, treats suggestions as leads and only matches the saved category vocabulary',()=>{
 const input={name:page.name,domain:'bottle-workshop.example',pages:[source],categories:['reusable water bottles']},result=parseUnderstanding({...profile,matchedCategories:['reusable water bottles','invented'],claims:[...profile.claims,{text:'Unsupported',quote:'This never appeared anywhere.',source:0}]},input)!;
 assert.equal(result.claims.length,1);assert.deepEqual(result.matchedCategories,['reusable water bottles']);assert.equal(parseUnderstanding({...profile,spend:100},input),null);
 const body=understandingRequest(input);assert.equal(body.batch.input_config.requests.requests[0].request.generationConfig.thinkingConfig.thinkingBudget,0);assert.equal(body.batch.input_config.requests.requests[0].request.generationConfig.maxOutputTokens,4096);
 assert.deepEqual(categoryList([' Reusable water bottles ','reusable water bottles']),['reusable water bottles']);assert.equal(nextMonth(new Date('2026-01-31T03:00:00Z')).toISOString(),'2026-02-28T03:00:00.000Z');
});
test('specific categories are used by the same text-only batch and invalidate labels when the vocabulary changes',()=>{
 const input={copy:'Our reusable water bottles keep drinks cold.',headlines:[],landingPaths:['/products/bottle']},vocabulary=['reusable water bottles','kids water bottles'];
 const body=categoryBatchInput([{key:'fixture',input}],vocabulary);assert.deepEqual(body.batch.input_config.requests.requests[0].request.generationConfig.responseSchema.properties.categories.items.enum,vocabulary);
 const response={candidates:[{content:{parts:[{text:'{"categories":["reusable water bottles"]}'}]}}]};assert.deepEqual(categoryResult(response,vocabulary)?.categories,['reusable water bottles']);assert.equal(categoryResult(response),null);assert.notEqual(categoryHash(input),categoryHash(input,vocabulary));assert.notEqual(categoryHash(input,vocabulary),categoryHash(input,['candles']));
});
test('ad discovery deduplicates IDs across keywords and keeps reach missing rather than zero',()=>{
 const ads=[{id:'9001',page_id:'1001',page_name:page.name,ad_creative_link_captions:['bottle-workshop.example'],ad_creative_bodies:['Reusable bottles']}];
 const first=mergeDiscoveredPages([],ads,'bottle-workshop.example',[]),second=mergeDiscoveredPages(first.pages,ads,'bottle-workshop.example',first.seen);assert.equal(second.pages[0].ukAds,1);assert.equal(second.pages[0].domainAds,1);assert.equal(second.pages[0].reach,null);assert.equal(second.seen.length,1);
});
test('understanding uses the existing asynchronous cheap model with header-only credentials and controlled failures',async()=>{
 let calls=0;const ai=new OnboardingAI({env:{GEMINI_API_KEY:'fixture-only'},fetch:async(target,init)=>{calls++;assert(String(target).includes('gemini-2.5-flash-lite:batchGenerateContent'));assert(!String(target).includes('fixture-only'));assert.equal(new Headers(init?.headers).get('x-goog-api-key'),'fixture-only');return Response.json({name:'batches/fixture-brand'});}});assert.equal(await ai.start({name:page.name,domain:'bottle-workshop.example',pages:[source],categories:[]}), 'batches/fixture-brand');assert.equal(calls,1);
 await assert.rejects(()=>new OnboardingAI({env:{},fetch:async()=>{assert.fail();}}).start({name:page.name,domain:'bottle-workshop.example',pages:[source],categories:[]}));
});

test('competitor profiles share one batch and responses remain attached to their keys in any order',()=>{
 const input={name:page.name,domain:'bottle-workshop.example',pages:[source],categories:['reusable water bottles']},items=[{key:'brand-a',input},{key:'brand-b',input:{...input,name:'Fictional Retailer'}}],body=understandingBatch(items);
 assert.equal(body.batch.input_config.requests.requests.length,2);assert.throws(()=>understandingBatch([...items,items[0]]));
 const response=(key:string,businessType:string)=>({metadata:{key},response:{modelVersion:'gemini-2.5-flash-lite',usageMetadata:{promptTokenCount:10,candidatesTokenCount:20},candidates:[{content:{parts:[{text:JSON.stringify({...profile,businessType,ownRange:businessType==='own_brand'})}]}}]}});
 const result=understandingBatchResult({response:{inlinedResponses:[response('brand-b','retailer'),response('brand-a','own_brand')]}},items);assert.equal(result.profiles['brand-a']?.businessType,'own_brand');assert.equal(result.profiles['brand-b']?.businessType,'retailer');assert.equal(result.priced,true);assert.equal(result.inputTokens,20);assert.equal(result.outputTokens,40);
 assert.throws(()=>understandingBatchResult({response:{inlinedResponses:[response('unrequested','own_brand')]}},items));
});
