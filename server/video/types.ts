import type { CreatorEvidence, VideoCoverage, VideoProcessingMode } from "../../shared/video-analysis.js";

export interface StoredVideo {
  mediaId: string;
  absolutePath: string;
  relativePath: string;
  sha256: string;
  bytes: number;
  mimeType: string;
  durationSeconds: number;
  storedAt: string;
  sourceAdId: string;
  brandId: string;
  sourceUrl: string;
}
export interface VideoMediaStore {
  store(input: { adId: string; brandId: string; sourceUrl?: string; signal?: AbortSignal }): Promise<StoredVideo>;
  load(mediaId: string): Promise<StoredVideo | null>;
}
export interface VideoAnalyserInput {
  adId: string;
  brandId: string;
  media: StoredVideo;
  context: { brandName: string; adCopy: string; sourceUrl?: string; creatorEvidence: CreatorEvidence[] };
  processingMode: VideoProcessingMode;
  signal?: AbortSignal;
}
export interface VideoProviderResult {
  fields: unknown;
  model: string;
  modelVersion: string | null;
  processingMode: VideoProcessingMode;
  promptVersion: string;
  coverage: VideoCoverage;
  providerRequestId?: string;
}
export interface VideoAnalyser {
  readonly provider: string;
  readonly model: string;
  readonly implemented?: boolean;
  analyse(input: VideoAnalyserInput): Promise<VideoProviderResult>;
}
export type VideoErrorCode = "unsupported_mode" | "authentication" | "rate_limit" | "invalid_output" | "unavailable" | "not_implemented" | "configuration";
export class VideoProviderError extends Error {
  constructor(public code: VideoErrorCode, message: string) { super(message); this.name = "VideoProviderError"; }
}
