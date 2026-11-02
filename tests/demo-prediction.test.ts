import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPredictionPreview } from "../server/demo/prediction.js";
import type { Ad } from "../shared/types.js";

const now = new Date("2026-11-02T12:00:00.000Z");
function ad(id: string, values: Partial<Ad> = {}): Ad {
  return { id, source: "public", sourceUrl: `https://www.facebook.com/ads/library/?id=${id}`, publishedAt: "2020-01-01T00:00:00.000Z",
    deliveryStartAt: "2020-01-01T00:00:00.000Z", firstObservedAt: "2026-10-01T12:00:00.000Z", observedAt: "2026-11-01T12:00:00.000Z", ...values } as Ad;
}

test("prediction preview never invents a probability from old publication or advertiser delivery dates", () => {
  const result = buildPredictionPreview([ad("1", { firstObservedAt: undefined, observedAt: undefined })], now);
  assert.equal(result.status, "preview");
  assert.equal(result.message, "Trains as collection history builds.");
  assert.equal(result.probability, null);
  assert.equal(result.trainingStatus, "not-trained");
  assert.equal(result.history.eligibleAds, 0);
  assert.equal(result.history.firstObservedAt, null);
  assert.equal(result.history.lastObservedAt, null);
  assert.deepEqual(result.observations, []);
});

test("real stored capture endpoints produce cited observed spans without continuous-delivery or performance claims", () => {
  const result = buildPredictionPreview([ad("1"), ad("2", { firstObservedAt: "2026-11-01T12:00:00.000Z" })], now);
  assert.equal(result.probability, null, "history alone does not train an outcome model");
  assert.equal(result.history.eligibleAds, 2);
  assert.equal(result.history.repeatedlyObservedAds, 1);
  const repeated = result.observations.find(value => value.adId === "1")!;
  assert.equal(repeated.observedSpanDays, 31);
  assert.equal(repeated.observationCount, null, "a min/max range cannot establish collection frequency");
  assert.equal(repeated.continuousDeliveryConfirmed, false);
  assert.equal(repeated.source, "stored-public-captures");
  assert.equal(repeated.evidence[0].adId, "1");
  assert.equal(repeated.evidence[0].sourceUrl, "https://www.facebook.com/ads/library/?id=1");
  assert.equal(repeated.evidence[0].observedAt, repeated.lastObservedAt);
  assert.match(repeated.evidence[0].quote, /does not establish uninterrupted/);
  const single = result.observations.find(value => value.adId === "2")!;
  assert.equal(single.observedSpanDays, 0);
  assert.equal(single.observationCount, null, "one retained endpoint does not establish the total collection count");
  assert.match(result.history.definition, /Published and advertiser delivery dates are excluded/);
});

test("sample, future, malformed, inverted and unsupported source data never become collection history", () => {
  const rows = [
    ad("1", { source: "sample" }), ad("2", { source: "import" }), ad("3", { firstObservedAt: "not-a-timestamp" }),
    ad("4", { firstObservedAt: "2026-11-02T13:00:00.000Z" }), ad("5", { observedAt: "2026-11-03T12:00:00.000Z" }),
    ad("6", { firstObservedAt: "2026-11-02T11:00:00.000Z" }), ad("7", { sourceUrl: "https://example.com/not-a-public-source" }),
    ad("8", { sourceUrl: "http://www.facebook.com/ads/library/?id=8" }), ad("9", { sourceUrl: "https://user:password@www.facebook.com/ads/library/?id=9" }),
    ad("10", { firstObservedAt: "2026-10-01" }), ad("11", { firstObservedAt: undefined }),
  ];
  assert.equal(buildPredictionPreview(rows, now).history.eligibleAds, 0);
  assert.throws(() => buildPredictionPreview([], new Date("invalid")), /reference time is invalid/);
});

test("repeat rows do not inflate the ad sample and public links omit tracking or signed query values", () => {
  const rows = [ad("1", { observedAt: "2026-10-31T12:00:00.000Z" }), ad("1", { sourceUrl: "https://www.facebook.com/ads/library/?id=1&tracking=discard-me#details" })];
  const result = buildPredictionPreview(rows, now);
  assert.equal(result.history.eligibleAds, 1);
  assert.equal(result.observations[0].observedSpanDays, 31);
  assert.equal(result.observations[0].sourceUrl, "https://www.facebook.com/ads/library/?id=1");
  assert.ok(!JSON.stringify(result).includes("discard-me"));
});
