import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TikTokCommercialConnector, tiktokCommercialStatus, TIKTOK_AD_FIELDS } from "../server/connectors/tiktok-commercial.js";
import { parsePublicJson } from "../server/connectors/public-json.js";
import { boundedPublicBody } from "../server/connectors/public-json.js";
const credentials = { TIKTOK_CLIENT_KEY: "fixture-key", TIKTOK_CLIENT_SECRET: "fixture-secret" }, now = () => Date.parse("2026-11-03T02:00:00Z"), query = { countries: ["GB"], publishedFrom: "2026-10-01", publishedTo: "2026-11-01" };
const page = readFileSync(new URL("./fixtures/connectors/tiktok-page.json", import.meta.url), "utf8");
test("TikTok Commercial API requires both valid keys and never calls a provider while disconnected", async () => {
    for (const env of [{}, { TIKTOK_CLIENT_KEY: "fixture-key" }, { TIKTOK_CLIENT_SECRET: "fixture-secret" }, { ...credentials, TIKTOK_CLIENT_KEY: " " }, { ...credentials, TIKTOK_CLIENT_SECRET: "invalid\r\nvalue" }]) {
        let calls = 0;
        const connector = new TikTokCommercialConnector({ env, now, fetch: async () => { calls++; throw new Error("not called"); } });
        assert.equal(connector.status().status, "not_connected");
        await assert.rejects(connector.page(query), /not connected/);
        assert.equal(calls, 0);
    }
    assert.equal(tiktokCommercialStatus(credentials).status, "configured");
    assert.equal(tiktokCommercialStatus(credentials).connected, false);
});
test("TikTok client credentials stay in the token POST; i64 IDs and rounded reach survive without invented counts", async () => {
    let tokens = 0, pages = 0;
    const connector = new TikTokCommercialConnector({ env: credentials, now, fetch: async (target, init) => {
            const url = new URL(String(target));
            assert.equal(url.origin, "https://open.tiktokapis.com");
            assert.equal(init?.redirect, "error");
            assert.equal(url.searchParams.has("client_secret"), false);
            if (url.pathname === "/v2/oauth/token/") {
                tokens++;
                const body = new URLSearchParams(String(init?.body));
                assert.equal(body.get("grant_type"), "client_credentials");
                assert.equal(body.get("client_key"), credentials.TIKTOK_CLIENT_KEY);
                assert.equal(body.get("client_secret"), credentials.TIKTOK_CLIENT_SECRET);
                return Response.json({ access_token: "fixture-access-token", expires_in: 7200, token_type: "Bearer" });
            }
            pages++;
            assert.equal(url.pathname, "/v2/research/adlib/ad/query/");
            assert.equal(url.searchParams.get("fields"), TIKTOK_AD_FIELDS);
            assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-access-token");
            const body = JSON.parse(String(init?.body));
            assert.deepEqual(body.filters.country_code_list, ["GB"]);
            if (pages === 1)
                return new Response(page, { headers: { "Content-Type": "application/json" } });
            assert.equal(body.search_id, "fixture-next");
            return Response.json({ data: { ads: [], has_more: false }, error: { code: "ok" } });
        } });
    const first = await connector.page(query);
    assert.equal(first.ads[0].id, "7000000000000000001");
    assert.equal(first.ads[0].advertiserId, "7000000000000000002");
    assert.deepEqual(first.ads[0].reach, { basis: "estimated", value: null, display: "11K" });
    assert.equal(first.ads[0].firstShownDate, "2026-10-01");
    assert.equal(first.ads[0].active, true);
    const second = await connector.page({ ...query, cursor: first.cursor! });
    assert.equal(second.cursor, null);
    assert.equal(tokens, 1);
    assert.equal(pages, 2);
    assert.ok(!JSON.stringify(first).includes(credentials.TIKTOK_CLIENT_SECRET));
    assert.ok(!JSON.stringify(connector).includes(credentials.TIKTOK_CLIENT_SECRET));
    await assert.rejects(connector.page({ ...query, countries: ["FR"], cursor: first.cursor! }), /different/);
    assert.equal(pages, 2);
});
test("lossless public JSON preserves quoted text and rejects invalid or pathological numeric input", () => {
    const text = 'escaped "id":7000000000000000001';
    assert.deepEqual(parsePublicJson('{"id":7000000000000000001,"text":' + JSON.stringify(text) + ',"zero":0}'), { id: "7000000000000000001", text, zero: 0 });
    assert.throws(() => parsePublicJson('{"id":01}'));
    assert.throws(() => parsePublicJson('{"id":' + "9".repeat(129) + '}'));
});
test("TikTok provider errors and repeating result pages never expose credentials", async () => {
    for (const status of [302, 400, 401, 403, 429, 500]) {
        const connector = new TikTokCommercialConnector({ env: credentials, now, fetch: async () => new Response(credentials.TIKTOK_CLIENT_SECRET, { status }) });
        await assert.rejects(connector.page(query), (error: Error) => !error.message.includes(credentials.TIKTOK_CLIENT_SECRET));
    }
    const connector = new TikTokCommercialConnector({ env: credentials, now, fetch: async (target) => String(target).includes("oauth") ? Response.json({ access_token: "fixture-access-token", expires_in: 7200 }) : Response.json({ data: { ads: [], has_more: true, search_id: "same" }, error: { code: "ok" } }) });
    const first = await connector.page(query);
    await assert.rejects(connector.page({ ...query, cursor: first.cursor! }), /repeating/);
});
test("TikTok permits a stable cached-search ID when the next page contains different ads", async () => {
    let pageNumber = 0;
    const connector = new TikTokCommercialConnector({ env: credentials, now, fetch: async target => String(target).includes("oauth")
        ? Response.json({ access_token: "fixture-access-token", expires_in: 7200 })
        : Response.json({ data: { ads: [{ ad: { id: String(++pageNumber) } }], has_more: true, search_id: "same" }, error: { code: "ok" } }) });
    const first = await connector.page(query);
    const second = await connector.page({ ...query, cursor: first.cursor! });
    assert.equal(second.cursor!.searchId, first.cursor!.searchId);
    assert.notEqual(second.cursor!.pageFingerprint, first.cursor!.pageFingerprint);
    assert.equal(second.ads[0].id, "2");
});
test("TikTok coalesces concurrent token requests and refreshes an expired token without a paid retry loop", async () => {
    let clock = now(), tokens = 0;
    const connector = new TikTokCommercialConnector({ env: credentials, now: () => clock, fetch: async (target) => { if (String(target).includes("oauth")) {
            tokens++;
            await new Promise(resolve => setTimeout(resolve, 5));
            return Response.json({ access_token: `fixture-token-${tokens}`, expires_in: 7200 });
        } return Response.json({ data: { ads: [], has_more: false }, error: { code: "ok" } }); } });
    await Promise.all([connector.page(query), connector.page(query)]);
    assert.equal(tokens, 1);
    clock += 7200 * 1000;
    await connector.page(query);
    assert.equal(tokens, 2);
});
test("untrusted bodies are bounded during streaming even without content-length", async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(20)); }, cancel() { cancelled = true; } }));
    await assert.rejects(boundedPublicBody(response, 32), /limit/);
    assert.equal(cancelled, true);
});
