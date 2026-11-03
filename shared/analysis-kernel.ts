/** Worker evidence contracts. These do not imply that local ML stages are installed. */
export const EXTRACTED_PIPELINE_VERSION = "exter-extracted-labels-v1";
export const REFERENCE_PIPELINE_VERSION = "exter-reference-full-video-v2";
export const LABEL_PROMPT_VERSION = "exter-labels-only-v1";
export const LABEL_MODEL = "gemini-3.1-flash-lite";
export type KernelSourceKind = "speech" | "on-screen-text" | "scene" | "audio" | "face-presence" | "product-candidate" | "creator-credit" | "ad-copy";
export interface KernelEvidence {
    id: string;
    kind: KernelSourceKind;
    text: string;
    startSeconds: number | null;
    endSeconds: number | null;
    observedBy: string;
    version: string;
}
export interface KernelFeatures {
    workspaceId: string;
    mediaSha256: string;
    durationSeconds: number;
    stageVersions: Record<string, string>;
    evidence: KernelEvidence[];
    qualityFlags: string[];
    adContext: {
        brand: string;
        copy: string;
    };
    frames?: {
        sourceId: string;
        mimeType: "image/jpeg" | "image/png";
        base64: string;
    }[];
}
export interface KernelUsage {
    inputTokens: number | null;
    visibleOutputTokens: number | null;
    thoughtTokens: number | null;
    cachedInputTokens: number | null;
    totalTokens: number | null;
    reservedGbp: number | null;
    estimatedGbp: number | null;
    billedGbp: number | null;
}
