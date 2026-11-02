import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/db.js";
import { BrandDemoService } from "../server/demo/service.js";
import { refreshWebsiteEvidence } from "../server/demo/website.js";
import type { Ad, Brand } from "../shared/types.js";
import type { VideoAnalysisResult } from "../shared/video-analysis.js";

const field = <T extends string | boolean>(value: T) => ({ value, confidence: 0.1, timestamps: [{ startSeconds: 0, endSeconds: 2 }] });
function fixture() {
  const db = openDatabase(":memory:", false);
  const brand: Brand = { id: "sourced-brand", name: "Evidence Fixture", domain: "example.com", category: "Home fragrance & gifting", color: "#234", initials: "EF", voice: [], competitors: [], mode: "imported", createdAt: "2026-11-01T00:00:00Z" };
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  db.exec("CREATE TABLE video_analysis_runs (id TEXT PRIMARY KEY,brand_id TEXT,ad_id TEXT,created_at TEXT,data TEXT)");
  function ad(index: number, source: Ad["source"] = "public") {
    const value = { id: `ad-${index}`, brandId: brand.id, providerAdId: String(100000 + index), source, platform: "Meta", brand: brand.name, publishedAt: "2026-11-01", sourceUrl: `https://www.facebook.com/ads/library/?id=${100000 + index}` } as Ad;
    db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(value.id, brand.id, source, "Meta", value.publishedAt, JSON.stringify(value)); return value;
  }
  function analysis(ad: Ad, id: string, angle = "gifting", createdAt = "2026-11-02T00:00:00Z") {
    const result = { id, brandId: brand.id, adId: ad.id, mediaId: "retained-media", createdAt, fields: { format: field("studio"), hook: field("A scent gift set"), hook_type: field("offer-led"), angle: field(angle), offer_type: field("bundle"), offer_explanation: field("Three products"), keyClaims: [field("Three products in one gift set")], onScreenText: [field("Gift set")], cta: field("Shop now"), personTalkingToCamera: field(false), spokenTranscript: [], creatorEvidence: [] } } as unknown as VideoAnalysisResult;
    db.prepare("INSERT INTO video_analysis_runs VALUES (?,?,?,?,?)").run(id, brand.id, ad.id, createdAt, JSON.stringify(result)); return result;
  }
  return { db, brand, ad, analysis };
}

test("brand demo counts latest real analyses once, discloses denominators and cites every draft point", () => {
  const f = fixture();
  try {
    for (let index = 0; index < 12; index++) f.analysis(f.ad(index), `run-${index}`, index === 11 ? "problem-solution" : "gifting");
    f.analysis(f.ad(12, "sample"), "sample-run");
    f.ad(13); // retained source without a successful model result
    const oldAd = JSON.parse((f.db.prepare("SELECT data FROM ads WHERE id='ad-0'").get() as { data: string }).data) as Ad;
    f.analysis(oldAd, "old-run", "value-bundle", "2026-11-01T00:00:00Z");
    const service = new BrandDemoService(f.db);
    const before = f.db.prepare("SELECT total_changes() AS n").get();
    const report = service.report(f.brand.id);
    assert.equal(report.analysedAdsCount, 12); assert.equal(report.sample.excludedSampleAds, 1); assert.equal(report.sample.excludedUnanalysed, 1);
    assert.equal(report.patterns.angle.find(pattern => pattern.value === "gifting")?.count, 11);
    assert.ok(report.patterns.angle.every(pattern => pattern.denominator === 12));
    assert.equal(report.opportunities.length, 3); assert.equal(report.opportunities[0].status, "saturated");
    assert.ok(report.opportunities.some(item => item.status === "gap"));
    for (const opportunity of report.opportunities) {
      assert.equal(opportunity.brief.hooks.length, 3);
      for (const point of [opportunity.rationale, ...opportunity.brief.hooks, opportunity.brief.format, ...opportunity.brief.scriptBeats, ...opportunity.brief.proof, opportunity.brief.creatorProfile]) {
        assert.ok(point.evidence.some(item => item.kind === "ad" && item.adId?.startsWith("ad-") && item.sourceUrl?.startsWith("https://www.facebook.com/ads/library/?id=")));
      }
    }
    assert.ok(report.scores.every(score => score.label === "Best-practice score, not a performance prediction."));
    assert.equal(report.prediction.probability, null); assert.deepEqual(f.db.prepare("SELECT total_changes() AS n").get(), before);
  } finally { f.db.close(); }
});

test("legacy free-text angles motivate drafts but never become invented categorical votes or gaps", () => {
  const f = fixture();
  try {
    f.analysis(f.ad(1), "v1-run", "A luxurious fragrance gift for the home");
    const report = new BrandDemoService(f.db).report(f.brand.id);
    assert.equal(report.analysedAdsCount, 1); assert.ok(report.patterns.angle.every(pattern => pattern.denominator === 0));
    assert.ok(report.opportunities.every(item => item.status === "unknown"));
    assert.ok(report.opportunities.some(item => item.brief.hooks.some(hook => hook.evidence.some(evidence => evidence.quote.includes("luxurious")))));
    f.db.exec("DELETE FROM video_analysis_runs");
    assert.deepEqual(new BrandDemoService(f.db).report(f.brand.id).opportunities, []);
  } finally { f.db.close(); }
});

test("explicit website refresh preserves sources and blocks private DNS, unrelated redirects and challenges", async () => {
  const f = fixture(); let calls = 0;
  const options = { resolve: async () => [{ address: "93.184.216.34", family: 4 }], fetch: (async () => { calls++; return new Response("<html><head><title>Evidence Fixture</title></head><body><main><h1>Fragrance gift sets for the home</h1><p>Publisher statement to verify before production.</p></main></body></html>", { headers: { "Content-Type": "text/html" } }); }) as typeof fetch };
  try {
    const saved = await refreshWebsiteEvidence(f.db, f.brand, options);
    assert.equal(saved.status, "available"); assert.equal(calls, 1); assert.ok(saved.excerpts[0].sourceUrl?.startsWith("https://example.com"));
    const service = new BrandDemoService(f.db); assert.deepEqual(service.report(f.brand.id).website, saved); assert.equal(calls, 1);
    await assert.rejects(refreshWebsiteEvidence(f.db, f.brand, { ...options, resolve: async () => [{ address: "127.0.0.1", family: 4 }] }), /private/);
    await assert.rejects(refreshWebsiteEvidence(f.db, f.brand, { ...options, fetch: (async () => new Response(null, { status: 302, headers: { Location: "https://unrelated.example/" } })) as typeof fetch }), /unrelated/);
    await assert.rejects(refreshWebsiteEvidence(f.db, f.brand, { ...options, fetch: (async () => new Response("<title>Verify human</title>", { headers: { "Content-Type": "text/html" } })) as typeof fetch }), /challenge/);
    assert.deepEqual(service.report(f.brand.id).website, saved);
  } finally { f.db.close(); }
});
