import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MetaLibraryConnector, MetaCollectionError, META_FIELDS, metaStatus } from "../server/connectors/meta-library.js";
const fakeToken = "test-fixture-token";
test("Meta API version override and ALL type apply to Page and category requests on every cursor",async()=>{
  const old=process.env.META_API_VERSION;process.env.META_API_VERSION="v27.0";
  try{for(const query of [{pageIds:["12"]},{searchTerm:"home fragrance"}]){
    const connector=new MetaLibraryConnector({token:fakeToken,fetch:async target=>{
      const url=new URL(String(target));assert.equal(url.pathname,"/v27.0/ads_archive");assert.equal(url.searchParams.get("ad_type"),"ALL");
      assert.equal(url.searchParams.get("ad_delivery_date_min"),"2025-11-05");assert.equal(url.searchParams.get("ad_delivery_date_max"),"2026-11-05");
      return Response.json({data:[]});
    }});await connector.page({...query,countries:["GB"],after:"fixture-cursor",from:"2025-11-05",to:"2026-11-05"});
  }}finally{if(old===undefined)delete process.env.META_API_VERSION;else process.env.META_API_VERSION=old;}
});
test("brand queries never combine keyword discovery, commercial fields or secret paging URLs",async()=>{
  let calls=0;const paging=`https://graph.facebook.com/private?access_token=${fakeToken}`;
  const connector=new MetaLibraryConnector({token:fakeToken,fetch:async()=>{calls++;return Response.json({data:[{id:"123",spend:99,impressions:1000,ad_snapshot_url:paging,ad_creative_bodies:[paging],total_reach_by_location:[{key:"UK",value:20,paging:{next:paging}}]}],paging:{next:paging,cursors:{after:"safe"}}});}});
  await assert.rejects(connector.page({pageIds:["12"],searchTerm:"category",countries:["GB"]}));assert.equal(calls,0);
  const result=await connector.page({pageIds:["12"],countries:["GB"]});
  assert.ok(!JSON.stringify(result).includes("access_token"));assert.ok(!JSON.stringify(result).includes(fakeToken));assert.ok(!JSON.stringify(result).includes("private?"));
  assert.equal(result.rows[0].spend,undefined);assert.equal(result.rows[0].impressions,undefined);
  assert.ok(!META_FIELDS.includes("spend"));assert.ok(!META_FIELDS.includes("impressions"));
});
test("Meta fixture pages preserve exact IDs, observed zero and missing reach without claiming live verification",async()=>{
  const fixture=readFileSync(new URL("./fixtures/connectors/meta-page.json",import.meta.url),"utf8");
  const connector=new MetaLibraryConnector({token:fakeToken,fetch:async()=>new Response(fixture,{headers:{"Content-Type":"application/json"}})});
  const result=await connector.page({pageIds:["172851066181411"],countries:["GB"]});
  assert.equal(result.rows[0].id,"7000000000000000001");assert.equal(result.rows[0].eu_total_reach,0);assert.equal(result.rows[1].eu_total_reach,undefined);assert.equal(result.after,"fixture-next");
  assert.equal(metaStatus({META_ACCESS_TOKEN:" "}).status,"not_connected");assert.equal(metaStatus({META_ACCESS_TOKEN:"bad\nvalue"}).status,"not_connected");
});
test("missing Meta credential gives an actionable disconnected status without a network call", async () => {
  const connector = new MetaLibraryConnector({ token: "", fetch: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(connector.page({ pageIds: ["12"], countries: ["GB"] }), /Meta not connected/);
});
test("Meta requests required public fields and paginates via cursor without persisting URLs or tokens", async () => {
  const connector = new MetaLibraryConnector({ token: fakeToken, fetch: async (target,init) => {
    const url = new URL(String(target));
    assert.equal(url.origin,"https://graph.facebook.com");
    assert.equal(url.pathname,"/v26.0/ads_archive");
    assert.equal(url.searchParams.get("fields"),META_FIELDS);
    assert.equal(url.searchParams.get("after"),"first");
    assert.equal(url.searchParams.get("ad_active_status"),"ALL");
    assert.equal(url.searchParams.get("ad_type"),"ALL");
    assert.deepEqual(JSON.parse(url.searchParams.get("ad_reached_countries")!),["GB","FR"]);
    assert.equal(url.searchParams.has("access_token"),false);
    assert.equal((init?.headers as Record<string,string>).Authorization,`Bearer ${fakeToken}`);
    assert.equal(init?.redirect,"error");
    return Response.json({ data: [{ id: "123", page_id: "12", eu_total_reach: 0, ad_creative_bodies: [fakeToken], extra_secret: fakeToken }], paging: { next: `https://untrusted.invalid/?access_token=${fakeToken}`, cursors: { after: "second" } } }, { headers: { "x-app-usage": JSON.stringify({ call_count: 85 }) } });
  } });
  const result = await connector.page({ pageIds: ["12"], countries: ["GB","FR"], after: "first" });
  assert.equal(result.after,"second");
  assert.equal(result.backoffMs,60000);
  assert.equal(result.rows[0].eu_total_reach,0);
  assert.ok(!JSON.stringify(result).includes(fakeToken));
  assert.ok(!JSON.stringify(result).includes("untrusted.invalid"));
});
test("Meta rejects repeating pagination and sanitizes remote failure payloads", async () => {
  for (const status of [400,401,403,429,500]) {
    const connector = new MetaLibraryConnector({ token: fakeToken, fetch: async () => Response.json({ error: { message: fakeToken } }, { status }) });
    await assert.rejects(connector.page({ searchTerm: "fragrance", countries: ["GB"] }), (error: Error) => !error.message.includes(fakeToken) && /HTTP/.test(error.message));
  }
  const connector = new MetaLibraryConnector({ token: fakeToken, fetch: async () => Response.json({ data: [], paging: { next: "unused", cursors: { after: "same" } } }) });
  await assert.rejects(connector.page({ searchTerm: "fragrance", countries: ["GB"], after: "same" }), /cursor/);
});

test("unsafe numeric IDs and token-bearing cursors are rejected before persistence", async () => {
  for (const body of [
    { data: [{ id: 9007199254740992 }] },
    { data: [], paging: { next: "unused", cursors: { after: fakeToken } } },
  ]) {
    const connector = new MetaLibraryConnector({ token: fakeToken, fetch: async () => Response.json(body) });
    await assert.rejects(connector.page({ pageIds: ["12"], countries: ["GB"] }));
  }
});
test("Graph application errors classify known permission, rate and transient codes without exposing provider text", async () => {
  for (const status of [200,400]) for (const [code,reason] of [[190,"permission"],[102,"permission"],[10,"permission"],[200,"permission"],[294,"permission"],[4,"rate_limited"],[17,"rate_limited"],[32,"rate_limited"],[613,"rate_limited"],[80004,"rate_limited"],[2,"unavailable"],[100,"schema"]] as const) {
    const connector = new MetaLibraryConnector({ token: fakeToken, fetch: async () => Response.json({ error: { code,message: fakeToken,error_user_msg: `private ${fakeToken}` } },{ status }) });
    await assert.rejects(connector.page({ pageIds: ["12"],countries: ["GB"] }), (error: unknown) => error instanceof MetaCollectionError && error.reason === reason && !error.message.includes(fakeToken));
  }
  const transient = new MetaLibraryConnector({ token: fakeToken, fetch: async () => Response.json({ error: { code: 999,is_transient: true,message: fakeToken } }) });
  await assert.rejects(transient.page({ pageIds: ["12"],countries: ["GB"] }), (error: unknown) => error instanceof MetaCollectionError && error.reason === "unavailable" && !error.message.includes(fakeToken));
  const malformed = new MetaLibraryConnector({ token: fakeToken, fetch: async () => Response.json(null) });
  await assert.rejects(malformed.page({ pageIds: ["12"],countries: ["GB"] }), (error: unknown) => error instanceof MetaCollectionError && error.reason === "schema");
});
