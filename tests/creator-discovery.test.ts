import test from "node:test";
import assert from "node:assert/strict";
import { creatorHandle, followerTier, engagementMetrics, evaluateCreator, ukCreatorSignals, creatorPrecision, parseCreatorLabels, nextCreatorRefresh, matchesCreator, creatorCsv, scrubCreatorText, businessEmail } from "../shared/creator-discovery.js";
import { discoveryProfile, InstagramCreatorVerifier, CreatorVerificationError } from "../server/creators/discovery-provider.js";
import { briefSchema, discoverySteps, actorDiscoveryInput, discoveryBatchCount } from "../server/creators/discovery-store.js";
import { creatorBrief, creatorProfile, creatorRow } from "./fixtures/creator-discovery.js";
test("creator median uses latest 12 unique dated official posts and preserves unknown and genuine zero", () => {
  const profile=creatorProfile(), m=engagementMetrics(profile); assert.equal(m.engagement,.0265);assert.equal(m.assessedPosts,12);assert.equal(m.frequency,3.5);
  const p=profile.posts[0];profile.posts=[{...p,at:"2020-01-01",likes:900000},...profile.posts,{...p}];assert.equal(engagementMetrics(profile).engagement,.0265);
  profile.posts=profile.posts.slice(1,3).map(p=>({...p,likes:0,comments:0}));assert.equal(engagementMetrics(profile).engagement,0);
  assert.equal(engagementMetrics({...profile,followers:0}).engagement,null);assert.equal(engagementMetrics({...profile,verification:"Unverified"}).engagement,null);
  profile.posts[0].likes=null;assert.equal(engagementMetrics(profile).assessedPosts,1);
});
test("creator handles deduplicate case and requested tiers have exact non-overlapping boundaries",()=>{
  assert.equal(creatorHandle(" @Fixture.Creator "),"fixture.creator");assert.equal(creatorHandle("../secret"),null);
  assert.deepEqual([null,9999,10000,99999,100000,499999,500000].map(followerTier),[null,"Nano","Micro","Micro","Mid","Mid","Macro"]);
  assert.equal(briefSchema.safeParse({...creatorBrief,target:1001}).success,false);assert.equal(briefSchema.safeParse({...creatorBrief,minFollowers:1000000}).success,false);
});
test("UK signals show reasons, weak hints cannot pass, foreign bases cannot be hidden by UK travel",()=>{
  assert.equal(ukCreatorSignals(creatorProfile()).band,"High");
  const weak=creatorProfile({bio:"My favourite colour",posts:[]});assert.equal(ukCreatorSignals(weak).confidence,.2);
  const foreign=creatorProfile({bio:"Based in Dubai. Holiday in London."});assert.equal(ukCreatorSignals(foreign).band,"Low");assert.ok(ukCreatorSignals(foreign).foreign);
  assert.equal(ukCreatorSignals(creatorProfile({bio:"",website:null,posts:[]})).confidence,null);
});
test("creator fit adds up, missing checks are provisional, exclusions override a high fit",()=>{
  for(let mask=0;mask<16;mask++){
    const p=creatorProfile({audit:mask&1?null:creatorProfile().audit,verification:mask&2?"Unverified":"Verified",bio:mask&4?"":creatorProfile().bio});const b={...creatorBrief,styles:mask&8?[]:creatorBrief.styles};
    const e=evaluateCreator(p,b,[]),maximum=e.parts.reduce((n,p)=>n+(p.points===null?0:p.max),0),points=e.parts.reduce((n,p)=>n+(p.points??0),0);
    assert.equal(e.assessedPoints,maximum);assert.equal(e.fit,maximum?Math.round(100*points/maximum):null);assert.equal(e.provisional,maximum<100);
  }
  for(const patch of [{private:true},{accountKind:"brand" as const},{accountKind:"repost" as const},{accountKind:"reseller" as const},{handle:"excluded_fixture"},{followers:200000}]){const e=evaluateCreator(creatorProfile(patch),creatorBrief);assert.ok(e.excluded.length);assert.equal(e.goodFit,false);}
  const foreign=creatorProfile({bio:"Based in Dubai",posts:[],website:null});assert.ok(evaluateCreator(foreign,creatorBrief).excluded.length);assert.equal(evaluateCreator(foreign,{...creatorBrief,country:"ALL"}).excluded.length,0);
});
test("collaboration requires disclosure plus competitor mention; comment pattern is a review flag, not fraud",()=>{
  const p=creatorProfile();p.posts[0].caption="@fictional_shop ordinary mention";assert.deepEqual(evaluateCreator(p,creatorBrief).workedWithCompetitors,[]);
  p.posts[0].caption="#ad @fictional_shop";assert.deepEqual(evaluateCreator(p,creatorBrief).workedWithCompetitors,["fictional_shop"]);
  assert.equal(evaluateCreator({...p,audit:null},creatorBrief).risk.status,"Not assessed");
  assert.equal(evaluateCreator({...p,audit:null,growth:{from:"2026-10-10",to:"2026-11-10",previousFollowers:4000,followers:10000}},creatorBrief).risk.status,"Review");
  assert.equal(evaluateCreator({...p,audit:{sampledPosts:3,comments:20,repeatedFraction:.8}},creatorBrief).risk.status,"Review");
});
test("public projections discard scraped numbers, private contact details and unknown images",()=>{
  const p=discoveryProfile({username:"Fixture_Creator",followersCount:10000,postsCount:200,biography:"Creator. Personal: person@example.org +44 7700 123456. Business: work@example.org",externalUrl:"https://site.co.uk/?access_token=redacted",latestPosts:[{id:"1",url:"https://www.instagram.com/p/fixture/?token=hidden",timestamp:"2026-11-10",caption:"call +44 7700 123456",locationName:"51.5072,-0.1276",likesCount:500,commentsCount:30,displayUrl:"https://evil.example/image"}]},"2026-11-10")!;
  assert.equal(p.followers,null);assert.equal(p.mediaCount,null);assert.equal(p.posts[0].likes,null);assert.equal(p.posts[0].thumbnail,null);assert.equal(p.posts[0].location,"");assert.equal(p.businessEmail,"work@example.org");assert.equal(p.website,"https://site.co.uk");assert.ok(!JSON.stringify(p).includes("person@example.org"));assert.ok(!JSON.stringify(p).includes("7700"));assert.ok(!JSON.stringify(p).includes("token=hidden"));
  assert.equal(discoveryProfile({username:"fixture_creator",biography:"Business: fixture-secret@example.org"},"2026-11-10","fixture-secret"),null);
  assert.equal(businessEmail("personal: person@example.org"),null);assert.ok(!scrubCreatorText("14 Example Road, AA1 1AA").includes("Example Road"));
});
test("official verification uses dedicated secret in header, latest 12 counts and controlled errors only",async()=>{
  const env={EXTER_INSTAGRAM_ACCESS_TOKEN:"fixture-value-not-a-key",EXTER_INSTAGRAM_ACCOUNT_ID:"123",META_API_VERSION:"v26.0"};let calls=0;
  const verifier=new InstagramCreatorVerifier({env,fetch:async(input,init)=>{calls++;const u=new URL(String(input));assert.ok(!u.href.includes(env.EXTER_INSTAGRAM_ACCESS_TOKEN));assert.equal(new Headers(init?.headers).get("Authorization"),`Bearer ${env.EXTER_INSTAGRAM_ACCESS_TOKEN}`);assert.ok(u.searchParams.get("fields")?.includes("media.limit(12)"));return Response.json({business_discovery:{username:"fixture_creator",followers_count:10000,media_count:40,media:{data:[{id:"1",permalink:"https://www.instagram.com/p/fixture/",timestamp:"2026-11-10",like_count:0,comments_count:0,media_type:"IMAGE"}]}}});}});
  const p=await verifier.verify(creatorProfile());assert.equal(p.followers,10000);assert.equal(p.posts[0].likes,0);assert.equal(calls,1);
  for(const [code,status,expected] of [[190,400,"permissions"],[4,200,"rate_limited"],[100,400,"unsupported"],[1,500,"unavailable"]] as const){const v=new InstagramCreatorVerifier({env,fetch:async()=>Response.json({error:{code,message:"must never persist this",access_token:env.EXTER_INSTAGRAM_ACCESS_TOKEN}},{status})});await assert.rejects(v.verify(creatorProfile()),(e:unknown)=>e instanceof CreatorVerificationError&&e.reason===expected&&!e.message.includes("persist"));}
  await assert.rejects(new InstagramCreatorVerifier({env:{},fetch:async()=>{throw new Error("no request");}}).verify(creatorProfile()),CreatorVerificationError);
});
test("all five discovery channels use bounded supported inputs, and cost quote covers profile enrichment",()=>{
  const steps=discoverySteps(creatorBrief);assert.deepEqual(steps.map(s=>s.kind),["hashtag","keyword","keyword","competitor","seed"]);
  assert.equal(discoveryBatchCount(creatorBrief),8);assert.equal(actorDiscoveryInput(steps[0],"GB",1000).resultsLimit,100);assert.equal(actorDiscoveryInput(steps[3],"GB",1000).resultsType,"mentions");assert.equal(actorDiscoveryInput(steps[4],"GB",1000).resultsType,"details");
});
test("segments cover all requested filters, calendar refresh clamps month ends, CSV cannot execute formulae",()=>{
  const row=creatorRow();row.profile.appearsInAds=["123"];row.saved=true;
  assert.ok(matchesCreator(row,{tier:"Micro",niche:"candles",engagement:"1 to 3%",uk:"High",style:"Tutorial",worked:true,ads:true,minFit:70,saved:true}));assert.equal(matchesCreator(row,{tier:"Macro"}),false);
  assert.equal(nextCreatorRefresh("2026-01-31T00:00:00.000Z"),"2026-02-28T00:00:00.000Z");
  row.profile.name="=SUM(1,2)";assert.ok(creatorCsv([row]).includes('"\'=SUM(1,2)"'));assert.ok(!creatorCsv([row]).includes("private"));
});
test("owner CSV precision is separate by field, version-bound and fixtures cannot release the 85% gate",()=>{
  assert.deepEqual(parseCreatorLabels("handle,good_fit,is_uk,notes\n"),[]);
  const rows=Array.from({length:20},(_,i)=>creatorRow({handle:`fixture${i}`})), csv="handle,good_fit,is_uk,notes\n"+rows.map(r=>`${r.profile.handle},yes,yes,"Owner, checked"`).join("\n"),labels=parseCreatorLabels(csv);
  const checks=creatorPrecision(labels,rows,"fixture-brief","2026-11-10",false);assert.ok(checks.every(c=>c.precision===1&&c.clientReady&&c.interval));
  assert.ok(creatorPrecision(labels,rows,"fixture-brief","2026-11-10",true).every(c=>!c.clientReady));
  assert.ok(creatorPrecision(labels,rows,"other-version","2026-11-10",false).every(c=>!c.clientReady&&c.missing===20));
  labels[0].good_fit=false;assert.equal(creatorPrecision(labels,rows,"fixture-brief","2026-11-10")[0].precision,.95);
  assert.throws(()=>parseCreatorLabels("handle,good_fit,is_uk,notes\na,yes,yes,\n@A,no,no,"));
});
