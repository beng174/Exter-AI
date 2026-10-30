import { z } from "zod";
import {
  DEFAULT_VIDEO_CONFIDENCE, VIDEO_FORMATS,
  type CreatorEvidence, type VideoAnalysisFields, type VideoCoverage, type VideoField, type VideoTimestamp,
} from "../../shared/video-analysis.js";
import { VideoProviderError } from "./types.js";

const ranges = z.array(z.object({ startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().nonnegative() }).strict()).max(100);
const text = z.string().max(4000);
const annotation = <T extends z.ZodType>(value: T) => z.object({ value, confidence: z.number().finite().min(0).max(1), timestamps: ranges }).strict();
const textAnnotation = annotation(text);
const evidenceSchema = z.object({
  kind: z.enum(["paid-partnership-label", "visible-creator-handle"]), value: z.string().min(1).max(300),
  confidence: z.number().finite().min(0).max(1), timestamps: ranges,
  source: z.enum(["video", "ad-library"]), sourceUrl: z.string().max(2000).optional(),
}).strict();
const schema = z.object({
  hook: textAnnotation, format: annotation(z.enum(VIDEO_FORMATS)), angle: textAnnotation,
  keyClaims: z.array(textAnnotation).max(100), spokenTranscript: z.array(textAnnotation).max(500),
  onScreenText: z.array(textAnnotation).max(300), cta: textAnnotation,
  personTalkingToCamera: annotation(z.union([z.boolean(), z.literal("unknown")])),
  creatorEvidence: z.array(evidenceSchema).max(30),
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
  const parsed = schema.safeParse(raw);
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
  function clean<T extends string | boolean>(field: VideoField<T>, hook = false): VideoField<T> {
    const support = timestamps(field.timestamps, hook);
    const value = typeof field.value === "string" ? field.value.trim() : field.value;
    if (value === "" || value === "unknown" || field.confidence < threshold || !support.length)
      return { value: "unknown", confidence: field.confidence, timestamps: [] };
    return { value: value as T, confidence: field.confidence, timestamps: support };
  }
  const unknown = (): VideoField => ({ value: "unknown", confidence: 0, timestamps: [] });
  const trusted = options.trustedEvidence || [];
  const modelEvidence = parsed.data.creatorEvidence.flatMap((item): CreatorEvidence[] => {
    if (item.confidence < threshold) return [];
    if (item.source === "ad-library") {
      const exact = trusted.find((entry) => entry.kind === item.kind && entry.value === item.value && entry.sourceUrl === item.sourceUrl && entry.confidence >= threshold);
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
  const creatorEvidence = [...new Map([...trusted.filter((item) => item.confidence >= threshold), ...modelEvidence]
    .map((item) => [JSON.stringify([item.kind, item.value, item.source, item.sourceUrl]), item])).values()];
  const result: VideoAnalysisFields = {
    hook: clean(parsed.data.hook, true), format: clean(parsed.data.format), angle: clean(parsed.data.angle),
    keyClaims: parsed.data.keyClaims.length ? parsed.data.keyClaims.map((item) => clean(item)) : [unknown()],
    spokenTranscript: parsed.data.spokenTranscript.length ? parsed.data.spokenTranscript.map((item) => clean(item)) : [unknown()],
    onScreenText: parsed.data.onScreenText.length ? parsed.data.onScreenText.map((item) => clean(item)) : [unknown()],
    cta: clean(parsed.data.cta), personTalkingToCamera: clean(parsed.data.personTalkingToCamera), creatorEvidence,
  };
  if (result.format.value === "UGC" && !creatorEvidence.length)
    result.format = { value: "unknown", confidence: result.format.confidence, timestamps: [] };
  if (!creatorEvidence.length) {
    for (const field of ["hook", "angle"] as const)
      if (/\b(?:ugc|influencer|user[ -]generated)\b/i.test(result[field].value))
        result[field] = { value: "unknown", confidence: result[field].confidence, timestamps: [] };
  }
  return result;
}
