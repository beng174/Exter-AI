import test from "node:test";
import assert from "node:assert/strict";
import { ANGLE_VALUES, AUDIO_TYPE_VALUES, CLAIM_TYPE_VALUES, CREATIVE_BOOLEAN_TAGS, FORMAT_VALUES, HOOK_TYPE_VALUES, OFFER_TYPE_VALUES } from "../shared/creative-taxonomy.js";
import { VIDEO_PROMPT_VERSION, type VideoCoverage } from "../shared/video-analysis.js";
import { IMAGE_PROMPT_VERSION } from "../shared/image-analysis.js";
import { VIDEO_RESPONSE_JSON_SCHEMA } from "../server/video/prompt.js";
import { IMAGE_RESPONSE_SCHEMA, validateImageAnalysisFields } from "../server/image/schema.js";
import { assertVideoAnalysisV2, normalizeVideoAnalysisFields } from "../server/video/validation.js";

const coverage: VideoCoverage = { durationSeconds: 12, fullVideo: true, segments: [{ startSeconds: 0, endSeconds: 12, processing: "static", fps: 1 }] };
const v = (value: string | boolean, confidence = 0.2) => ({ value, confidence, timestamps: [{ startSeconds: 0, endSeconds: 2 }] });
const i = (value: string | boolean, confidence = 0.2) => ({ value, confidence, imageIndices: [1] });
function video() {
  return {
    hook: v("Eight times stronger"), hook_type: v("bold-claim"), format: v("studio"),
    angle: v("quality-luxury"), angle_explanation: v("Strength and quality"),
    offer_type: v("none"), offer_explanation: v("No offer shown"),
    tags: Object.fromEntries(CREATIVE_BOOLEAN_TAGS.map(tag => [tag, v(false)])),
    keyClaims: [{ ...v("8x stronger than other fragrances"), claim_type: ["comparative", "performance"] }],
    spokenTranscript: [v("Upside down / Inside out", 0.99)], onScreenText: [v("Eight times stronger")], cta: v("Shop now"), personTalkingToCamera: v(false), creatorEvidence: [],
    audio_type: v("music-only"), music_lyrics_present: v(true), has_licensed_music_lyrics: v(true, 0.99),
    audio_segments: [{ kind: "sung_lyrics", speaker_type: "singer", startSeconds: 0, endSeconds: 2, text: "Upside down / Inside out", confidence: 0.99 }],
  };
}
function image() {
  return {
    format: i("static"), hook: i("UK's best"), hook_type: i("bold-claim"), headline: i("UK's best"),
    angle: i("quality-luxury"), angle_explanation: i("Quality positioning"), offer_type: i("none"), offer: i("unknown"), cta: i("Shop now"),
    tags: Object.fromEntries(CREATIVE_BOOLEAN_TAGS.map(tag => [tag, i(false)])),
    keyClaims: [{ ...i("UK's best"), claim_type: ["superlative"] }], onScreenText: [i("UK's best")],
  };
}

test("model schemas use the same canonical categories as the human labelling registry", () => {
  const videoProperties = VIDEO_RESPONSE_JSON_SCHEMA.properties;
  const imageProperties = IMAGE_RESPONSE_SCHEMA.properties;
  for (const [key, values] of [["format", FORMAT_VALUES], ["hook_type", HOOK_TYPE_VALUES], ["angle", ANGLE_VALUES], ["offer_type", OFFER_TYPE_VALUES]] as const) {
    assert.deepEqual(videoProperties[key].properties.value.enum, [...values]);
    assert.deepEqual(imageProperties[key].properties.value.enum, [...values]);
  }
  assert.deepEqual(videoProperties.audio_type.properties.value.enum, [...AUDIO_TYPE_VALUES]);
  assert.deepEqual(videoProperties.keyClaims.items.properties.claim_type.items.enum, [...CLAIM_TYPE_VALUES]);
  assert.match(VIDEO_PROMPT_VERSION, /v2$/);
  assert.match(IMAGE_PROMPT_VERSION, /v2$/);
});

test("music-only lyrics cannot enter spoken transcript or establish music licensing", () => {
  const result = normalizeVideoAnalysisFields(video(), { coverage, threshold: 0.95 });
  assert.deepEqual(result.spokenTranscript, []);
  assert.equal(result.audio_segments?.[0].kind, "sung_lyrics");
  assert.equal(result.audio_segments?.[0].text, "");
  assert.equal(result.music_lyrics_present?.value, true);
  assert.equal(result.has_licensed_music_lyrics?.value, "unknown");
  assert.deepEqual(result.has_licensed_music_lyrics?.timestamps, []);
});

test("mixed music preserves low-confidence actual speech and excludes sung words", () => {
  const raw = video();
  raw.audio_type = v("music-plus-voiceover");
  raw.audio_segments.push({ kind: "spoken", speaker_type: "voiceover", startSeconds: 2, endSeconds: 4, text: "Our gift set is back", confidence: 0.05 });
  const result = normalizeVideoAnalysisFields(raw, { coverage, threshold: 0.95 });
  assert.deepEqual(result.spokenTranscript.map(segment => segment.value), ["Our gift set is back"]);
  assert.equal(result.spokenTranscript[0].confidence, 0.05);
  assert.equal(result.hook.value, "Eight times stronger");
  raw.cta.timestamps = [];
  assert.equal(normalizeVideoAnalysisFields(raw, { coverage }).cta.value, "unknown");
});

test("ASA review flags are derived from comparative or superlative tags, not confidence", () => {
  const raw = video();
  const comparative = normalizeVideoAnalysisFields(raw, { coverage }).keyClaims[0];
  assert.equal(comparative.may_need_substantiation_asa, true);
  assert.equal(comparative.substantiation_note, "may need substantiation (ASA)");
  raw.keyClaims[0].claim_type = ["performance"];
  const performance = normalizeVideoAnalysisFields(raw, { coverage }).keyClaims[0];
  assert.equal(performance.may_need_substantiation_asa, false);
  assert.equal(performance.substantiation_note, null);
});

test("v2 rejects free text categories, partial taxonomies and unsupported timestamp assertions", () => {
  const raw = video();
  assertVideoAnalysisV2(raw);
  assert.throws(() => assertVideoAnalysisV2({ ...raw, angle: v("looks luxurious") }), /v2/);
  const { hook_type, ...partial } = raw;
  assert.throws(() => normalizeVideoAnalysisFields(partial, { coverage }), /invalid structured/);
  raw.audio_segments[0].endSeconds = 99;
  assert.throws(() => normalizeVideoAnalysisFields(raw, { coverage }), /timestamp/);
});

test("still-image and carousel v2 fields share fixed formats, ASA flags and unfiltered evidence", () => {
  const raw = image();
  const result = validateImageAnalysisFields(raw, 2, "carousel", 0.95, { requireV2: true });
  assert.equal(result.format.value, "static");
  assert.equal(result.hook.value, "UK's best");
  assert.equal(result.hook.confidence, 0.2);
  assert.equal(result.keyClaims[0].may_need_substantiation_asa, true);
  assert.equal(result.keyClaims[0].substantiation_note, "may need substantiation (ASA)");
  assert.deepEqual(result.offer.imageIndices, []);
  assert.throws(() => validateImageAnalysisFields({ ...raw, format: i("carousel") }, 2, "carousel"), /required creative/);
  assert.throws(() => validateImageAnalysisFields({ ...raw, hook: { ...raw.hook, imageIndices: [3] } }, 2, "carousel"), /outside/);
  assert.throws(() => validateImageAnalysisFields({ format: i("static") }, 1, "image", 0, { requireV2: true }), /required creative/);
});

test("UGC still requires creator identity evidence even when confidence filtering is disabled", () => {
  const raw = video();
  raw.format = v("UGC", 0.99);
  assert.equal(normalizeVideoAnalysisFields(raw, { coverage }).format.value, "unsure");
  const creator = { kind: "visible-creator-handle" as const, value: "@independentcreator", confidence: 0.01, timestamps: [{ startSeconds: 1, endSeconds: 2 }], source: "video" as const };
  const result = normalizeVideoAnalysisFields({ ...raw, creatorEvidence: [creator] }, { coverage, threshold: 0.95 });
  assert.equal(result.format.value, "UGC");
  assert.equal(result.creatorEvidence.length, 1);
});
