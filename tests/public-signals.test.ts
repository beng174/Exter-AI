import {test,after} from "node:test";
import assert from "node:assert/strict";
import {mkdir,mkdtemp,writeFile,rm} from "node:fs/promises";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {publishedReach,publishedAdDetails} from "../shared/meta-public.js";
import {publicSignalTiles,publicAudienceBars,publicVersions} from "../shared/public-signals.js";
import {mergePublicEvidence,type PublicObservation} from "../server/infrastructure/meta-evidence.js";
import {browserCreative} from "./fixtures/creative-browser.js";
await mkdir(resolve("work"),{recursive:true});const dir=await mkdtemp(resolve("work/public-signals-render-"));
const bundle=await build({entryPoints:["src/components/creatives/PublicPerformance.tsx"],bundle:true,format:"esm",platform:"node",write:false,external:["react","react-dom","lucide-react"],loader:{".css":"empty"}});const file=join(dir,"components.mjs");await writeFile(file,bundle.outputFiles[0].contents);const {PublicPerformance}=await import(pathToFileURL(file).href);after(()=>rm(dir,{recursive:true,force:true}));
const raw={total_reach_by_location:[{key:"UK",value:3500},{key:"FR",value:700}],eu_total_reach:0,age_country_gender_reach_breakdown:[{country:"GB",age_gender_breakdowns:[{age_range:"25-34",female:2100,male:0}]}],target_ages:["25-34","35-44"],target_gender:"Female",target_locations:[{name:"United Kingdom",type:"country"},{country:"FR"}],publisher_platforms:["FACEBOOK","INSTAGRAM","AUDIENCE_NETWORK"],languages:["en","fr"]};
test("official public details retain chosen targeting, languages and platforms separately from reached demographics",()=>{
 const details=publishedAdDetails(raw);assert.deepEqual(details.targetAges,["25-34","35-44"]);assert.deepEqual(details.targetGenders,["Women"]);assert.deepEqual(details.targetLocations,["United Kingdom","France"]);assert.deepEqual(details.platforms,["Facebook","Instagram","Audience Network"]);assert.deepEqual(details.languages,["English","French"]);
 assert.deepEqual(publishedAdDetails({target_ages:[null,"unknown",false,"{{age}}"],target_gender:"None",target_locations:[{id:"123"},"https://fixture.invalid"],publisher_platforms:["unknown"],languages:[null,"unknown"]}),{targetAges:[],targetGenders:[],targetLocations:[],platforms:[],languages:[]});
});
test("reach tiles preserve observed zero and every country; the estimated daily rate exposes the actual arithmetic",()=>{
 const row=browserCreative({daysRunning:35,publicReach:publishedReach(raw),publicDetails:publishedAdDetails(raw)}),tiles=publicSignalTiles(row,[row]);
 assert.equal(tiles.find(t=>t.id==="uk")?.value,3500);assert.equal(tiles.find(t=>t.id==="eu")?.value,0);assert.equal(tiles.find(t=>t.id==="country-FR")?.value,700);
 const rate=tiles.find(t=>t.id==="daily")!;assert.equal(rate.basis,"Estimated");assert.equal(rate.value,"100");assert.match(rate.tooltip!,/3,500 UK reach ÷ 35 days running = 100/);
 for(const tile of tiles.filter(t=>t.id!=="daily"))assert.equal(tile.basis,"Observed");
 assert.deepEqual(publicAudienceBars(row).map(b=>b.value),[2100,0]);assert.ok(publicAudienceBars(row)[0].label.includes("Women"));
});
test("missing public values create no tiles or bars, and zero days never creates a daily rate",()=>{
 const empty=browserCreative({copy:"",placements:[],daysRunning:null,publicReach:publishedReach({})});assert.deepEqual(publicSignalTiles(empty,[empty]),[]);assert.deepEqual(publicAudienceBars(empty),[]);
 for(const daysRunning of [null,0,-1,NaN])assert.ok(!publicSignalTiles({...empty,daysRunning,publicReach:publishedReach(raw)},[]).some(t=>t.id==="daily"));
 const zero=publicSignalTiles({...empty,daysRunning:5,publicReach:publishedReach({eu_total_reach:0})},[]);assert.equal(zero.find(t=>t.id==="daily")?.value,"0");assert.equal(zero.find(t=>t.id==="daily")?.note,"EU reach");
});
test("versions count unique same-brand public ads matching exact media or full copy, without similar text or truncated-prefix matches",()=>{
 const row=browserCreative({copy:"Full source copy",mediaSha256:"a".repeat(64)}),copy=browserCreative({adId:"copy",nativeId:"2",copy:"Full  source\ncopy"}),media=browserCreative({adId:"media",nativeId:"3",copy:"Different words",mediaSha256:"a".repeat(64)});
 const rows=[row,copy,{...copy,adId:"duplicate-import",platform:"Facebook"},media,browserCreative({adId:"other",nativeId:"4",brandId:"different",copy:row.copy}),browserCreative({adId:"private",nativeId:"5",owned:true,copy:row.copy}),browserCreative({adId:"similar",nativeId:"6",copy:"Full source copy, with another sentence"})];
 assert.equal(publicVersions(row,rows),3);assert.equal(publicVersions({...row,copyTruncated:true,mediaSha256:null},rows),null);assert.equal(publicVersions({...row,copy:"",mediaSha256:null},rows),null);assert.equal(publicVersions({...row,owned:true},rows),null);
  assert.equal(publicVersions(row,[...rows,browserCreative({adId:"also-public",nativeId:"7",owned:true,publicEvidence:true,copy:row.copy})]),4,"an owned ad with independent public evidence can still count as a public version");
 assert.equal(publicVersions({...row,copy:"{{product.name}}",mediaSha256:null},rows),null);
});
test("public Performance contains no private-outcome tiles or Unavailable placeholders, even for the workspace's own public ad",()=>{
 const row=browserCreative({workspaceBrand:true,owned:false,publicReach:publishedReach(raw),publicDetails:publishedAdDetails(raw),daysRunning:35});
 const html=renderToStaticMarkup(createElement(PublicPerformance,{row,creatives:[row],onEvidence:()=>{}}));
 for(const label of ["UK reach","EU reach","France reach","Reach per day","Target ages","Target gender","Target locations","Platforms","Languages","Versions","Reach by age and gender"])assert.ok(html.includes(label),label);
 for(const privateLabel of ["Spend","Impressions","Clicks","Conversions","ROAS","CPA","Unavailable"])assert.ok(!html.includes(privateLabel),privateLabel);
 assert.match(html,/title="3,500 UK reach/);assert.match(html,/Observed/);assert.match(html,/Estimated/);assert.match(html,/Audience Network/);
});
test("the public read projection carries collected targeting and preserves paid analyses and private outcomes untouched",()=>{
 const saved=browserCreative(),observation:PublicObservation={native_id:saved.nativeId,advertiser_id:"12",brand_key:saved.brandId,page_ids:["12"],observed_at:"2026-11-05T09:00:00Z",first_seen_at:"2026-11-01",start_time:"2026-10-01",stop_time:null,raw_payload:raw};
 const [row]=mergePublicEvidence([saved],[observation],{id:saved.brandId,name:saved.brandName,domain:"fixture.example"},[]);assert.deepEqual(row.publicDetails?.targetGenders,["Women"]);assert.deepEqual(row.publicDetails?.languages,["English","French"]);assert.equal(row.analysis,saved.analysis);assert.equal(row.performance,saved.performance);assert.equal(saved.publicDetails,undefined);
});
