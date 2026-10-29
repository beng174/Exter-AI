import assert from "node:assert/strict";
import { analyseLocally, BRAIN_MODELS } from "../server/brain.js";
import { seedData } from "../server/seed.js";
const ad = seedData().ads[0];
ad.title = "Customer review of a daily skincare routine";
ad.copy =
  "I tried this moisturising cream every morning. Here is my honest customer review and product demonstration.";
const result = await analyseLocally(ad);
assert.equal(result.analysis.provenance, "model");
assert.equal(result.analysis.keyMessage, ad.copy);
assert.ok(result.analysis.observedRelevance?.includes("Local visual concept:"));
assert.ok(result.analysis.analyzedAt);
assert.equal(result.analysis.gender, undefined);
assert.equal(result.analysis.attentionMap, undefined);
console.log(
  JSON.stringify(
    {
      status: "verified",
      engine: "exter-local-semantic-vision",
      models: BRAIN_MODELS,
      analysis: result.analysis,
      creativeFormats: result.creativeFormats,
    },
    null,
    2,
  ),
);
