import test from "node:test";
import assert from "node:assert/strict";
import { creatorSourceSuggestions } from "../shared/creator-sources.js";
import { evaluateCreator, engagementMetrics, matchesCreator } from "../shared/creator-discovery.js";
import { discoveryProfile, discoveryProfiles, InstagramCreatorVerifier } from "../server/creators/discovery-provider.js";
import { discoverySteps, actorDiscoveryInput, discoveryBatchCount } from "../server/creators/discovery-store.js";
import { creatorBrief, creatorProfile, creatorRow } from "./fixtures/creator-discovery.js";
const at = "2026-11-10T00:00:00.000Z", now=new Date(at);

test("keywords never become account searches; sources follow the quality order",()=>{
  const brief={...creatorBrief,keywords:["home fragrance","candles","home blogger","mum of","interiors creator","candle lover"]};
  const steps=discoverySteps(brief);
  assert.deepEqual(steps.map(s=>s.kind),["partnership","ads","seed","competitor","hashtag"]);
  for(const step of steps.filter(s=>!["ads","competitor"].includes(s.kind))){const input=actorDiscoveryInput(step,"GB",100);assert.equal(input.search,undefined);assert.equal(input.searchType,undefined);}
  assert.deepEqual(discoverySteps({...brief,keywords:[]}),steps);
  assert.throws(()=>actorDiscoveryInput({kind:"keyword",value:"candle lover"} as never,"GB",100));
  assert.equal(discoveryBatchCount(brief),3+Math.ceil((brief.target+brief.seeds.length)/20));
});
test("onboarding suggests editable niche hashtags and real competitor query candidates without fake seeds",()=>{
  const suggestions=creatorSourceSuggestions({category:"candles",primaryCategories:["home fragrance","candles"],discoveryKeywords:["scented candles"],competitors:["Hearth Box","Birch Glow","Willow Scent","Reed Garden"]},["birch_glow"]);
  assert.ok(suggestions.hashtags.length>=10 && suggestions.hashtags.length<=20);
  assert.ok(suggestions.hashtags.includes("homefragrance"));
  assert.ok(suggestions.competitors.length>=3 && suggestions.competitors.length<=8);
  assert.ok(!suggestions.unconfirmedHandles.includes("birch_glow"));
  assert.ok(suggestions.unconfirmedHandles.includes("hearthbox"));
  assert.ok(suggestions.keywords.includes("candles"));
  assert.equal(creatorSourceSuggestions({category:"candles",competitors:[]}).competitors.length,0);
});
test("post discovery takes authors from top and recent posts, never mentioned businesses",()=>{
  const post={id:"1",shortCode:"fixture1",url:"https://www.instagram.com/p/fixture1/",timestamp:at,caption:"#gifted candles @hearthbox",ownerUsername:"harper_person",username:"hearthbox",ownerFullName:"Harper Rowan",likesCount:0,commentsCount:0};
  const [p]=discoveryProfiles([{topPosts:[post],latestPosts:[post,{...post,id:"2",shortCode:"fixture2",url:"https://www.instagram.com/p/fixture2/"}]}],at);
  assert.equal(p.handle,"harper_person");assert.equal(p.name,"Harper Rowan");assert.equal(p.posts.length,2);
  assert.equal(p.posts[0].likes,0);assert.equal(p.followers,null);assert.equal(p.verification,"Unverified");
});
test("public followers set tiers and engagement; strict follower limits reject before official verification",()=>{
  const p=creatorProfile({verification:"Observed (public profile)",growth:{...creatorProfile().growth!,source:"Observed (public profile)"}});
  const e=evaluateCreator(p,creatorBrief,[],now);
  assert.equal(e.screen.disposition,"Results");assert.equal(e.tier,"Micro");assert.equal(e.engagement,.0265);
  assert.ok(matchesCreator({...creatorRow(),profile:p,evaluation:e},{tier:"Micro"},"Results",now));
  for(const followers of [0,50,999,100001]){
    const e=evaluateCreator({...p,followers},creatorBrief,[],now);
    assert.equal(e.screen.disposition,"Rejected");assert.ok(e.screen.rejectedReasons.includes("Outside follower range"));
  }
  for(const followers of [1000,100000])assert.equal(evaluateCreator({...p,followers},creatorBrief,[],now).screen.rules.find(r=>r.id==="followers")!.state,"pass");
  assert.equal(evaluateCreator({...p,followers:50,checkedAt:"2026-08-01"},creatorBrief,[],now).screen.disposition,"Rejected");
  assert.equal(evaluateCreator({...p,followers:null},creatorBrief,[],now).screen.disposition,"Rejected");
  assert.equal(evaluateCreator({...p,growth:undefined,audit:null},creatorBrief,[],now).screen.disposition,"Results");
  assert.equal(evaluateCreator({...p,growth:undefined,audit:null},creatorBrief,[],now).parts.find(p=>p.key==="authenticity")!.points,null);
});
test("business names and handles without personal signals reject; real mixed founders need review",()=>{
  const empty=creatorProfile({name:"Hearth Box Home Fragrance",bio:"UK home fragrance",screening:{...creatorProfile().screening!,category:null,personalAccount:null},posts:[],accountKind:"unknown",website:null});
  for(const patch of [{},{name:"Heather Anne Home Fragrance"},{name:"Flowers",handle:"flowerboxhomefragrance"},{name:"Gifts",handle:"gifts.co"}]){
    const e=evaluateCreator({...empty,...patch},creatorBrief,[],now);assert.equal(e.screen.individual.state,"fail");assert.equal(e.screen.disposition,"Rejected");
  }
  const shop=creatorProfile({screening:{...creatorProfile().screening!,linkKind:"shop"}});
  assert.equal(evaluateCreator(shop,creatorBrief,[],now).screen.disposition,"Rejected");
  const founder={...shop,bio:"I am a UK lifestyle creator and founder of my shop. Candles tutorials.",screening:{...shop.screening!,shopOwner:true}};
  assert.equal(evaluateCreator(founder,creatorBrief,[],now).screen.disposition,"Needs review");
  const onlyOne=creatorProfile({bio:"",name:"fixture_creator",posts:creatorProfile().posts.map(p=>({...p,altText:"",caption:"candles",personPresent:null})),screening:{...creatorProfile().screening!,category:"Digital creator"}});
  assert.ok(evaluateCreator(onlyOne,creatorBrief,[],now).screen.individual.positives.length<2);
  assert.notEqual(evaluateCreator(onlyOne,creatorBrief,[],now).screen.disposition,"Results");
});
test("observed counts preserve unknowns, official upgrade never fills missing official fields from scraper",async()=>{
  for(const bad of [-1,1.5,"10000",Infinity,null])assert.equal(discoveryProfile({username:"person_fixture",followersCount:bad,postsCount:100},at)!.followers,null);
  const p=creatorProfile({verification:"Observed (public profile)"});
  assert.equal(engagementMetrics(p).assessedPosts,12);
  const v=new InstagramCreatorVerifier({env:{EXTER_INSTAGRAM_ACCESS_TOKEN:"fixture-upgrade",EXTER_INSTAGRAM_ACCOUNT_ID:"123"},now:()=>now,fetch:async()=>Response.json({business_discovery:{username:p.handle,followers_count:11000,media:{data:[]}}})});
  const upgraded=await v.verify(p);assert.equal(upgraded.verification,"Verified");assert.equal(upgraded.followers,11000);assert.equal(upgraded.mediaCount,null);assert.equal(upgraded.posts.length,0);
});

test("reported clothing shop and below-range personal handle cannot enter Results",()=>{
  const shop=discoveryProfile({username:"01londonclothing",fullName:"London Clothing",biography:"UK clothing",businessCategoryName:"Clothing store",private:false,followersCount:18000,postsCount:400,externalUrl:"https://clothing.example/shop"},at)!;
  const shopCheck=evaluateCreator(shop,creatorBrief,[],now);
  assert.equal(shopCheck.screen.disposition,"Rejected");assert.ok(shopCheck.screen.rejectedReasons.includes("Business page"));
  const personal=discoveryProfile({username:"anika16115",fullName:"Anika Rowan",biography:"I share my UK lifestyle",private:false,isPersonalAccount:true,followersCount:1000,postsCount:30},at)!;
  const check=evaluateCreator(personal,{...creatorBrief,minFollowers:5000},[],now);
  assert.equal(personal.verification,"Observed (public profile)");assert.equal(check.screen.disposition,"Rejected");assert.ok(check.screen.rejectedReasons.includes("Outside follower range"));
  assert.equal(check.screen.rules.find(r=>r.id==="followers")!.state,"fail");
});
test("explicitly absent public links are known; product handles cannot bypass screening with a creator category",()=>{
  const p=discoveryProfile({username:"genuine_person",fullName:"Harper Rowan",biography:"I share my UK lifestyle",businessCategoryName:"Digital creator",externalUrl:null,followersCount:10000,postsCount:230,private:false,latestPosts:creatorProfile().posts.map(post=>({id:post.id,url:post.url,caption:post.caption,alt:post.altText,timestamp:post.at,likesCount:post.likes,commentsCount:post.comments}))},at)!;
  assert.equal(p.screening?.linkKind,"none");assert.equal(evaluateCreator(p,creatorBrief,[],now).screen.individual.state,"pass");
  const business=evaluateCreator(creatorProfile({handle:"harper_clothing"}),creatorBrief,[],now);
  assert.equal(business.screen.disposition,"Rejected");assert.ok(business.screen.rejectedReasons.includes("Business page"));
});
