import {emptyAccuracy} from "../../shared/accuracy-workspace.js";
/** Fictional browser data computed by the shared rules; never used in production. */
import {creatorProfile,creatorBrief,creatorRow} from './creator-discovery.js';
import {evaluateCreator,emptyDiscovery} from '../../shared/creator-discovery.js';
import {creatorSalesSignal,type CreatorAdStats} from '../../shared/creator-performance.js';
import {publishedReach} from '../../shared/meta-public.js';
import {creatorCohort,type CreatorCampaign} from '../../shared/creator-campaigns.js';
import {ownedMetrics} from '../../shared/owned-metrics.js';
import {pullOwnedDays} from '../../server/owned/providers.js';
import {fixtureAccount,fixtureEnv,fixtureFetch} from './owned-fixtures.js';
const at='2026-11-20T12:00:00.000Z',brief={...creatorBrief,audienceTarget:{ages:['25-34'],genders:['female']},minFollowers:5000};
const profiles=[creatorProfile({handle:'harper_creator'}),creatorProfile({handle:'robin_creator',name:'Robin Willow'})];
const rows=profiles.map((p,i)=>{const evaluation=evaluateCreator(p,brief,[],new Date(at));const stats:CreatorAdStats={ads:3,competitorAds:3,brands:2,repeatBrands:i?0:2,longest:i?15:74,workingMedian:null,versions:i?3:9,countries:[{country:'GB',reach:i?1000:8000},{country:'FR',reach:2000}],demographics:[{country:'GB',age:'25-34',gender:'female',reach:6000},{country:'GB',age:'35-44',gender:'male',reach:2000}],from:'2026-09-07',to:at,checkedAt:at};return {...creatorRow(p,brief),evaluation,salesSignal:creatorSalesSignal(p,evaluation,[brief.category,...brief.keywords],stats,at,brief.audienceTarget)};});
const snapshot={...emptyDiscovery(),configured:true,verificationConfigured:true,brief,briefVersion:'browser-fixture',creators:rows};
const owned=(await pullOwnedDays(fixtureAccount(),'2026-11-01','2026-11-04',{env:fixtureEnv,fetch:fixtureFetch()}))[0];
const campaign:CreatorCampaign={id:'reported-campaign',handle:profiles[0].handle,brand:'Fixture Candle House',platform:'Meta',from:'2026-10-01',to:'2026-10-14',scope:{account:'reported',currency:'GBP',attribution:'reported',event:'reported',category:'candles',product:'Starter kit',format:'video'},spend:100,revenue:250,roas:2.5,cpa:10,purchases:10,hookRate:null,holdRate:null,adIds:[],source:'Imported',recordedAt:at,features:null,featureAt:null,fixture:true};
const performance={accounts:[{id:'own',accountId:'12001',platform:'Meta',currency:'GBP',attribution:'7d_click',event:'purchase',status:'connected'}],cohorts:[{key:creatorCohort(campaign),label:'Meta · reported · GBP · candles · Starter kit · video',creators:12,campaigns:17}],models:[]};
const details={handle:profiles[0].handle,signal:rows[0].salesSignal,ads:Array.from({length:3},(_,i)=>({adId:'public:Meta:'+String(900001+i),nativeId:String(900001+i),brandId:'rival-'+i,brandName:['Fixture Hearth','Fixture Wick','Fixture Garden'][i],platform:'Meta',title:['A warm welcome home.','A quiet evening, made cosy.','A gift for candle lovers.'][i],from:'2026-09-07',days:74-i*9,workingScore:null,reach:publishedReach({total_reach_by_location:[{country:'GB',reach:1000+i*500}]}),versions:3,checkedAt:at,credits:[{handle:profiles[0].handle,kind:'Partnership',quote:'Published creator identity.',seconds:null,basis:'Observed'}]})),totalAds:3,owned:[{account:'12001',platform:'Meta',currency:'GBP',attribution:'7d_click',event:'purchase',category:'candles',product:'Starter kit',format:'video',from:'2026-11-01',to:'2026-11-04',ads:1,checkedAt:at,metrics:ownedMetrics([owned])}],campaigns:[campaign],forecasts:[]};
process.stdout.write(JSON.stringify({snapshot,performance,details,accuracy:emptyAccuracy()}));
