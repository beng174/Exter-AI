import type { Ad } from "./types";

export interface AttentionMap {
  imageUrl?: string;
  description?: string;
  method?: string;
}

/** Interpretations of an ad, distinct from delivery/performance observations. */
export interface AdAnalysis {
  provenance: "sample" | "provided" | "model";
  model?: string;
  method?: string;
  topic?: string;
  theme?: string;
  contentType?: string;
  contentOrientation?: string;
  marketSegment?: string;
  brandMentions?: string[];
  observedTension?: string;
  observedRelevance?: string;
  keyMessage?: string;
  inferredAudience?: string[];
  gender?: string;
  profession?: string;
  maritalStatus?: string;
  ageGroup?: string;
  familialRelationship?: string;
  confidence?: number;
  analyzedAt?: string;
  attentionMap?: AttentionMap;
}

const MAX_TEXT = 2000;
const fields = [
  "topic",
  "theme",
  "contentType",
  "contentOrientation",
  "marketSegment",
  "observedTension",
  "observedRelevance",
  "keyMessage",
  "gender",
  "profession",
  "maritalStatus",
  "ageGroup",
  "familialRelationship",
] as const;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, label: string, limit = MAX_TEXT) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > limit) {
    throw new Error(`${label} must be text of at most ${limit} characters.`);
  }
  return value.trim() || undefined;
}

function optionalList(value: unknown, label: string) {
  if (value === undefined || value === null) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some(
      (item) =>
        typeof item !== "string" || !item.trim() || item.trim().length > 200,
    )
  ) {
    throw new Error(
      `${label} must be an array of at most 30 non-empty strings of at most 200 characters each.`,
    );
  }
  return [...new Set(value.map((item) => (item as string).trim()))];
}

function attentionImage(value: unknown): string | undefined {
  const image = optionalText(
    value,
    "analysis.attentionMap.imageUrl",
    3 * 1024 * 1024,
  );
  if (!image) return undefined;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))
    return image;
  let url: URL;
  try {
    url = new URL(image);
  } catch {
    throw new Error(
      "Attention-map image must be an HTTP(S) URL or an embedded PNG, JPEG or WebP image.",
    );
  }
  if (
    image.length > 2000 ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Attention-map image must use HTTP(S) without credentials, or an embedded PNG, JPEG or WebP image.",
    );
  }
  return url.href;
}

/** User imports may supply annotations, but cannot assert a verified model origin. */
export function normalizeAdAnalysis(
  value: unknown,
  allowSample = false,
): AdAnalysis | undefined {
  if (value === undefined || value === null) return undefined;
  const input = object(value, "analysis");
  const provenance = input.provenance ?? "provided";
  if (!["sample", "provided", "model"].includes(String(provenance))) {
    throw new Error("analysis.provenance must be sample, provided or model.");
  }
  if (provenance === "sample" && !allowSample) {
    throw new Error("Imported analysis must not claim sample provenance.");
  }
  const result: AdAnalysis = {
    provenance: provenance === "sample" ? "sample" : "provided",
  };
  for (const field of fields) {
    const parsed = optionalText(input[field], `analysis.${field}`);
    if (parsed !== undefined) result[field] = parsed;
  }
  result.brandMentions = optionalList(
    input.brandMentions,
    "analysis.brandMentions",
  );
  result.inferredAudience = optionalList(
    input.inferredAudience,
    "analysis.inferredAudience",
  );
  if (input.confidence !== undefined && input.confidence !== null) {
    if (
      typeof input.confidence !== "number" ||
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1
    ) {
      throw new Error(
        "analysis.confidence must be a finite number from 0 to 1.",
      );
    }
    result.confidence = input.confidence;
  }
  if (
    input.analyzedAt !== undefined &&
    input.analyzedAt !== null &&
    input.analyzedAt !== ""
  ) {
    const timestamp = optionalText(
      input.analyzedAt,
      "analysis.analyzedAt",
      40,
    )!;
    const date = new Date(timestamp);
    if (
      !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(timestamp) ||
      !Number.isFinite(date.getTime()) ||
      date.getUTCFullYear() < 2000 ||
      date.getTime() > Date.now() + 300000 ||
      date.toISOString().slice(0, 10) !== timestamp.slice(0, 10)
    ) {
      throw new Error(
        "analysis.analyzedAt must be a valid ISO date between 2000 and now.",
      );
    }
    result.analyzedAt = date.toISOString();
  }
  if (input.attentionMap !== undefined && input.attentionMap !== null) {
    const map = object(input.attentionMap, "analysis.attentionMap");
    result.attentionMap = {
      imageUrl: attentionImage(map.imageUrl),
      description: optionalText(
        map.description,
        "analysis.attentionMap.description",
      ),
      method: optionalText(map.method, "analysis.attentionMap.method", 200),
    };
  }
  return result;
}

export const validateAdAnalysis = normalizeAdAnalysis;

/** Sample-only annotation; never infers sensitive demographics from a photograph. */
export function sampleAdAnalysis(ad: Ad): AdAnalysis {
  return {
    provenance: "sample",
    topic: `${ad.brand} — ${ad.title}`,
    theme: ad.category,
    contentType: `${ad.format} creative — illustrative classification`,
    contentOrientation:
      "Brand offering / awareness — illustrative classification",
    marketSegment: "Business to consumer — sample category context",
    brandMentions: [ad.brand],
    observedRelevance: `${ad.angle} messaging for the sample audience: ${ad.audience}.`,
    keyMessage: ad.copy || ad.title,
    inferredAudience: ad.audience ? [ad.audience] : [],
  };
}
