import type { VideoAnalysisAccounting } from "./video-analysis.js";
import type { ClaimType, CreativeBooleanTag, HookType, OfferType } from "./creative-taxonomy.js";
import type { InferenceGenerationMetadata, InferenceSettings } from "./inference-config.js";

export const IMAGE_PROMPT_VERSION = "exter-still-creative-v2";
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
export interface ImageField<T = string> {
  value: T | "unknown";
  confidence: number;
  /** One-based slide positions; empty when evidence exists only in the supplied ad copy. */
  imageIndices: number[];
}
export interface ImageClaim extends ImageField {
  claim_type?: ClaimType[];
  may_need_substantiation_asa?: boolean;
  substantiation_note?: "may need substantiation (ASA)" | null;
}
export interface ImageAnalysisFields {
  format: ImageField;
  hook: ImageField;
  headline: ImageField;
  angle: ImageField;
  keyClaims: ImageClaim[];
  onScreenText: ImageField[];
  offer: ImageField;
  cta: ImageField;
  hook_type?: ImageField<HookType>;
  angle_explanation?: ImageField;
  offer_type?: ImageField<OfferType>;
  tags?: Record<CreativeBooleanTag, ImageField<boolean>>;
}
export interface ImageAnalysisResult {
  id: string;
  brandId: string;
  adId: string;
  mediaId: string;
  mediaSha256: string;
  provider: "gemini";
  model: string;
  requestedModel?: string;
  servedModel?: string;
  modelVersion: string | null;
  processingMode: ImageCreativeKind;
  promptVersion: string;
  createdAt: string;
  confidencePolicy?: "uncalibrated-not-filtered";
  analysisConfigSha256?: string;
  inferenceSettings?: InferenceSettings;
  generation?: InferenceGenerationMetadata;
  fields: ImageAnalysisFields;
  accounting: VideoAnalysisAccounting;
}
