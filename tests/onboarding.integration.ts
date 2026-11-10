// Disposable schemas and fictional HTTP/model fixtures only. No live provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase,readBrand} from '../server/db.js';
import {migrate} from '../server/infrastructure/database.js';
import {onboardingBrand,enqueueOnboarding,applyOwnPages} from '../server/onboarding/store.js';
import {claimOnboarding,stepOnboarding,scheduleOnboarding,type RunData} from '../server/onboarding/jobs.js';
import {readOnboarding} from '../server/onboarding/read.js';
import {OnboardingAI} from '../server/onboarding/ai.js';
import {OnboardingMeta} from '../server/onboarding/meta.js';
import {MetaLibraryConnector} from '../server/connectors/meta-library.js';
import {workOnce} from '../server/infrastructure/jobs.js';
import {claimAdMedia,stepAdMedia} from '../server/ad-media/jobs.js';
import {AdMediaActor} from '../server/ad-media/apify.js';
import {AdMediaStorage,mediaDiskMeasurement} from '../server/ad-media/storage.js';
import {claimCategoryBatch,stepCategoryBatch} from '../server/public-categories/jobs.js';
import {PublicCategoryProvider} from '../server/public-categories/provider.js';
const env={META_ACCESS_TOKEN:'fixture-only',GEMINI_API_KEY:'fixture-only',GEMINI_REQUEST_RESERVE_GBP:'.1',EXTER_AD_MEDIA_GBP_PER_USD:'1',EXTER_META_LIBRARY_ENABLED:'true',EXTER_AD_MEDIA_ENABLED:'true',APIFY_TOKEN:'fixture-only'};
const categories=['reusable water bottles','kids water bottles','insulated bottles'];
const rivals=Array.from({length:6},(_,i)=>({name:`Fictional Flask ${String.fromCharCode(65+i)}`,domain:`flask-${i}.example`,page:String(2001+i)}));
const html=(domain:string)=>`<html><title>${domain} reusable bottles</title><a href="/collections/bottles">Bottles</a><a href="/products/reusable">Product</a><a href="/about">About</a><main><h1>Reusable water bottles</h1><p>We design reusable water bottles for families. UK delivery is available. Our own brand range includes insulated bottles and kids water bottles.</p></main><script type="application/ld+json">{"@type":"Product","offers":{"price":"24.00","priceCurrency":"GBP"}}</script></html>`;
async function fixture(work:(context:{pool:pg.Pool;db:ReturnType<typeof openDatabase>;root:string})=>Promise<void>){
 assert(process.env.TEST_DATABASE_URL,'Use a disposable local TEST_DATABASE_URL.');const schema='onboarding_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:8}),db=openDatabase(':memory:',false),root=await mkdtemp(join(tmpdir(),'exter-onboard-'));
 try{await migrate(pool);await migrate(pool);await pool.query('UPDATE budget_settings SET monthly_budget_gbp=20');await work({pool,db,root});}finally{db.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(root,{recursive:true,force:true});}
}
function providers(pool:pg.Pool,noOwnAds=false,ambiguous=false){
 const jobs=new Map<string,any>();let starts=0,metaCalls=0;
 const ai=new OnboardingAI({env,fetch:async(_url,init)=>{if(init?.method==='POST'){assert((await pool.query("SELECT count(*)::integer AS n FROM cost_ledger WHERE provider='gemini' AND status='reserved'")).rows[0].n>0);starts++;const requests=JSON.parse(String(init.body)).batch.input_config.requests.requests;
 const profiles=requests.map((request:any)=>{const input=JSON.parse(request.request.contents[0].parts[0].text),domain=input.domain;
 const profile={categories,keywords:['reusable water bottles'],audience:'Families',ukPresence:'yes',ukReasons:['UK delivery is available'],claims:[{text:'Designed for families',quote:'We design reusable water bottles for families.',source:0}],businessType:domain==='retailer.example'?'retailer':'own_brand',ownRange:domain!=='retailer.example',matchedCategories:domain==='fashion.example'?[]:input.comparisonCategories,suggestions:[{name:'Fictional Unverified Brand',domain:'no-ads.example'}]};return {key:request.metadata.key,profile};});const name=`batches/fixture-${starts}`;jobs.set(name,profiles);return Response.json({name});}
 const name=String(_url).split('/v1beta/')[1],profiles=jobs.get(name);return Response.json({done:true,metadata:{state:'JOB_STATE_SUCCEEDED'},response:{inlinedResponses:profiles.map((item:any)=>({metadata:{key:item.key},response:{modelVersion:'gemini-2.5-flash-lite',usageMetadata:{promptTokenCount:100,candidatesTokenCount:100},candidates:[{content:{parts:[{text:JSON.stringify(item.profile)}]}}]}}))}});}});
 const row=(id:string,page:string,name:string,domain:string)=>({id,page_id:page,page_name:name,ad_creative_bodies:['Our reusable water bottles keep drinks cold.'],ad_creative_link_captions:[domain],ad_delivery_start_time:'2025-08-21',source_format:'static_image',total_reach_by_location:[{country:'GB',reach:1000}]});
 const ownRows=noOwnAds?[]:['1001','1002','1003'].map((page,i)=>row(String(9001+i),page,i===2?'Fictional Kids Range':'Fictional Bottle Works','bottle-workshop.example'));
 const rivalRows=rivals.flatMap((r,i)=>[row(String(10000+i*2),r.page,r.name,r.domain),row(String(10001+i*2),r.page,r.name,r.domain)]);
 const badRows=[row('19001','2101','Fictional Multi-brand Store','retailer.example'),row('19002','2102','Fictional Clothing','fashion.example')];
 const connector={page:async(query:any)=>{metaCalls++;assert.deepEqual(query.countries,['GB']);return {rows:query.pageIds?query.pageIds[0].startsWith('100')?ownRows.filter(r=>r.page_id===query.pageIds[0]):rivalRows.filter(r=>r.page_id===query.pageIds[0]):query.searchTerm==='Fictional Bottle Works'?ownRows:query.searchTerm==='Fictional Unverified Brand'?[]:[...ownRows,...rivalRows,...badRows],after:null,backoffMs:0,pageSize:query.pageSize||100};}} as MetaLibraryConnector;
 const meta=new OnboardingMeta(pool,{env,paceMs:0,connector,fetch:async(target)=>{metaCalls++;const url=new URL(String(target));assert.equal(url.pathname,'/v26.0/pages/search');return Response.json({data:ambiguous?[{id:'1099',name:'Fictional Bottle Works'}]:['1001','1002','1003'].map((id,i)=>({id,name:i===2?'Fictional Bottle Works Kids':'Fictional Bottle Works',website:'https://bottle-workshop.example/'}))});}});
 const website={resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async(target:RequestInfo|URL)=>new Response(html(new URL(String(target)).hostname),{headers:{'content-type':'text/html'}})};
 return {ai,meta,website,connector,counts:()=>({starts,metaCalls})};
}
async function tick(pool:pg.Pool,db:ReturnType<typeof openDatabase>,options:any){await pool.query("UPDATE brand_onboarding_runs SET available_at=now(),lease_owner=NULL,lease_until=NULL WHERE status IN ('queued','running','paused')");const owner=randomUUID(),run=await claimOnboarding(pool,owner);assert(run);await stepOnboarding(pool,db,run.id,owner,options);return (await pool.query('SELECT * FROM brand_onboarding_runs WHERE id=$1',[run.id])).rows[0];}
async function prepare(pool:pg.Pool,db:ReturnType<typeof openDatabase>,supplied:ReturnType<typeof providers>){const brand=onboardingBrand(db,'Fictional Bottle Works','https://bottle-workshop.example/'),id=await enqueueOnboarding(pool,brand);let run:any;for(let i=0;i<200;i++){run=await tick(pool,db,{...supplied,env});if(run.phase==='enrichment')return {brand:readBrand(db,brand.id)!,id,run};assert.equal(run.error_kind,null,JSON.stringify({phase:run.phase,error:run.error_kind}));}assert.fail('Setup did not reach collection.');}

test('bottle onboarding verifies six same-category competitors, includes three Pages, rejects retailers/self and queues each Page separately',async()=>fixture(async({pool,db,root})=>{
 const provider=providers(pool),{brand,id}=await prepare(pool,db,provider);assert.deepEqual(brand.primaryCategories,categories);assert.equal(provider.counts().starts,2,'one brand batch and one shared competitor batch');assert.equal(brand.competitors.length,6);assert.equal(brand.competitorProfiles?.length,6);assert(!brand.competitors.some(name=>/Store|Clothing|Unverified|Bottle Works/.test(name)));
 const watches=(await pool.query("SELECT brand_key,page_ids FROM watchlists WHERE workspace_id=$1 AND purpose='brand'",[brand.id])).rows;assert.equal(watches.filter(w=>w.brand_key===brand.id).length,3);assert.equal(watches.length,9);assert.equal((await pool.query('SELECT count(*)::integer AS n FROM collection_jobs')).rows[0].n,9);
 const view=await readOnboarding(pool,db,brand.id);assert.equal(view?.confirmedPages.length,3);assert.equal(view?.competitors.filter(c=>c.state==='automatic').length,6);assert.equal(view?.understanding?.categories[0],'reusable water bottles');assert.equal(view?.steps.find(s=>s.key==='understanding')?.status,'complete');assert.equal(view?.steps.find(s=>s.key==='competitors')?.actualGbp!>0,true);
 assert.equal((await pool.query('SELECT count(*)::integer AS n FROM public_ads')).rows[0].n,0,'discovery never contaminates official observations');
 assert.equal((await pool.query("SELECT count(*)::integer AS n FROM cost_ledger WHERE provider='gemini' AND status='reserved'")).rows[0].n,0);
 for(let n=0;n<9;n++){await pool.query('UPDATE meta_request_gate SET next_request_at=now()');assert(await workOnce(pool,provider.connector,{env,paceMs:0}));}
 const media=(await pool.query('SELECT page_id,target_ids FROM ad_media_runs')).rows;assert.equal(media.length,9);for(const run of media){const saved=(await pool.query('SELECT native_id FROM public_ads WHERE advertiser_id=$1',[run.page_id])).rows.map(row=>row.native_id);assert(run.target_ids.every((id:string)=>saved.includes(id)),'media never requests another Page’s ads');}
 assert((await pool.query('SELECT id FROM public_category_batches')).rowCount!>0);
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]),storage=new AdMediaStorage({root,disk:async()=>mediaDiskMeasurement(10*1024**3,9*1024**3),images:{resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async()=>new Response(png,{headers:{'content-type':'image/png'}}),probe:async()=>({width:40,height:30})}});
 const datasets=new Map<string,any[]>(),runs=new Map<string,any[]>();let actorStarts=0;
 const actor=new AdMediaActor({env,fetch:async(target,init)=>{const url=new URL(String(target));if(init?.method==='POST'){actorStarts++;const input=JSON.parse(String(init.body)),run=`fixtureRun${String(actorStarts).padStart(8,'0')}`,dataset=`fixtureData${String(actorStarts).padStart(8,'0')}`,items=[];for(const native of input.adArchiveIds){const ad=(await pool.query('SELECT advertiser_id FROM public_ads WHERE native_id=$1',[native])).rows[0];items.push({adArchiveId:native,pageId:ad.advertiser_id,displayFormat:'IMAGE',imageUrls:['https://image.fixture.fbcdn.net/file.png']});}datasets.set(dataset,items);runs.set(run,items);return Response.json({data:{id:run,defaultDatasetId:dataset}});}if(url.pathname.endsWith('/items'))return Response.json((datasets.get(url.pathname.split('/')[3])||[]).slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+1));const run=url.pathname.split('/').at(-1)!,items=runs.get(run)||[];return Response.json({data:{id:run,status:'SUCCEEDED',chargedEventCounts:{'ad-result':items.length,'apify-actor-start':1},pricingInfo:{pricingModel:'PAY_PER_EVENT',pricingPerEvent:{actorChargeEvents:{'ad-result':{eventPriceUsd:.0005},'apify-actor-start':{eventPriceUsd:.00005}}}}}});}});
 for(let n=0;n<100;n++){await pool.query("UPDATE ad_media_runs SET available_at=now(),lease_owner=NULL,lease_until=NULL WHERE status IN ('queued','running')");const owner=randomUUID(),job=await claimAdMedia(pool,owner);if(!job)break;await stepAdMedia(pool,job.id,owner,{env,actor,storage});assert(n<99);}
 const categoryJobs=new Map<string,any[]>();let categoryStarts=0;
 const categoryProvider=new PublicCategoryProvider({env,fetch:async(target,init)=>{if(init?.method==='POST'){const body=JSON.parse(String(init.body)),requests=body.batch.input_config.requests.requests;assert.deepEqual(requests[0].request.generationConfig.responseSchema.properties.categories.items.enum,[...categories].sort());const name=`batches/category-${++categoryStarts}`;categoryJobs.set(name,requests);return Response.json({name});}const name=String(target).split('/v1beta/')[1];return Response.json({done:true,metadata:{state:'JOB_STATE_SUCCEEDED'},response:{inlinedResponses:(categoryJobs.get(name)||[]).map(request=>({metadata:request.metadata,response:{modelVersion:'gemini-2.5-flash-lite',usageMetadata:{promptTokenCount:20,candidatesTokenCount:5},candidates:[{content:{parts:[{text:'{"categories":["reusable water bottles"]}'}]}}]}}))}});}});
 for(let n=0;n<100;n++){await pool.query("UPDATE public_category_batches SET available_at=now(),lease_owner=NULL,lease_until=NULL WHERE status IN ('queued','running')");const owner=randomUUID(),job=await claimCategoryBatch(pool,owner);if(!job)break;await stepCategoryBatch(pool,job.id,owner,{env,provider:categoryProvider});assert(n<99);}
 const completed=await tick(pool,db,{...provider,env});assert.equal(completed.status,'complete');const ready=await readOnboarding(pool,db,brand.id);assert.equal(ready?.totals.ads,15);assert.equal(ready?.totals.images,15);assert.equal(ready?.totals.tagged,15);assert.equal(ready?.totals.mediaPercent,100);assert.equal(ready?.totals.taggedPercent,100);assert.equal(ready?.steps.find(s=>s.key==='comparisons')?.status,'complete');

}));

test('a no-ad brand still gets UK competitors and a clear no-ads status',async()=>fixture(async({pool,db})=>{
 const {brand}=await prepare(pool,db,providers(pool,true));assert.equal(brand.competitors.length,6);const view=await readOnboarding(pool,db,brand.id);assert.equal(view?.steps.find(s=>s.key==='pages')?.detail,'No UK Meta ads found');assert.equal(view?.totals.ads,0);assert.equal(view?.steps.find(step=>step.key==='understanding')?.reservedGbp,0);assert.equal(view?.steps.find(step=>step.key==='competitors')?.reservedGbp,0);
}));

test('budget refusal and ambiguous paid starts never dispatch twice, and manual Page choices are never overwritten',async()=>fixture(async({pool,db})=>{
 const brand=onboardingBrand(db,'Fictional Bottle Works','bottle-workshop.example'),id=await enqueueOnboarding(pool,brand),provider=providers(pool);await pool.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='inference'");
 for(let i=0;i<10;i++){const run=await tick(pool,db,{...provider,env});if(run.error_kind==='budget')break;}assert.equal(provider.counts().starts,0);assert.equal((await pool.query('SELECT status FROM brand_onboarding_runs WHERE id=$1',[id])).rows[0].status,'paused');assert.equal((await readOnboarding(pool,db,brand.id))?.steps.find(step=>step.key==='understanding')?.status,'paused');
 await pool.query("UPDATE budget_settings SET monthly_budget_gbp=20 WHERE cost_type='inference'");const ambiguous=new OnboardingAI({env,fetch:async()=>{throw new Error('private-provider-text https://private.example/ fixture-only');}});await tick(pool,db,{...provider,ai:ambiguous,env});assert.equal((await pool.query('SELECT status FROM brand_onboarding_runs WHERE id=$1',[id])).rows[0].status,'uncertain');assert.equal((await pool.query('SELECT count(*)::integer AS n FROM cost_ledger WHERE status=\'reserved\'')).rows[0].n,1);
 const owner=randomUUID();assert.equal(await claimOnboarding(pool,owner),null);
 await pool.query(`INSERT INTO watchlists(id,workspace_id,brand_key,page_ids,managed_by) VALUES('manual',$1,$1,'["7777"]','manual')`,[brand.id]);await applyOwnPages(pool,db,brand.id,[{pageId:'1001'} as any]);assert.equal((await pool.query('SELECT count(*)::integer AS n FROM watchlists')).rows[0].n,1);
}));

test('monthly checks only suggest and preserve manually selected categories and removed competitors',async()=>fixture(async({pool,db})=>{
 const provider=providers(pool),{brand,id}=await prepare(pool,db,provider);await pool.query("UPDATE brand_onboarding_runs SET status='complete' WHERE id=$1",[id]);
 const current=readBrand(db,brand.id)!;db.prepare('UPDATE brands SET data=? WHERE id=?').run(JSON.stringify({...current,primaryCategories:['kids water bottles'],primaryCategoriesSource:'manual'}),brand.id);
 await pool.query("UPDATE brand_onboarding_profiles SET next_review_at='2026-01-01'");await scheduleOnboarding(pool,new Date('2026-11-10'),{...env,EXTER_AD_MEDIA_BROKER_ORIGIN:'https://fixture-service.example',EXTER_AD_MEDIA_BROKER_TOKEN:'fixture-service-only-'.repeat(3)});const monthly=(await pool.query("SELECT * FROM brand_onboarding_runs WHERE kind='monthly'")).rows;assert.equal(monthly.length,1);
 const data=monthly[0].data as RunData;data.profile=(await pool.query('SELECT profile FROM brand_onboarding_profiles WHERE workspace_id=$1',[brand.id])).rows[0].profile;data.choices=[{...brand.competitorProfiles![0],domain:'new-flask.example',name:'Fictional New Flask',state:'automatic'}];await pool.query("UPDATE brand_onboarding_runs SET phase='apply',data=$2 WHERE id=$1",[monthly[0].id,JSON.stringify(data)]);
 await tick(pool,db,{...provider,env});const result=(await pool.query('SELECT status,data FROM brand_onboarding_runs WHERE id=$1',[monthly[0].id])).rows[0];assert.equal(result.status,'needs_review');assert.equal(result.data.choices[0].state,'suggested');assert(!readBrand(db,brand.id)!.competitors.includes('Fictional New Flask'));assert.deepEqual(readBrand(db,brand.id)!.primaryCategories,['kids water bottles']);
}));

test('onboarding endpoints require same-origin JSON, keep samples read-only and never call providers on progress reads',async()=>fixture(async({pool,db})=>{
 const {default:express}=await import('express'),{createServer}=await import('node:http'),{attachOnboarding,attachOnboardingStep}=await import('../server/onboarding/api.js');
 const brand=onboardingBrand(db,'Fictional Bottle Works','bottle-workshop.example'),sample={...brand,id:'sample-onboarding',mode:'demo' as const};db.prepare('INSERT INTO brands VALUES(?,?)').run(sample.id,JSON.stringify(sample));await enqueueOnboarding(pool,brand);
 const provider=providers(pool),app=express();attachOnboardingStep(app,db,()=>pool,{...provider,env:{...env,EXTER_AD_MEDIA_BROKER_TOKEN:'fixture-service-only-'.repeat(3)}});app.use(express.json());attachOnboarding(app,db,()=>pool);const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as import('node:net').AddressInfo,origin=`http://127.0.0.1:${address.port}`;
 const post=(path:string,body:unknown,extra:Record<string,string>={})=>fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',origin,...extra},body:JSON.stringify(body)});
 try{
  const prior=provider.counts();for(let n=0;n<3;n++)assert.equal((await fetch(`${origin}/api/brands/${brand.id}/onboarding`)).status,200);assert.deepEqual(provider.counts(),prior);
  assert.equal((await post('/api/onboarding/start',{name:'Other',website:'other.example'},{origin:'https://elsewhere.example'})).status,403);
  assert.equal((await post('/api/onboarding/start?demo=1',{name:sample.name,website:sample.domain})).status,403);
  assert.equal((await post(`/api/brands/${sample.id}/onboarding/retry`,{})).status,404);
  assert.equal((await post(`/api/brands/${sample.id}/onboarding/confirm-page`,{pageId:'1001'})).status,404);
  assert.equal((await post('/api/onboarding/step/'+randomUUID()+'/'+randomUUID(),{})).status,401);
  assert.equal((await post('/api/onboarding/start',{name:'New Fictional Brand',website:'https://new-bottles.example/'})).status,202);
  assert.equal((await post('/api/onboarding/start',{name:'Private',website:'http://127.0.0.1/'})).status,400);
  const all=JSON.stringify((await pool.query('SELECT data FROM brand_onboarding_runs')).rows);assert(!all.includes('fixture-only')&&!all.includes('GEMINI_API_KEY'));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}));

test('manual competitor removal is durable, disables every Page and cannot be undone by a replayed automatic apply',async()=>fixture(async({pool,db})=>{
 const {applyCompetitor}=await import('../server/onboarding/store.js'),provider=providers(pool),{brand}=await prepare(pool,db,provider),choice=brand.competitorProfiles![0];
 await pool.query("INSERT INTO brand_onboarding_choices(workspace_id,domain,action) VALUES($1,$2,'removed') ON CONFLICT(workspace_id,domain) DO UPDATE SET action='removed'",[brand.id,choice.domain]);
 const latest=readBrand(db,brand.id)!;db.prepare('UPDATE brands SET data=? WHERE id=?').run(JSON.stringify({...latest,competitors:latest.competitors.filter(name=>name!==choice.name),competitorProfiles:latest.competitorProfiles?.filter(row=>row.domain!==choice.domain)}),brand.id);
 await pool.query("UPDATE watchlists SET enabled=false,revision=revision+1,managed_by='manual' WHERE workspace_id=$1 AND brand_key=$2",[brand.id,`name:${choice.name.toLowerCase()}`]);
 await applyCompetitor(pool,db,brand.id,choice);assert(!readBrand(db,brand.id)!.competitors.includes(choice.name));const view=await readOnboarding(pool,db,brand.id);assert.equal(view?.competitors.find(row=>row.domain===choice.domain)?.state,'removed');
}));

test('Page search permission limits fall back to archive search; rate limits wait and never persist provider text',async()=>fixture(async({pool})=>{
 let calls=0;const meta=new OnboardingMeta(pool,{env,paceMs:0,fetch:async()=>{calls++;return Response.json({error:{code:100,message:'private-provider-text fixture-only https://private.example/'}},{status:400});}});
 assert.deepEqual(await meta.pages('Fictional Bottle Works'),{pages:[],unavailable:true});assert.equal(calls,1);
 const limited=new OnboardingMeta(pool,{env,paceMs:0,fetch:async()=>Response.json({error:{code:4,message:'private-provider-text'}},{status:429})});await assert.rejects(()=>limited.pages('Fictional Bottle Works'),(error:Error)=>error.message==='waiting');
 assert.equal((await pool.query("SELECT count(*)::integer AS n FROM cost_ledger WHERE provider='meta'")).rows[0].n,2);
}));

test('manual overrides can clear several Pages and explicitly restore a removed competitor without losing run history',async()=>fixture(async({pool,db})=>{
 const {default:express}=await import('express'),{createServer}=await import('node:http'),{attachOnboarding}=await import('../server/onboarding/api.js'),{attachInfrastructure}=await import('../server/infrastructure/api.js'),{protectSettingsMutation}=await import('../server/request-guard.js');
 const provider=providers(pool),{brand}=await prepare(pool,db,provider),app=express();app.use(express.json());app.use(protectSettingsMutation);attachOnboarding(app,db,()=>pool);attachInfrastructure(app,db,()=>pool);
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
 const send=(path:string,body:unknown,method='POST')=>fetch(origin+path,{method,headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
 try{const own=(await pool.query('SELECT id FROM watchlists WHERE workspace_id=$1 AND brand_key=$1',[brand.id])).rows;for(const row of own.slice(0,2))assert.equal((await send('/api/public/meta/watchlists/'+row.id,{workspaceId:brand.id,brandKey:brand.id,pageIds:[],countries:['GB']},'PUT')).status,200);
  assert.equal((await pool.query('SELECT count(*)::integer AS n FROM watchlists WHERE workspace_id=$1 AND brand_key=$1 AND enabled',[brand.id])).rows[0].n,1);
  const choice=brand.competitorProfiles![0];assert.equal((await send(`/api/brands/${brand.id}/onboarding/competitor`,{domain:choice.domain,action:'remove'})).status,200);assert(!readBrand(db,brand.id)!.competitors.includes(choice.name));
  assert.equal((await send(`/api/brands/${brand.id}/onboarding/competitor`,{domain:choice.domain,action:'add'})).status,200);assert(readBrand(db,brand.id)!.competitors.includes(choice.name));
  assert.equal((await pool.query('SELECT enabled FROM watchlists WHERE workspace_id=$1 AND brand_key=$2',[brand.id,`name:${choice.name.toLowerCase()}`])).rows[0].enabled,true);
  assert((await pool.query("SELECT id FROM collection_runs WHERE status='superseded'")).rowCount!>=3);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}));

test('large discovery pages resume the same cursor with a smaller page after a worker restart',async()=>fixture(async({pool,db})=>{
 const brand=onboardingBrand(db,'Fictional Bottle Works','bottle-workshop.example'),id=await enqueueOnboarding(pool,brand);await pool.query("UPDATE brand_onboarding_runs SET phase='pages',data=data||'{\"pagesSearched\":true,\"ownAfter\":\"fixture-cursor\"}'::jsonb WHERE id=$1",[id]);const sizes:number[]=[];
 const meta=()=>new OnboardingMeta(pool,{env,paceMs:0,connector:new MetaLibraryConnector({token:'fixture-only',fetch:async target=>{const url=new URL(String(target)),size=Number(url.searchParams.get('limit'));sizes.push(size);assert.equal(url.searchParams.get('after'),'fixture-cursor');return size===100?Response.json({error:{code:1,message:'private provider text'}},{status:500}):Response.json({data:[{id:'9001',page_id:'1001',page_name:brand.name,ad_creative_bodies:['Reusable water bottles'],ad_creative_link_captions:[brand.domain]}]});}})});
 const first=await tick(pool,db,{env,meta:meta()});assert.equal(first.status,'running');assert.equal(first.data.ownPageSize,50);assert.equal(first.data.ownAfter,'fixture-cursor');await pool.query('UPDATE meta_request_gate SET next_request_at=now()');const second=await tick(pool,db,{env,meta:meta()});assert.deepEqual(sizes,[100,50]);assert.equal(second.phase,'discovery');
}));

test('automatic understanding preserves paid research history and explicit empty manual categories',async()=>fixture(async({pool,db})=>{
 const {applyUnderstanding}=await import('../server/onboarding/store.js'),{saveBrandResearch,readBrandResearch}=await import('../server/brand-research.js'),brand=onboardingBrand(db,'Fictional Bottle Works','bottle-workshop.example'),provider=providers(pool);
 const {brand:prepared}=await prepare(pool,db,provider);const original=readBrandResearch(db,prepared.id)!;saveBrandResearch(db,{...original,analysis:{marker:'paid analysis kept'} as any,analysisStatus:'complete'});
 const manual={...readBrand(db,brand.id)!,primaryCategories:[],primaryCategoriesSource:'manual' as const};db.prepare('UPDATE brands SET data=? WHERE id=?').run(JSON.stringify(manual),brand.id);
 await pool.query(`INSERT INTO watchlists(id,workspace_id,purpose,search_terms,enabled) VALUES('manual-keywords',$1,'discovery','["kids bottles"]',true)`,[brand.id]);
 const profile=(await pool.query('SELECT profile,pages FROM brand_onboarding_profiles WHERE workspace_id=$1',[brand.id])).rows[0];await applyUnderstanding(pool,db,brand.id,profile.profile,profile.pages,'monthly');
 assert.deepEqual(readBrand(db,brand.id)!.primaryCategories,[]);assert.deepEqual(readBrand(db,brand.id)!.discoveryKeywords,['kids bottles']);assert.deepEqual((await pool.query('SELECT categories FROM workspace_category_vocabularies WHERE workspace_id=$1',[brand.id])).rows[0].categories,[]);assert.equal((await readOnboarding(pool,db,brand.id))?.totals.tagged,0);
 assert.equal((readBrandResearch(db,brand.id)!.analysis as any).marker,'paid analysis kept');assert((db.prepare('SELECT count(*) AS n FROM brand_research_history WHERE brand_id=?').get(brand.id) as any).n>=1);
}));

test('parallel category and multi-Page media enqueues finish in a two-connection pool without duplicate batches',async()=>fixture(async({pool,db})=>{
 const {enqueueCategoryBatch}=await import('../server/public-categories/jobs.js'),{enqueueAdMedia}=await import('../server/ad-media/jobs.js'),provider=providers(pool),{brand}=await prepare(pool,db,provider);
 for(let n=0;n<9;n++){await pool.query('UPDATE meta_request_gate SET next_request_at=now()');assert(await workOnce(pool,provider.connector,{env,paceMs:0}));}
 await pool.query("UPDATE public_category_batches SET status='complete',finished_at=now()-interval '1 day'");await pool.query("UPDATE ad_media_runs SET status='complete',finished_at=now()-interval '1 day'");
 const small=new pg.Pool({...pool.options,max:2,connectionTimeoutMillis:2000});
 try{const categories=await Promise.all([enqueueCategoryBatch(small,brand.id),enqueueCategoryBatch(small,brand.id)]);assert.equal(categories.filter(Boolean).length,1);
  const page=(await pool.query('SELECT id FROM watchlists WHERE workspace_id=$1 AND brand_key=$1 ORDER BY page_ids->>0',[brand.id])).rows[0].id;
  const media=await Promise.all([enqueueAdMedia(small,page),enqueueAdMedia(small,page)]);assert.equal(media.filter(Boolean).length,1);
 }finally{await small.end();}
}));

test('tagging cannot appear complete when its key is removed after collection',async()=>fixture(async({pool,db})=>{
 const provider=providers(pool),{brand}=await prepare(pool,db,provider);
 for(let n=0;n<9;n++){await pool.query('UPDATE meta_request_gate SET next_request_at=now()');assert(await workOnce(pool,provider.connector,{env,paceMs:0}));}
 const run=await tick(pool,db,{...provider,env:{...env,GEMINI_API_KEY:undefined}});assert.equal(run.status,'paused');assert.equal(run.error_kind,'configuration');
 const view=await readOnboarding(pool,db,brand.id);assert.equal(view?.steps.find(step=>step.key==='tagging')?.status,'paused');assert.equal(view?.totals.taggedPercent,0);
}));
