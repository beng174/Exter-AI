import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildLabelsRequest, validateLabelOutput, kernelUsage, LABEL_INSTRUCTIONS } from "../server/kernel/labels-prompt.js";
import { decideKernelRoute } from "../server/kernel/policy.js";
import type { KernelFeatures } from "../shared/analysis-kernel.js";
const features = (): KernelFeatures => ({ workspaceId: "fixture", mediaSha256: "a".repeat(64), durationSeconds: 12, stageVersions: { ocr: "fixture-1", speech: "fixture-1" }, evidence: [{ id: "speech-1", kind: "speech", text: "Choose the gift bundle", startSeconds: 0, endSeconds: 2, observedBy: "faster-whisper", version: "fixture-1" }], qualityFlags: [], adContext: { brand: "Fixture", copy: "A gift bundle" } });
const output = () => ({ format: { value: "unsure", sourceIds: [] }, hook_type: { value: "offer-led", sourceIds: ["speech-1"] }, angle: { value: "gifting", sourceIds: ["speech-1"] }, offer_type: { value: "bundle", sourceIds: ["speech-1"] }, audio_type: { value: "voiceover", sourceIds: ["speech-1"] }, claims: [], ctaSourceIds: [] });
test("labels-only request uses stable bounded schema, requested model and minimal thinking without full video", () => {
    const request = buildLabelsRequest(features());
    assert.equal(request.model, "gemini-3.1-flash-lite");
    assert.equal(request.body.systemInstruction.parts[0].text, LABEL_INSTRUCTIONS);
    assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
    assert.equal(request.thinkingOffGuaranteed, false);
    assert.equal(request.body.generationConfig.maxOutputTokens, 1536);
    assert.ok(!JSON.stringify(request).includes("fileUri"));
    assert.ok(!JSON.stringify(request.body.generationConfig).includes("thinkingBudget"));
    assert.equal(buildLabelsRequest(features()).cacheKey, request.cacheKey);
    const other = features();
    other.adContext.copy = "Different offer context";
    assert.notEqual(buildLabelsRequest(other).cacheKey, request.cacheKey);
    assert.throws(() => buildLabelsRequest({ ...features(), evidence: [{ ...features().evidence[0], endSeconds: 999 }] }), /timing/);
    const reordered = features();
    reordered.stageVersions = { speech: "fixture-1", ocr: "fixture-1" };
    assert.equal(buildLabelsRequest(reordered).cacheKey, request.cacheKey);
});
test("schema and source references reject invented fields, citations and unsupported UGC", () => {
    assert.equal(validateLabelOutput(output(), features()).angle.value, "gifting");
    assert.throws(() => validateLabelOutput({ ...output(), explanation: "Extra output" }, features()));
    assert.throws(() => validateLabelOutput({ ...output(), angle: { value: "gifting", sourceIds: ["invented"] } }, features()));
    assert.throws(() => validateLabelOutput({ ...output(), format: { value: "UGC", sourceIds: ["speech-1"] } }, features()), /creator/);
});
test("usage never invents absent thought tokens, cached inputs or billed cost", () => {
    assert.deepEqual(kernelUsage({}), { inputTokens: null, visibleOutputTokens: null, thoughtTokens: null, cachedInputTokens: null, totalTokens: null, reservedGbp: null, estimatedGbp: null, billedGbp: null });
    assert.equal(kernelUsage({ thoughtsTokenCount: 0 }).thoughtTokens, 0);
    assert.equal(kernelUsage({ thoughtsTokenCount: 17 }).thoughtTokens, 17);
});
test("escalation needs calibration, available budget and cap headroom; cache hits do not spend", () => {
    const input = { cacheHit: false, featuresReady: true, qualityFlags: ["speech_music_ambiguous"], labelsValid: true, budgetAllows: true, batchSize: 10, escalated: 0 }, policy = { version: "fixture", calibrationVersion: null, maxEscalationsPerBatch: 2, maxEscalationFraction: .2 };
    assert.equal(decideKernelRoute(input, policy).route, "human-review");
    assert.equal(decideKernelRoute({ ...input, cacheHit: true, budgetAllows: false }, policy).route, "reuse");
    assert.equal(decideKernelRoute(input, { ...policy, calibrationVersion: "labelled-fixture" }).route, "reference-full-video");
    assert.equal(decideKernelRoute({ ...input, escalated: 2 }, { ...policy, calibrationVersion: "labelled-fixture" }).route, "human-review");
    assert.equal(decideKernelRoute({ ...input, budgetAllows: false }, policy).route, "blocked");
});
test("backlog context loads one task rather than all specifications or skill bundles", () => {
    const text = execFileSync(process.execPath, ["scripts/kernel-backlog.mjs", "show", "K06"], { encoding: "utf8" });
    assert.match(text, /K06/);
    assert.doesNotMatch(text, /K10/);
    assert.ok(text.length < 6000);
    const next = execFileSync(process.execPath, ["scripts/kernel-backlog.mjs", "next"], { encoding: "utf8" });
    assert.match(next, /^(?:K\d+(?:-[A-Z]+)?: [^\n]+\nStatus:|No ready task\.)/);
    assert.ok(next.length < 6000);
});
