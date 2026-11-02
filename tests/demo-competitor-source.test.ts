import { test } from "node:test";
import assert from "node:assert/strict";
import { CompetitorSourceError, DEMO_COMPETITORS, PublicCompetitorSource, competitorCreativesFromScripts } from "../server/demo/competitor-source.js";

const neom = DEMO_COMPETITORS.find(item => item.id === "neom")!;
const observedAt = "2026-11-02T10:00:00.000Z";
const row = (id = "123456789012345", pageId = "111111111111111", overrides: Record<string, unknown> = {}) => ({
  ad_archive_id: id, page_id: pageId, page_name: "NEOM Wellbeing", is_active: true, start_date: 1793448000,
  snapshot: { page_id: pageId, page_name: "NEOM Wellbeing", link_url: "https://neomwellbeing.com/products/real-product", display_format: "VIDEO", title: "Real source title", body: { text: "Publisher copy" }, videos: [{ video_hd_url: "https://fixture.fbcdn.net/ad.mp4?signature=PRIVATE_SOURCE_MARKER" }], ...overrides },
});
const parse = (items: unknown[]) => competitorCreativesFromScripts([JSON.stringify(items)], neom, observedAt);

test("competitor identity requires exact publisher name, matching page identity and official landing domain", () => {
  const cases = [
    row("123456789012346", "111111111111111", { page_name: "NEOM fan shop" }),
    row("123456789012347", "111111111111111", { page_id: "222222222222222" }),
    row("123456789012348", "111111111111111", { link_url: "https://neomwellbeing.com.attacker.example/" }),
    row("123456789012349", "111111111111111", { link_url: "https://attacker.example/neomwellbeing.com" }),
    row("123456789012350", "111111111111111", { link_url: "http://neomwellbeing.com/" }),
    row("123456789012351", "111111111111111", { link_url: "https://name:secret@neomwellbeing.com/" }),
  ];
  for (const candidate of cases) assert.equal(parse([candidate]).length, 0);
  const accepted = parse([row()]);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].sourceUrl, "https://www.facebook.com/ads/library/?id=123456789012345");
  assert.equal(accepted[0].active, true);
  assert.equal(accepted[0].creative.kind, "video");
  assert.equal(accepted[0].observedAt, observedAt);
  assert.equal(accepted[0].deliveryStopAt, undefined);
});

test("one verified landing establishes only the same matching advertiser page, including Facebook landing shims", () => {
  const first = row("123456789012345", "111111111111111", { link_url: "https://l.facebook.com/l.php?u=https%3A%2F%2Fneomwellbeing.com%2Fproducts%2Fsource" });
  const samePage = row("123456789012346", "111111111111111", { link_url: null });
  const unrelatedPage = row("123456789012347", "222222222222222", { link_url: null });
  assert.deepEqual(parse([samePage, unrelatedPage, first]).map(item => item.nativeId), ["123456789012346", "123456789012345"]);
  assert.equal(parse([samePage]).length, 0, "name similarity alone never establishes a page");
});

test("branded-content creator attribution preserves its public source without treating the creator as the advertiser", () => {
  const branded = row();
  branded.snapshot = { ...branded.snapshot, page_id: "999999999999999", page_name: "Real Creator", page_profile_uri: "https://www.instagram.com/realcreator/?token=PRIVATE_SOURCE_MARKER", branded_content: { page_id: branded.page_id, page_name: "NEOM Wellbeing" } } as typeof branded.snapshot;
  const accepted = parse([branded]);
  assert.deepEqual(accepted[0].brandedContentPartner, { pageId: "999999999999999", name: "Real Creator", profileUrl: "https://www.instagram.com/realcreator/" });
  assert.equal(accepted[0].advertiserPageId, "111111111111111");
  assert.equal(accepted[0].advertiserName, "NEOM Wellbeing");
  assert.equal(parse([{ ...branded, page_name: "NEOM fan store" }]).length, 0);
});

test("media parser retains actual source images and ordered carousel slides and rejects preview-only videos", () => {
  const accepted = parse([
    row("123456789012345", undefined, { display_format: "IMAGE", videos: [], images: [{ original_image_url: "https://fixture.fbcdn.net/image.jpg" }] }),
    row("123456789012346", undefined, { display_format: "CAROUSEL", videos: [], cards: [{ original_image_url: "https://fixture.fbcdn.net/one.jpg" }, { original_image_url: "https://fixture.fbcdn.net/two.jpg" }] }),
    row("123456789012347", undefined, { display_format: "VIDEO", videos: [{ video_preview_image_url: "https://fixture.fbcdn.net/poster.jpg" }], images: [{ original_image_url: "https://fixture.fbcdn.net/poster.jpg" }] }),
  ]);
  assert.deepEqual(accepted.map(item => item.creative.kind), ["image", "carousel", "unknown"]);
  assert.deepEqual(accepted[1].creative, { kind: "carousel", imageUrls: ["https://fixture.fbcdn.net/one.jpg", "https://fixture.fbcdn.net/two.jpg"] });
});

test("access challenges and restricted redirects never become empty competitor libraries", async () => {
  assert.throws(() => competitorCreativesFromScripts([JSON.stringify([row(), { xfb_ad_library_is_captcha_required: true }])], neom, observedAt), error => error instanceof CompetitorSourceError && error.code === "source_restricted");
  for (const fixture of [
    { url: "https://www.facebook.com/login/", status: 200, scripts: [] },
    { url: "https://www.facebook.com/ads/library/", status: 403, scripts: ["PRIVATE_UPSTREAM_MARKER"] },
    { url: "https://www.facebook.com/ads/library/", status: 200, scripts: [] },
  ]) {
    const source = new PublicCompetitorSource(neom, { readSnapshot: async () => fixture });
    try {
      await assert.rejects(source.collect(), error => error instanceof CompetitorSourceError && ["source_restricted", "source_forbidden", "source_identity_unverified"].includes(error.code) && !error.message.includes("PRIVATE_UPSTREAM_MARKER"));
    } finally { await source.close(); }
  }
});

test("public collection is bounded and fresh snapshots must match an already verified advertiser and requested ad", async () => {
  const reads: string[] = [];
  const source = new PublicCompetitorSource(neom, {
    now: () => new Date(observedAt),
    readSnapshot: async url => {
      reads.push(url);
      const nativeId = new URL(url).searchParams.get("id");
      return { url, status: 200, scripts: [JSON.stringify(nativeId ? row(nativeId, "111111111111111", { videos: [{ video_hd_url: "https://fixture.fbcdn.net/fresh.mp4" }] }) : Array.from({ length: 35 }, (_, index) => row(String(123456789012345n + BigInt(index)))))] };
    },
  });
  try {
    await assert.rejects(source.refresh("123456789012345", "111111111111111"), /previously verified/);
    const collected = await source.collect();
    assert.equal(collected.creatives.length, 25);
    assert.equal(reads.length, 1);
    assert.equal(new URL(reads[0]).searchParams.get("country"), "GB");
    await source.close();
    assert.deepEqual(await source.refresh("123456789012345", "111111111111111"), { kind: "video", videoUrl: "https://fixture.fbcdn.net/fresh.mp4" });
    assert.equal(reads[1], "https://www.facebook.com/ads/library/?id=123456789012345");
    await assert.rejects(source.refresh("123456789012345", "222222222222222"), /previously verified/);
  } finally { await source.close(); }
});

test("Aery current publisher alias is explicit and still requires the official landing domain", async () => {
  const reads: string[] = [];
  const aery = DEMO_COMPETITORS.find(item => item.id === "aery-living")!;
  const source = new PublicCompetitorSource(aery, { readSnapshot: async url => {
    reads.push(url);
    return { url, status: 200, scripts: [JSON.stringify(new URL(url).searchParams.get("q") === "Aery Living" ? [] : Array.from({ length: 25 }, (_, index) => ({ ...row(String(123456789012345n + BigInt(index))), page_name: "Osmology by Aery", snapshot: { ...row().snapshot, page_name: "Osmology by Aery", link_url: "https://osmology.co.uk/products/source" } })))] };
  } });
  try {
    const result = await source.collect();
    assert.equal(result.creatives.length, 25);
    assert.equal(reads.length, 2);
    assert.equal(new URL(reads[1]).searchParams.get("q"), "Osmology");
    assert.ok(aery.identityNote?.includes("redirects"));
  } finally { await source.close(); }
});
