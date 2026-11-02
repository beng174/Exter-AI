import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectBrandDemo, demoBrandIdentity, mergeDemoAds, normalizeDemoCapture } from "../scripts/collect-brand-demo.js";
import { openDatabase } from "../server/db.js";
import type { Brand } from "../shared/types.js";

const identity = demoBrandIdentity({ name: "Fixture Candle Co", website: "https://fixture.example/", metaUrl: "https://www.facebook.com/ads/library/?view_all_page_id=1234567890", country: "GB", category: "Home fragrance & gifting" });
const brand: Brand = { id: "fixture-brand", name: identity.name, domain: identity.domain, category: identity.category, color: "#657869", initials: "FC", voice: [], competitors: [], mode: "imported", createdAt: "2026-11-01T12:00:00Z" };
function ad(extra: Record<string, unknown> = {}) {
  return { ad_archive_id: "2345678901", page_id: identity.pageId, is_active: true, start_date: 1767225600, end_date: 1767312000,
    publisher_platform: ["FACEBOOK", "INSTAGRAM"], snapshot: { page_id: identity.pageId, page_name: identity.advertiserName,
      body: { text: "A source-provided product description." }, title: "A product", display_format: "VIDEO",
      videos: [{ video_hd_url: "https://fixture.fbcdn.net/movie.mp4?signature=RAW_CAPTURE_ONLY" }] }, ...extra };
}
function capture(ads = [ad()], observedAt = "2026-11-01T12:00:00Z") {
  const requestUrl = `https://www.facebook.com/ads/library/?view_all_page_id=${identity.pageId}&country=GB&active_status=all&opaque=RAW_CAPTURE_ONLY`;
  return { observedAt, requestUrl, renderedUrl: requestUrl, status: 200, advertiserPageId: identity.pageId, country: "GB", ads };
}
const args = (path: string) => ["--name", identity.name, "--website", identity.websiteUrl, "--meta-url", identity.metaLibraryUrl, "--country", "GB", "--category", identity.category, "--input", path];

test("generic demo import keeps real source identity and dates without inventing media, metrics or model analysis", () => {
  const normalized = normalizeDemoCapture(capture(), identity, brand);
  const value = normalized.ads[0];
  assert.equal(value.brandId, brand.id); assert.equal(value.providerAdId, "2345678901"); assert.equal(value.advertiserPageId, identity.pageId);
  assert.equal(value.source, "public"); assert.equal(value.sourceUrl, "https://www.facebook.com/ads/library/?id=2345678901");
  assert.equal(value.deliveryStartAt, "2026-01-01T00:00:00.000Z"); assert.equal(value.publishedAt, value.deliveryStartAt); assert.equal(value.deliveryStopAt, undefined);
  assert.equal(value.observedAt, "2026-11-01T12:00:00.000Z"); assert.equal(value.metricsAvailable, false); assert.equal(value.engagementRateBasis, "unavailable");
  assert.equal(value.spend, null); assert.equal(value.owned, false); assert.equal(value.analysis, undefined); assert.equal(value.angle, "Not analysed");
  assert.ok(!JSON.stringify(normalized).includes("RAW_CAPTURE_ONLY")); assert.ok(!JSON.stringify(normalized).includes("fbcdn.net"));
});

test("identity validation rejects a different page, country or advertiser and retains only explicit partnership evidence", () => {
  assert.throws(() => normalizeDemoCapture({ ...capture(), advertiserPageId: "9999999999" }, identity, brand), /advertiser\/country/);
  assert.throws(() => normalizeDemoCapture({ ...capture(), country: "US" }, identity, brand), /advertiser\/country/);
  assert.throws(() => normalizeDemoCapture(capture([ad({ snapshot: { page_id: identity.pageId, page_name: "A different advertiser" } })]), identity, brand), /advertiser name/);
  assert.throws(() => normalizeDemoCapture(capture([ad({ page_id: "9999999999" })]), identity, brand), /No captured records/);
  const partnership = ad({ page_name: identity.advertiserName, snapshot: { page_id: "3456789012", page_name: "Fixture creator",
    page_profile_uri: "https://www.instagram.com/fixture_creator?opaque=RAW_CAPTURE_ONLY", branded_content: { page_id: identity.pageId, page_name: identity.advertiserName }, display_format: "VIDEO" } });
  const value = normalizeDemoCapture(capture([partnership]), identity, brand).ads[0];
  assert.deepEqual(value.brandedContentPartner, { pageId: "3456789012", name: "Fixture creator", profileUrl: "https://www.instagram.com/fixture_creator" });
  assert.deepEqual(value.creativeFormats, []);
  const numericPartnership = { ...partnership, snapshot: { ...partnership.snapshot,
    page_profile_uri: "https://www.facebook.com/profile.php?id=3456789012&opaque=RAW_CAPTURE_ONLY" } };
  const numericProfile = normalizeDemoCapture(capture([numericPartnership]), identity, brand).ads[0];
  assert.equal(numericProfile.brandedContentPartner?.profileUrl, "https://www.facebook.com/profile.php?id=3456789012");
  assert.throws(() => demoBrandIdentity({ name: "Fixture", website: "https://user:password@fixture.example", metaUrl: identity.metaLibraryUrl, country: "GB", category: identity.category }), /website/);
});

test("repeated imports preserve exact retained media/model analysis and earliest observation without reverting newer source evidence", () => {
  const first = normalizeDemoCapture(capture(), identity, brand).ads[0];
  first.videoMediaId = "retained-media-id"; first.analysis = { provenance: "model", keyMessage: "Retained analysis" };
  const latest = normalizeDemoCapture(capture([ad({ is_active: false })], "2026-11-02T12:00:00Z"), identity, brand).ads[0];
  const merged = mergeDemoAds([first], [latest, latest], identity, brand.id);
  assert.equal(merged.length, 1); assert.equal(merged[0].active, false); assert.equal(merged[0].videoMediaId, first.videoMediaId);
  assert.equal(merged[0].firstObservedAt, first.firstObservedAt); assert.deepEqual(merged[0].analysis, first.analysis);
  assert.equal(mergeDemoAds(merged, [first], identity, brand.id)[0].observedAt, latest.observedAt);
});

test("dry-run validates retained captures without creating files; imports are idempotent and record supplied identity provenance", async () => {
  const dir = await mkdtemp(join(tmpdir(), "exter-demo-import-")), input = join(dir, "raw.json"), dbPath = join(dir, "source.db"), output = join(dir, "evidence.json");
  try {
    await writeFile(input, JSON.stringify(capture()));
    const dry = await collectBrandDemo([...args(input), "--dry-run", "--db", dbPath, "--output", output]);
    assert.equal(dry.uniqueAds, 1); assert.equal(dry.inferenceRequests, 0);
    await assert.rejects(stat(dbPath)); await assert.rejects(stat(output));
    const imported = await collectBrandDemo([...args(input), "--db", dbPath, "--output", output]);
    const beforeRefresh = openDatabase(dbPath, false);
    try {
      const row = beforeRefresh.prepare("SELECT id,data FROM ads LIMIT 1").get() as { id: string; data: string };
      beforeRefresh.prepare("UPDATE ads SET data=? WHERE id=?").run(JSON.stringify({ ...JSON.parse(row.data), videoMediaId: "preserved-media-id", analysis: { provenance: "model", keyMessage: "PRIVATE_SAVED_ANALYSIS_NOT_SOURCE_CAPTURE" } }), row.id);
    } finally { beforeRefresh.close(); }
    const again = await collectBrandDemo([...args(input), "--db", dbPath, "--output", output]);
    assert.equal(imported.brandId, again.brandId); assert.equal(again.uniqueAds, 1);
    const db = openDatabase(dbPath, false);
    try {
      assert.equal((db.prepare("SELECT count(*) AS n FROM brands").get() as { n: number }).n, 1);
      assert.equal((db.prepare("SELECT count(*) AS n FROM ads").get() as { n: number }).n, 1);
      assert.equal((db.prepare("SELECT count(*) AS n FROM brand_demo_capture_sources").get() as { n: number }).n, 2);
      const saved = JSON.parse((db.prepare("SELECT data FROM ads LIMIT 1").get() as { data: string }).data);
      assert.equal(saved.videoMediaId, "preserved-media-id"); assert.equal(saved.analysis.keyMessage, "PRIVATE_SAVED_ANALYSIS_NOT_SOURCE_CAPTURE");
    } finally { db.close(); }
    const evidence = await readFile(output, "utf8");
    assert.match(evidence, /No independent website ownership verification is claimed/); assert.ok(!evidence.includes("RAW_CAPTURE_ONLY"));
    assert.ok(!evidence.includes("fbcdn.net"));
    assert.ok(!evidence.includes("PRIVATE_SAVED_ANALYSIS_NOT_SOURCE_CAPTURE")); assert.ok(!evidence.includes("preserved-media-id"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("invalid source captures stop before a destination database is opened", async () => {
  const dir = await mkdtemp(join(tmpdir(), "exter-demo-reject-")), input = join(dir, "raw.json"), dbPath = join(dir, "source.db");
  try {
    await writeFile(input, JSON.stringify({ ...capture(), observedAt: undefined }));
    await assert.rejects(collectBrandDemo([...args(input), "--db", dbPath]), /actual ISO/);
    await assert.rejects(stat(dbPath));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
