import { test } from "node:test";
import assert from "node:assert/strict";
import { ANGLE_VALUES, AUDIO_TYPE_VALUES, CREATIVE_BOOLEAN_TAGS, FORMAT_VALUES, HOOK_TYPE_VALUES, OFFER_TYPE_VALUES } from "../shared/creative-taxonomy.js";
import { LABELLING_FIELDS } from "../shared/labelling.js";
import { VIDEO_RESPONSE_JSON_SCHEMA } from "../server/video/prompt.js";
import { assertVideoAnalysisV2, normalizeVideoAnalysisFields } from "../server/video/validation.js";
import { IMAGE_RESPONSE_SCHEMA, validateImageAnalysisFields } from "../server/image/schema.js";

const times = [{ startSeconds: 0, endSeconds: 3 }];
const annotation = (value: string | boolean, confidence = 0.2) => ({ value, confidence, timestamps: times });
const coverage = { durationSeconds: 12, fullVideo: true, segments: [{ startSeconds: 0, endSeconds: 12, processing: "static" as const, fps: 3 }] };
function videoFields() {
  return {
    hook: annotation("A restock is announced"), hook_type: annotation("scarcity-restock"), format: annotation("studio"),
    angle: annotation("scarcity-urgency"), angle_explanation: annotation("The advertiser asks viewers to buy before it sells out"),
    offer_type: annotation("bundle"), offer_explanation: annotation("Three candles for £30"),
    tags: Object.fromEntries(CREATIVE_BOOLEAN_TAGS.map(tag => [tag, annotation(tag === "urgency_scarcity")])),
    keyClaims: [{ ...annotation("8x stronger than other fragrances"), claim_type: ["comparative", "performance"] }],
    spokenTranscript: [annotation("Upside down / Inside out", 0.99)], onScreenText: [annotation("Back in stock")],
    cta: annotation("Shop now"), personTalkingToCamera: annotation(false), creatorEvidence: [],
    audio_type: annotation("music-only"), music_lyrics_present: annotation(true), has_licensed_music_lyrics: annotation(true, 0.99),
    audio_segments: [{ kind: "sung_lyrics", speaker_type: "singer", startSeconds: 0, endSeconds: 3, text: "Upside down / Inside out", confidence: 0.99 }],
  };
}

test("model and labelling tool share exact format, hook, angle and offer categories", () => {
  const categories = [
    ["format", "format", FORMAT_VALUES], ["hook_type", "hookType", HOOK_TYPE_VALUES],
    ["angle", "angle", ANGLE_VALUES], ["offer_type", "offerType", OFFER_TYPE_VALUES],
  ] as const;
  for (const [modelField, humanField, values] of categories) {
    const human = LABELLING_FIELDS.find(field => field.key === humanField);
    assert.ok(human);
    assert.deepEqual(human.options.map(([value]) => value), [...values]);
    assert.deepEqual(VIDEO_RESPONSE_JSON_SCHEMA.properties[modelField].properties.value.enum, [...values]);
    assert.deepEqual(IMAGE_RESPONSE_SCHEMA.properties[modelField].properties.value.enum, [...values]);
  }
  assert.deepEqual(VIDEO_RESPONSE_JSON_SCHEMA.properties.audio_type.properties.value.enum, [...AUDIO_TYPE_VALUES]);
});

test("song-lyric regression: music-only cannot become speech or establish a music licence", () => {
  const raw = videoFields();
  assertVideoAnalysisV2(raw);
  const result = normalizeVideoAnalysisFields(raw, { coverage, threshold: 0.99 });
  assert.deepEqual(result.spokenTranscript, []);
  assert.equal(result.audio_type?.value, "music-only");
  assert.equal(result.audio_segments?.[0].text, "");
  assert.equal(result.music_lyrics_present?.value, true);
  assert.equal(result.has_licensed_music_lyrics?.value, "unknown");
  assert.deepEqual(result.has_licensed_music_lyrics?.timestamps, []);
  assert.equal(result.hook.value, raw.hook.value, "uncalibrated low confidence is retained");
  assert.equal(result.keyClaims[0].may_need_substantiation_asa, true);
  assert.equal(result.keyClaims[0].substantiation_note, "may need substantiation (ASA)");
});

test("mixed music and voiceover retains only speech and derives ASA review flags per claim", () => {
  const raw = videoFields();
  raw.audio_type = annotation("music-plus-voiceover");
  raw.audio_segments.push({ kind: "spoken", speaker_type: "voiceover", startSeconds: 4, endSeconds: 7, text: "Our candles are back in stock", confidence: 0.25 });
  raw.keyClaims.push({ ...annotation("The UK's best candle"), claim_type: ["superlative"] }, { ...annotation("Made in the UK"), claim_type: ["provenance"] });
  const result = normalizeVideoAnalysisFields(raw, { coverage });
  assert.deepEqual(result.spokenTranscript.map(item => item.value), ["Our candles are back in stock"]);
  assert.ok(!JSON.stringify(result).includes("Upside down"));
  assert.equal(result.keyClaims[1].may_need_substantiation_asa, true);
  assert.equal(result.keyClaims[2].may_need_substantiation_asa, false);
  assert.equal(result.keyClaims[2].substantiation_note, null);
});

test("new model responses require v2 categories while stored legacy fields remain readable", () => {
  const legacy = { hook: annotation("Opening"), format: annotation("studio"), angle: annotation("Historical free-text angle"),
    keyClaims: [], spokenTranscript: [], onScreenText: [], cta: annotation("Shop"), personTalkingToCamera: annotation(false), creatorEvidence: [] };
  assert.throws(() => assertVideoAnalysisV2(legacy), /required v2/);
  assert.equal(normalizeVideoAnalysisFields(legacy, { coverage, threshold: 0.99 }).angle.value, "Historical free-text angle");
  assert.throws(() => assertVideoAnalysisV2({ ...videoFields(), angle: annotation("Uncontrolled new phrase") }), /required v2/);
});

test("still-image and carousel claims use v2 categories and derived ASA flags without a confidence filter", () => {
  const image = (value: string | boolean) => ({ value, confidence: 0.1, imageIndices: [1] });
  const raw = { format: image("static"), hook: image("Back in stock"), hook_type: image("scarcity-restock"), headline: image("Candle bundle"),
    angle: image("value-bundle"), angle_explanation: image("A lower combined price"),
    keyClaims: [{ ...image("The UK's best candle"), claim_type: ["superlative"] }], onScreenText: [],
    offer: image("Three for £30"), offer_type: image("bundle"), cta: image("Shop now"),
    tags: Object.fromEntries(CREATIVE_BOOLEAN_TAGS.map(tag => [tag, image(tag === "price_shown")])) };
  for (const kind of ["image", "carousel"] as const) {
    const result = validateImageAnalysisFields(raw, 1, kind, 0.99, { requireV2: true });
    assert.equal(result.format.value, "static");
    assert.equal(result.hook_type?.value, "scarcity-restock");
    assert.equal(result.keyClaims[0].may_need_substantiation_asa, true);
    assert.equal(result.tags?.price_shown.value, true);
  }
  assert.throws(() => validateImageAnalysisFields({ ...raw, format: image("carousel") }, 1, "carousel", 0, { requireV2: true }), /valid required/);
});
