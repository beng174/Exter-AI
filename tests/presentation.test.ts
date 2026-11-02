import { test } from "node:test";
import assert from "node:assert/strict";
import { displayData, plainDashes } from "../shared/presentation.js";

test("display typography leaves saved evidence, source identifiers and source links intact", () => {
  const original = { title: "Brand \u2014 research", fields: [{ value: "Offer \u2013 check terms", confidence: 0.1 }], sourceUrl: "https://example.com/source\u2014page", adId: "source\u2013id" };
  const saved = JSON.stringify(original);
  const shown = displayData(original);
  assert.equal(shown.title, "Brand - research");
  assert.equal(shown.fields[0].value, "Offer - check terms");
  assert.equal(shown.sourceUrl, original.sourceUrl); assert.equal(shown.adId, original.adId);
  assert.equal(JSON.stringify(original), saved, "Presentation must not rewrite retained source records");
  assert.equal(shown.fields[0].confidence, 0.1);
  assert.equal(plainDashes("Report \u2014 0\u201360 seconds"), "Report - 0-60 seconds");
});
