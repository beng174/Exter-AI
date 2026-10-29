import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import type { Brand, Dashboard, Report } from "../shared/types.js";

const temp = mkdtempSync(join(tmpdir(), "exter-test-"));
const path = join(temp, "workspace.db");
let db: ReturnType<typeof openDatabase>;
let server: Server;
let base: string;
before(async () => {
  db = openDatabase(path);
  server = createServer(createApp(db));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(temp, { recursive: true, force: true });
});
async function get<T = any>(url: string): Promise<T> {
  const response = await fetch(base + url);
  assert.equal(response.status, 200);
  return response.json();
}
async function post(url: string, body: unknown) {
  return fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const row = (overrides: Record<string, unknown> = {}) => ({
  brand: "Test Brand",
  platform: "Meta",
  title: "Try the daily ritual",
  angle: "Daily ritual",
  audience: "Routine builders",
  impressions: 1000,
  engagements: 50,
  publishedAt: new Date().toISOString(),
  ...overrides,
});
let importedBrand: Brand;

test("seeds thousands of ads once and exposes explicit sample provenance", async () => {
  const brands = await get<Brand[]>("/api/brands");
  assert.equal(brands.length, 4);
  const count = db.prepare("SELECT count(*) AS total FROM ads").get()!.total;
  assert.equal(count, 2400);
  const dash = await get<Dashboard>("/api/dashboard?brandId=rhode&range=90");
  assert.equal(dash.mode, "demo");
  assert.equal(dash.metrics.ads, 600);
  assert.equal(dash.sampleCount, 600);
  assert.equal(dash.competitors.length, 4);
  assert.ok(dash.metrics.engagementRate > 0);
  assert.ok(dash.ads.every((ad) => ad.source === "sample"));
  assert.ok(dash.creators.every((c) => c.category === "Beauty & skincare"));
});
test("date, platform, category, search and pagination filters affect selected records", async () => {
  const all = await get<Dashboard>("/api/dashboard?brandId=rhode&range=90");
  const meta = await get<Dashboard>(
    "/api/dashboard?brandId=rhode&range=90&platform=Meta",
  );
  const week = await get<Dashboard>("/api/dashboard?brandId=rhode&range=7");
  assert.ok(meta.metrics.ads < all.metrics.ads);
  assert.ok(week.metrics.ads < all.metrics.ads);
  assert.ok(meta.ads.every((a) => a.platform === "Meta"));
  const search = await get(
    "/api/ads?brandId=rhode&range=90&search=Glossier&page=1",
  );
  assert.equal(search.items.length, 12);
  assert.ok(search.items.every((a: any) => a.brand === "Glossier"));
  assert.equal(search.total, 150);
  const next = await get(
    "/api/ads?brandId=rhode&range=90&search=Glossier&page=2",
  );
  assert.notEqual(search.items[0].id, next.items[0].id);
  const fashion = await get<Dashboard>(
    "/api/dashboard?brandId=aritzia&range=90",
  );
  assert.ok(fashion.ads.every((a) => a.category === "Fashion"));
  const bad = await fetch(base + "/api/dashboard?brandId=rhode&range=1000");
  assert.equal(bad.status, 400);
});
test("unknown brands start empty without invented competitors, reviews or matches", async () => {
  const response = await post("/api/brands", {
    name: "Test Brand",
    domain: "testbrand.example",
    category: "Fashion",
  });
  assert.equal(response.status, 201);
  importedBrand = await response.json();
  const dash = await get<Dashboard>(
    `/api/dashboard?brandId=${importedBrand.id}`,
  );
  assert.equal(dash.mode, "imported");
  assert.equal(dash.metrics.ads, 0);
  assert.equal(dash.metrics.conversions, null);
  assert.deepEqual(dash.competitors, []);
  assert.deepEqual(dash.creators, []);
  assert.deepEqual(dash.reviews, []);
});
test("imports validate an entire batch before writing and reject fabricated competitor conversions", async () => {
  for (const invalid of [
    row({ impressions: -1 }),
    row({ platform: "Other" }),
    row({ publishedAt: "2026-02-31" }),
    row({ brand: "Competitor", conversions: 50 }),
    row({ brand: "Competitor", owned: true, conversions: 50 }),
    row({ owned: "true" }),
    row({ sourceUrl: "javascript:alert(1)" }),
  ]) {
    const response = await post("/api/import", {
      brandId: importedBrand.id,
      ads: [row(), invalid],
    });
    assert.equal(response.status, 400);
  }
  const dash = await get<Dashboard>(
    `/api/dashboard?brandId=${importedBrand.id}`,
  );
  assert.equal(dash.metrics.ads, 0);
});
test("imports isolate data and calculate weighted engagement and owned-only conversions", async () => {
  const response = await post("/api/import", {
    brandId: importedBrand.id,
    ads: [
      row({ owned: true, conversions: 10, spend: 200, revenue: 500 }),
      row({
        brand: "Competitor",
        audience: "Competitor audience",
        impressions: 3000,
        engagements: 90,
      }),
    ],
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).imported, 2);
  const dash = await get<Dashboard>(
    `/api/dashboard?brandId=${importedBrand.id}`,
  );
  assert.equal(dash.metrics.ads, 2);
  assert.ok(Math.abs(dash.metrics.engagementRate - 3.5) < 1e-9);
  assert.equal(dash.metrics.conversions, 10);
  assert.equal(dash.metrics.spend, 200);
  assert.equal(dash.angles[0].cpa, 20);
  assert.equal(dash.audiencePerformance!.length, 2);
  const ownedAudience = dash.audiencePerformance!.find(
    (audience) => audience.name === "Routine builders",
  )!;
  const competitorAudience = dash.audiencePerformance!.find(
    (audience) => audience.name === "Competitor audience",
  )!;
  assert.equal(ownedAudience.ads, 1);
  assert.equal(ownedAudience.impressions, 1000);
  assert.equal(ownedAudience.engagements, 50);
  assert.equal(ownedAudience.engagementRate, 5);
  assert.equal(ownedAudience.conversions, 10);
  assert.equal(ownedAudience.cpa, 20);
  assert.equal(competitorAudience.ads, 1);
  assert.equal(competitorAudience.engagementRate, 3);
  assert.equal(competitorAudience.conversions, null);
  assert.equal(competitorAudience.cpa, null);
  assert.equal(dash.mode, "imported");
  assert.equal(dash.sampleCount, 0);
  const emptyMeta = await get<Dashboard>(
    `/api/dashboard?brandId=${importedBrand.id}&platform=TikTok`,
  );
  assert.equal(emptyMeta.metrics.ads, 0);
});
test("importing into a demo brand hides sample ads, reviews and creator suggestions", async () => {
  const response = await post("/api/import", {
    brandId: "olipop",
    ads: [row({ brand: "OLIPOP", owned: true })],
  });
  assert.equal(response.status, 201);
  const dash = await get<Dashboard>("/api/dashboard?brandId=olipop&range=90");
  assert.equal(dash.metrics.ads, 1);
  assert.equal(dash.mode, "imported");
  assert.equal(dash.sampleCount, 0);
  assert.equal(dash.creators.length, 0);
  assert.equal(dash.reviews.length, 0);
  assert.ok(dash.ads.every((a) => a.source === "import"));
});
test("shortlist toggles persist and cannot leak other categories into a workspace", async () => {
  const creators = await get("/api/creators?brandId=rhode");
  const response = await post("/api/shortlist", {
    brandId: "rhode",
    creatorId: creators[0].id,
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).ids, [creators[0].id]);
  assert.deepEqual((await get("/api/shortlist?brandId=rhode")).ids, [
    creators[0].id,
  ]);
  const mismatch = await post("/api/shortlist", {
    brandId: "aritzia",
    creatorId: creators[0].id,
  });
  assert.equal(mismatch.status, 400);
  const removed = await post("/api/shortlist", {
    brandId: "rhode",
    creatorId: creators[0].id,
  });
  assert.deepEqual((await removed.json()).ids, []);
});
test("report generation, list and downloads retain provenance and measured results", async () => {
  const response = await post("/api/reports", { brandId: importedBrand.id });
  assert.equal(response.status, 201);
  const report: Report = await response.json();
  assert.equal(report.mode, "imported");
  assert.match(report.content, /USER-IMPORTED DATA/);
  assert.match(report.content, /2 ads across 2 brands/);
  assert.match(report.content, /not a conversion ranking/);
  const list = await get<Report[]>(`/api/reports?brandId=${importedBrand.id}`);
  assert.equal(list.length, 1);
  const downloaded = await fetch(base + `/api/reports/${report.id}/download`);
  assert.match(downloaded.headers.get("content-disposition")!, /attachment/);
  assert.equal(await downloaded.text(), report.content);
});
test("research answers use selected data, disclose rule-based grounding and avoid conversion claims", async () => {
  const response = await post("/api/ask", {
    brandId: importedBrand.id,
    question: "Which competitors convert best?",
  });
  const answer = await response.json();
  assert.equal(answer.mode, "rule-based");
  assert.match(answer.answer, /Competitor conversions are not available/);
  assert.match(answer.answer, /10 conversions/);
  assert.ok(answer.sources.length > 0);
  const filtered = await post("/api/ask", {
    brandId: importedBrand.id,
    question: "What is winning?",
    platform: "Google",
  });
  assert.match((await filtered.json()).answer, /no ad records/);
});
test("trend groups observed engagements by publication date and averages across all observed competitor brands", async () => {
  const created = await post("/api/brands", {
    name: "Trend Brand",
    category: "Fashion",
  });
  const brand: Brand = await created.json();
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const response = await post("/api/import", {
    brandId: brand.id,
    ads: [
      row({
        brand: "Trend Brand",
        owned: true,
        engagements: 50,
        publishedAt: today,
      }),
      row({ brand: "Competitor A", engagements: 90, publishedAt: today }),
      row({ brand: "Competitor B", engagements: 80, publishedAt: yesterday }),
    ],
  });
  assert.equal(response.status, 201);
  const dash = await get<Dashboard>(`/api/dashboard?brandId=${brand.id}`);
  const todayPoint = dash.trend.find(
    (point) => point.date === today.slice(0, 10),
  )!;
  const yesterdayPoint = dash.trend.find(
    (point) => point.date === yesterday.slice(0, 10),
  )!;
  assert.equal(todayPoint.brand, 50);
  assert.equal(todayPoint.competitors, 45); // A's 90 / both observed competitors, including inactive B.
  assert.equal(yesterdayPoint.brand, 0);
  assert.equal(yesterdayPoint.competitors, 40); // B's 80 / both observed competitors.
  assert.equal(dash.trend.length, 30);
});
test("stored imports, brands, reports and seed count survive reopening the database", async () => {
  const reopened = openDatabase(path);
  assert.equal(
    reopened.prepare("SELECT count(*) AS total FROM ads").get()!.total,
    2406,
  );
  assert.ok(
    reopened
      .prepare("SELECT data FROM brands WHERE id=?")
      .get(importedBrand.id),
  );
  assert.equal(
    reopened.prepare("SELECT count(*) AS total FROM reports").get()!.total,
    1,
  );
  reopened.close();
});
test("invalid JSON and missing workspaces return explicit errors without crashing", async () => {
  const response = await fetch(base + "/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid",
  });
  assert.equal(response.status, 400);
  assert.equal(
    (await fetch(base + "/api/dashboard?brandId=not-found")).status,
    404,
  );
  assert.equal((await fetch(base + "/api/health")).status, 200);
});

test("a 10,000-record import aggregates completely and paginates without truncation; 10,001 records are rejected atomically", async (t) => {
  const scaleDb = openDatabase(":memory:", false);
  const scaleServer = createServer(createApp(scaleDb));
  await new Promise<void>((resolve) =>
    scaleServer.listen(0, "127.0.0.1", resolve),
  );
  const scaleBase = `http://127.0.0.1:${(scaleServer.address() as AddressInfo).port}`;
  async function send(url: string, body: unknown) {
    return fetch(scaleBase + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  try {
    const created = await send("/api/brands", {
      name: "Scale Brand",
      category: "Fashion",
    });
    assert.equal(created.status, 201);
    const brand: Brand = await created.json();
    const started = performance.now();
    const records = Array.from({ length: 10000 }, (_, index) =>
      row({
        brand: "Scale Brand",
        title: `Scale ad ${index}`,
        owned: true,
        impressions: 1000,
        engagements: 50 + (index % 5),
        conversions: 2,
        spend: 25,
        audience: index % 2 ? "Audience A" : "Audience B",
      }),
    );
    const imported = await send("/api/import", {
      brandId: brand.id,
      ads: records,
    });
    assert.equal(imported.status, 201);
    assert.equal((await imported.json()).imported, 10000);
    const response = await fetch(
      `${scaleBase}/api/dashboard?brandId=${brand.id}&range=30`,
    );
    assert.equal(response.status, 200);
    const dash: Dashboard = await response.json();
    assert.equal(dash.metrics.ads, 10000);
    assert.equal(dash.metrics.impressions, 10000000);
    assert.equal(dash.metrics.engagements, 520000);
    assert.ok(Math.abs(dash.metrics.engagementRate - 5.2) < 1e-9);
    assert.equal(dash.metrics.conversions, 20000);
    assert.equal(dash.metrics.spend, 250000);
    assert.equal(dash.angles[0].cpa, 12.5);
    assert.equal(dash.audiencePerformance!.length, 2);
    for (const audience of dash.audiencePerformance!) {
      assert.equal(audience.ads, 5000);
      assert.equal(audience.conversions, 10000);
      assert.equal(audience.cpa, 12.5);
    }
    const first = await (
      await fetch(`${scaleBase}/api/ads?brandId=${brand.id}&page=1`)
    ).json();
    assert.equal(first.total, 10000);
    assert.equal(first.items.length, 12);
    assert.equal(first.pages, 834);
    const last = await (
      await fetch(`${scaleBase}/api/ads?brandId=${brand.id}&page=834`)
    ).json();
    assert.equal(last.total, 10000);
    assert.equal(last.items.length, 4);
    assert.ok(
      last.items.every(
        (ad: { id: string }) =>
          !first.items.some((firstAd: { id: string }) => firstAd.id === ad.id),
      ),
    );
    const rejected = await send("/api/import", {
      brandId: brand.id,
      ads: [...records, records[0]],
    });
    assert.equal(rejected.status, 400);
    assert.equal(
      scaleDb.prepare("SELECT count(*) AS total FROM ads").get()!.total,
      10000,
    );
    t.diagnostic(
      `10,000-row import, full aggregation, pagination and oversized-batch rejection completed in ${(performance.now() - started).toFixed(0)} ms (informational; no timing threshold).`,
    );
    // A separate zero-conversion group must report unavailable CPA instead of Infinity/NaN.
    const zero = await send("/api/import", {
      brandId: brand.id,
      ads: [
        row({
          brand: "Scale Brand",
          owned: true,
          angle: "Zero conversions",
          conversions: 0,
          spend: 25,
        }),
      ],
    });
    assert.equal(zero.status, 201);
    const afterZero: Dashboard = await (
      await fetch(`${scaleBase}/api/dashboard?brandId=${brand.id}`)
    ).json();
    assert.equal(
      afterZero.angles.find((angle) => angle.name === "Zero conversions")!.cpa,
      null,
    );
  } finally {
    await new Promise<void>((resolve) => scaleServer.close(() => resolve()));
    scaleDb.close();
  }
});
