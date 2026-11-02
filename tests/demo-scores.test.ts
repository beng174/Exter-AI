import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCreative, type DemoCreative } from "../server/demo/scores.js";
import type { Ad } from "../shared/types.js";
import type { VideoAnalysisResult } from "../shared/video-analysis.js";
import type { ImageAnalysisResult } from "../shared/image-analysis.js";

const field = <T extends string | boolean>(value: T, startSeconds = 0, endSeconds = 3) => ({ value, confidence: 0.1, timestamps: [{ startSeconds, endSeconds }] });
function creative(): DemoCreative {
  return { ad: { id: "ad-1", providerAdId: "123", source: "public", sourceUrl: "https://www.facebook.com/ads/library/?id=123" } as Ad,
    mediaKind: "video", analysis: { id: "analysis-1", createdAt: "2026-11-02T12:00:00.000Z", fields: {
      hook: field("Our candle bundle is back"), hook_type: field("scarcity-restock"), keyClaims: [field("Three candles for £30")],
      onScreenText: [field("Three candles in one bundle")], cta: field("Shop now"), offer_explanation: field("Three candles for £30"),
    } } as unknown as VideoAnalysisResult };
}

test("best-practice score discloses deterministic criteria and cited evidence without interpreting outcomes", () => {
  const source = creative();
  const score = scoreCreative(source);
  assert.equal(score.label, "Best-practice score, not a performance prediction.");
  assert.equal(score.score, 100);
  assert.equal(score.coverage, 1);
  assert.equal(score.provisional, false);
  assert.equal(score.criteria.length, 5);
  assert.ok(score.criteria.every(item => item.weight === 20 && item.evidence[0].adId === "ad-1"));
  assert.ok(score.criteria.every(item => item.evidence[0].sourceUrl?.includes("id=123")));
  assert.deepEqual(score.criteria[0].evidence[0].timestamps, [{ startSeconds: 0, endSeconds: 3 }]);
  assert.match(score.method, /not calibrated to outcomes/);
  assert.match(score.method, /No spend, sales or conversion data is used/);
  const altered = { ...source, ad: { ...source.ad, spend: 999999, revenue: 0, conversions: 0, impressions: 999999 } };
  assert.deepEqual(scoreCreative(altered), score, "advertiser outcomes do not affect the rubric");
});

test("late hooks and dense short-lived text fail explicit rubric checks while ambiguous CTA is unknown", () => {
  const source = creative();
  source.analysis.fields.hook = field("Message appears later", 5, 7);
  source.analysis.fields.cta = field("Valentte");
  source.analysis.fields.onScreenText = [field("This is a long sentence of ten words shown briefly", 0, 1)];
  const result = scoreCreative(source);
  assert.equal(result.criteria[0].status, "not-met");
  assert.equal(result.criteria[2].status, "not-met");
  assert.match(result.criteria[2].explanation, /words\/second/);
  assert.equal(result.criteria[3].status, "unknown");
  assert.equal(result.score, 50);
  assert.equal(result.coverage, 0.8);
  assert.equal(result.provisional, true);
});

test("missing evidence is unknown and a high partial score exposes its limited coverage", () => {
  const source = creative();
  source.analysis.fields.hook = field("unknown");
  source.analysis.fields.cta = field("unknown");
  source.analysis.fields.keyClaims = [];
  source.analysis.fields.onScreenText = [];
  const result = scoreCreative(source);
  assert.equal(result.score, 100);
  assert.equal(result.coverage, 0.2);
  assert.equal(result.assessedWeight, 20);
  assert.equal(result.totalWeight, 100);
  assert.equal(result.provisional, true);
  assert.equal(result.criteria.filter(item => item.status === "unknown").length, 4);
  assert.match(result.method, /high partial score is not a complete assessment/);
  if ("offer_explanation" in source.analysis.fields) source.analysis.fields.offer_explanation = field("unknown");
  const noEvidence = scoreCreative(source);
  assert.equal(noEvidence.score, null);
  assert.equal(noEvidence.coverage, 0);
});

test("no offer is a valid decision while explicit absence of a CTA is assessed separately", () => {
  const source = creative();
  source.analysis.fields.cta = field("No CTA");
  if ("offer_explanation" in source.analysis.fields) source.analysis.fields.offer_explanation = field("No offer");
  const result = scoreCreative(source);
  assert.equal(result.criteria[3].status, "not-met");
  assert.equal(result.criteria[4].status, "met");
  assert.equal(result.score, 80);
  assert.equal(result.coverage, 1);
});

test("still/carousel text readability stays unknown and a hook on a later slide does not pass opening placement", () => {
  const image = (value: string, imageIndices = [1]) => ({ value, confidence: 0.1, imageIndices });
  const source = creative();
  source.mediaKind = "carousel";
  source.analysis = { id: "image-1", createdAt: "2026-11-02T12:00:00.000Z", fields: {
    hook: image("The bundle", [2]), hook_type: image("offer-led"), keyClaims: [image("Three for £30")],
    onScreenText: [image("Three for £30")], cta: image("Order now"), offer: image("Three for £30"),
  } } as unknown as ImageAnalysisResult;
  const result = scoreCreative(source);
  assert.equal(result.criteria[0].status, "not-met");
  assert.equal(result.criteria[2].status, "unknown");
  assert.match(result.criteria[2].explanation, /no known viewing duration/);
  assert.equal(result.coverage, 0.8);
  assert.equal(result.score, 75);
  assert.deepEqual(result.criteria[0].evidence[0].imageIndices, [2]);
});
