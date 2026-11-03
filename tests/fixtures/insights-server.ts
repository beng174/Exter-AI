/** Isolated browser fixture. No provider calls, paid analyses or production data. */
import express from "express";
import { resolve } from "node:path";
import { openDatabase } from "../../server/db.js";
import { createApp } from "../../server/app.js";
import type { Ad, Brand } from "../../shared/types.js";
const db=openDatabase(":memory:",false),app=createApp(db);
const brand:Brand={id:"valentte",name:"Valentte",domain:"valentte.com",category:"Home fragrance & gifting",color:"#0C1F96",initials:"CF",voice:["Warm","Clear"],competitors:[],mode:"imported",createdAt:"2026-11-01T00:00:00Z"};
const competitor={...brand,id:"comparison-fixture",name:"Aery Living",domain:"aeryliving.com"};
const owned={...brand,id:"outcome-fixture",name:"Outcome Test Fixture",domain:"outcome-fixture.example"};
for(const b of [brand,competitor,owned])db.prepare("INSERT INTO brands VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(b.id,JSON.stringify(b));
const field=(value:string)=>({value,confidence:.1,timestamps:[{startSeconds:0,endSeconds:2}]});
for(const b of [brand,competitor])for(let index=0;index<(b===brand?14:7);index++){
  const ad={id:`${b.id}-${index}`,brandId:b.id,brand:b.name,providerAdId:`900000000000${b===brand?1:2}${String(index).padStart(2,"0")}`,platform:"Meta",source:"public",owned:false,metricsAvailable:false,title:`Fixture creative ${index+1}`,copy:"Fixture creative, for UI testing only.",category:b.category,format:"Video",angle:"Not recorded",audience:"Not recorded",publishedAt:"2026-11-01T00:00:00Z",observedAt:"2026-11-02T00:00:00Z",active:true,impressions:0,engagements:0,conversions:null,spend:null,revenue:null,image:"",color:b.color,sourceUrl:null} as Ad;
  ad.advertiserPageId="172851066181411"; ad.sourceUrl=`https://www.facebook.com/ads/library/?id=${ad.providerAdId}`;
  db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id,b.id,ad.source,ad.platform,ad.publishedAt,JSON.stringify(ad));
  const fields={format:field("studio"),hook:field(index<6?"A creator opens a newly delivered branded package":index<10?"A question asks which fragrance makes the best gift":"A founder tells the origin story of the brand"),angle:field(index<5?"Bundle and save discount promotion":index<10?"Thoughtful gifting with home fragrance":"Brand origin story from a kitchen table"),keyClaims:[],spokenTranscript:[],onScreenText:[],cta:field("Shop now"),creatorEvidence:[],personTalkingToCamera:{...field("false"),value:false},...(index<2?{offer_explanation:field("Bundle and save")}: {})};
  const result={id:`analysis-${ad.id}`,adId:ad.id,brandId:b.id,mediaId:`fixture-${ad.id}`,mediaSha256:"fixture",createdAt:"2026-11-02T01:00:00Z",promptVersion:"exter-native-video-v1",coverage:{durationSeconds:2},fields};
  db.prepare("INSERT INTO video_analysis_runs VALUES (?,?,?,?,?)").run(result.id,b.id,ad.id,result.createdAt,JSON.stringify(result));
}
for(let index=0;index<2;index++){
  const ad={id:`owned-${index}`,providerAdId:`account-${index}`,brandId:owned.id,brand:owned.name,platform:"Meta",source:"import",owned:true,metricsAvailable:true,title:`Owned test creative ${index+1}`,copy:"",angle:"Product education",audience:"Provided test audience",format:"Video",category:owned.category,publishedAt:"2026-11-01T00:00:00Z",metricDate:"2026-11-02",observedAt:"2026-11-03T00:00:00Z",currency:"GBP",conversionEvent:"purchase",conversions:index?0:10,spend:100,revenue:index?0:300,impressions:10000,engagements:200,sourceUrl:null,image:"",color:"#0C1F96",active:true} as Ad;
  db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id,owned.id,ad.source,ad.platform,ad.publishedAt,JSON.stringify(ad));
}
app.use(express.static(resolve("dist")));app.get("/{*path}",(_req,res)=>res.sendFile(resolve("dist/index.html")));
const server=app.listen(Number(process.env.PORT||3107),"127.0.0.1",()=>console.log("Isolated insight fixture ready"));
process.once("SIGTERM",()=>server.close(()=>{db.close();process.exit(0);}));
