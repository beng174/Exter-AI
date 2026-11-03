import type { VideoAnalysisAccounting, VideoTimestamp } from "./video-analysis.js";

export const PATTERN_LABEL_PROMPT_VERSION = "exter-saved-analysis-labels-v1";
export const PATTERN_LABEL_FIELDS = ["format", "hook_type", "angle", "offer_type"] as const;
export type PatternLabelField = (typeof PATTERN_LABEL_FIELDS)[number];
export interface PatternLabelEvidence { sourceField: string; quote: string }
export interface PatternLabelValue {
  value: string;
  reason: string;
  evidence: PatternLabelEvidence[];
  timestamps?: VideoTimestamp[];
  imageIndices?: number[];
}
export interface PatternLabelProjection {
  overlayId: string;
  sourceAnalysisId: string;
  taxonomyVersion: string;
  promptVersion: typeof PATTERN_LABEL_PROMPT_VERSION;
  provenance: "modelled";
  basis: "recorded-analysis-text";
  createdAt: string;
  requestedModel: string;
  servedModel: string | null;
  fields: PatternLabelField[];
  labels?: Partial<Record<PatternLabelField,PatternLabelValue>>;
}
export interface PatternLabelOverlay {
  id: string;
  brandId: string;
  adId: string;
  sourceBrandId: string;
  sourceAdId: string;
  sourceAnalysisId: string;
  sourceSha256: string;
  taxonomyVersion: string;
  promptVersion: typeof PATTERN_LABEL_PROMPT_VERSION;
  provenance: "modelled";
  basis: "recorded-analysis-text";
  createdAt: string;
  requestedModel: string;
  servedModel: string | null;
  generation: { temperature: 0; seed: number };
  fields: Record<PatternLabelField, PatternLabelValue>;
  accounting?: VideoAnalysisAccounting;
}
export interface PatternLabelItem {
  adId: string;
  nativeId: string;
  sourceAnalysisId: string;
  sourceSha256: string;
  status: "pending" | "claimed" | "complete" | "failed" | "interrupted";
  attemptId?: string;
  overlayId?: string;
  possibleCharge?: boolean;
  error?: string;
  accounting?: VideoAnalysisAccounting;
}
export interface PatternLabelRun {
  id: string;
  brandId: string;
  status: "queued" | "running" | "complete" | "paused" | "interrupted";
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  message?: string;
  items: PatternLabelItem[];
}
export interface PatternLabelsSnapshot {
  brandId: string;
  hosted: boolean;
  configured: boolean;
  sourceAnalysedCount: number;
  eligibleCount: number;
  labelledCount: number;
  remainingCount: number;
  blockedCount: number;
  lastRun: PatternLabelRun | null;
  limitations: string[];
}
