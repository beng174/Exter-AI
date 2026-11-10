import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { CREATOR_RULE_VERSION, evaluateCreator, matchesCreator, creatorCsv, creatorPrecision, parseCreatorLabels, ukCreatorSignals, type DiscoveryProfile } from "../shared/creator-discovery.js";
import { CREATOR_ENGAGEMENT_BANDS, commentQuality, linkKind } from "../shared/creator-screening.js";
import { discoveryProfile } from "../server/creators/discovery-provider.js";
import { creatorBrief, creatorProfile, creatorRow } from "./fixtures/creator-discovery.js";
const now=new Date("2026-11-10T12:00:00Z");
const screen=(p:Partial<DiscoveryProfile>={},brief=creatorBrief)=>evaluateCreator(creatorProfile(p),brief,[],now).screen;
const rule=(id:string,p:Partial<DiscoveryProfile>={},brief=creatorBrief)=>screen(p,brief).rules.find(r=>r.id===id)!;
test("strict screening accepts a genuine individual only when every hard rule passes",()=>{
  const s=screen();assert.equal(s.disposition,"Results");assert.equal(s.rules.length,9);assert.ok(s.rules.every(r=>r.state==="pass"));
  for(const patch of [{growth:undefined},{audit:null},{screening:undefined},{verification:"Unverified" as const},{private:null}]) assert.equal(screen(patch).disposition,"Needs review");
});
test("business categories, sales bios, shop links and product-only feeds fail",()=>{
  for(const category of ["Shopping and retail","Brand","Product/service","Local business","Restaurant","Shop","Agency","Magazine","Media","Publisher","News","Community","Organisation","Non-profit","School"]){assert.equal(rule("individual",{screening:{...creatorProfile().screening!,category}}).state,"fail",category);}
  for(const bio of ["Our shop","The official store","Our studio","Scent co.","Example ltd","Our boutique brand","DM to order","Shop now","Worldwide shipping","Free delivery","Discount code for our candles","Talent management"]){assert.equal(rule("individual",{bio}).state,"fail",bio);}
  assert.equal(rule("individual",{screening:{...creatorProfile().screening!,linkKind:"shop"}}).state,"fail");
  const products=creatorProfile().posts.map(p=>({...p,altText:"Product-only candle catalogue image, no people",personPresent:false,productOnly:true}));
  assert.equal(rule("individual",{posts:products}).state,"fail");
  assert.equal(rule("individual",{posts:creatorProfile().posts.map(p=>({...p,altText:undefined}))}).state,"review");
});
test("repost pages are rejected and an individual shop owner needs review",()=>{
  for(const bio of ["Meme page","Daily quotes","Fan page","Tag us","DM for features","Credit to owners","Daily inspo","Reposting beautiful homes","Featuring page"]){const s=screen({bio});assert.equal(s.disposition,"Rejected",bio);assert.ok(s.rejectedReasons.includes("Repost page"));}
  const s=screen({bio:"I am a UK candle creator and founder of my shop. My favourite home fragrance tutorials.",screening:{...creatorProfile().screening!,shopOwner:true,linkKind:"shop"}});
  assert.equal(rule("individual",{bio:"I own my talent management agency and shop",screening:{...creatorProfile().screening!,category:"Agency",shopOwner:true,linkKind:"shop"}}).state,"fail");
  assert.equal(s.individual.state,"review");assert.equal(s.disposition,"Needs review");assert.ok(s.individual.positives.length>=2);
  assert.equal(screen({name:"Account",bio:"Candles home fragrance UK",accountKind:"unknown",screening:{...creatorProfile().screening!,category:null},posts:creatorProfile().posts.map(p=>({...p,caption:"Candles",altText:"product-only no people"}))}).disposition,"Rejected");
});
test("follower bounds use official counts only; location requires two independent UK signals",()=>{
  assert.equal(rule("followers",{followers:1000}).state,"pass");assert.equal(rule("followers",{followers:100000}).state,"pass");
  for(const followers of [999,100001])assert.equal(rule("followers",{followers}).state,"fail");
  assert.equal(rule("followers",{followers:null}).state,"review");assert.equal(rule("followers",{checkedAt:"2026-09-01"}).state,"review");assert.equal(rule("followers",{verification:"Unverified"}).state,"review");
  const posts=creatorProfile().posts.map(p=>({...p,caption:"Candle tutorial",location:undefined}));
  assert.equal(rule("country",{bio:"I am based in London",website:null,posts}).state,"review");
  assert.equal(ukCreatorSignals(creatorProfile({bio:"I am based in London",website:null,posts})).signalCount,1);
  assert.equal(rule("country",{bio:"I am based in London. My favourite colour.",website:null,posts}).state,"pass");
  assert.equal(rule("country",{bio:"I am based in Dubai"}).state,"fail");assert.equal(rule("country",{bio:"Based in Dubai"},{...creatorBrief,country:"ALL"}).state,"pass");
});
test("niche needs a matching bio or three of twelve posts; styles cannot be compensated by fit",()=>{
  const posts=creatorProfile().posts.map((p,i)=>({...p,caption:i<3?"#candlefixture tutorial":"Weekend photograph",altText:"Person smiling"}));
  assert.equal(rule("niche",{bio:"My UK lifestyle diary",posts}).state,"pass");
  posts[2].caption="Weekend photograph";assert.equal(rule("niche",{bio:"My UK lifestyle diary",posts}).state,"fail");
  assert.equal(rule("niche",{bio:"My UK lifestyle diary",posts:posts.slice(0,2)}).state,"review");
  assert.equal(rule("niche",{bio:"I share home fragrance",posts:[]}).state,"pass");
  assert.equal(rule("style",{bio:"I share home fragrance",posts:posts.map(p=>({...p,caption:"Candle photographs"}))}).state,"fail");
  assert.equal(rule("style",{}, {...creatorBrief,styles:[]}).state,"pass");
});
test("activity, account access and brief exclusions are hard gates",()=>{
  const posts=creatorProfile().posts.map(p=>({...p,at:"2026-10-11T12:00:00Z"}));
  assert.equal(rule("active",{posts,mediaCount:12}).state,"pass");posts[0].at="2026-10-11T11:59:59Z";
  assert.equal(rule("active",{posts:posts.slice(0,1)}).state,"fail");
  assert.equal(rule("active",{mediaCount:11}).state,"fail");assert.equal(rule("active",{mediaCount:null}).state,"review");
  assert.equal(rule("active",{posts:creatorProfile().posts.map(p=>({...p,at:"2026-12-01"}))}).state,"review");
  assert.equal(rule("public",{private:true}).state,"fail");assert.equal(rule("exclusions",{handle:"excluded_fixture"}).state,"fail");
  assert.equal(rule("exclusions",{bio:"I am 17, UK lifestyle creator"}).state,"fail");
});
test("audience plausibility, generic comments and follower jumps cannot silently pass",()=>{
  const p=creatorProfile();
  for(const rate of [0,.16])assert.equal(rule("audience",{posts:p.posts.map(p=>({...p,likes:rate*10000,comments:0}))}).state,"fail");
  for(const fraction of ["genericFraction","emojiFraction","repeatedFraction"] as const)assert.equal(rule("audience",{audit:{...p.audit!,[fraction]:.6}}).state,"fail");
  assert.equal(rule("audience",{growth:{...p.growth!,previousFollowers:4000}}).state,"fail");
  assert.equal(rule("audience",{audit:{...p.audit!,genericFraction:NaN}}).state,"review");
  assert.equal(rule("audience",{audit:{...p.audit!,postIds:["not-in-latest-posts"]}}).state,"review");
  assert.equal(rule("audience",{growth:{...p.growth!,to:"2027-01-01"}}).state,"review");
  assert.deepEqual(commentQuality(["🔥🔥","Nice post","I used this tip in my kitchen yesterday"]),{genericFraction:2/3,emojiFraction:1/3});
  assert.equal(CREATOR_ENGAGEMENT_BANDS.Micro.max,.15);
});
test("filters, saved segments and CSV cannot include failed, uncertain, stale or expired rules",()=>{
  const row=creatorRow({growth:undefined});assert.equal(row.evaluation.screen.disposition,"Needs review");
  assert.equal(matchesCreator(row,{}),false);assert.equal(matchesCreator(row,{review:true}),false);
  assert.ok(matchesCreator(row,{},"Needs review"));assert.equal(creatorCsv([row]).split("\r\n").length,1);
  const good=creatorRow();assert.ok(matchesCreator(good,{},"Results",now));good.evaluation.ruleVersion="old";assert.equal(matchesCreator(good,{}),false);
  good.evaluation.ruleVersion=CREATOR_RULE_VERSION;assert.equal(matchesCreator(good,{},"Results",new Date("2027-01-01")),false);
});
test("public projection preserves only coarse business flags and bounded public descriptions",()=>{
  const p=discoveryProfile({username:"fixture_owner",fullName:"Harper Rowan",biography:"I own my shop. Open daily 9am to 5pm. 14 Example Road",businessCategoryName:"Digital creator",externalUrl:"https://store.example/products/candle",private:false,latestPosts:[{id:"1",url:"https://www.instagram.com/p/fixture/",timestamp:"2026-11-10",alt:"A person holding a candle",caption:"My tutorial"}]},now.toISOString())!;
  assert.equal(p.screening?.linkKind,"shop");assert.ok(p.screening?.businessAddress);assert.ok(p.screening?.openingHours);assert.ok(p.screening?.shopOwner);assert.ok(!JSON.stringify(p).includes("Example Road"));assert.equal(p.posts[0].altText,"A person holding a candle");assert.equal(p.followers,null);
  assert.equal(discoveryProfile({username:"fixture_unknown"},now.toISOString())!.private,null);
  assert.equal(linkKind("https://fictional.myshopify.com"),"shop");assert.equal(linkKind("https://www.etsy.com/shop/fixture"),"shop");assert.equal(linkKind("https://fixture.example/blog"),"blog");assert.equal(linkKind("https://fixture.example"),"unknown");
});
test("individual precision needs labelled business and repost negatives; legacy labels never release gates",()=>{
  const rows=Array.from({length:20},(_,i)=>creatorRow({handle:`fixture_${i}`}));
  const csv="handle,good_fit,is_uk,is_individual,account_type,notes\n"+rows.map(r=>`${r.profile.handle},yes,yes,yes,individual,`).join("\n");
  const labels=parseCreatorLabels(csv);assert.ok(creatorPrecision(labels,rows,"fixture-brief",now.toISOString(),false).every(c=>!c.clientReady));
  rows.push(creatorRow({handle:"fixture_business",accountKind:"brand"}),creatorRow({handle:"fixture_repost",accountKind:"repost"}));
  const all=parseCreatorLabels(csv+"\nfixture_business,no,yes,no,business,\nfixture_repost,no,yes,no,repost,");
  const checks=creatorPrecision(all,rows,"fixture-brief",now.toISOString(),false);assert.ok(checks.every(c=>c.clientReady));assert.equal(checks.find(c=>c.field==="Individual creator")!.precision,1);
  assert.ok(creatorPrecision(all,rows,"fixture-brief",now.toISOString(),true).every(c=>!c.clientReady));
  assert.throws(()=>parseCreatorLabels("handle,good_fit,is_uk,is_individual,account_type,notes\nbad,yes,yes,yes,business,"));
});

test("fixture label set includes business and repost known negatives and an ambiguous creator-owner",()=>{
  const labels=parseCreatorLabels(readFileSync(new URL("./fixtures/creator-labels.csv",import.meta.url),"utf8"));
  for(const type of ["business","repost"])assert.ok(labels.some(l=>l.account_type===type && l.is_individual===false && !l.good_fit));
  assert.ok(labels.some(l=>l.handle==="fixture_owner" && l.is_individual && !l.good_fit));
});
