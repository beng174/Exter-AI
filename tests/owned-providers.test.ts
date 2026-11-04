import test from "node:test";
import assert from "node:assert/strict";
import meta from "./fixtures/owned/meta-report.json";
import { META_OWNED_FIELDS,TIKTOK_OWNED_METRICS,pullOwnedDays } from "../server/owned/providers.js";
import { ownedWindow } from "../server/owned/jobs.js";
import { fixtureAccount,fixtureEnv,fixtureFetch } from "./fixtures/owned-fixtures.js";
const now=new Date("2026-11-04T00:00:00Z");
test("CA-02 first sync requests 90 days; successful accounts re-pull seven inclusive days",()=>{
  assert.deepEqual(ownedWindow(null,now),{from:"2026-08-07",to:"2026-11-04"});
  assert.deepEqual(ownedWindow("2026-11-03",now),{from:"2026-10-29",to:"2026-11-04"});
});
test("CA-02 Meta pagination rebuilds the fixed endpoint; headers alone carry the marker",async()=>{
  const requests:URL[]=[];
  const fetcher=fixtureFetch((url,init)=>{requests.push(new URL(url));assert.ok(!url.href.includes(fixtureEnv.EXTER_META_ACCESS_TOKEN));assert.equal(new Headers(init?.headers).get("Authorization"),`Bearer ${fixtureEnv.EXTER_META_ACCESS_TOKEN}`);});
  const rows=await pullOwnedDays(fixtureAccount(),"2026-11-01","2026-11-04",{env:fixtureEnv,now,fetch:async(target,init)=>{
    const url=new URL(String(target));const response=await fetcher(target,init);
    if(url.pathname.endsWith('/insights')&&!url.searchParams.has('after'))return Response.json({...meta,paging:{next:"https://untrusted.example/ignored",cursors:{after:"second"}}});
    if(url.searchParams.has('after'))return Response.json({data:[{...meta.data[0],date_start:"2026-11-03"}]});
    return response;
  }});
  assert.equal(rows.length,2);assert.equal(rows[0].assetIds[0],"3333");
  const insights=requests.find(url=>url.pathname.endsWith('/insights'))!;
  for(const field of META_OWNED_FIELDS)assert.ok(insights.searchParams.get('fields')!.split(',').includes(field));
  assert.deepEqual(JSON.parse(insights.searchParams.get('action_attribution_windows')!),["7d_click","1d_view"]);
  assert.ok(requests.every(url=>url.hostname==="graph.facebook.com"));
});
test("CA-02 TikTok reporting uses attention metrics, pagination and missing purchase value",async()=>{
  let reportPages=0;
  const fetcher=fixtureFetch((url)=>{if(url.pathname.includes('/report/')){reportPages++;assert.deepEqual(JSON.parse(url.searchParams.get('metrics')!),TIKTOK_OWNED_METRICS);}});
  const rows=await pullOwnedDays(fixtureAccount({platform:"TikTok",attribution:"account_configured"}),"2026-11-01","2026-11-04",{env:fixtureEnv,fetch:async(target,init)=>{
    const result=await fetcher(target,init);const body=await result.json();
    if(String(target).includes('/report/')){body.data.page_info.total_page=2;if(reportPages===2)body.data.list[0].dimensions.stat_time_day="2026-11-03";}
    return Response.json(body);
  }});
  assert.equal(reportPages,2);assert.equal(rows.length,2);assert.equal(rows[0].earlyViews,500);assert.equal(rows[0].purchaseValue,null);
});
test("CA-01 missing/revoked tokens never expose provider payloads or call a source while disconnected",async()=>{
  let calls=0;
  await assert.rejects(pullOwnedDays(fixtureAccount(),"2026-11-01","2026-11-04",{env:{},fetch:async()=>{calls++;throw new Error('must not call');}}),/not connected/);
  assert.equal(calls,0);
  for(const response of [()=>new Response(fixtureEnv.EXTER_META_ACCESS_TOKEN,{status:401}),()=>Response.json({error:{code:190,message:fixtureEnv.EXTER_META_ACCESS_TOKEN}})]) {
    await assert.rejects(pullOwnedDays(fixtureAccount(),"2026-11-01","2026-11-04",{env:fixtureEnv,fetch:async()=>response()}),error=>error instanceof Error && /revoked/.test(error.message) && !error.message.includes(fixtureEnv.EXTER_META_ACCESS_TOKEN));
  }
});
test("CA-02 repeated cursors and out-of-range rows reject the whole pull",async()=>{
  await assert.rejects(pullOwnedDays(fixtureAccount(),"2026-11-01","2026-11-04",{env:fixtureEnv,fetch:async()=>Response.json({data:[{id:'1111'}],paging:{next:'ignored',cursors:{after:'same'}}})}),/unsupported/);
  await assert.rejects(pullOwnedDays(fixtureAccount(),"2026-11-03","2026-11-04",{env:fixtureEnv,fetch:fixtureFetch()}),/unsupported/);
});

test("CA-02 TikTok parent metadata resolves names by exact IDs, not by guesses",async()=>{
  const base=fixtureFetch();
  const rows=await pullOwnedDays(fixtureAccount({platform:"TikTok",attribution:"account_configured"}),"2026-11-01","2026-11-04",{env:fixtureEnv,fetch:async(target,init)=>{
    const url=String(target);
    if(url.includes('/adgroup/get/'))return Response.json({code:0,data:{list:[{adgroup_id:"5555",adgroup_name:"Parent group"}],page_info:{total_page:1}}});
    if(url.includes('/campaign/get/'))return Response.json({code:0,data:{list:[{campaign_id:"6666",campaign_name:"Parent campaign"}],page_info:{total_page:1}}});
    if(url.includes('/ad/get/'))return Response.json({code:0,data:{list:[{ad_id:"1111",ad_name:"Fixture",adgroup_id:"5555",campaign_id:"6666"}],page_info:{total_page:1}}});
    return base(target,init);
  }});
  assert.equal(rows[0].adSetName,"Parent group");assert.equal(rows[0].campaignName,"Parent campaign");
});
