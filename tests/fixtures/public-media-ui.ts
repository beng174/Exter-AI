/** Fictional API fixtures only. Never imported by production. */
import {browserCreative,ownedDay} from './creative-browser.js';
import {ownedMetrics} from '../../shared/owned-metrics.js';
import {publishedReach} from '../../shared/meta-public.js';
import type {Brand} from '../../shared/types.js';
import type {BrowserCreative,CreativeBrowserResponse} from '../../shared/creative-browser.js';
const brand:Brand={id:'public-ui',name:'Fictional Candle House',domain:'fictional-candle.example',category:'Home fragrance & gifting',primaryCategories:['home fragrance','candles'],color:'#21336b',initials:'FC',voice:[],competitors:['public-rival-a','public-rival-b'],mode:'imported',createdAt:'2026-11-01'};
const brands=[brand,{...brand,id:'public-rival-a',name:'Fictional Hearth',color:'#9d5747'},{...brand,id:'public-rival-b',name:'Fictional Wick',color:'#476b58'}];
const creatives:BrowserCreative[]=[];
function add(format:NonNullable<BrowserCreative['adFormat']>,you:number,peers:number,categories:string[]|null=['home fragrance','candles']){
 for(let j=0;j<you+peers;j++){
  const i=creatives.length,b=j<you?brand:brands[1+j%2],id=String(200000+i),hasImage=i>2;
  creatives.push(browserCreative({adId:'fixture-public-'+i,nativeId:id,brandId:b.id,brandName:b.name,workspaceBrand:b.id===brand.id,owned:false,sourceKind:'public',publicEvidence:true,adFormat:format,productCategories:categories,productCategoryModel:'fixture-model',copy:`A candle for quiet evenings.\nA fictional collection, number ${i+1}, made with care.`,searchText:'A candle for quiet evenings gifting',mediaKind:format==='video'?'video':format==='carousel'?'carousel':'image',durationSeconds:format==='video'?12:null,thumbnailUrl:hasImage?`/api/ad-media/files/public-ui/${b.id}/${id}/${'a'.repeat(64)}`:null,videoUrl:i===3?'/fixture-video.mp4':null,imageUrls:[],mediaAvailable:hasImage,creativeFormat:format==='video'?'UGC':'static',hookType:'offer-led',angle:i%3?'gifting':'quality-luxury',offerType:i%2?'bundle':'none',observedAt:'2026-11-08T20:00:00Z',firstObservedAt:'2026-11-01T00:00:00Z',deliveryStartAt:'2026-10-01T00:00:00Z',daysRunning:38,daysRunningAsOf:'2026-11-08T20:00:00Z',previewState:i<3?{failedDays:[0,6,7][i],reason:i?'expired':null,lastAttemptAt:i?'2026-11-08T20:00:00Z':null}:undefined,publicReach:publishedReach({eu_total_reach:1000+i,total_reach_by_location:[{country:'GB',reach:100+i}],age_country_gender_reach_breakdown:[{country:'GB',age_gender_breakdowns:[{age_range:'25-34',female:60,male:40}]}]})}));
 }
}
add('video',46,312);add('static_image',12,20);add('carousel',5,5);add('video',0,15,['fashion']);add('video',0,5,null);
const metrics=ownedMetrics([ownedDay()]);
creatives.push(browserCreative({adId:'private-account-ad',nativeId:'private',owned:true,workspaceBrand:true,brandId:brand.id,brandName:brand.name,sourceKind:'owned',publicEvidence:false,performance:[{id:'fixture-account',accountId:'fixture-account',platform:'Meta',currency:'GBP',attribution:'7d_click',conversionEvent:'purchase',from:'2026-11-02',to:'2026-11-08',lastChecked:'2026-11-08T20:00:00Z',benchmarkSampleSize:1,metrics,benchmark:metrics}]}));
const library:CreativeBrowserResponse={brand,creatives,competitors:brands.slice(1).map(b=>({key:b.id,brandId:b.id,name:b.name,status:'collected'})),sources:brands.map(b=>({brandId:b.id,name:b.name,status:'collected'})),ownedStatus:'available',mediaReadStatus:'available',categoryReadStatus:'available',metaSource:{enabled:true,status:'connected',lastSuccessfulCheck:'2026-11-08T20:00:00Z',message:'Public collection completed successfully.'},dateRange:{from:'2026-11-01',to:'2026-11-08'},lastChecked:'2026-11-08T20:00:00Z',reportingRange:{from:'2026-11-02',to:'2026-11-08'}};
process.stdout.write(JSON.stringify({brand,brands,library}));
