import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/db.js";
import { ImageAnalysisService } from "../server/image/service.js";
import { IMAGE_PROMPT_VERSION, type ImageAnalysisFields, type StoredImageCreative } from "../shared/image-analysis.js";
import type { InferenceSettings } from "../shared/inference-config.js";

test("image service forwards selected settings and keeps each comparison's provenance immutable", async () => {
  const db = openDatabase(":memory:", false);
  const ad = { id: "ad", brandId: "brand", brand: "Brand", source: "public", platform: "Meta", publishedAt: "2026-11-01", copy: "Original copy" };
  db.prepare("INSERT INTO brands VALUES (?,?)").run("brand", JSON.stringify({ id: "brand", name: "Brand" }));
  db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
  const media: StoredImageCreative = { mediaId: "a".repeat(64), sha256: "b".repeat(64), kind: "image", brandId: "brand", adId: "ad", storedAt: new Date().toISOString(), images: [{ absolutePath: "/tmp/fixture.png", relativePath: "fixture.png", mimeType: "image/png", sha256: "c".repeat(64), bytes: 100 }] };
  const field = (value: string) => ({ value, confidence: 0.2, imageIndices: [1] });
  const fields: ImageAnalysisFields = { format: field("static"), hook: field("Gift set"), headline: field("Gift set"), angle: field("Gifting"), keyClaims: [], onScreenText: [], offer: field("unknown"), cta: field("Shop now") };
  const seen: InferenceSettings[] = [];
  const service = new ImageAnalysisService(db, {
    mediaStore: { store: async () => media, load: async () => media },
    analyserFactory: () => ({ model: "gemini-requested-flash", analyse: async input => {
      assert.ok(input.inferenceSettings);
      seen.push(input.inferenceSettings);
      return { model: "gemini-served-flash", requestedModel: "gemini-requested-flash", servedModel: "gemini-served-flash", modelVersion: "fixture-1", promptVersion: IMAGE_PROMPT_VERSION, fields,
        generation: { temperature: 0, seedRequested: input.inferenceSettings.generationSeed, seedApplied: true, mediaResolutionRequested: input.inferenceSettings.mediaResolution, mediaResolutionApplied: input.inferenceSettings.mediaResolution === "low", providerMediaResolution: null },
        accounting: { usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 }, tokenCostGbp: null, reservedCostGbp: 0.2, estimatedCostGbp: 0.2, costBasis: "reservation_estimate", pricing: null, requestAttempts: 1 } };
    } }),
  });
  try {
    await service.storeMedia("brand", "ad", ["https://fixture.fbcdn.net/image.png"], "image");
    const first = await service.analyse("brand", "ad", media.mediaId, "low-attempt", { mediaResolution: "low", generationSeed: 13 });
    assert.equal(first.confidencePolicy, "uncalibrated-not-filtered");
    assert.deepEqual(first.inferenceSettings, { mediaResolution: "low", generationSeed: 13 });
    assert.equal(first.requestedModel, "gemini-requested-flash");
    assert.equal(first.servedModel, "gemini-served-flash");
    assert.equal(first.generation?.temperature, 0);
    assert.equal(first.fields.hook.value, "Gift set");
    assert.deepEqual(await service.analyse("brand", "ad", media.mediaId, "low-attempt", { mediaResolution: "low", generationSeed: 13 }), first);
    await assert.rejects(service.analyse("brand", "ad", media.mediaId, "low-attempt", { mediaResolution: "default", generationSeed: 13 }), /different inference settings/);
    const comparison = await service.analyse("brand", "ad", media.mediaId, "default-attempt", { mediaResolution: "default", generationSeed: 13 });
    assert.notEqual(comparison.analysisConfigSha256, first.analysisConfigSha256);
    assert.deepEqual(seen, [{ mediaResolution: "low", generationSeed: 13 }, { mediaResolution: "default", generationSeed: 13 }]);
    assert.deepEqual(service.history("brand", "ad")[1], first);
  } finally { db.close(); }
});
