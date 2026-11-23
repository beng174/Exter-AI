import type {CreatorCampaign} from '../../shared/creator-campaigns.js';
const scope={account:'reported',currency:'GBP',attribution:'reported',event:'reported',category:'candles',product:'Candle starter kit'};
export function forecastFixture(count=60):CreatorCampaign[]{return Array.from({length:count},(_,i)=>{
 const from=new Date(Date.UTC(2025,0,1+i*5)).toISOString().slice(0,10),to=new Date(Date.parse(from)+86400000).toISOString().slice(0,10),features=Array.from({length:10},(_,j)=>j<5?(i%10)/10:0),roas=1+(i%10)/3;
 return {id:'campaign-'+i,handle:'creator_'+i,brand:'Fictional Candle House',platform:'Meta',from,to,scope:{...scope,format:'video'},spend:100,revenue:roas*100,roas,cpa:10,purchases:10,hookRate:.3,holdRate:.2,adIds:[String(90000+i)],source:'Owned',recordedAt:new Date(Date.parse(to)+86400000).toISOString(),features,featureAt:new Date(Date.parse(from)-86400000).toISOString(),fixture:true,adOutcomes:[{adId:String(90000+i),familyId:'family-'+i,roas,benchmark:2}]};
});}
