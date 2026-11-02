import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pg from "pg";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { CreatorResearchService, creatorMetrics, type CreatorResearchOptions } from "../server/creators/service.js";
import { attachCreatorResearch } from "../server/creators/api.js";
import { CreatorProviderError } from "../server/creators/types.js";
import type { CreatorPublicProfile } from "../shared/creator-research.js";

function fixture() {
  const db = openDatabase(":memory:", false);
  const brand = { id: "brand", name: "Fragrance Brand", category: "Home fragrance & gifting", mode: "imported", voice: ["calm", "accessible"], domain: "brand.example" };
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  const saveAd = (id: string, extra: Record<string, unknown> = {}) => {
    const ad = { id, brandId: brand.id, brand: brand.name, source: "public", platform: "Meta", publishedAt: "2026-11-01", providerAdId: id, sourceUrl: `https://www.facebook.com/ads/library/?id=${id}`, advertiserPageId: "111", brandedContentPartner: { pageId: "222", name: "Public Partner", profileUrl: "https://www.facebook.com/profile.php?id=222" }, ...extra };
    db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(id, brand.id, ad.source as string, ad.platform as string, ad.publishedAt as string, JSON.stringify(ad));
  };
  saveAd("1001"); saveAd("1002");
  saveAd("sample", { source: "sample" });
  saveAd("own", { brandedContentPartner: { pageId: "111", name: "Brand", profileUrl: null } });
  saveAd("unverified", { source: "import" });
  saveAd("wrong-source", { sourceUrl: "https://example.com/ad" });
  return { db, brand };
}
const observedAt = "2026-11-02T00:00:00.000Z";
const profile = (): CreatorPublicProfile => ({ platform: "instagram", handle: "real_creator", displayName: "Real Creator", profileUrl: "https://www.instagram.com/real_creator/", sourceUrl: "https://www.instagram.com/real_creator/", evidenceUrl: "https://www.instagram.com/real_creator/", bio: "Public home fragrance posts", followers: 1000, following: null, postsCount: null, country: null, category: null, observedAt,
  recentPosts: [
    { id: "one", url: "https://www.instagram.com/p/one/", publishedAt: "2026-10-01", caption: "An accessible scent gift set", views: 100, likes: 10, comments: 2, shares: null, observedAt, evidenceUrl: "https://www.instagram.com/p/one/" },
    { id: "two", url: "https://www.instagram.com/p/two/", publishedAt: "2026-10-02", caption: "At home", views: 50, likes: 5, comments: null, shares: 1, observedAt, evidenceUrl: "https://www.instagram.com/p/two/" },
    { id: "three", url: "https://www.instagram.com/p/three/", publishedAt: null, caption: null, views: 0, likes: 0, comments: 0, shares: null, observedAt, evidenceUrl: "https://www.instagram.com/p/three/" },
    { id: "four", url: "https://www.instagram.com/p/four/", publishedAt: "2026-10-03", caption: "Fragrance", views: null, likes: 4, comments: 1, shares: null, observedAt, evidenceUrl: "https://www.instagram.com/p/four/" },
  ] });
const providerAccounting = { reservedCostGbp: 0.5, billedCostGbp: null, requestAttempts: 1, runIds: ["public-run"] } as const;
const discovery = (search: NonNullable<CreatorResearchOptions["discovery"]>["search"]) => ({ status: () => ({ configured: true, platforms: ["instagram" as const] }), search });

test("creator read derives only Meta partner-label seeds and changes no stored data or network state", () => {
  const { db } = fixture(); let calls = 0;
  try {
    const service = new CreatorResearchService(db, { discovery: discovery(async () => { calls++; throw new Error("No read may search"); }) });
    const before = db.prepare("SELECT total_changes() AS changes").get();
    const snapshot = service.snapshot("brand");
    assert.equal(snapshot.candidates.length, 1);
    assert.equal(snapshot.seeds[0].displayName, "Public Partner");
    assert.equal(snapshot.seeds[0].profileUrl, "https://www.facebook.com/profile.php?id=222");
    assert.deepEqual(snapshot.seeds[0].seedEvidence.map(evidence => evidence.providerAdId), ["1001", "1002"]);
    assert.equal(snapshot.seeds[0].seedEvidence[0].adUrl, "https://www.facebook.com/ads/library/?id=1001");
    assert.equal(snapshot.candidates[0].profile, null);
    assert.equal(snapshot.candidates[0].fit, null);
    assert.equal(snapshot.candidates[0].metrics.followers, null);
    service.snapshot("brand"); service.report("brand");
    assert.deepEqual(db.prepare("SELECT total_changes() AS changes").get(), before);
    assert.equal(calls, 0);
    assert.throws(() => service.snapshot("another-brand"), /not found/);
  } finally { db.close(); }
});
test("creator public metrics preserve missing counts and explicitly exclude unknown denominators", () => {
  const metrics = creatorMetrics(profile());
  assert.equal(metrics.engagementPerView.valuePercent, 12);
  assert.equal(metrics.engagementPerView.eligiblePosts, 1);
  assert.equal(metrics.engagementPerView.excludedPosts, 3);
  assert.equal(metrics.engagementPerView.numeratorTotal, 12);
  assert.equal(metrics.engagementPerView.denominatorTotal, 100);
  assert.equal(metrics.engagementPerFollower.eligiblePosts, 3);
  assert.equal(metrics.engagementPerFollower.excludedPosts, 1);
  assert.equal(metrics.engagementPerFollower.numeratorTotal, 17);
  assert.equal(metrics.engagementPerFollower.denominatorTotal, 3000);
  assert.equal(metrics.averageViews, 50);
  assert.equal(metrics.windowStart, "2026-10-01T00:00:00.000Z");
  assert.equal(metrics.windowEnd, "2026-10-03T00:00:00.000Z");
  assert.equal(creatorMetrics({ ...profile(), followers: null }).engagementPerFollower.valuePercent, null);
  assert.equal(creatorMetrics(null).engagementPerView.valuePercent, null);
});
test("explicit search persists nullable public observations and fit cites stored examples without inventing Meta identity", async () => {
  const { db } = fixture(); let searches = 0, fits = 0;
  try {
    const service = new CreatorResearchService(db, { discovery: discovery(async input => {
      searches++; assert.equal(input.maxProfiles, 5); assert.equal(input.maxPostsPerProfile, 12);
      assert.equal(input.seedHandles, undefined, "Meta partner names never become guessed platform handles");
      return { profiles: [profile()], accounting: { ...providerAccounting, runIds: [...providerAccounting.runIds] }, warnings: [] };
    }), fitAnalyser: async input => {
      fits++; assert.equal(input.sourceContext.posts[0].id, "one"); assert.equal(input.sourceContext.category, "Home fragrance", "Fit uses the operator's saved, specific search category");
      return { categoryRelevance: "high", toneFit: "medium", reason: "The public gift-set caption matches the saved fragrance category.", evidencePostUrls: [input.sourceContext.posts[0].url], requestedModel: "gemini-fixture-flash", servedModel: "gemini-fixture-flash-001" };
    } });
    const saved = await service.search({ brandId: "brand", platform: "instagram", country: "GB", category: "Home fragrance", query: "scent" });
    const candidate = saved.candidates.find(item => item.profile)!;
    assert.equal(candidate.source, "apify-public"); assert.deepEqual(candidate.seedEvidence, []);
    assert.equal(candidate.profile!.country, null, "requested country never becomes observed creator country");
    assert.equal(candidate.profile!.recentPosts[1].comments, null);
    assert.equal(candidate.searchContext!.country, "GB");
    assert.equal(saved.searches[0].accounting.reservedCostGbp, 0.5);
    assert.equal(saved.searches[0].accounting.billedCostGbp, null);
    const result = await service.fit("brand", candidate.id);
    assert.equal(result.assessment.status, "complete"); assert.equal(result.assessment.categoryRelevance, "high");
    assert.equal(result.assessment.sourceContext.posts[0].caption, "An accessible scent gift set");
    assert.deepEqual(result.assessment.evidencePostUrls, ["https://www.instagram.com/p/one/"]);
    service.shortlist("brand", candidate.id, true);
    const readOnly = service.snapshot("brand"); assert.equal(readOnly.candidates[0].shortlisted, true);
    assert.match(service.report("brand"), /ad 1001/); assert.match(service.report("brand"), /likes \+ comments \/ eligible views/);
    assert.equal(searches, 1); assert.equal(fits, 1);
    const reopened = new CreatorResearchService(db, { discovery: discovery(async () => { throw new Error("No read may search"); }) });
    assert.equal(reopened.snapshot("brand").candidates.find(item => item.id === candidate.id)?.profile?.recentPosts[1].comments, null);
  } finally { db.close(); }
});
test("missing posts and unsupported citations leave unknown fit, while failed provider reservations persist", async () => {
  const { db } = fixture(); let fits = 0;
  try {
    const service = new CreatorResearchService(db, { discovery: discovery(async () => { throw new CreatorProviderError("unavailable", "Public provider timed out.", { ...providerAccounting, runIds: [...providerAccounting.runIds] }); }), fitAnalyser: async () => { fits++; throw new Error("No missing-post inference"); } });
    const seed = service.snapshot("brand").seeds[0];
    const fit = await service.fit("brand", seed.id);
    assert.equal(fit.assessment.status, "unavailable"); assert.equal(fit.assessment.toneFit, "unknown"); assert.equal(fits, 0);
    await assert.rejects(service.search({ brandId: "brand", platform: "instagram", country: "GB", category: "Fragrance" }), /timed out/);
    assert.equal(service.snapshot("brand").searches[0].status, "failed");
    assert.equal(service.snapshot("brand").searches[0].accounting.reservedCostGbp, 0.5);
    const invalid = new CreatorResearchService(db, { discovery: discovery(async () => ({ profiles: [profile()], accounting: { ...providerAccounting, runIds: [...providerAccounting.runIds] }, warnings: [] })), fitAnalyser: async () => ({ categoryRelevance: "high", toneFit: "high", reason: "Unsupported", evidencePostUrls: ["https://example.com/invented-post"] }) });
    const searched = await invalid.search({ brandId: "brand", platform: "instagram", country: "GB", category: "Fragrance" });
    const bad = await invalid.fit("brand", searched.candidates.find(item => item.profile)!.id);
    assert.equal(bad.assessment.status, "failed"); assert.equal(bad.assessment.categoryRelevance, "unknown"); assert.deepEqual(bad.assessment.evidencePostUrls, []);
  } finally { db.close(); }
});
test("default creator fit requires budget configuration before any provider or ledger dispatch in development", async context => {
  const { db } = fixture();
  const names = ["NODE_ENV", "DATABASE_URL", "GEMINI_REQUEST_RESERVE_GBP", "GEMINI_API_KEY", "GEMINI_VIDEO_MODEL"] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let fetchCalls = 0, ledgerCalls = 0;
  context.mock.method(globalThis, "fetch", async () => { fetchCalls++; throw new Error("Unexpected provider dispatch"); });
  context.mock.method(pg.Pool.prototype, "connect", async () => { ledgerCalls++; throw new Error("Unexpected ledger dispatch"); });
  try {
    process.env.NODE_ENV = "development";
    process.env.GEMINI_API_KEY = "fixture-only-key";
    process.env.GEMINI_VIDEO_MODEL = "gemini-fixture-flash";
    const service = new CreatorResearchService(db, { discovery: discovery(async () => ({ profiles: [profile()], accounting: { ...providerAccounting, runIds: [...providerAccounting.runIds] }, warnings: [] })) });
    const searched = await service.search({ brandId: "brand", platform: "instagram", country: "GB", category: "Fragrance" });
    const candidate = searched.candidates.find(item => item.profile)!;
    for (const [database, reserve] of [[undefined, "0.5"], [" ", "0.5"], ["postgresql://fixture.invalid/budget", undefined], ["postgresql://fixture.invalid/budget", ""], ["postgresql://fixture.invalid/budget", "0"], ["postgresql://fixture.invalid/budget", "-1"], ["postgresql://fixture.invalid/budget", "NaN"], ["postgresql://fixture.invalid/budget", "Infinity"]]) {
      if (database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = database;
      if (reserve === undefined) delete process.env.GEMINI_REQUEST_RESERVE_GBP; else process.env.GEMINI_REQUEST_RESERVE_GBP = reserve;
      const { assessment } = await service.fit("brand", candidate.id);
      assert.equal(assessment.status, "failed");
      assert.equal(assessment.categoryRelevance, "unknown");
      assert.equal(assessment.toneFit, "unknown");
      assert.match(assessment.error || "", /Paid creator fit is paused.*DATABASE_URL.*GEMINI_REQUEST_RESERVE_GBP/);
      assert.equal(fetchCalls, 0);
      assert.equal(ledgerCalls, 0);
    }
  } finally {
    db.close();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
});
test("creator endpoints require app authentication and same-origin JSON before paid actions", async () => {
  const { db } = fixture(); let calls = 0;
  const app = express();
  app.use(basicAuth({ EXTER_ADMIN_USER: "fixture", EXTER_ADMIN_PASSWORD: "fixture-password", NODE_ENV: "test" })); app.use(express.json());
  attachCreatorResearch(app, db, { discovery: discovery(async () => { calls++; return { profiles: [], accounting: { ...providerAccounting, runIds: [...providerAccounting.runIds] }, warnings: [] }; }) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as import("node:net").AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const authorization = `Basic ${Buffer.from("fixture:fixture-password").toString("base64")}`;
  try {
    assert.equal((await fetch(`${base}/api/creator-research?brandId=brand`)).status, 401);
    assert.equal((await fetch(`${base}/api/creator-research?brandId=brand`, { headers: { authorization } })).status, 200);
    assert.equal((await fetch(`${base}/api/creator-research/search`, { method: "POST", headers: { authorization, "content-type": "application/json", origin: "https://foreign.example" }, body: JSON.stringify({ brandId: "brand", platform: "instagram", country: "GB", category: "Fragrance" }) })).status, 403);
    assert.equal((await fetch(`${base}/api/creator-research/search`, { method: "POST", headers: { authorization, "content-type": "text/plain" }, body: "{}" })).status, 415);
    assert.equal(calls, 0);
    const response = await fetch(`${base}/api/creator-research/search`, { method: "POST", headers: { authorization, "content-type": "application/json", origin: base }, body: JSON.stringify({ brandId: "brand", platform: "instagram", country: "GB", category: "Fragrance" }) });
    assert.equal(response.status, 201); assert.equal(calls, 1);
    assert.equal((await fetch(`${base}/api/creator-research/report?brandId=brand`, { headers: { authorization } })).headers.get("content-type"), "text/markdown; charset=utf-8");
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); db.close(); }
});
