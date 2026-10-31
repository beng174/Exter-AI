import { test } from "node:test";
import assert from "node:assert/strict";
import { MetaLibraryConnector, META_FIELDS } from "../server/connectors/meta-library.js";
const fakeToken = "test-fixture-token";
test("missing Meta credential gives an actionable disconnected status without a network call", async () => {
  const connector = new MetaLibraryConnector({ token: "", fetch: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(connector.page({ pageIds: ["12"], countries: ["GB"] }), /Meta not connected/);
});
test("Meta requests required public fields and paginates via cursor without persisting URLs or tokens", async () => {
  const connector = new MetaLibraryConnector({ token: fakeToken, fetch: async (target,init) => {
    const url = new URL(String(target));
    assert.equal(url.origin,"https://graph.facebook.com");
    assert.equal(url.pathname,"/v25.0/ads_archive");
    assert.equal(url.searchParams.get("fields"),META_FIELDS);
    assert.equal(url.searchParams.get("after"),"first");
    assert.equal(url.searchParams.get("ad_active_status"),"ALL");
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
