export const VIDEO_FORMATS = ["UGC", "founder-led", "studio", "animation", "mixed", "unknown"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];
export type VideoProcessingMode = "agentic" | "static-high-fps-hook";
export const VIDEO_PROMPT_VERSION = "exter-native-video-v1";
export const DEFAULT_VIDEO_CONFIDENCE = 0.75;

export interface VideoTimestamp { startSeconds: number; endSeconds: number }
export interface VideoField<T = string> {
  value: T | "unknown";
  confidence: number;
  timestamps: VideoTimestamp[];
}
export interface CreatorEvidence {
  kind: "paid-partnership-label" | "visible-creator-handle";
  value: string;
  confidence: number;
  timestamps: VideoTimestamp[];
  source: "video" | "ad-library";
  sourceUrl?: string;
}
export interface VideoAnalysisFields {
  hook: VideoField;
  format: VideoField<VideoFormat>;
  angle: VideoField;
  keyClaims: VideoField[];
  spokenTranscript: VideoField[];
  onScreenText: VideoField[];
  cta: VideoField;
  personTalkingToCamera: VideoField<boolean>;
  creatorEvidence: CreatorEvidence[];
}
export interface VideoCoverage {
  durationSeconds: number;
  fullVideo: boolean;
  segments: (VideoTimestamp & { processing: "agentic" | "static"; fps?: number })[];
}
/** GBP estimates include conservative reservations for attempts whose charge is unknown. */
export interface VideoAnalysisAccounting {
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
  tokenCostGbp: number | null;
  reservedCostGbp: number | null;
  estimatedCostGbp: number | null;
  costBasis: "token_estimate" | "reservation_estimate" | "token_and_reservation_estimate" | "unavailable";
  pricing: { inputGbpPerMillion: number; outputGbpPerMillion: number } | null;
  requestAttempts: number;
  /** Sanitised provider response; never contains the configured credential. */
  rawResponse?: unknown;
}
export interface VideoAnalysisResult {
  id: string;
  adId: string;
  brandId: string;
  mediaId: string;
  mediaSha256: string;
  inputContextSha256?: string;
  provider: string;
  model: string;
  requestedModel?: string;
  modelVersion: string | null;
  processingMode: VideoProcessingMode;
  promptVersion: string;
  createdAt: string;
  confidenceThreshold: number;
  coverage: VideoCoverage;
  fields: VideoAnalysisFields;
  providerRequestId?: string;
  accounting?: VideoAnalysisAccounting;
}

export interface VideoAnalysisAttempt {
  processingMode: VideoProcessingMode;
  status: "succeeded" | "failed";
  errorCode?: string;
  accounting?: VideoAnalysisAccounting;
}
