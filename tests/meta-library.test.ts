import { test } from "node:test";
import assert from "node:assert/strict";
import type { Brand } from "../shared/types.js";
import {
  normalizeMetaLibraryCapture,
  mergeMetaLibraryAds,
  buildMetaLibrarySnapshot,
  VALENTTE_META_PAGE_ID,
} from "../shared/meta-library.js";
const brand: Brand = {
  id: "valentte", name: "Valentte", domain: "valentte.com",
  category: "Home fragrance & gifting", color: "#555", initials: "V",
  voice: [], competitors: [], mode: "imported", createdAt: "2026-10-01T00:00:00.000Z",
};
const native = (extra: Record<string, unknown> = {}) => ({
  ad_archive_id: "123456789012345", page_id: VALENTTE_META_PAGE_ID,
  is_active: true, start_date: 1767225600, end_date: 1767312000,
  publisher_platform: ["FACEBOOK", "INSTAGRAM"],
  snapshot: { page_id: VALENTTE_META_PAGE_ID, page_name: "Valentte",
    title: "A fragrance gift", body: { text: "A reed diffuser for your home." }, display_format: "VIDEO" },
  ...extra,
});
const capture = (ads: unknown[] = [native()], observedAt = "2026-10-30T00:37:27.728037+00:00") => ({
  requestUrl: `https://www.facebook.com/ads/library/?view_all_page_id=${VALENTTE_META_PAGE_ID}`,
  renderedUrl: `https://www.facebook.com/ads/library/?view_all_page_id=${VALENTTE_META_PAGE_ID}`,
  observedAt, status: 200, ads,
});
test("Meta library dates represent delivery, not post publication or capture time", () => {
  const result = normalizeMetaLibraryCapture(capture(), brand);
  const ad = result.ads[0];
  assert.equal(ad.dateBasis, "delivery");
  assert.equal(ad.deliveryStartAt, "2026-01-01T00:00:00.000Z");
  assert.equal(ad.publishedAt, ad.deliveryStartAt);
  assert.equal(ad.observedAt, "2026-10-30T00:37:27.728Z");
  assert.equal(ad.deliveryStopAt, undefined, "active-card end_date is not evidence delivery stopped");
  assert.equal(ad.firstObservedAt, ad.observedAt);
});
test("Missing public measurements cannot become engagement rates or private outcomes", () => {
  const ad = normalizeMetaLibraryCapture(capture([native({ impressions: 40000, engagements: 2500, conversions: 500 })]), brand).ads[0];
  assert.equal(ad.metricsAvailable, false);
  assert.equal(ad.engagementRateBasis, "unavailable");
  assert.equal(ad.engagements, 0);
  assert.equal(ad.impressions, 0);
  assert.equal(ad.owned, false);
  assert.equal(ad.conversions, null);
  assert.equal(ad.spend, null);
  assert.equal(ad.revenue, null);
  assert.deepEqual(ad.creativeFormats, [], "video does not establish UGC/influencer origin");
});
test("Advertiser identity excludes keyword matches and rejects inconsistent source identity", () => {
  const result = normalizeMetaLibraryCapture(capture([native(), native({ page_id: "999999999999999" })]), brand);
  assert.equal(result.ads.length, 1);
  assert.equal(result.excludedAdvertiserRecords, 1);
  assert.throws(() => normalizeMetaLibraryCapture(capture([native({ snapshot: { page_id: VALENTTE_META_PAGE_ID, page_name: "Another advertiser" } })]), brand), /identity/);
  assert.throws(() => normalizeMetaLibraryCapture(capture(), { ...brand, domain: "different.com" }), /scoped/);
});
test("Partnership cards retain only explicitly linked branded-content evidence", () => {
  const partnership = native({ page_name: "Valentte", snapshot: {
    page_id: "922752257597312", page_name: "_sheisgreta",
    page_profile_uri: "https://www.instagram.com/_u/_sheisgreta",
    branded_content: { page_id: VALENTTE_META_PAGE_ID, page_name: "Valentte" },
    body: { text: "An at-home fragrance video." }, display_format: "VIDEO",
  } });
  const ad = normalizeMetaLibraryCapture(capture([partnership]), brand).ads[0];
  assert.deepEqual(ad.brandedContentPartner, {
    pageId: "922752257597312", name: "_sheisgreta", profileUrl: "https://www.instagram.com/_u/_sheisgreta",
  });
  assert.deepEqual(ad.creativeFormats, [], "partnership evidence alone does not classify a creative's style");
  assert.throws(() => normalizeMetaLibraryCapture(capture([{ ...partnership, snapshot: {
    ...partnership.snapshot, branded_content: { page_id: "999999999999999", page_name: "Another brand" },
  } }]), brand), /identity/);
});
test("Source provenance, excerpts and numeric native IDs are validated", () => {
  assert.throws(() => normalizeMetaLibraryCapture({ ...capture(), observedAt: undefined }, brand), /timestamp/);
  assert.throws(() => normalizeMetaLibraryCapture({ ...capture(), observedAt: "2026-10-30T00:37:27" }, brand), /timestamp/);
  assert.throws(() => normalizeMetaLibraryCapture({ ...capture(), renderedUrl: "https://example.com/ads/library/" }, brand), /official/);
  assert.throws(() => normalizeMetaLibraryCapture(capture([native({ ad_archive_id: 123456789012345 })]), brand), /numeric string/);
  const ad = normalizeMetaLibraryCapture(capture([native({ snapshot: {
    page_id: VALENTTE_META_PAGE_ID, page_name: "Valentte", body: { text: "A".repeat(1000) }, display_format: "IMAGE",
  } })]), brand).ads[0];
  assert.equal(ad.copy.length, 400);
  assert.equal(ad.copyTruncated, true);
  assert.deepEqual(ad.creativeFormats, ["Static"]);
  assert.equal(ad.sourceUrl, "https://www.facebook.com/ads/library/?id=123456789012345");
});
test("Repeated imports deduplicate by workspace/native identity and retain analysis/first observation", () => {
  const first = normalizeMetaLibraryCapture(capture(), brand).ads[0];
  first.analysis = { provenance: "model", keyMessage: "Existing reviewed analysis" };
  const second = normalizeMetaLibraryCapture(capture([native({ is_active: false })], "2026-10-31T00:00:00.000Z"), brand).ads[0];
  const merged = mergeMetaLibraryAds([first], [second, second]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].active, false);
  assert.equal(merged[0].observedAt, second.observedAt);
  assert.equal(merged[0].firstObservedAt, first.observedAt);
  assert.deepEqual(merged[0].analysis, first.analysis);
  assert.equal(mergeMetaLibraryAds(merged, [first])[0].observedAt, second.observedAt, "an older capture cannot roll back a newer observation");
  const otherWorkspace = { ...second, id: "another", brandId: "another" };
  assert.equal(mergeMetaLibraryAds(merged, [otherWorkspace]).length, 2);
});
test("Partial captures form bounded snapshots without adopting search-result counts", () => {
  const a = normalizeMetaLibraryCapture({ ...capture(), searchResultCounts: [999999] }, brand);
  const b = normalizeMetaLibraryCapture(capture([native(), native({ ad_archive_id: "987654321012345", is_active: false })]), brand);
  const result = buildMetaLibrarySnapshot(brand, [a, b]);
  assert.equal(result.coverage.uniqueAds, 2);
  assert.equal(result.coverage.activeAds, 1);
  assert.equal(result.sources.length, 2);
  assert.match(result.metricCaveat, /not exhaustive/);
  assert.throws(() => buildMetaLibrarySnapshot(brand, [a], [{ ...a.ads[0], id: "another", brandId: "another" }]), /another workspace/);
});
