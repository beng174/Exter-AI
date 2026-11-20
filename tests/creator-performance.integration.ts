import {scheduleCreatorRefresh} from "../server/creators/discovery-jobs.js";
// CP-01..06: isolated databases and recorded public/owned fixtures. No provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import express from 'express';
import {openDatabase} from '../server/db.js';
import {basicAuth} from '../server/auth.js';
import {migrate} from '../server/infrastructure/database.js';
import {refreshCreativeIndex} from '../server/infrastructure/creative-index.js';
import {recordCreatorAdEvidence,refreshCreatorSales,recordOwnedCreatorIdentities} from '../server/creators/performance-store.js';
import {attachCreatorPerformance,creatorOwnedOutcomes} from '../server/creators/performance-api.js';
import {attachAccuracy} from '../server/accuracy/api.js';
import {briefDigest,upsertDiscoveryProfile,discoverySnapshot,deleteDiscoveryCreator,saveCreatorSegment} from '../server/creators/discovery-store.js';
import {creatorBrief,creatorProfile} from './fixtures/creator-discovery.js';
import {forecastFixture} from './fixtures/creator-performance.js';
import {CREATOR_HISTORY_HEADER,creatorCohort} from '../shared/creator-campaigns.js';
import {fixtureAccount,fixtureEnv,fixtureFetch} from './fixtures/owned-fixtures.js';
import {pullOwnedDays} from '../server/owned/providers.js';
import {ownedMetrics} from '../shared/owned-metrics.js';
import type {BrowserCreative} from '../shared/creative-browser.js';
import {browserCreative} from './fixtures/creative-browser.js';
const at=new Date('2026-11-20T12:00:00.000Z');
const brand={id:'workspace',name:'Fictional Candle House',domain:'candles.fixture.example',category:'candles',primaryCategories:['candles'],mode:'imported',competitors:[]};
async function fixture(work:(p:pg.Pool,db:ReturnType<typeof openDatabase>,call:(path:string,body?:unknown,headers?:Record<string,string>)=>Promise<{status:number;body:any}>)=>Promise<void>){
 assert(process.env.TEST_DATABASE_URL);const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL}),schema='creator_sales_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
 const p=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:6}),db=openDatabase(':memory:',false);
 for(const [id,name,mode]of [['workspace',brand.name,'imported'],['other','Fictional Other House','imported'],['sample','Fictional Sample House','demo']])db.prepare('INSERT INTO brands VALUES(?,?)').run(id,JSON.stringify({...brand,id,name,mode}));
 await migrate(p);await migrate(p);await p.query('INSERT INTO creator_discovery_settings(workspace_id,brief,brief_version) VALUES($1,$2,$3)',['workspace',JSON.stringify(creatorBrief),briefDigest(creatorBrief)]);
 const app=express();app.use(express.json({limit:'2mb'}));app.use(basicAuth({EXTER_ADMIN_USER:'fixture-owner',EXTER_ADMIN_PASSWORD:'fixture-password'}));attachCreatorPerformance(app,db,{pool:p,now:()=>at,fixture:true});attachAccuracy(app,db,{getPool:()=>p,now:()=>at});
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${(server.address() as any).port}`,originalFetch=globalThis.fetch;
 globalThis.fetch=async(target,init)=>{assert(String(target).startsWith(origin+'/'),'No provider requests in these fixtures.');return originalFetch(target,init);};
 const call=async(path:string,body?:unknown,headers:Record<string,string>={})=>{const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from('fixture-owner:fixture-password').toString('base64'),...(body?{'Content-Type':'application/json',Origin:origin}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json().catch(()=>null)};};
 try{await work(p,db,call);}finally{globalThis.fetch=originalFetch;await new Promise<void>((r,reject)=>server.close(e=>e?reject(e):r()));db.close();await p.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
}
const csv=CREATOR_HISTORY_HEADER+'\nfixture_creator,Fictional Candle House,Meta,2026-01-01,2026-01-14,100,250,2.5,10,video,campaign-one,10,\n';
const scope={account:'reported',currency:'GBP',attribution:'reported',event:'reported',category:'candles',product:'Candle starter kit'};
test('CP-01 indexing stores direct creator proof and public reach in committed chunks; scopes and deletion stay intact',async()=>fixture(async(p,db,call)=>{
 await upsertDiscoveryProfile(p,'workspace',creatorProfile(),creatorBrief,briefDigest(creatorBrief),true,'2026-12-20');
 await p.query(`INSERT INTO watchlists(id,workspace_id,brand_key,page_ids) VALUES('watch','workspace','workspace','["12001"]');INSERT INTO collection_runs(id,watchlist_id,config,status) VALUES('run','watch','{"revision":1}','complete');`);
 for(let n=0;n<3;n++){
  const raw={ad_creative_bodies:[`A candle story featuring @fixture_creator. Version ${n}.`],branded_content_partner:{profile_url:'https://www.instagram.com/fixture_creator/'},total_reach_by_location:[{country:'GB',reach:n*100}],age_country_gender_reach_breakdown:[{country:'GB',age_gender_breakdowns:[{age_range:'25-34',female:50,male:10}]}]};
  await p.query("INSERT INTO public_ads(platform,native_id,advertiser_id,start_time) VALUES('Meta',$1,'12001',$2)",[String(900001+n),new Date(Date.UTC(2026,7,1+n*35))]);
  await p.query("INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload) VALUES('Meta',$1,'run','workspace','active','{}',$2)",[String(900001+n),JSON.stringify(raw)]);
 }
 await refreshCreativeIndex(p,db,brand as any,[],{selected:async()=>[]} as any);
 let result=await call('/api/creator-performance/creator?workspaceId=workspace&handle=fixture_creator');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.totalAds,3);assert.equal(result.body.ads.length,3);assert.equal(result.body.signal.stats.longest>30,true);assert.equal(result.body.signal.stats.repeatBrands,1);assert.equal(result.body.owned.length,0);assert.equal(result.body.signal.stats.countries[0].reach,300);assert.equal(result.body.ads.find((a:any)=>a.nativeId==='900001').reach.locations.value[0].reach,0);assert(result.body.ads.every((a:any)=>a.workingScore===null));assert.equal(result.body.ads[0].credits.length,2);
 await refreshCreativeIndex(p,db,brand as any,[],{selected:async()=>[]} as any);assert.equal((await p.query('SELECT count(*)::integer n FROM creator_ad_evidence')).rows[0].n,3);
 await recordCreatorAdEvidence(p,'workspace',[{row:browserCreative({adId:'public:Meta:900001',nativeId:'900001',brandId:'duplicate-watch',platform:'Meta',workspaceBrand:false,copy:'Featuring @fixture_creator'})},{row:browserCreative({adId:'private-identity',nativeId:'private-id',brandId:'workspace',owned:true,publicEvidence:false,platform:'Meta',copy:'Featuring @fixture_creator'})}]);
 result=await call('/api/creator-performance/creator?workspaceId=workspace&handle=fixture_creator');assert.equal(result.body.totalAds,3,'The same archive ad in two watchlists counts once; private identities stay separate.');assert.equal(result.body.signal.stats.countries[0].reach,300);assert.equal(result.body.ads.length,3);
 const snapshot=await discoverySnapshot(p,'workspace',at);assert(snapshot.creators[0].salesSignal);await saveCreatorSegment(p,'workspace','Sales-qualified',{minSales:101} as any);assert.equal((await discoverySnapshot(p,'workspace',at)).segments[0].count,0);
 assert.equal((await call('/api/creator-performance/creator?workspaceId=other&handle=fixture_creator')).body.totalAds,0);
 await p.query("INSERT INTO creator_forecast_models(workspace_id,id,cohort,data) VALUES('workspace','deleted-model','x','{\"handles\":[\"fixture_creator\"]}')");await deleteDiscoveryCreator(p,'workspace','fixture_creator');
 for(const table of ['creator_ad_evidence','creator_sales_current','creator_sales_history','creator_campaign_outcomes','creator_owned_links','creator_forecast_models'])assert.equal((await p.query(`SELECT count(*)::integer n FROM ${table} WHERE workspace_id='workspace'`)).rows[0].n,0,table);
 const row=browserCreative({nativeId:'900001',brandId:'workspace',platform:'Meta',copy:'Featuring @fixture_creator',workspaceBrand:true});await recordCreatorAdEvidence(p,'workspace',[{row}]);assert.equal((await p.query('SELECT count(*)::integer n FROM creator_ad_evidence')).rows[0].n,0,'Suppression prevents a new attribution after deletion.');
 await upsertDiscoveryProfile(p,'workspace',creatorProfile({handle:'expired_creator'}),creatorBrief,briefDigest(creatorBrief),true,'2026-12-20');
 await p.query("UPDATE creator_discovery_results SET used_at='2026-01-01' WHERE handle='expired_creator'");await scheduleCreatorRefresh(p,at,{});
 assert.equal((await p.query("SELECT count(*)::integer n FROM creator_sales_current WHERE handle='expired_creator'")).rows[0].n,0);assert.equal((await p.query("SELECT count(*)::integer n FROM creator_sales_history WHERE handle='expired_creator'")).rows[0].n,0);assert.equal((await p.query('SELECT count(*)::integer n FROM ad_observations')).rows[0].n,3,'Expiry never deletes official ad history.');
}));
test('CP-04 authenticated CSV import is atomic and idempotent; foreign brands, accounts and samples cannot inject outcomes',async()=>fixture(async(p,_db,call)=>{
 assert.equal((await call('/api/creator-performance?workspaceId=workspace',undefined,{Authorization:''})).status,401);assert.equal((await call('/api/creator-performance/import',{workspaceId:'workspace',scope,csv},{Origin:'https://wrong.fixture.example'})).status,403);assert.equal((await call('/api/creator-performance?workspaceId=sample')).status,409);
 const bad=csv+csv.split('\n')[1].replace('2.5,10','9,10')+'\n';assert.equal((await call('/api/creator-performance/import',{workspaceId:'workspace',scope,csv:bad})).status,409);assert.equal((await p.query('SELECT count(*)::integer n FROM creator_campaign_outcomes')).rows[0].n,0);
 const imported=await call('/api/creator-performance/import',{workspaceId:'workspace',scope,csv});assert.equal(imported.status,200,JSON.stringify(imported.body));assert.equal(imported.body.inserted,1);assert.equal((await call('/api/creator-performance/import',{workspaceId:'workspace',scope,csv})).body.inserted,0);
 assert.equal((await call('/api/creator-performance/import',{workspaceId:'workspace',scope,csv:csv.replace('Fictional Candle House','Fictional Other House')})).status,409);assert.equal((await call('/api/creator-performance/import',{workspaceId:'sample',scope,csv})).status,409);assert.equal((await call('/api/creator-performance/import',{workspaceId:'workspace',scope:{...scope,account:'unrelated-account'},csv})).status,409);
 const saved=await call('/api/creator-performance/creator?workspaceId=workspace&handle=fixture_creator');assert.equal(saved.body.campaigns[0].source,'Imported');assert.equal(saved.body.campaigns[0].roas,2.5);assert.equal(saved.body.forecasts.length,0);assert.equal((await call('/api/creator-performance?workspaceId=other')).body.cohorts.length,0);
 const group=(await call('/api/creator-performance?workspaceId=workspace')).body.cohorts[0];assert.equal(group.creators,1);assert.equal((await call('/api/creator-performance/train',{workspaceId:'workspace',cohort:group.key})).status,409);
}));
test('CP-04 exact owned identity uses existing metric formulas, reporting cohorts and minimum samples; archive IDs confer no ownership',async()=>fixture(async(p,_db,call)=>{
 await p.query("INSERT INTO owned_accounts(id,workspace_id,platform,account_id,currency,attribution,conversion_event,status,last_successful_sync) VALUES('own','workspace','Meta','12001','GBP','7d_click','purchase','connected',now()),('foreign','other','Meta','999','GBP','7d_click','purchase','connected',now())");
 const base=(await pullOwnedDays(fixtureAccount(), '2026-11-01','2026-11-04',{env:fixtureEnv,fetch:fixtureFetch()}))[0];
 const rows=[{...base,adId:'444',accountId:'12001',day:'2026-11-01',currency:'GBP',attribution:'7d_click',conversionEvent:'purchase',assetIds:['real-owned-family']},{...base,adId:'444',accountId:'12001',day:'2026-11-02',currency:'GBP',attribution:'7d_click',conversionEvent:'purchase',assetIds:['real-owned-family']}];
 for(const row of rows)await p.query('INSERT INTO owned_ad_days VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',['own',row.platform,row.adId,row.day,row.attribution,row.currency,row.conversionEvent,row.pulledAt,JSON.stringify(row)]);
 await recordCreatorAdEvidence(p,'workspace',[{row:browserCreative({nativeId:'444',brandId:'workspace',platform:'Meta',copy:'Featuring @fixture_creator',workspaceBrand:true})}]);assert.deepEqual(await creatorOwnedOutcomes(p,'workspace','fixture_creator','2026-11-01','2026-11-03'),[]);
 const body={workspaceId:'workspace',handle:'fixture_creator',accountId:'own',adIds:['444'],kind:'Whitelisted',category:'candles',product:'Candle starter kit',format:'video',from:'2026-11-01',to:'2026-11-03',campaignId:'owned-campaign'};
 assert.equal((await call('/api/creator-performance/owned',{...body,accountId:'foreign'})).status,409);assert.equal((await call('/api/creator-performance/owned',{...body,adIds:['900001']})).status,409);
 const response=await call('/api/creator-performance/owned',body);assert.equal(response.status,200,JSON.stringify(response.body));const result=await creatorOwnedOutcomes(p,'workspace','fixture_creator','2026-11-01','2026-11-03');assert.equal(result.length,1);assert.equal(result[0].currency,'GBP');const expected=ownedMetrics(rows);for(const metric of ['Spend','ROAS','CPA','Hook rate','Hold rate'] as const)assert.deepEqual(result[0].metrics[metric],expected[metric]);
 const outcomes=(await p.query('SELECT data FROM creator_campaign_outcomes')).rows[0].data;assert.equal(outcomes.source,'Owned');assert.equal(outcomes.adOutcomes.length,1);assert.equal(outcomes.adOutcomes[0].adId,'444');assert.equal(outcomes.features,null,'Retrospective score snapshots never train this campaign.');
 await recordOwnedCreatorIdentities(p,'workspace','own',[{...rows[0],creatorAttributions:[{handle:'auto_creator',kind:'Partnership'}]}]);assert.equal((await creatorOwnedOutcomes(p,'workspace','auto_creator','2026-11-01','2026-11-03')).length,1);
}));
test('CP-05 explicit training and saved-outcome checks appear on Accuracy but fixture gates never publish a forecast',async()=>fixture(async(p,_db,call)=>{
 const rows=forecastFixture(),cohort=creatorCohort(rows[0]);for(const row of rows)await p.query('INSERT INTO creator_campaign_outcomes VALUES($1,$2,$3,$4,$5,$6)', ['workspace',row.id,row.handle,cohort,JSON.stringify(row),row.id]);
 const response=await call('/api/creator-performance/train',{workspaceId:'workspace',cohort});assert.equal(response.status,201,JSON.stringify(response.body));assert.equal(response.body.status,'In validation');
 const check=await call('/api/creator-performance/validate',{workspaceId:'workspace',version:response.body.version});assert.equal(check.status,200,JSON.stringify(check.body));assert.match(check.body.message,/3,000/);assert.match(check.body.message,/Fixtures/);
 const metadata=await call('/api/creator-performance?workspaceId=workspace');assert.equal(metadata.body.cohorts[0].creators,60);assert.equal(metadata.body.models.length,1);assert.equal(metadata.body.models[0].live,false);assert.equal(metadata.body.models[0].validation.sampleSize,12);assert(!('coefficients'in metadata.body.models[0]));
 const accuracy=await call('/api/accuracy?workspaceId=workspace');assert.equal(accuracy.status,200,JSON.stringify(accuracy.body));assert(accuracy.body.models.some((m:any)=>m.modelVersion===response.body.version&&m.status!=='Live'));
 const details=await call('/api/creator-performance/creator?workspaceId=workspace&handle=creator_55');assert.equal(details.status,200);assert.equal(details.body.forecasts.length,0);
}));
