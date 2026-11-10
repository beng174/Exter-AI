import { test } from "node:test";
import assert from "node:assert/strict";
import { ApifyCreatorProvider, normaliseApifyCreators } from "../server/creators/apify.js";
import { CreatorProviderError } from "../server/creators/types.js";

const token = "fixture-apify-secret-never-exposed";
const env = { APIFY_TOKEN: token, APIFY_INSTAGRAM_ACTOR_ID: "fixture/instagram-scraper", APIFY_TIKTOK_ACTOR_ID: "fixture/tiktok-scraper", APIFY_REQUEST_RESERVE_GBP: "0.75" };
const observedAt = "2026-11-02T12:00:00.000Z";
const query = { platform: "instagram" as const, country: "GB", category: "home fragrance", maxProfiles: 5 };
const json = (body: unknown, status = 200, headers: Record<string,string> = {}) => new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json",...headers}});
const ig = { username:"real.creator",fullName:"Real Creator",followersCount:12000,followsCount:250,postsCount:400,biography:"Home scent reviews",latestPosts:[
  {id:"post-two",shortCode:"example_two",timestamp:"2026-11-01T12:00:00Z",caption:"Gift ideas",videoViewCount:2500,likesCount:100,commentsCount:12},
  {id:"post-one",shortCode:"example_one",timestamp:"2026-10-28T12:00:00Z",caption:"Fragrance review",likesCount:80},
]};

test("Apify status is a configuration read with no network requests and requires explicit actor and reserve setup",async()=>{
  let calls=0;
  const provider=new ApifyCreatorProvider({env:{APIFY_TOKEN:token},fetch:async()=>{calls++;return json({});}});
  assert.equal(provider.status().configured,false);assert.deepEqual(provider.status().platforms,[]);assert.match(provider.status().message??"",/APIFY_REQUEST_RESERVE_GBP/);
  await assert.rejects(()=>provider.search(query),(error:unknown)=>error instanceof CreatorProviderError&&error.code==="configuration");
  assert.equal(calls,0);
  assert.equal(new ApifyCreatorProvider({env}).status().configured,true);
});

test("a public Instagram search reserves the data-provider budget before actor dispatch and preserves observed metric evidence",async()=>{
  const events:string[]=[];let requestBody:any;const calls:URL[]=[];
  const provider=new ApifyCreatorProvider({env,now:()=>new Date(observedAt),sleep:async()=>{},reserve:async(amount,context)=>{assert.equal(amount,0.75);assert.equal(context.actorId,"fixture~instagram-scraper");events.push("reserve");return{reservationId:"reserve-one",reservedGbp:0.75};},
    fetch:async(input,init)=>{
      const url=new URL(String(input));calls.push(url);assert.equal(url.origin,"https://api.apify.com");assert.equal(new Headers(init?.headers).get("Authorization"),`Bearer ${token}`);assert.equal(init?.redirect,"manual");assert.equal(url.searchParams.has("token"),false);
      if(url.pathname.endsWith("/runs")){assert.equal(url.searchParams.get("timeout"),"900");events.push("start");requestBody=JSON.parse(String(init?.body));return json({data:{id:"run-one",status:"RUNNING"}});}
      if(url.pathname==="/v2/actor-runs/run-one")return json({data:{id:"run-one",status:"SUCCEEDED",usageTotalUsd:0.125,defaultDatasetId:"dataset-one"}});
      assert.equal(url.pathname,"/v2/datasets/dataset-one/items");return json([ig]);
    }});
  const result=await provider.search(query);
  assert.deepEqual(events,["reserve","start"]);assert.equal(calls.length,3);assert.equal(requestBody.search,"home fragrance GB");assert.equal(requestBody.searchType,"user");assert.equal(requestBody.resultsType,"details");
  const profile=result.profiles[0];assert.equal(profile.followers,12000);assert.equal(profile.country,null,"a country query is not country evidence");assert.equal(profile.category,null);assert.equal(profile.sourceUrl,"https://www.instagram.com/real.creator/");
  assert.equal(profile.recentPosts[0].views,2500);assert.equal(profile.recentPosts[1].views,null);assert.equal(profile.recentPosts[1].comments,null);assert.equal(profile.recentPosts[0].shares,null);
  assert.deepEqual(profile.metricCoverage,{postsSampled:2,postsWithViews:1,postsWithLikes:2,postsWithComments:1,postsWithShares:0,followersAvailable:true});
  assert.ok(profile.evidence?.some(item=>item.field==="followers"&&item.value===12000&&item.observedAt===observedAt));
  assert.deepEqual(result.accounting,{reservedCostGbp:0.75,billedCostGbp:.1,requestAttempts:1,runIds:["run-one"],reservationId:"reserve-one",runStatus:"SUCCEEDED",billedCostUsd:.125});assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(result.warnings.some(warning=>warning.includes("not verified creator residence")));
});

test("budget refusal prevents every billable actor request",async()=>{
  let calls=0;
  const provider=new ApifyCreatorProvider({env,reserve:async()=>{throw new Error(token);},fetch:async()=>{calls++;return json({});}});
  await assert.rejects(()=>provider.search(query),(error:unknown)=>{
    assert.ok(error instanceof CreatorProviderError);assert.equal(error.code,"budget_paused");assert.equal(error.accounting?.requestAttempts,0);assert.equal(error.accounting?.reservedCostGbp,null);assert.ok(!JSON.stringify(error).includes(token));return true;
  });assert.equal(calls,0);
});

test("TikTok public post rows normalize real author counts and retain the newest bounded sample",async()=>{
  const rows=[1,2,3].map(day=>({id:String(day),webVideoUrl:`https://www.tiktok.com/@scent.reviewer/video/${day}?signed=secret`,authorMeta:{name:"scent.reviewer",nickName:"Scent Reviewer",fans:4321,following:120,video:40,signature:"Honest reviews"},createTimeISO:`2026-10-0${day}T00:00:00Z`,text:`Review ${day}`,playCount:day*100,diggCount:day*5,commentCount:day,shareCount:0}));
  const result=normaliseApifyCreators(rows,"tiktok",{observedAt,maxProfiles:5,maxPostsPerProfile:2});
  assert.equal(result.length,1);assert.equal(result[0].followers,4321);assert.equal(result[0].following,120);assert.equal(result[0].postsCount,40);assert.deepEqual(result[0].recentPosts.map(post=>post.id),["3","2"]);assert.equal(result[0].recentPosts[0].shares,0);assert.ok(!JSON.stringify(result).includes("signed="));
  let body:any;
  const provider=new ApifyCreatorProvider({env,reserve:async()=>({reservationId:"tiktok-hold",reservedGbp:0.75}),fetch:async(input,init)=>{
    const url=new URL(String(input));if(url.pathname.endsWith("/runs")){body=JSON.parse(String(init?.body));return json({data:{id:"run-tiktok",status:"SUCCEEDED",usageTotalUsd:0.125,defaultDatasetId:"dataset-tiktok"}});}return json(rows);
  }});
  await provider.search({...query,platform:"tiktok",seedHandles:["@scent.reviewer"]});assert.deepEqual(body.profiles,["scent.reviewer"]);assert.equal(body.shouldDownloadVideos,false);assert.equal(body.searchQueries,undefined);
});

test("missing, abbreviated and invalid public metrics stay unavailable instead of becoming estimates or zero",()=>{
  const result=normaliseApifyCreators([{...ig,followersCount:"12K",latestPosts:[{shortCode:"image_ad",likesCount:-1,commentsCount:"1.2K",videoViewCount:"unavailable"}]}],"instagram",{observedAt,maxProfiles:5,maxPostsPerProfile:12});
  assert.equal(result[0].followers,null);assert.equal(result[0].recentPosts[0].likes,null);assert.equal(result[0].recentPosts[0].views,null);assert.equal(result[0].metricCoverage?.followersAvailable,false);
  assert.equal(normaliseApifyCreators([{username:"not/a/handle",followersCount:9000}],"instagram",{observedAt,maxProfiles:5,maxPostsPerProfile:12}).length,0);
});

test("an ambiguous actor-start timeout retains its one reserve and never creates an automatic paid retry",async()=>{
  let calls=0,reserves=0;
  const provider=new ApifyCreatorProvider({env,reserve:async()=>{reserves++;return{reservationId:"timeout-hold",reservedGbp:0.75};},fetch:async()=>{calls++;throw new Error(`timeout ${token}`);}});
  await assert.rejects(()=>provider.search(query),(error:unknown)=>{
    assert.ok(error instanceof CreatorProviderError);assert.equal(error.accounting?.reservedCostGbp,0.75);assert.equal(error.accounting?.requestAttempts,1);assert.equal(error.accounting?.billedCostGbp,null);assert.ok(!error.message.includes(token));return true;
  });assert.equal(calls,1);assert.equal(reserves,1);
});

test("redirects and provider error payloads cannot leak credentials or follow untrusted URLs",async()=>{
  for(const status of [302,401,429,503]){
    let calls=0;
    const provider=new ApifyCreatorProvider({env,reserve:async()=>({reservationId:"blocked-hold",reservedGbp:0.75}),fetch:async()=>{calls++;return json({error:{message:token,paginationUrl:`https://evil.example/?token=${token}`}},status,{Location:`https://evil.example/?token=${token}`});}});
    await assert.rejects(()=>provider.search(query),(error:unknown)=>error instanceof CreatorProviderError&&!JSON.stringify(error).includes(token));assert.equal(calls,1);
  }
});

test("bounded polling keeps the existing paid run and never aborts or starts another actor",async()=>{
  let reserves=0,starts=0,polls=0,aborts=0;
  const provider=new ApifyCreatorProvider({env,maxPolls:2,pollIntervalMs:0,sleep:async()=>{},reserve:async()=>{reserves++;return{reservationId:"bounded-hold",reservedGbp:0.75};},fetch:async(input,init)=>{
    const url=new URL(String(input));if(url.pathname.endsWith("/runs")){starts++;return json({data:{id:"running-one",status:"RUNNING"}});}if(url.pathname.endsWith("/abort")){aborts++;assert.equal(init?.method,"POST");return json({data:{id:"running-one",status:"ABORTED"}});}polls++;return json({data:{id:"running-one",status:"RUNNING"}});
  }});
  await assert.rejects(()=>provider.search(query),(e:unknown)=>e instanceof CreatorProviderError && e.code==="pending");assert.equal(starts,1);assert.equal(reserves,1);assert.equal(polls,2);assert.equal(aborts,0);
});

test("dataset pagination uses only validated official resource IDs and stops after two pages",async()=>{
  const offsets:string[]=[];
  const provider=new ApifyCreatorProvider({env,reserve:async()=>({reservationId:"pages-hold",reservedGbp:0.75}),fetch:async(input)=>{
    const url=new URL(String(input));assert.equal(url.origin,"https://api.apify.com");if(url.pathname.endsWith("/runs"))return json({data:{id:"paged-one",status:"SUCCEEDED",usageTotalUsd:0.125,defaultDatasetId:"dataset-paged",next:"https://evil.example"}});offsets.push(url.searchParams.get("offset")!);return json(Array.from({length:100},()=>ig));
  }});
  const result=await provider.search(query);assert.deepEqual(offsets,["0","100"]);assert.equal(result.profiles.length,1);assert.ok(result.warnings.some(warning=>warning.includes("capped at 200")));
});

test("cancelled searches and invalid input cannot reserve funds or dispatch",async()=>{
  let reserves=0,calls=0;const cancelled=new AbortController();cancelled.abort();
  const provider=new ApifyCreatorProvider({env,reserve:async()=>{reserves++;return{reservationId:"never",reservedGbp:0.75};},fetch:async()=>{calls++;return json({});}});
  await assert.rejects(()=>provider.search({...query,signal:cancelled.signal}),/cancelled before dispatch/);await assert.rejects(()=>provider.search({...query,seedHandles:["https://evil.example"]}),/valid explicit seed handles/);assert.equal(reserves,0);assert.equal(calls,0);
});

test("creator research batches use the existing client, reserve first and enforce provider charge/result caps",async()=>{
 let reserved=false,starts=0,deleted=false;const researchEnv={...env,APIFY_INSTAGRAM_ACTOR_ID:"apify/instagram-scraper",EXTER_AD_MEDIA_GBP_PER_USD:"0.8"};
 const provider=new ApifyCreatorProvider({env:researchEnv,reserve:async(amount)=>{reserved=true;assert.equal(amount,.75);return{reservationId:"fixture-hold",reservedGbp:amount};},fetch:async(input,init)=>{
  const url=new URL(String(input));assert.ok(!url.href.includes(token));assert.equal(new Headers(init?.headers).get("Authorization"),`Bearer ${token}`);
  if(url.pathname.endsWith("/runs")){starts++;assert.ok(reserved);assert.equal(url.searchParams.get("maxItems"),"199");assert.equal(url.searchParams.get("maxTotalChargeUsd"),"0.93");assert.equal(url.searchParams.get("restartOnError"),"false");return json({data:{id:"research-run",status:"SUCCEEDED",usageTotalUsd:0.125,defaultDatasetId:"research-dataset"}});}
  if(init?.method==="DELETE"){deleted=true;return new Response(null,{status:204});}
  assert.ok(url.pathname.endsWith("/items"));const offset=Number(url.searchParams.get("offset")),limit=Number(url.searchParams.get("limit"));assert.ok(limit<=100);return json(Array.from({length:limit},(_,i)=>({username:`fixture${offset+i}`})));
 }});
 const result=await provider.collectPublic({resultsType:"details",search:"fixture"},199);assert.equal(result.rows.length,199);assert.equal(starts,1);assert.equal(deleted,false,"a dataset stays available until its rows are durably saved");assert.equal(result.accounting.reservedCostGbp,.75);
});
test("creator research cannot dispatch after a budget refusal and never retries an ambiguous paid call",async()=>{
 const researchEnv={...env,APIFY_INSTAGRAM_ACTOR_ID:"apify/instagram-scraper"};let calls=0;
 const blocked=new ApifyCreatorProvider({env:researchEnv,reserve:async()=>{throw new Error(token);},fetch:async()=>{calls++;throw new Error();}});
 await assert.rejects(blocked.collectPublic({},20),(e:unknown)=>e instanceof CreatorProviderError&&e.code==="budget_paused");assert.equal(calls,0);
 const ambiguous=new ApifyCreatorProvider({env:researchEnv,reserve:async()=>({reservationId:"fixture-hold",reservedGbp:.75}),fetch:async()=>{calls++;throw new Error(token);}});
 await assert.rejects(ambiguous.collectPublic({},20),(e:unknown)=>e instanceof CreatorProviderError&&e.accounting?.reservedCostGbp===.75&&!e.message.includes(token));assert.equal(calls,1);
});
