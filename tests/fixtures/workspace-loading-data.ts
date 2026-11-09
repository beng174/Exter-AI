/** Fictional, large read-only workspace. No database, files or provider access. */
import {browserCreative} from "./creative-browser.js";
import type {Brand} from "../../shared/types.js";
import type {CreativeBrowserResponse} from "../../shared/creative-browser.js";
import {publishedReach} from "../../shared/meta-public.js";
import {sampleBrands,sampleLibrary,sampleResearch,sampleReports,SAMPLE_BRAND_ID} from "../../shared/sample/workspace.js";
import {sampleCreatorResearch,sampleBriefReport} from "../../shared/sample/research.js";
const brand:Brand={id:"loading-fixture",name:"Fictional Candle House",domain:"fictional.example",category:"Home fragrance & gifting",color:"#21336b",initials:"FC",voice:[],competitors:["Fictional Hearth","Fictional Wick"],mode:"imported",createdAt:"2026-11-01"};
const brands=[brand,...brand.competitors.map((name,i)=>({...brand,id:`loading-rival-${i}`,name,domain:`rival-${i}.example`}))];
const creatives=Array.from({length:7800},(_,i)=>{const b=brands[i%3];return browserCreative({adId:`loading-ad-${i}`,nativeId:String(1000000+i),brandId:b.id,brandName:b.name,workspaceBrand:i%3===0,title:"A quiet evening, made special.",copy:`A quiet evening, made special. Candle collection ${i+1}. Made with care for your home.`,observedAt:"2026-11-08T20:00:00Z",firstObservedAt:"2026-11-01T00:00:00Z",creativeFormat:null,hookType:null,angle:null,offerType:null,ugc:null,mediaKind:"unknown",durationSeconds:null,analysis:null,publicReach:publishedReach({total_reach_by_location:[{country:"GB",reach:1234+i}],eu_total_reach:0})});});
const library:CreativeBrowserResponse={brand,creatives,competitors:brands.slice(1).map(b=>({key:b.id,brandId:b.id,name:b.name,status:"collected"})),sources:brands.map(b=>({brandId:b.id,name:b.name,status:"collected"})),ownedStatus:"not_configured",dateRange:{from:"2026-11-01",to:"2026-11-08"},lastChecked:"2026-11-08T20:00:00Z",reportingRange:{from:"2026-10-11",to:"2026-11-09"}};
const sample={brands:sampleBrands,library:sampleLibrary(),research:sampleResearch(),reports:sampleReports,creators:sampleCreatorResearch(),drafts:sampleBriefReport(),id:SAMPLE_BRAND_ID};
process.stdout.write(JSON.stringify({brand,brands,library,sample}));
