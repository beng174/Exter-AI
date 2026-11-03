import { ANGLE_OPTIONS, FORMAT_OPTIONS, HOOK_TYPE_OPTIONS, OFFER_TYPE_OPTIONS } from "./creative-taxonomy.js";
import type { DemoPatternCoverage } from "./brand-demo.js";
import type { VideoAnalysisFields, VideoField } from "./video-analysis.js";
import type { ImageAnalysisFields, ImageField } from "./image-analysis.js";

export type PatternDimension = "format" | "hookType" | "angle" | "offerType";
export type PatternAnnotation = VideoField<unknown> | ImageField<unknown>;
export const PATTERN_OPTIONS = { format: FORMAT_OPTIONS, hookType: HOOK_TYPE_OPTIONS, angle: ANGLE_OPTIONS, offerType: OFFER_TYPE_OPTIONS } as const;
const sourceFields = { format: "format", hookType: "hook_type", angle: "angle", offerType: "offer_type" } as const;
const legacyFields = { format: ["format"], hookType: ["hook_type", "hook"], angle: ["angle"], offerType: ["offer_type", "offer", "offer_explanation"] } as const;

/** Confidence remains uncalibrated. Only a retained value and source references
 * establish that the model actually recorded this observation. */
export function supportedPatternAnnotation(value: unknown): value is PatternAnnotation {
  if (!value || typeof value !== "object") return false;
  const annotation = value as Partial<PatternAnnotation> & { imageIndices?: unknown; timestamps?: unknown };
  if (typeof annotation.value !== "string" || ["", "unknown", "unsure"].includes(annotation.value.trim().toLowerCase())) return false;
  // Image outputs may explicitly cite supplied original copy with no slide index.
  return Array.isArray(annotation.imageIndices) || Array.isArray(annotation.timestamps) && annotation.timestamps.length > 0;
}

export interface PatternLabelProjection {
  canonical: string | null;
  legacy: string | null;
  annotation: PatternAnnotation | null;
  sourceField: string;
}

/** A descriptive opening or offer remains a description. No phrase matching,
 * synonym mapping or guessed taxonomy label is performed here. */
export function projectPatternLabel(fields: VideoAnalysisFields | ImageAnalysisFields, dimension: PatternDimension): PatternLabelProjection {
  const original = fields as unknown as Record<string, unknown>;
  const sourceField = sourceFields[dimension];
  const primary = original[sourceField];
  if (supportedPatternAnnotation(primary) && PATTERN_OPTIONS[dimension].some(([value]) => value !== "unsure" && value === primary.value))
    return { canonical: String(primary.value), legacy: null, annotation: primary, sourceField };
  for (const field of legacyFields[dimension]) {
    const annotation = original[field];
    if (supportedPatternAnnotation(annotation)) return { canonical: null, legacy: String(annotation.value).trim(), annotation, sourceField: field };
  }
  return { canonical: null, legacy: null, annotation: null, sourceField };
}

export function patternCoverage(projections: PatternLabelProjection[]): DemoPatternCoverage {
  const classified = projections.filter(item => item.canonical !== null).length;
  const legacy = projections.filter(item => item.canonical === null && item.legacy !== null).length;
  const missing = projections.length - classified - legacy;
  return {
    classified, totalAnalysed: projections.length, unclassified: projections.length - classified, legacy, missing,
    basis: "modelled", countBasis: "observed", classificationBasis: "modelled",
    definition: "Counts describe saved analysed ads. Categories are model classifications, not measured ad performance. Original descriptions are shown separately and never silently assigned a fixed category. Missing labels do not mean the feature is absent.",
  };
}
