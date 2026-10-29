import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAdAnalysis,
  sampleAdAnalysis,
  validateAdAnalysis,
} from "../shared/ad-intelligence";
import type { Ad } from "../shared/types";

const sample: Ad = {
  id: "sample-beauty",
  brandId: "rhode",
  brand: "Rhode",
  platform: "Meta",
  category: "Beauty & skincare",
  title: "The daily routine",
  copy: "A sample skincare routine.",
  angle: "Everyday rituals",
  audience: "Skincare minimalists",
  format: "Video",
  image: "",
  color: "#abcdef",
  active: true,
  publishedAt: "2020-01-01T12:00:00Z",
  impressions: 10000,
  engagements: 450,
  spend: null,
  conversions: null,
  revenue: null,
  owned: false,
  source: "sample",
  sourceUrl: null,
};

test("ad analysis is optional and missing fields stay unknown", () => {
  assert.equal(normalizeAdAnalysis(undefined), undefined);
  assert.equal(normalizeAdAnalysis(null), undefined);
  const empty = normalizeAdAnalysis({})!;
  assert.equal(empty.provenance, "provided");
  assert.equal(empty.topic, undefined);
  assert.equal(empty.gender, undefined);
  assert.equal(empty.inferredAudience, undefined);
  assert.equal(empty.attentionMap, undefined);
});

test("provided concepts and audience interpretations retain their structured fields", () => {
  const analysis = normalizeAdAnalysis({
    topic: "  Skincare at night  ",
    theme: "Beauty",
    contentType: "Brand offering",
    contentOrientation: "Brand awareness",
    marketSegment: "Business to consumer",
    brandMentions: ["Rhode", " Rhode "],
    observedTension: "Routine complexity",
    observedRelevance: "A shorter routine for time-conscious shoppers",
    keyMessage: "Keep it simple",
    inferredAudience: ["Skincare minimalists", "Routine builders"],
    gender: "Not specified in creative",
    profession: "General",
    maritalStatus: "Not specified",
    ageGroup: "Adults",
    familialRelationship: "Not specified",
    confidence: 0,
    analyzedAt: "2020-01-01T12:00:00Z",
  })!;
  assert.equal(analysis.topic, "Skincare at night");
  assert.deepEqual(analysis.brandMentions, ["Rhode"]);
  assert.deepEqual(analysis.inferredAudience, [
    "Skincare minimalists",
    "Routine builders",
  ]);
  assert.equal(analysis.keyMessage, "Keep it simple");
  assert.equal(analysis.gender, "Not specified in creative");
  assert.equal(analysis.profession, "General");
  assert.equal(analysis.ageGroup, "Adults");
  assert.equal(analysis.confidence, 0);
  assert.equal(analysis.analyzedAt, "2020-01-01T12:00:00.000Z");
});

test("imports cannot claim a verified model or sample origin", () => {
  assert.equal(
    normalizeAdAnalysis({
      provenance: "model",
      keyMessage: "Supplied by a user",
    })!.provenance,
    "provided",
  );
  assert.throws(
    () => normalizeAdAnalysis({ provenance: "sample" }),
    /must not claim sample/,
  );
  assert.equal(
    normalizeAdAnalysis({ provenance: "sample" }, true)!.provenance,
    "sample",
  );
  assert.throws(
    () => normalizeAdAnalysis({ provenance: "verified" }),
    /provenance/,
  );
  assert.equal(validateAdAnalysis, normalizeAdAnalysis);
});

test("sample annotations are explicit examples and never infer personal demographics", () => {
  const analysis = sampleAdAnalysis(sample);
  assert.equal(analysis.provenance, "sample");
  assert.equal(analysis.topic, "Rhode — The daily routine");
  assert.equal(analysis.theme, "Beauty & skincare");
  assert.deepEqual(analysis.brandMentions, ["Rhode"]);
  assert.deepEqual(analysis.inferredAudience, ["Skincare minimalists"]);
  assert.equal(analysis.keyMessage, sample.copy);
  for (const field of [
    "gender",
    "profession",
    "maritalStatus",
    "ageGroup",
    "familialRelationship",
    "attentionMap",
    "confidence",
    "observedTension",
  ] as const) {
    assert.equal(analysis[field], undefined, field);
  }
});

test("analysis rejects malformed text, array and confidence values", () => {
  for (const value of [false, "analysis", []])
    assert.throws(() => normalizeAdAnalysis(value), /must be an object/);
  assert.throws(
    () => normalizeAdAnalysis({ keyMessage: { injected: true } }),
    /keyMessage/,
  );
  assert.throws(() => normalizeAdAnalysis({ topic: "x".repeat(2001) }), /2000/);
  assert.throws(() => normalizeAdAnalysis({ brandMentions: "Rhode" }), /array/);
  assert.throws(
    () => normalizeAdAnalysis({ inferredAudience: [" "] }),
    /non-empty/,
  );
  assert.throws(
    () =>
      normalizeAdAnalysis({ inferredAudience: new Array(31).fill("Audience") }),
    /30/,
  );
  for (const confidence of [-0.1, 1.1, Infinity, NaN, "0.8"]) {
    assert.throws(() => normalizeAdAnalysis({ confidence }), /confidence/);
  }
});

test("timestamps are actual ISO dates and cannot silently normalize impossible dates", () => {
  for (const analyzedAt of [
    "yesterday",
    "2020-02-31",
    "1999-01-01",
    "2999-01-01",
  ]) {
    assert.throws(() => normalizeAdAnalysis({ analyzedAt }), /analyzedAt/);
  }
});

test("attention maps require supplied images or descriptions and safe image schemes", () => {
  const analysis = normalizeAdAnalysis({
    attentionMap: {
      imageUrl: "https://example.com/attention.png",
      description: "Provided model visualisation",
      method: "Supplier-reported saliency",
    },
  })!;
  assert.equal(
    analysis.attentionMap?.imageUrl,
    "https://example.com/attention.png",
  );
  assert.equal(analysis.attentionMap?.method, "Supplier-reported saliency");
  const embedded = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(
    normalizeAdAnalysis({ attentionMap: { imageUrl: embedded } })!.attentionMap
      ?.imageUrl,
    embedded,
  );
  const textOnly = normalizeAdAnalysis({
    attentionMap: { description: "No map image supplied" },
  })!;
  assert.equal(textOnly.attentionMap?.imageUrl, undefined);
  for (const imageUrl of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:password@example.com/image.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
  ]) {
    assert.throws(
      () => normalizeAdAnalysis({ attentionMap: { imageUrl } }),
      /image/,
    );
  }
  assert.throws(() => normalizeAdAnalysis({ attentionMap: [] }), /object/);
});
