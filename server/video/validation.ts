import { z } from "zod";
import {
  AUDIO_SEGMENT_KINDS, AUDIO_SPEAKER_TYPES, DEFAULT_VIDEO_CONFIDENCE, VIDEO_FORMATS,
  type CreatorEvidence, type VideoAnalysisFields, type VideoCoverage, type VideoField, type VideoTimestamp,
} from "../../shared/video-analysis.js";
import { VideoProviderError } from "./types.js";
import { ANGLE_VALUES, AUDIO_TYPE_VALUES, CLAIM_TYPE_VALUES, CREATIVE_BOOLEAN_TAGS, HOOK_TYPE_VALUES, OFFER_TYPE_VALUES } from "../../shared/creative-taxonomy.js";

const ranges = z.array(z.object({ startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().nonnegative() }).strict()).max(100);
const text = z.string().max(4000);
const annotation = <T extends z.ZodType>(value: T) => z.object({ value, confidence: z.number().finite().min(0).max(1), timestamps: ranges }).strict();
const textAnnotation = annotation(text);
const evidenceSchema = z.object({
  kind: z.enum(["paid-partnership-label", "visible-creator-handle"]), value: z.string().min(1).max(300),
  confidence: z.number().finite().min(0).max(1), timestamps: ranges,
  source: z.enum(["video", "ad-library"]), sourceUrl: z.string().max(2000).optional(),
}).strict();
const legacyProperties = {
  hook: textAnnotation, format: annotation(z.enum([...VIDEO_FORMATS, "unknown"])), angle: textAnnotation,
  keyClaims: z.array(textAnnotation).max(100), spokenTranscript: z.array(textAnnotation).max(500),
  onScreenText: z.array(textAnnotation).max(300), cta: textAnnotation,
  personTalkingToCamera: annotation(z.union([z.boolean(), z.literal("unknown")])),
  creatorEvidence: z.array(evidenceSchema).max(30),
};
const legacySchema = z.object(legacyProperties).strict();
const booleanAnnotation = annotation(z.union([z.boolean(), z.literal("unknown")]));
const schema = z.object({
  ...legacyProperties,
  format: annotation(z.enum(VIDEO_FORMATS)),
  hook_type: annotation(z.enum(HOOK_TYPE_VALUES)),
  angle: annotation(z.enum(ANGLE_VALUES)), angle_explanation: textAnnotation,
  offer_type: annotation(z.enum(OFFER_TYPE_VALUES)), offer_explanation: textAnnotation,
  tags: z.object(Object.fromEntries(CREATIVE_BOOLEAN_TAGS.map(tag => [tag, booleanAnnotation])) as Record<(typeof CREATIVE_BOOLEAN_TAGS)[number], typeof booleanAnnotation>).strict(),
  keyClaims: z.array(textAnnotation.extend({ claim_type: z.array(z.enum(CLAIM_TYPE_VALUES)).min(1).max(CLAIM_TYPE_VALUES.length) })).max(100),
  audio_type: annotation(z.enum(AUDIO_TYPE_VALUES)), music_lyrics_present: booleanAnnotation, has_licensed_music_lyrics: booleanAnnotation,
  audio_segments: z.array(z.object({
    kind: z.enum(AUDIO_SEGMENT_KINDS), speaker_type: z.enum(AUDIO_SPEAKER_TYPES),
    startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().nonnegative(),
    text, confidence: z.number().finite().min(0).max(1),
  }).strict()).max(500),
}).strict();

export interface VideoValidationOptions {
  coverage: VideoCoverage;
  threshold?: number;
  trustedEvidence?: CreatorEvidence[];
  brandName?: string;
}
export function normalizeVideoAnalysisFields(raw: unknown, options: VideoValidationOptions): VideoAnalysisFields {
  const threshold = options.threshold ?? DEFAULT_VIDEO_CONFIDENCE;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new VideoProviderError("configuration", "Video confidence threshold must be between zero and one.");
  // Historical v1 data remains readable. The provider's v2 response schema requires
  // every new field; any v2 field opts into the complete, strict v2 contract here.
  const isV2 = !!raw && typeof raw === "object" && ["hook_type", "angle_explanation", "offer_type", "tags", "audio_type", "audio_segments"].some(key => key in raw);
  const parsed = (isV2 ? schema : legacySchema).safeParse(raw);
  if (!parsed.success)
    throw new VideoProviderError("invalid_output", "The video model returned an invalid structured result. No analysis was saved.");
  const { coverage } = options;
  const duration = coverage.durationSeconds;
  if (!Number.isFinite(duration) || duration <= 0 || !coverage.segments.length)
    throw new VideoProviderError("invalid_output", "Video coverage metadata is invalid.");
  if (typeof coverage.fullVideo !== "boolean" || coverage.segments.length > 100 || coverage.segments.some((segment) =>
    !Number.isFinite(segment.startSeconds) || !Number.isFinite(segment.endSeconds) || segment.startSeconds < 0 ||
    segment.endSeconds <= segment.startSeconds || segment.endSeconds > duration + 0.05 ||
    !["agentic", "static"].includes(segment.processing) ||
    (segment.processing === "static" && (!Number.isFinite(segment.fps) || segment.fps! <= 0 || segment.fps! > 60))))
    throw new VideoProviderError("invalid_output", "Video coverage segments are invalid.");
  let fullCoverageEnd = 0;
  for (const segment of [...coverage.segments].sort((a, b) => a.startSeconds - b.startSeconds))
    if (segment.startSeconds <= fullCoverageEnd + 0.05) fullCoverageEnd = Math.max(fullCoverageEnd, segment.endSeconds);
  if (coverage.fullVideo && fullCoverageEnd < duration - 0.05)
    throw new VideoProviderError("invalid_output", "Full-video coverage cannot contain unanalysed gaps.");
  function timestamps(input: VideoTimestamp[], hook = false): VideoTimestamp[] {
    return input.map((range) => {
      let coveredUntil = range.startSeconds;
      for (const segment of [...coverage.segments].sort((a, b) => a.startSeconds - b.startSeconds)) {
        if (segment.startSeconds <= coveredUntil + 0.05 && segment.endSeconds >= coveredUntil)
          coveredUntil = Math.max(coveredUntil, segment.endSeconds);
      }
      if (range.endSeconds < range.startSeconds || range.endSeconds > duration + 0.05 ||
          (hook && range.endSeconds > Math.min(3, duration) + 0.05) ||
          coveredUntil < range.endSeconds - 0.05)
        throw new VideoProviderError("invalid_output", "A video timestamp is outside the analysed coverage or hook interval.");
      return range;
    });
  }
  function clean<T extends string | boolean>(field: VideoField<T>, hook = false, fallback: T | "unknown" = "unknown"): VideoField<T> {
    const support = timestamps(field.timestamps, hook);
    const value = typeof field.value === "string" ? field.value.trim() : field.value;
    if (value === "" || value === "unknown" || !support.length)
      return { value: fallback, confidence: field.confidence, timestamps: [] };
    return { value: value as T, confidence: field.confidence, timestamps: support };
  }
  const unknown = (): VideoField => ({ value: "unknown", confidence: 0, timestamps: [] });
  const trusted = options.trustedEvidence || [];
  const modelEvidence = parsed.data.creatorEvidence.flatMap((item): CreatorEvidence[] => {
    if (item.source === "ad-library") {
      const exact = trusted.find((entry) => entry.kind === item.kind && entry.value === item.value && entry.sourceUrl === item.sourceUrl);
      return exact ? [exact] : [];
    }
    const support = timestamps(item.timestamps);
    if (!support.length) return [];
    if (item.kind === "visible-creator-handle") {
      if (!/^@[a-zA-Z0-9_.-]{2,100}$/.test(item.value)) return [];
      const brand = options.brandName?.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (brand && brand.length >= 4 && item.value.toLowerCase().replace(/[^a-z0-9]/g, "").includes(brand)) return [];
    }
    // Only trusted source context may assert an external source URL.
    return [{ kind: item.kind, value: item.value, confidence: item.confidence, timestamps: support, source: "video" }];
  });
  const creatorEvidence = [...new Map([...trusted, ...modelEvidence]
    .map((item) => [JSON.stringify([item.kind, item.value, item.source, item.sourceUrl]), item])).values()];
  const result: VideoAnalysisFields = {
    hook: clean(parsed.data.hook, true), format: clean(parsed.data.format, false, isV2 ? "unsure" : "unknown"), angle: clean(parsed.data.angle, false, isV2 ? "unsure" : "unknown"),
    keyClaims: parsed.data.keyClaims.length ? parsed.data.keyClaims.map((item) => clean(item)) : [unknown()],
    spokenTranscript: parsed.data.spokenTranscript.length ? parsed.data.spokenTranscript.map((item) => clean(item)) : [unknown()],
    onScreenText: parsed.data.onScreenText.length ? parsed.data.onScreenText.map((item) => clean(item)) : [unknown()],
    cta: clean(parsed.data.cta), personTalkingToCamera: clean(parsed.data.personTalkingToCamera), creatorEvidence,
  };
  if (isV2) {
    const data = schema.parse(raw);
    result.hook_type = clean(data.hook_type, true, "unsure");
    result.angle_explanation = clean(data.angle_explanation);
    result.offer_type = clean(data.offer_type, false, "unsure");
    result.offer_explanation = clean(data.offer_explanation);
    result.tags = Object.fromEntries(CREATIVE_BOOLEAN_TAGS.map(tag => [tag, clean(data.tags[tag])])) as NonNullable<VideoAnalysisFields["tags"]>;
    result.keyClaims = data.keyClaims.map(item => {
      const claim = clean(item);
      const claim_type = claim.value === "unknown" ? ["unsure" as const] : [...new Set(item.claim_type)];
      const review = claim_type.some(type => type === "comparative" || type === "superlative");
      return { ...claim, claim_type, may_need_substantiation_asa: review, substantiation_note: review ? "may need substantiation (ASA)" : null };
    });
    result.audio_type = clean(data.audio_type, false, "unsure");
    const audioSegments = data.audio_segments.map(segment => {
      timestamps([segment]);
      return { ...segment, text: segment.kind === "spoken" && segment.speaker_type !== "singer" ? segment.text.trim() : "" };
    });
    result.audio_segments = audioSegments;
    result.music_lyrics_present = clean(data.music_lyrics_present);
    const singing = audioSegments.filter(segment => segment.kind === "sung_lyrics");
    if (singing.length) result.music_lyrics_present = { value: true, confidence: Math.max(...singing.map(segment => segment.confidence)), timestamps: singing.map(({ startSeconds, endSeconds }) => ({ startSeconds, endSeconds })) };
    // Neither a model assertion nor an intelligible song establishes rights ownership.
    timestamps(data.has_licensed_music_lyrics.timestamps);
    result.has_licensed_music_lyrics = { value: "unknown", confidence: data.has_licensed_music_lyrics.confidence, timestamps: [] };
    const speech = audioSegments.filter(segment => segment.kind === "spoken" && segment.speaker_type !== "singer" && segment.text);
    result.spokenTranscript = ["music-only", "silent"].includes(result.audio_type.value)
      ? []
      : speech.map(segment => ({ value: segment.text, confidence: segment.confidence, timestamps: [{ startSeconds: segment.startSeconds, endSeconds: segment.endSeconds }] }));
    if (!result.spokenTranscript.length && result.audio_type.value === "unsure") result.spokenTranscript = [unknown()];
  }
  if (result.format.value === "UGC" && !creatorEvidence.length)
    result.format = { value: isV2 ? "unsure" : "unknown", confidence: result.format.confidence, timestamps: [] };
  if (!creatorEvidence.length) {
    for (const field of ["hook", "angle", "angle_explanation"] as const) {
      const item = result[field];
      if (item && /\b(?:ugc|influencer|user[ -]generated)\b/i.test(item.value))
        result[field] = { value: field === "angle" && isV2 ? "unsure" : "unknown", confidence: item.confidence, timestamps: [] };
    }
  }
  return result;
}

/** New model responses must satisfy v2; legacy acceptance is only for stored/injected history. */
export function assertVideoAnalysisV2(raw: unknown): void {
  if (!schema.safeParse(raw).success)
    throw new VideoProviderError("invalid_output", "The video model did not return the required v2 creative taxonomy and audio fields.");
}
