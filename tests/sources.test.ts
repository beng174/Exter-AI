import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDatabase, readBrand } from "../server/db.js";
import { attachPublicMonitor } from "../server/public-monitor.js";
import {
  syncConnection,
  getConnectionStatuses,
} from "../server/connections.js";
import { dashboard, getAds } from "../server/analysis.js";
import { analyzeFormats } from "../shared/formats.js";
const day = new Date().toISOString().slice(0, 10);
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const fakeFetch = (
  callback: (url: URL, init: RequestInit) => Response | Promise<Response>,
) =>
  (async (input: URL | RequestInfo, init?: RequestInit) =>
    callback(new URL(String(input)), init || {})) as typeof fetch;
test("public competitor collection uses embed metadata without client permissions; unknown metrics and dates stay unavailable", async () => {
  const db = openDatabase(":memory:");
  const app = express();
  app.use(express.json());
  let requests = 0;
  attachPublicMonitor(app, db, {
    analyse: false,
    fetch: fakeFetch((url, init) => {
      requests++;
      assert.equal(url.hostname, "www.youtube.com");
      assert.equal(new Headers(init.headers).get("Authorization"), null);
      return response({
        title: "Public skincare product review",
        author_name: "A public competitor",
        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      });
    }),
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const post = (data: unknown) =>
      fetch(base + "/api/public/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    assert.equal(
      (await post({ brandId: "rhode", urls: ["http://127.0.0.1/private"] }))
        .status,
      400,
    );
    assert.equal(requests, 0);
    assert.equal(
      (
        await post({
          brandId: "rhode",
          urls: ["https://www.instagram.com/p/example/"],
        })
      ).status,
      409,
    );
    assert.equal(requests, 0);
    const result = await post({
      brandId: "rhode",
      urls: ["https://youtu.be/dQw4w9WgXcQ"],
      contentSource: "organic",
    });
    assert.equal(result.status, 201);
    assert.equal((await result.json()).clientAccountRequired, false);
    const brand = readBrand(db, "rhode")!;
    assert.equal(brand.mode, "imported");
    const records = getAds(db, brand);
    assert.equal(records.length, 1);
    const ad = records[0];
    assert.equal(ad.owned, false);
    assert.equal(ad.contentSource, "organic");
    assert.equal(ad.source, "public");
    assert.equal(ad.metricsAvailable, false);
    assert.equal(ad.dateBasis, "observed");
    assert.equal(ad.analysis, undefined);
    assert.equal(ad.conversions, null);
    assert.equal(ad.sourceUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(
      analyzeFormats(brand, records, { platform: "YouTube" }).platforms[0]
        .winner,
      null,
    );
    await post({ brandId: "rhode", urls: ["https://youtu.be/dQw4w9WgXcQ"] });
    assert.equal(getAds(db, brand).length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});
test("Meta sync is atomic and idempotent, counts unique creatives across days and retains the previous dataset after a provider error", async () => {
  const db = openDatabase(":memory:");
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const env = {
    EXTER_META_ACCESS_TOKEN: "fake-test-only",
    EXTER_META_AD_ACCOUNT_ID: "12345",
  };
  const fetcher = fakeFetch((url, init) => {
    assert.equal(url.hostname, "graph.facebook.com");
    assert.equal(
      new Headers(init.headers).get("Authorization"),
      "Bearer fake-test-only",
    );
    return url.pathname.endsWith("/ads")
      ? response({
          data: [
            {
              id: "777",
              name: "Product story",
              created_time: "2020-01-01T00:00:00Z",
              creative: { object_story_spec: { photo_data: {} } },
            },
          ],
        })
      : response({
          data: [day, yesterday].map((date) => ({
            ad_id: "777",
            ad_name: "Product story",
            date_start: date,
            impressions: "200",
            inline_post_engagement: "20",
            spend: "4",
            actions: [{ action_type: "purchase", value: "2" }],
            account_currency: "GBP",
          })),
        });
  });
  try {
    assert.equal(
      getConnectionStatuses(db, "rhode", {}).every(
        (s) => s.status === "not_configured",
      ),
      true,
    );
    await syncConnection(db, "Meta", "rhode", { env, fetch: fetcher, now });
    await syncConnection(db, "Meta", "rhode", { env, fetch: fetcher, now });
    const brand = readBrand(db, "rhode")!;
    const result = dashboard(db, brand);
    assert.equal(result.metrics.ads, 1);
    assert.equal(result.metrics.observations, 2);
    assert.equal(result.metrics.impressions, 400);
    assert.equal(result.ads[0].impressions, 400);
    assert.equal(result.ads[0].dateBasis, "creative");
    assert.equal(getConnectionStatuses(db, brand.id, env)[0].status, "synced");
    await assert.rejects(
      syncConnection(db, "Meta", "aritzia", { env, fetch: fetcher, now }),
      /bound to another workspace/,
    );
    await assert.rejects(
      syncConnection(db, "Meta", "rhode", {
        env,
        fetch: fakeFetch(() =>
          response({ error: "sensitive-data-that-must-not-be-echoed" }, 403),
        ),
        now,
      }),
      /permission denied/,
    );
    assert.equal(dashboard(db, brand).metrics.impressions, 400);
    assert.ok(
      !getConnectionStatuses(db, brand.id, env)[0].lastError?.includes(
        "sensitive-data",
      ),
    );
  } finally {
    db.close();
  }
});
test("TikTok and Google adapters retain reported metrics, provenance and native formats without inventing UGC", async () => {
  const db = openDatabase(":memory:");
  try {
    await syncConnection(db, "TikTok", "rhode", {
      env: {
        EXTER_TIKTOK_ACCESS_TOKEN: "fake-test-only",
        EXTER_TIKTOK_ADVERTISER_ID: "12345",
      },
      fetch: fakeFetch((url) =>
        url.pathname.includes("/ad/get")
          ? response({
              code: 0,
              data: {
                list: [
                  {
                    ad_id: "55",
                    ad_name: "Public product",
                    ad_format: "VIDEO",
                  },
                ],
                page_info: { total_page: 1 },
              },
            })
          : response({
              code: 0,
              data: {
                list: [
                  {
                    dimensions: { ad_id: "55", stat_time_day: day },
                    metrics: {
                      impressions: "100",
                      likes: "5",
                      comments: "2",
                      shares: "1",
                      spend: "10",
                      conversion: "2",
                    },
                  },
                ],
                page_info: { total_page: 1 },
              },
            }),
      ),
    });
    const tik = getAds(db, readBrand(db, "rhode")!, "TikTok")[0];
    assert.equal(tik.engagements, 8);
    assert.equal(tik.conversions, 2);
    assert.deepEqual(tik.creativeFormats, []);
    assert.equal(tik.dateBasis, "report");
    await syncConnection(db, "Google", "rhode", {
      env: {
        EXTER_GOOGLE_ACCESS_TOKEN: "fake-test-only",
        EXTER_GOOGLE_DEVELOPER_TOKEN: "fake-dev-only",
        EXTER_GOOGLE_CUSTOMER_ID: "12345",
        EXTER_GOOGLE_API_VERSION: "v26",
      },
      fetch: fakeFetch((url, init) => {
        assert.equal(url.hostname, "googleads.googleapis.com");
        assert.ok(String(init.body).includes("segments.date"));
        return response([
          {
            results: [
              {
                adGroupAd: { ad: { id: "99", type: "RESPONSIVE_SEARCH_AD" } },
                segments: { date: day },
                customer: { currencyCode: "GBP" },
                metrics: {
                  impressions: "1000",
                  engagements: "0",
                  costMicros: "10000000",
                  conversions: 2,
                  conversionsValue: 80,
                },
              },
            ],
          },
        ]);
      }),
    });
    const google = getAds(db, readBrand(db, "rhode")!, "Google")[0];
    assert.equal(google.spend, 10);
    assert.equal(google.revenue, 80);
    assert.deepEqual(google.creativeFormats, ["Search / text"]);
    assert.equal(google.currency, "GBP");
  } finally {
    db.close();
  }
});
