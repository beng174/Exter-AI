/** Fictional response fixtures for the isolated browser test; never imported by production. */
import type {Brand} from "../../shared/types.js";
import type {CreativeBrowserResponse} from "../../shared/creative-browser.js";
import {browserCreative} from "./creative-browser.js";
import {publishedReach} from "../../shared/meta-public.js";
const brand:Brand={id:"fixture-meta",name:"Fixture Candle House",domain:"fixture-candle.example",category:"Home fragrance & gifting",color:"#21336b",initials:"FC",voice:[],competitors:["Fixture Hearth","Fixture Wick"],mode:"imported",createdAt:"2026-11-01"};
const rivals=[{key:"name:fixture hearth",brandId:null,name:"Fixture Hearth",status:"collected"},{key:"name:fixture wick",brandId:null,name:"Fixture Wick",status:"collected"}];
const brands=[brand,...rivals.map((r,i)=>({...brand,id:r.key,name:r.name,color:i?"#476b58":"#9d5747"}))];
const creatives=brands.map((b,i)=>browserCreative({adId:"fixture-ad-"+i,nativeId:String(1000+i),brandId:b.id,brandName:b.name,workspaceBrand:i===0,copy:["Light up a quiet evening","A warm welcome home","A small gift, made with care"][i],durationSeconds:12+i*5,observedAt:"2026-11-05T09:00:00Z",daysRunning:35,publicReach:publishedReach({total_reach_by_location:[{key:"UK",value:[1000,3000,0][i]}],eu_total_reach:0,age_country_gender_reach_breakdown:[{country:"GB",age_gender_breakdowns:[{age_range:"25-34",female:[600,1800,0][i],male:[400,1200,0][i]},{age_range:"35-44",female:0,male:0}]}]}),reachObservedAt:"2026-11-05T09:00:00Z"}));
const library:CreativeBrowserResponse={brand,competitors:rivals,creatives,sources:rivals.map(r=>({brandId:r.brandId,name:r.name,status:"collected"})),metaSource:{status:"connected",enabled:true,lastSuccessfulCheck:"2026-11-05T09:00:00Z",message:"Public collection completed successfully."},ownedStatus:"not_configured",dateRange:{from:"2026-11-01",to:"2026-11-05"},lastChecked:"2026-11-05T09:00:00Z",reportingRange:{from:"2026-10-30",to:"2026-11-05"}};
const watchlists=brands.map((b,i)=>({id:"fixture-watch-"+i,workspace_id:brand.id,brand_key:b.id,purpose:"brand",page_ids:[String(12+i)],search_terms:[],countries:["GB"],enabled:true}));
process.stdout.write(JSON.stringify({brand,brands,library,watchlists}));
