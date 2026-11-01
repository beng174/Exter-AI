import type { VideoAnalysisAccounting } from "./video-analysis.js";

export const IMAGE_PROMPT_VERSION = "exter-still-creative-v1";
export type ImageCreativeKind = "image" | "carousel";
export interface StoredImage {
  absolutePath: string;
  relativePath: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sha256: string;
  bytes: number;
}
export interface StoredImageCreative {
  mediaId: string;
  sha256: string;
  kind: ImageCreativeKind;
  brandId: string;
  adId: string;
  storedAt: string;
  images: StoredImage[];
}
export interface ImageField {
  value: string;
  confidence: number;
  /** One-based slide positions; empty when evidence exists only in the supplied ad copy. */
  imageIndices: number[];
}
export interface ImageAnalysisFields {
  format: ImageField;
  hook: ImageField;
  headline: ImageField;
  angle: ImageField;
  keyClaims: ImageField[];
  onScreenText: ImageField[];
  offer: ImageField;
  cta: ImageField;
}
export interface ImageAnalysisResult {
  id: string;
  brandId: string;
  adId: string;
  mediaId: string;
  mediaSha256: string;
  provider: "gemini";
  model: string;
  modelVersion: string | null;
  processingMode: ImageCreativeKind;
  promptVersion: string;
  createdAt: string;
  fields: ImageAnalysisFields;
  accounting: VideoAnalysisAccounting;
}
