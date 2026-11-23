import {forecastFixture} from './fixtures/creator-performance.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {creatorCredits,creatorSalesSignal,emptyAdStats,salesFeatures,type CreatorAdStats} from '../shared/creator-performance.js';
import {creatorSearchDraft,creatorLookalikes,creatorBriefHref} from '../shared/creator-search.js';
import {historyCampaigns,creatorCohort,CREATOR_HISTORY_HEADER,type CreatorCampaign} from '../shared/creator-campaigns.js';
import {creatorForecastGate,predictCreatorRoas,trainCreatorForecast,validateCreatorForecast} from '../shared/creator-forecast.js';
import {evaluateCreator,matchesCreator,creatorCsv} from '../shared/creator-discovery.js';
import {creatorBrief,creatorProfile,creatorRow} from './fixtures/creator-discovery.js';
import {publishedReach} from '../shared/meta-public.js';
import type {ModelValidation} from '../shared/accuracy.js';
const at='2026-11-20T12:00:00.000Z';
const profile=creatorProfile(),evaluation=evaluateCreator(profile,creatorBrief,[],new Date(at));
const stats:CreatorAdStats={...emptyAdStats(),ads:3,competitorAds:3,brands:2,repeatBrands:1,longest:74,workingMedian:80,versions:9,countries:[{country:'GB',reach:800},{country:'FR',reach:200}],demographics:[{country:'GB',age:'25-34',gender:'female',reach:600},{country:'GB',age:'35-44',gender:'male',reach:200}]};
test('CP-01 direct creator identities and credits only, with safe profile links and on-screen moments',()=>{
 const row={copy:'A story featuring @fixture_creator. Visit @ordinary_brand. Email a@private.example',partnershipAttribution:null,creatorEvidence:[{kind:'visible-creator-handle' as const,value:'@screen_creator',timestamps:[{startSeconds:9,endSeconds:10}],source:'video' as const,confidence:.9}]};
 const credits=creatorCredits({branded_content_partner:{profile_url:'https://www.instagram.com/partner_creator/'},whitelisted_creator:{username:'white_creator'},coauthors:[{username:'co_creator'},{name:'No proven handle'},{profile_url:'https://instagram.com.evil.example/steal/'},{profile_url:'https://www.instagram.com/secret/?access_token=fixture'}]},row);
 assert.deepEqual(credits.map(c=>c.handle),['partner_creator','white_creator','co_creator','fixture_creator','screen_creator']);assert.equal(credits.at(-1)!.seconds,9);assert(!JSON.stringify(credits).includes('private.example'));assert(!JSON.stringify(credits).includes('access_token'));assert(!credits.some(c=>c.handle==='ordinary_brand'));
 assert.deepEqual(creatorCredits({page_name:'A creator',creator_name:'Harper Rowan',instagram_username:'advertiser_identity'}),[]);
});
test('CP-02 the five assessed weights add up; missing values lower coverage, never add free points',()=>{
 const signal=creatorSalesSignal(profile,evaluation,['candles'],stats,at,{ages:['25-34'],genders:['female']});
 const denominator=signal.parts.reduce((n,p)=>n+p.availableWeight,0);assert.equal(signal.score,Math.round(signal.parts.reduce((n,p)=>n+(p.value??0)*p.availableWeight,0)/denominator));assert.equal(signal.coverage,denominator/100);assert.match(signal.evidence,/3 competitor ads, longest 74 days, 9 versions/);assert.equal(signal.confidence,'Medium');assert(signal.provisional);
 const missing=creatorSalesSignal({...profile,bio:'',posts:[],audit:null},{...evaluation,risk:{status:'Not assessed',reasons:[]}},[],emptyAdStats(),at);assert.equal(missing.score,null);assert.equal(missing.coverage,0);assert.equal(missing.confidence,'Low');assert(missing.parts.every(p=>p.availableWeight===0));
 const zero=creatorSalesSignal(profile,{...evaluation,risk:{status:'Review',reasons:['Recorded flag.']}},[],{...emptyAdStats(),ads:1,longest:0,workingMedian:0},at);assert.equal(zero.parts.find(p=>p.key==='backing')!.value,0);assert.equal(zero.parts.find(p=>p.key==='authenticity')!.value,0);
});
test('CP-02 public UK reach is a published sample, not the creator’s base; demographic fit is optional',()=>{
 const noReach=creatorSalesSignal(profile,evaluation,['candles'],{...stats,countries:[],demographics:[]},at);assert.equal(noReach.parts.find(p=>p.key==='audience')!.availableWeight,20/3);assert.match(noReach.parts.find(p=>p.key==='audience')!.reason,/UK reach not assessed/);
 const signal=creatorSalesSignal(profile,evaluation,['candles'],stats,at,{ages:['25-34'],genders:['female']});assert.match(signal.parts.find(p=>p.key==='audience')!.reason,/UK: 80.0%/);assert.match(signal.parts.find(p=>p.key==='audience')!.reason,/age\/gender match 75.0%/);
});
test('CP-02 sponsored engagement compares three paid and three organic posts, never gifted or absent counts',()=>{
 const posts=profile.posts.map((p,i)=>({...p,caption:i<3?'#ad candles':i===3?'#gifted candles':'Candles',likes:i<3?400:200,comments:0}));
 const signal=creatorSalesSignal({...profile,posts},evaluation,[],stats,at);assert.equal(signal.parts.find(p=>p.key==='response')!.value,100);
 const partial=creatorSalesSignal({...profile,posts:posts.slice(0,5)},evaluation,[],stats,at);assert.equal(partial.parts.find(p=>p.key==='response')!.value,null);
 const emptyOrganic=creatorSalesSignal({...profile,posts:posts.map((p,i)=>({...p,likes:i<3?400:0}))},evaluation,[],stats,at);assert.equal(emptyOrganic.parts.find(p=>p.key==='response')!.value,null);
});
test('CP-03 reviewed search filters and seed handles never create account name searches or relax qualification',()=>{
 const parsed=creatorSearchDraft('UK micro creators about candles with UGC and Sales Signal at least 60',creatorBrief);assert.equal(parsed.brief.country,'GB');assert.equal(parsed.brief.minFollowers,10000);assert.equal(parsed.brief.maxFollowers,99999);assert.equal(parsed.minSales,60);assert(parsed.brief.keywords.includes('candles'));assert(parsed.brief.styles.includes('UGC'));assert(parsed.chosen.length>=4);
 assert.equal(creatorSearchDraft('UGC videos 15-20 seconds for ages 25-34',creatorBrief).brief.minFollowers,creatorBrief.minFollowers);
 assert.equal(creatorSearchDraft('3.5k to 20k followers',creatorBrief).brief.minFollowers,3500);assert.throws(()=>creatorSearchDraft('20k to 10k followers',creatorBrief));assert.deepEqual(creatorLookalikes('@one.creator, @two_creator, third'),['one.creator','two_creator','third']);assert.throws(()=>creatorLookalikes('one two three four'));assert.throws(()=>creatorLookalikes('https://secret.example'));
 const valid=creatorRow({},creatorBrief);const signal=creatorSalesSignal(profile,evaluation,['candles'],stats,at);assert(!matchesCreator({...valid,salesSignal:{...signal,score:59}},{minSales:60},'Results',new Date(at)));assert(!matchesCreator(valid,{minSales:0},'Results',new Date(at)));const rejected={...valid,evaluation:{...valid.evaluation,screen:{...valid.evaluation.screen,disposition:'Rejected' as const}}};assert(!matchesCreator({...rejected,salesSignal:{...signal,score:100}},{minSales:60},'Results',new Date(at)));assert(!creatorCsv([rejected]).includes(profile.handle));
 const href=creatorBriefHref('brand & one','candles','UK creators about candles with UGC','Gift-ready brief');const url=new URL(href,'https://fixture.example');assert.equal(url.searchParams.get('view'),'creators');assert.equal(url.searchParams.get('brandId'),'brand & one');assert.equal(url.searchParams.get('creatorCategory'),'candles');
});
const scope={account:'reported',currency:'GBP',attribution:'reported',event:'reported',category:'candles',product:'Candle starter kit'};
const csv=(row:string)=>CREATOR_HISTORY_HEADER+'\n'+row+'\n';
const validRow='fixture_creator,Fictional Candle House,Meta,2026-01-01,2026-01-14,100,250,2.5,10,video,campaign-one,10,';
test('CP-04 history import preserves source, real zero and missing values; validates dates, money and own brand',()=>{
 const rows=historyCampaigns(csv(validRow),'Fictional Candle House',scope,at,true);assert.equal(rows[0].roas,2.5);assert.equal(rows[0].cpa,10);assert.equal(rows[0].source,'Imported');assert.equal(rows[0].features,null);assert(rows[0].fixture);assert.equal(rows[0].scope.currency,'GBP');
 const zero=historyCampaigns(csv(validRow.replace('100,250,2.5,10','100,0,0,10')),'Fictional Candle House',scope,at);assert.equal(zero[0].roas,0);
 for(const bad of [validRow.replace('2.5,10','9,10'),validRow.replace('100,250','-100,250'),validRow.replace('2026-01-14','2026-02-30'),validRow.replace('2026-01-14','2027-01-01'),validRow.replace('Fictional Candle House','Competitor House'),validRow.replace('100,250','NaN,250'),validRow.replace('10,video','999,video'),validRow.replace('video,campaign','unknown,campaign')])assert.throws(()=>historyCampaigns(csv(bad),'Fictional Candle House',scope,at),/Row 2:/);
 assert.throws(()=>historyCampaigns(csv(validRow)+'"unterminated','Fictional Candle House',scope,at));assert.throws(()=>historyCampaigns(csv(validRow)+'\n'+validRow.replace('2.5,10','8,10'),'Fictional Candle House',scope,at),/Row 3:/);
});
test('CP-05 training requires 50 eligible distinct creators in one cohort with pre-campaign features',()=>{
 const rows=forecastFixture(),cohort=creatorCohort(rows[0]);assert.throws(()=>trainCreatorForecast(rows.slice(0,49),cohort,at),/50 creators/);assert.throws(()=>trainCreatorForecast(rows.map(r=>({...r,featureAt:r.recordedAt})),cohort,at),/50 creators/);assert.throws(()=>trainCreatorForecast(rows.map((r,i)=>i<30?{...r,scope:{...r.scope,currency:'USD'}}:r),cohort,at),/50 creators/);
 const model=trainCreatorForecast(rows,cohort,at);assert.equal(model.creators,60);assert(model.trainingIds.length>0&&model.calibrationIds.length>0&&model.holdoutIds.length>0);assert(model.referenceEnd<model.holdoutStart);assert(model.coefficients.every(Number.isFinite));assert(model.fixture);assert.equal(model.status,'In validation');
 const train=new Set([...model.trainingIds,...model.calibrationIds]);assert(model.holdoutIds.every(id=>!train.has(id)));const validation=validateCreatorForecast(model,rows,at);assert.notEqual(validation.status,'Live');assert(validation.reasons.includes('Fixtures are not live verification.'));assert.equal(validation.sampleSize,12);assert.equal(predictCreatorRoas(model,salesFeatures(creatorSalesSignal(profile,evaluation,[],stats,at)),validation),null);
 const contaminated=rows.map(r=>model.holdoutIds.includes(r.id)?{...r,adOutcomes:[{...r.adOutcomes![0],familyId:rows[0].adOutcomes![0].familyId}]}:r);assert.throws(()=>validateCreatorForecast(model,contaminated,at),/leaking/);
});
test('CP-05 publication needs both the exact model validation and continuous range checks; stale or fixture gates fail',()=>{
 const rows=forecastFixture(),model={...trainCreatorForecast(rows,creatorCohort(rows[0]),at),fixture:false,mae:.2,baselineMae:1,coverage:.9};
 const validation:ModelValidation={modelVersion:model.version,cohort:model.cohort,target:'owned-benchmark',sampleSize:3000,advertisers:1,auc:.75,baselineAuc:.5,brier:.1,baselineBrier:.25,ece:.02,bins:[],status:'Live',reasons:[],checkedAt:at,fixture:false,referenceEnd:model.referenceEnd,holdoutStart:model.holdoutStart,holdoutEnd:model.holdoutEnd};
 assert(creatorForecastGate(model,validation));const value=predictCreatorRoas(model,rows[0].features!,validation);assert(value);assert(value.range[0]>=0&&value.range[1]>=value.range[0]);assert.equal(value.confidence,.9);assert.equal(value.validation.auc,.75);
 for(const changed of [{...validation,fixture:true},{...validation,modelVersion:'old-version'},{...validation,auc:.6},{...validation,sampleSize:2999},{...validation,cohort:'other'},{...validation,holdoutStart:'2024-01-01'}])assert(!creatorForecastGate(model,changed));assert(!creatorForecastGate({...model,coverage:.8},validation));assert(!creatorForecastGate({...model,mae:2},validation));assert.equal(predictCreatorRoas(model,[NaN],validation),null);
});
test('published reach stays Observed and missing country or demographic cells stay absent',()=>{const reach=publishedReach({total_reach_by_location:[{country:'GB',reach:0}],eu_total_reach:0});assert.equal(reach.locations.type,'observed');assert.equal(reach.locations.value![0].reach,0);assert.equal(reach.demographics.value,null);});
