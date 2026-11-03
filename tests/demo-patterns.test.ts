import { test } from "node:test";
import assert from "node:assert/strict";
import { patternCoverage, projectPatternLabel } from "../shared/demo-patterns.js";
import type { VideoAnalysisFields, VideoAnalysisResult } from "../shared/video-analysis.js";
import type { ImageAnalysisFields } from "../shared/image-analysis.js";
import { openDatabase } from "../server/db.js";
import { BrandDemoService } from "../server/demo/service.js";
import type { Ad, Brand } from "../shared/types.js";

const video = <T,>(value: T) => ({ value, confidence: 0.01, timestamps: [{ startSeconds: 0, endSeconds: 2 }] });
const image = <T,>(value: T) => ({ value, confidence: 0.01, imageIndices: [] });
const legacyFields = () => ({
  format: video("UGC"), hook: video("Did you know that right now you can buy more and save more?"),
  angle: video("Volume discount deal promotion offering mix-and-match reed diffusers at lower per-unit prices"),
  keyClaims: [], spokenTranscript: [], onScreenText: [], cta: video("Shop now"), personTalkingToCamera: video(false), creatorEvidence: [],
}) as unknown as VideoAnalysisFields;

test("v1 retained opening and angle descriptions remain visible without inventing v2 categories", () => {
  const fields = legacyFields();
  assert.equal(projectPatternLabel(fields, "format").canonical, "UGC");
  const hook = projectPatternLabel(fields, "hookType");
  assert.equal(hook.canonical, null);
  assert.equal(hook.legacy, fields.hook.value);
  assert.equal(hook.sourceField, "hook");
  const angle = projectPatternLabel(fields, "angle");
  assert.equal(angle.canonical, null);
  assert.equal(angle.legacy, fields.angle.value);
  assert.equal(angle.sourceField, "angle");
  assert.equal(projectPatternLabel(fields, "offerType").canonical, null);
  assert.equal(projectPatternLabel(fields, "offerType").legacy, null, "An offer cannot be guessed from discount words in the angle");
});

test("coverage partitions each analysed ad once and does not gate low-confidence retained classifications", () => {
  const legacy = legacyFields();
  const classified = { ...legacy, hook_type: video("offer-led") } as VideoAnalysisFields;
  const absent = { ...legacy, hook: video("unknown"), hook_type: video("unsure") } as VideoAnalysisFields;
  const coverage = patternCoverage([classified, legacy, absent].map(fields => projectPatternLabel(fields, "hookType")));
  assert.deepEqual({ classified: coverage.classified, legacy: coverage.legacy, missing: coverage.missing, unclassified: coverage.unclassified, total: coverage.totalAnalysed },
    { classified: 1, legacy: 1, missing: 1, unclassified: 2, total: 3 });
  assert.equal(coverage.countBasis, "observed");
  assert.equal(coverage.classificationBasis, "modelled");
  assert.equal(projectPatternLabel({ ...legacy, hook_type: video("none") } as VideoAnalysisFields, "hookType").canonical, "none", "Explicitly classified absence is distinct from a missing classification");
});

test("copy-supported image offers stay exact legacy descriptions and missing timestamps cannot create categories", () => {
  const fields = { format: image("static"), hook: image("A gift for your home"), angle: image("gifting"), offer: image("Three diffusers for £30") } as unknown as ImageAnalysisFields;
  assert.equal(projectPatternLabel(fields, "format").canonical, "static");
  assert.equal(projectPatternLabel(fields, "angle").canonical, "gifting");
  const offer = projectPatternLabel(fields, "offerType");
  assert.equal(offer.canonical, null);
  assert.equal(offer.legacy, "Three diffusers for £30");
  assert.equal(offer.sourceField, "offer");
  const unsupported = { ...legacyFields(), hook_type: { value: "offer-led", confidence: 1, timestamps: [] } } as VideoAnalysisFields;
  assert.equal(projectPatternLabel(unsupported, "hookType").canonical, null);
  const explicitNoneDescription = { ...fields, offer: image("none") } as ImageAnalysisFields;
  assert.equal(projectPatternLabel(explicitNoneDescription, "offerType").canonical, null, "An exact word in a descriptive field does not turn it into a taxonomy output");
});

test("the report shows exact legacy distributions, real denominators and source ad links without writes", () => {
  const db = openDatabase(":memory:", false);
  const brand: Brand = { id: "pattern-fixture", name: "Pattern Fixture", domain: "example.com", category: "Home fragrance & gifting", color: "#0C1F96", initials: "PF", voice: [], competitors: [], mode: "imported", createdAt: "2026-11-03T00:00:00Z" };
  db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  db.exec("CREATE TABLE video_analysis_runs (id TEXT PRIMARY KEY,brand_id TEXT,ad_id TEXT,created_at TEXT,data TEXT)");
  try {
    for (let index = 0; index < 3; index++) {
      const ad = { id: `pattern-ad-${index}`, brandId: brand.id, brand: brand.name, providerAdId: String(100000 + index), source: "public", platform: "Meta", publishedAt: "2026-11-02T00:00:00Z", sourceUrl: `https://www.facebook.com/ads/library/?id=${100000 + index}` } as Ad;
      db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
      const fields = index === 2 ? { ...legacyFields(), angle: video("gifting"), hook_type: video("offer-led"), offer_type: video("bundle") } : legacyFields();
      const result = { id: `pattern-analysis-${index}`, brandId: brand.id, adId: ad.id, mediaId: "fixture-media", createdAt: "2026-11-03T00:00:00Z", fields } as unknown as VideoAnalysisResult;
      db.prepare("INSERT INTO video_analysis_runs VALUES (?,?,?,?,?)").run(result.id, result.brandId, result.adId, result.createdAt, JSON.stringify(result));
    }
    const before = db.prepare("SELECT total_changes() AS n").get()!.n;
    const report = new BrandDemoService(db).report(brand.id);
    assert.equal(report.analysedAdsCount, 3);
    assert.equal(report.patterns.angle.find(row => row.value === "gifting")?.count, 1);
    assert.ok(report.patterns.angle.every(row => row.denominator === 1));
    assert.deepEqual(report.patternCoverage?.angle && { classified: report.patternCoverage.angle.classified, legacy: report.patternCoverage.angle.legacy, missing: report.patternCoverage.angle.missing }, { classified: 1, legacy: 2, missing: 0 });
    assert.equal(report.legacyPatterns?.angle.length, 1);
    const angle = report.legacyPatterns!.angle[0];
    assert.equal(angle.label, legacyFields().angle.value);
    assert.equal(angle.count, 2);
    assert.equal(angle.denominator, 2);
    assert.equal(angle.totalAnalysed, 3);
    assert.equal(angle.share, 1);
    assert.deepEqual(angle.evidence.map(item => item.adId).sort(), ["pattern-ad-0", "pattern-ad-1"]);
    assert.ok(angle.evidence.every(item => item.sourceUrl?.startsWith("https://www.facebook.com/ads/library/?id=") && item.field === "angle"));
    assert.equal(report.patternCoverage?.offerType.missing, 2);
    assert.equal(db.prepare("SELECT total_changes() AS n").get()!.n, before);
  } finally { db.close(); }
});
