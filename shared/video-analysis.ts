import type { GeminiDiagnostic } from "./gemini-diagnostic.js";
import { FORMAT_VALUES, type AudioType, type ClaimType, type CreativeBooleanTag, type HookType, type OfferType } from "./creative-taxonomy.js";
import type { InferenceGenerationMetadata, InferenceSettings, VideoSamplingMetadata } from "./inference-config.js";

export const VIDEO_FORMATS = FORMAT_VALUES;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];
export type VideoProcessingMode = "agentic" | "static-high-fps-hook";
export const VIDEO_PROMPT_VERSION = "exter-native-video-v2";
/** Retained for old consumers; model confidence is uncalibrated and never filters evidence. */
export const DEFAULT_VIDEO_CONFIDENCE = 0;

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
export interface VideoClaim extends VideoField {
  claim_type?: ClaimType[];
  /** A review aid derived by the server, not a finding that a claim breaches ASA rules. */
  may_need_substantiation_asa?: boolean;
  substantiation_note?: "may need substantiation (ASA)" | null;
}
export const AUDIO_SEGMENT_KINDS = ["spoken", "sung_lyrics", "instrumental_music", "silence", "uncertain"] as const;
export const AUDIO_SPEAKER_TYPES = ["voiceover", "on-camera", "singer", "none", "unsure"] as const;
export interface VideoAudioSegment extends VideoTimestamp {
  kind: (typeof AUDIO_SEGMENT_KINDS)[number];
  speaker_type: (typeof AUDIO_SPEAKER_TYPES)[number];
  /** Spoken words only. Sung lyrics are never reproduced here. */
  text: string;
  confidence: number;
}
export interface VideoAnalysisFields {
  hook: VideoField;
  format: VideoField<VideoFormat>;
  angle: VideoField;
  keyClaims: VideoClaim[];
  spokenTranscript: VideoField[];
  onScreenText: VideoField[];
  cta: VideoField;
  personTalkingToCamera: VideoField<boolean>;
  creatorEvidence: CreatorEvidence[];
  /** Optional only so historical v1 results remain readable. New v2 requests require these. */
  hook_type?: VideoField<HookType>;
  angle_explanation?: VideoField;
  offer_type?: VideoField<OfferType>;
  offer_explanation?: VideoField;
  tags?: Record<CreativeBooleanTag, VideoField<boolean>>;
  audio_type?: VideoField<AudioType>;
  music_lyrics_present?: VideoField<boolean>;
  /** Unknown without trusted rights metadata; audio alone cannot establish a licence. */
  has_licensed_music_lyrics?: VideoField<boolean>;
  audio_segments?: VideoAudioSegment[];
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
  pricing: { inputGbpPerMillion: number; outputGbpPerMillion: number; model?: string; source?: string } | null;
  pricingReason?: string;
  requestAttempts: number;
  /** Total holds created, including holds subsequently settled or released. */
  initialReservedCostGbp?: number | null;
  /** Provider-confirmed bill/invoice amount. No billing feed is connected, so null. */
  billedCostGbp?: number | null;
  /** Extra generation dispatches after the first attempt; not a billing count. */
  retryAttempts?: number;
  /** Explicit provider HTTP rejections, as distinct from ambiguous timeouts. */
  rejectedAttempts?: number;
  /** Sanitised provider response; never contains the configured credential. */
  rawResponse?: unknown;
}
export interface VideoNormalization {
  version: "exter-video-normalize-v1";
  applied: boolean;
  originalSha256: string;
  uploadSha256: string;
  originalMimeType: string;
  uploadMimeType: "video/mp4";
  originalBytes: number;
  uploadBytes: number;
  videoCodec: "h264";
  audioCodec: "aac" | null;
  pixelFormat: "yuv420p";
  durationSeconds: number;
  originalWidth?: number | null;
  originalHeight?: number | null;
  originalFps?: number | null;
  uploadWidth?: number | null;
  uploadHeight?: number | null;
  uploadFps?: number | null;
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
  servedModel?: string;
  modelVersion: string | null;
  processingMode: VideoProcessingMode;
  promptVersion: string;
  createdAt: string;
  confidenceThreshold: number;
  confidencePolicy?: "uncalibrated-not-filtered";
  analysisConfigSha256?: string;
  inferenceSettings?: InferenceSettings;
  generation?: InferenceGenerationMetadata;
  sampling?: VideoSamplingMetadata;
  coverage: VideoCoverage;
  fields: VideoAnalysisFields;
  providerRequestId?: string;
  accounting?: VideoAnalysisAccounting;
  normalization?: VideoNormalization;
}

export interface VideoAnalysisAttempt {
  processingMode: VideoProcessingMode;
  status: "succeeded" | "failed";
  errorCode?: string;
  diagnostic?: GeminiDiagnostic;
  accounting?: VideoAnalysisAccounting;
}
