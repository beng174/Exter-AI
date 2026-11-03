import { test } from "node:test";
import assert from "node:assert/strict";
import { messageSignals, patternPopulation, treemap } from "../shared/creative-insights.js";
import { ownedOutcomes } from "../shared/owned-outcomes.js";
import type { DemoPattern } from "../shared/brand-demo.js";
import type { DemoGalleryCreative } from "../shared/creative-gallery.js";
import type { Ad } from "../shared/types.js";

const pattern = (label: string, count: number, prefix = label): DemoPattern => ({value:label,label,count,denominator:14,totalAnalysed:14,share:count/14,evidence:Array.from({length:count},(_,i)=>({kind:"ad",adId:`${prefix}-${i}`,sourceUrl:null,quote:label}))});
test("14 original analyses populate a complete chart without rewriting fixed labels or source evidence",()=>{
  const originals=[pattern("A creator opens a branded package",5),pattern("A presenter reveals a newly delivered box",3),pattern("A question asks what makes a fragrance special",4),pattern("A founder tells a brand story",2)];
  const before=JSON.stringify(originals),p=patternPopulation("hookType",[],originals,undefined,14);
  assert.equal(p.total,14);assert.equal(p.labelled,0);assert.equal(p.described,14);assert.equal(p.missing,0);
  assert.equal(p.groups.find(g=>g.label==="Product reveal & demo")?.count,8);
  assert.equal(p.groups.reduce((n,g)=>n+g.count,0),14);
  assert.equal(p.groups.flatMap(g=>g.evidence).length,14);
  assert.equal(JSON.stringify(originals),before,"The reading projection must not mutate immutable analyses");
});
test("two recorded offers retain the twelve unknown ads in the full sample denominator",()=>{
  const p=patternPopulation("offerType",[],[pattern("Bundle and save",2)],undefined,14);
  assert.equal(p.groups.find(g=>g.id==="missing")?.count,12);
  assert.equal(p.described,2);assert.equal(p.missing,12);assert.equal(p.labelled,0);
  assert.equal(p.groups.reduce((n,g)=>n+g.count,0),14);
  const mixed=patternPopulation("angle",[pattern("gifting",3)],[pattern("Brand origin story",4)],undefined,10);
  assert.deepEqual([mixed.labelled,mixed.described,mixed.missing],[3,4,3]);
  assert.equal(patternPopulation("angle",[],[],undefined,0).groups.length,0);
});
test("treemap area matches population, tiles stay in bounds and do not overlap",()=>{
  const rows=[{id:"a",value:8},{id:"b",value:4},{id:"c",value:2},{id:"ignored",value:0}];
  const tiles=treemap(rows);assert.equal(tiles.length,3);
  for(const tile of tiles){assert.ok(tile.x>=0&&tile.y>=0&&tile.x+tile.width<=100.00001&&tile.y+tile.height<=100.00001);assert.ok(Math.abs(tile.width*tile.height/10000-rows.find(r=>r.id===tile.id)!.value/14)<1e-10);}
  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){const a=tiles[i],b=tiles[j];assert.ok(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<1e-8||Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<1e-8);}
});
test("audience needs and voice use supported saved evidence and each ad counts once",()=>{
  const field=(value:string)=>({value,confidence:0.01,timestamps:[{startSeconds:0,endSeconds:2}]});
  const creative=(adId:string,angle:string)=>({adId,analysis:{mediaKind:"video",fields:{hook:field("A founder tells a story"),angle:field(angle),keyClaims:[],onScreenText:[]}}}) as unknown as DemoGalleryCreative;
  const result=messageSignals([creative("gift","Premium gifting with a discount"),creative("unknown","unrecorded subject"),{adId:"pending",analysis:null} as DemoGalleryCreative]);
  assert.equal(result.total,2);assert.deepEqual(result.audience.find(g=>g.id==="gifting")?.adIds,["gift"]);
  assert.equal(result.audience.reduce((n,g)=>n+g.adIds.length,0)+result.audienceUnrecorded.length,2);
  assert.equal(result.voice.reduce((n,g)=>n+g.adIds.length,0)+result.voiceUnrecorded.length,2);
  const unsupported=creative("unsupported","Gifting");unsupported.analysis!.fields.angle={value:"Gifting",confidence:1,timestamps:[]} as never;
  unsupported.analysis!.fields.hook={value:"unknown",confidence:1,timestamps:[]} as never;
  assert.deepEqual(messageSignals([unsupported]).audienceUnrecorded,["unsupported"]);
});
const ad=(id:string,overrides:Partial<Ad>={}):Ad=>({id,providerAdId:id,platform:"Meta",brandId:"owned",brand:"Owned",source:"import",owned:true,metricsAvailable:true,title:id,metricDate:"2026-11-02",publishedAt:"2026-11-02T00:00:00Z",observedAt:"2026-11-03T00:00:00Z",currency:"GBP",conversionEvent:"purchase",conversions:10,spend:100,revenue:300,...overrides}) as Ad;
test("owned outcomes exclude public, sample and competitor results and keep zero distinct from unavailable",()=>{
  const result=ownedOutcomes([ad("a"),ad("zero",{conversions:0,spend:50,revenue:0}),ad("public",{source:"public"}),ad("competitor",{owned:false}),ad("sample",{source:"sample"}),ad("unknown",{conversions:null}),ad("not-measured",{metricsAvailable:false})]);
  assert.equal(result.measuredAds,2);assert.equal(result.cohorts.length,1);
  const cohort=result.cohorts[0];assert.equal(cohort.conversions,10);assert.equal(cohort.cpa,15);assert.equal(cohort.comparable,true);
  assert.equal(cohort.rows.find(r=>r.adId==="zero")?.conversions,0);assert.equal(cohort.rows.find(r=>r.adId==="zero")?.cpa,null);
  assert.equal(cohort.rows.find(r=>r.adId==="a")?.roas,3);
  assert.equal(ownedOutcomes([ad("public",{source:"public"})]).status,"unavailable");
});
test("conversion comparisons separate currency, event, platform and day; repeated snapshots are not added",()=>{
  const result=ownedOutcomes([ad("old",{providerAdId:"same",conversions:7,observedAt:"2026-11-02T12:00:00Z"}),ad("new",{providerAdId:"same",conversions:10}),ad("usd",{currency:"USD"}),ad("lead",{conversionEvent:"lead"}),ad("tiktok",{platform:"TikTok"}),ad("yesterday",{metricDate:"2026-11-01"}),ad("missing-date",{metricDate:undefined}),ad("invalid-date",{metricDate:"2026-02-30"})]);
  assert.equal(result.cohorts.length,7);assert.equal(result.cohorts.find(c=>c.comparable&&c.currency==="GBP"&&c.conversionEvent==="purchase"&&c.platform==="Meta"&&c.date==="2026-11-02")?.conversions,10);
  assert.equal(result.cohorts.filter(c=>!c.comparable).length,2);
  const paired=ownedOutcomes([ad("matched"),ad("no-spend",{spend:null,conversions:100})]).cohorts[0];
  assert.equal(paired.conversions,110);assert.equal(paired.cpa,10,"CPA only uses conversions paired with spend on the same records");
});
