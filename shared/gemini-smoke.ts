import type { VideoAnalysisAccounting, VideoProcessingMode } from "./video-analysis.js";
export const GEMINI_SMOKE_TARGET = 25;
export type SmokeItemStatus = "pending" | "preparing" | "stored" | "analysing" | "complete" | "failed" | "interrupted";
export interface SmokeItem {
  adId: string;
  brandId: string;
  nativeId: string;
  status: SmokeItemStatus;
  mediaId?: string;
  mediaSha256?: string;
  jobId?: string;
  analysisId?: string;
  model?: string;
  processingMode?: VideoProcessingMode;
  usage?: VideoAnalysisAccounting["usage"];
  estimatedCostGbp?: number | null;
  costBasis?: string;
  accounting?: VideoAnalysisAccounting[];
  errorCode?: string;
  error?: string;
}
export interface SmokeRun {
  id: string;
  kind: "prepare" | "smoke";
  status: "queued" | "preparing" | "analysing" | "complete" | "paused" | "interrupted" | "failed";
  requestedMode: VideoProcessingMode;
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
  run: SmokeRun | null;
}
