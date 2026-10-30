import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateVideoPredictions, parseVideoLabelCsv, videoTokenF1 } from "../shared/video-evaluation.js";

const time = [{ startSeconds: 0, endSeconds: 3 }];
const field = (value: string | boolean, confidence = 0.95, timestamps = time) => ({ value, confidence, timestamps });
function prediction(adId: string, fields: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { id: `analysis:${adId}`, adId, provider: "gemini", model: "flash-test-fixture", modelVersion: "fixture-v1",
    mediaSha256: "a".repeat(64),
    processingMode: "agentic", promptVersion: "test-prompt-v1", confidenceThreshold: 0.75, fields, ...extra };
}
const parse = (rows: string) => parseVideoLabelCsv(rows);
test("human CSV accepts BOM, quoted commas/newlines and escaped quotes; false is a label and blanks are excluded", () => {
  const labels = parse('\uFEFFadId,sourceUrl,hook,format,personTalkingToCamera\r\na,https://example.com/ad/a,"She says ""hello,""\nthen points to the box",studio,false\r\nb,https://example.com/ad/b,,unknown,\r\n');
  assert.equal(labels.length, 2);
  assert.equal(labels[0].fields.hook, 'She says "hello,"\nthen points to the box');
  assert.equal(labels[0].fields.personTalkingToCamera, "false");
  assert.equal(labels[1].fields.hook, undefined);
  const report = evaluateVideoPredictions(labels, [{ predictions: [prediction("a", { format: field("studio"), personTalkingToCamera: field(false) })] }]);
  assert.equal(report.configurations[0].fields.personTalkingToCamera.labelled, 1);
  assert.equal(report.configurations[0].fields.personTalkingToCamera.accuracy, 1);
});
test("malformed, duplicate or empty labels never produce apparent accuracy", () => {
  assert.throws(() => parse("adId,sourceUrl,format\n"), /No human-labelled/);
  assert.throws(() => parse("adId,sourceUrl,format\na,https://example.com/a,\n"), /No human-labelled/);
  assert.throws(() => parse("adId,sourceUrl,format\na,https://example.com/a,UGC\na,https://example.com/a,UGC\n"), /unique/);
  assert.throws(() => parse('adId,sourceUrl,hook\na,https://example.com/a,"unterminated'), /unterminated/);
  assert.throws(() => parse('adId,sourceUrl,hook\na,https://example.com/a,"closed"extra'), /closing quote/);
  assert.throws(() => parse("adId,sourceUrl,format\na,https://example.com/a,studio,extra"), /width/);
  assert.throws(() => parse("adId,sourceUrl,format\na,http://example.com/a,studio"), /HTTPS/);
  assert.throws(() => parse("adId,sourceUrl,formatt\na,https://example.com/a,studio"), /unsupported/);
});
test("missing ads and fields count against the complete labelled set rather than disappearing from the denominator", () => {
  const labels = parse("adId,sourceUrl,format,hook\na,https://example.com/a,studio,A secret human label\nb,https://example.com/b,animation,\n");
  const report = evaluateVideoPredictions(labels, [[prediction("a", { format: field("studio") }), prediction("not-labelled", { format: field("UGC") })]]);
  const score = report.configurations[0];
  assert.equal(score.fields.format.labelled, 2);
  assert.equal(score.fields.format.accuracy, 0.5);
  assert.equal(score.fields.format.coverage, 0.5);
  assert.equal(score.fields.format.missingPredictions, 1);
  assert.equal(score.fields.hook.missingPredictions, 1);
  assert.deepEqual(score.missingAdIds, ["b"]);
  assert.equal(score.ignoredUnlabelledPredictions, 1);
  assert.ok(!JSON.stringify(report).includes("A secret human label"), "reports expose aggregate scores, not ground-truth text");
});
test("low-confidence outputs abstain and explicit unknown labels do not inflate answer coverage", () => {
  const labels = parse("adId,sourceUrl,format\na,https://example.com/a,UGC\nb,https://example.com/b,unknown\n");
  const report = evaluateVideoPredictions(labels, [[prediction("a", { format: field("UGC", 0.3) }), prediction("b", { format: field("studio", 0.3) })]]);
  const score = report.configurations[0].fields.format;
  assert.equal(score.accuracy, 0.5);
  assert.equal(score.coverage, 0);
  assert.equal(score.abstentions, 2);
  assert.equal(score.missingPredictions, 0);
});
test("providers, exact versions, processing modes and prompts benchmark separately on the same label set", () => {
  const labels = parse("adId,sourceUrl,format\na,https://example.com/a,studio\nb,https://example.com/b,animation\n");
  const gemini = { predictions: [prediction("a", { format: field("studio") }, { modelVersion: null })] };
  const pegasus = { predictions: [prediction("b", { format: field("animation") }, { provider: "twelvelabs", model: "pegasus", modelVersion: "fixture-pegasus-v1" })] };
  const report = evaluateVideoPredictions(labels, [gemini, pegasus]);
  assert.equal(report.configurations.length, 2);
  assert.equal(report.configurations[0].modelVersion, null);
  assert.equal(report.configurations[1].provider, "twelvelabs");
  assert.ok(report.configurations.every((configuration) => configuration.labelledAds === 2 && configuration.fields.format.accuracy === 0.5));
  assert.match(report.labelSetSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.configurations[0].confidenceThreshold, 0.75);
  assert.throws(() => evaluateVideoPredictions(labels, [gemini, gemini]), /Duplicate predictions/);
});
test("a TwelveLabs stub is unavailable rather than a scored real-provider result", () => {
  const labels = parse("adId,sourceUrl,format\na,https://example.com/a,studio\n");
  const report = evaluateVideoPredictions(labels, [[{ adId: "a", provider: "twelvelabs", status: "not_implemented" }]]);
  assert.equal(report.configurations[0].status, "not_implemented");
  assert.equal(report.configurations[0].fields.format.accuracy, null);
  assert.equal(report.configurations[0].fields.format.coverage, null);
  assert.equal(report.configurations[0].predictedLabelledAds, 0);
});
test("timestamp accuracy uses temporal overlap or boundary tolerance and counts missing intervals as failures", () => {
  const csv = 'adId,sourceUrl,hook,hookTimestamps\na,https://example.com/a,Box opens,"[{""startSeconds"":0,""endSeconds"":3}]"\nb,https://example.com/b,Box opens,"[{""startSeconds"":0,""endSeconds"":3}]"\n';
  const labels = parse(csv);
  const report = evaluateVideoPredictions(labels, [[prediction("a", { hook: field("Box opens", 0.9, [{ startSeconds: 0.2, endSeconds: 3.2 }]) }), prediction("b", { hook: field("Box opens", 0.9, []) })]]);
  const score = report.configurations[0].fields.hook;
  assert.equal(score.accuracy, 1);
  assert.equal(score.timestampLabels, 2);
  assert.equal(score.timestampAccuracy, 0.5);
  assert.ok(score.meanTimestampIou! > 0.4 && score.meanTimestampIou! < 0.5);
  assert.throws(() => parse(csv.replace('""endSeconds"":3', '""endSeconds"":-1')), /non-negative/);
});
test("lists retain chronological text and lexical F1 is explicit rather than an unsupported semantic score", () => {
  const labels = parse('adId,sourceUrl,keyClaims,spokenTranscript,creatorEvidence\na,https://example.com/a,"[""Soft fragrance"",""Lasts all day""]","hello, home","@real_creator"\n');
  const report = evaluateVideoPredictions(labels, [[prediction("a", {
    keyClaims: [field("Soft fragrance"), field("Lasts all day")],
    spokenTranscript: [field("hello home")],
    creatorEvidence: [{ kind: "visible-creator-handle", value: "@real_creator", source: "video", confidence: 0.9, timestamps: time }],
  })]]);
  const score = report.configurations[0].fields;
  assert.equal(score.keyClaims.accuracy, 1);
  assert.equal(score.spokenTranscript.accuracy, 0, "punctuation differs for strict canonical exact matching");
  assert.equal(score.spokenTranscript.meanTokenF1, 1, "lexical tokens ignore punctuation");
  assert.equal(score.creatorEvidence.accuracy, 1);
  assert.equal(videoTokenF1("bright bright home", "bright home"), 0.8);
  assert.match(report.accuracyDefinition, /not semantic correctness/);
});
test("sample data and incomplete provenance cannot masquerade as a real-ad benchmark", () => {
  const labels = parse("adId,sourceUrl,format\na,https://example.com/a,studio\n");
  assert.throws(() => evaluateVideoPredictions(labels, [[prediction("a", { format: field("studio") }, { provenance: "sample" })]]), /Fictional sample/);
  assert.throws(() => evaluateVideoPredictions(labels, [[prediction("a", { format: field("studio") }, { modelVersion: undefined })]]), /metadata/);
});
test("provider comparisons require the same stored video, including the human-labelled hash when supplied", () => {
  const hash = "a".repeat(64);
  const labels = parse(`adId,sourceUrl,mediaSha256,format\na,https://example.com/a,${hash},studio\n`);
  const gemini = prediction("a", { format: field("studio") });
  const pegasus = prediction("a", { format: field("studio") }, { provider: "twelvelabs", model: "pegasus" });
  const report = evaluateVideoPredictions(labels, [[gemini, pegasus]]);
  assert.equal(report.humanLabelsWithMediaHash, 1);
  assert.equal(report.configurations.length, 2);
  assert.throws(() => evaluateVideoPredictions(labels, [[{ ...gemini, mediaSha256: undefined }]]), /mediaSha256/);
  assert.throws(() => evaluateVideoPredictions(labels, [[gemini, { ...pegasus, mediaSha256: "b".repeat(64) }]]), /different stored-video hashes/);
  assert.throws(() => evaluateVideoPredictions(labels, [[{ ...gemini, mediaSha256: "b".repeat(64) }]]), /does not match/);
  assert.throws(() => parse("adId,sourceUrl,mediaSha256,format\na,https://example.com/a,short,studio\n"), /64-character/);
});
