import type { VideoAnalysisAccounting, VideoNormalization, VideoProcessingMode } from "./video-analysis.js";
import type { GeminiDiagnostic } from "./gemini-diagnostic.js";
import type { InferenceGenerationMetadata, MediaResolution, VideoSamplingMetadata } from "./inference-config.js";
export const GEMINI_SMOKE_TARGET = 25;
export const GEMINI_SMOKE_MIN_SAMPLE = 10;
export type SmokeMediaKind = "video" | "image" | "carousel" | "unknown";
export interface SmokeFormatCounts { video: number; image: number; carousel: number }
export interface SmokePreparationAttempt {
  at: string;
  source: "stored" | "snapshot" | "refreshed_snapshot";
  errorCode?: string;
  error?: string;
  httpStatus?: number;
}
export type SmokeItemStatus = "pending" | "preparing" | "stored" | "analysing" | "complete" | "unavailable" | "failed" | "interrupted";
export interface SmokeItem {
  adId: string;
  brandId: string;
  nativeId: string;
  mediaKind?: SmokeMediaKind;
  imageCount?: number;
  durationSeconds?: number;
  status: SmokeItemStatus;
  mediaId?: string;
  mediaSha256?: string;
  jobId?: string;
  analysisId?: string;
  model?: string;
  requestedModel?: string;
  servedModel?: string;
  generation?: InferenceGenerationMetadata;
  sampling?: VideoSamplingMetadata;
  normalization?: VideoNormalization;
  processingMode?: VideoProcessingMode | "image" | "carousel";
  usage?: VideoAnalysisAccounting["usage"];
  estimatedCostGbp?: number | null;
  reservedCostGbp?: number | null;
  tokenCostGbp?: number | null;
  billedCostGbp?: number | null;
  initialReservedCostGbp?: number | null;
  rejectedAttempts?: number;
  retryAttempts?: number;
  geminiDiagnostic?: GeminiDiagnostic;
  costBasis?: string;
  accounting?: VideoAnalysisAccounting[];
  errorCode?: string;
  error?: string;
  sourceHttpStatus?: number;
  preparationAttempts?: SmokePreparationAttempt[];
  failureCategory?: "expired_video_link" | "expired_media_link" | "blocked_restricted" | "other";
}
export interface SmokeRun {
  id: string;
  kind: "prepare" | "smoke" | "diagnostic";
  status: "queued" | "preparing" | "analysing" | "complete" | "paused" | "interrupted" | "failed";
  requestedMode: VideoProcessingMode;
  /** Missing on historical runs; never inferred for already-paid outputs. */
  mediaResolution?: MediaResolution;
  generationSeed?: number;
  /** Actual retained preparation count or fixed inference sample, including failed inferences. */
  sampleSize?: number;
  sampleCounts?: SmokeFormatCounts;
  targetSampleSize?: number;
  minimumSampleSize?: number;
  refreshFailed?: boolean;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  message?: string;
  items: SmokeItem[];
}
export interface SmokeStatus {
  hosted: boolean;
  configured: boolean;
  configurationErrors: string[];
  model: string;
  concurrency: number;
  candidateCount: number;
  storedCount: number | null;
  minSampleSize: number;
  targetSampleSize: number;
  storedCounts: SmokeFormatCounts;
  run: SmokeRun | null;
}
