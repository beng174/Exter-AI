import { ANGLE_OPTIONS, FORMAT_OPTIONS, HOOK_TYPE_OPTIONS, OFFER_TYPE_OPTIONS } from "./creative-taxonomy.js";

export const LABELLING_SCHEMA_VERSION = "exter-human-labels-v2";
export const LABELLING_GUIDE_VERSION = "draft-v2";

export const LABELLING_FIELDS = [
  { key: "format", label: "Format", options: FORMAT_OPTIONS },
  { key: "hookType", label: "Hook type", options: HOOK_TYPE_OPTIONS },
  { key: "angle", label: "Angle", options: ANGLE_OPTIONS },
  { key: "personOnCamera", label: "Person on camera", options: [
    ["yes", "Yes"], ["no", "No"], ["unsure", "Unsure"],
  ] },
  { key: "ugcEvidence", label: "UGC evidence", options: [
    ["paid-partnership-label", "Paid partnership label"], ["visible-creator-handle", "Visible non-brand creator handle"],
    ["both", "Partnership label and creator handle"], ["none", "No qualifying evidence"], ["unsure", "Unsure"],
  ] },
  { key: "offerType", label: "Offer type", options: OFFER_TYPE_OPTIONS },
  { key: "cta", label: "Call to action", options: [
    ["shop", "Shop / buy"], ["learn-more", "Learn more"], ["sign-up", "Sign up"], ["contact", "Contact"],
    ["download", "Download"], ["visit-store", "Visit a physical store"], ["engage", "Comment / follow / share"],
    ["none", "No CTA"], ["unsure", "Unsure"],
  ] },
] as const;

// Sessions begun before the v2 deployment keep the vocabulary the labeller saw.
// These values are deliberately historical, not aliases for the current taxonomy.
const LEGACY_FIELD_VALUES_V1 = {
  format: ["UGC", "founder-led", "studio", "animation", "mixed", "static", "unsure"],
  hookType: ["question", "problem", "bold-claim", "demonstration", "testimonial", "offer", "curiosity", "none", "unsure"],
  angle: ["problem-solution", "product-benefit", "social-proof", "value-price", "lifestyle", "comparison", "founder-story", "gifting-seasonal", "none", "unsure"],
  personOnCamera: ["yes", "no", "unsure"],
  ugcEvidence: ["paid-partnership-label", "visible-creator-handle", "both", "none", "unsure"],
  offerType: ["percentage-discount", "fixed-discount", "bundle", "free-gift", "free-shipping", "trial-guarantee", "multiple", "none", "unsure"],
  cta: ["shop", "learn-more", "sign-up", "contact", "download", "visit-store", "engage", "none", "unsure"],
} as const;

export type LabellingField = (typeof LABELLING_FIELDS)[number]["key"];
export type HumanCreativeLabels = Record<LabellingField, string>;
export interface BlindLabellingAd {
  id: string;
  brandId: string;
  advertiser: string;
  platform: string;
  copy: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  creativeKind: "video" | "image" | "unknown";
  isVideo: boolean;
  partnershipAttribution: string | null;
  storedVideo: { mediaId: string; sha256: string } | null;
  completedReviews: number;
}
export interface LabellingSession {
  id: string;
  brandId: string;
  adId: string;
  labeller: string;
  startedAt: string;
  mediaSha256: string | null;
  mediaId: string | null;
  guideVersion: string;
  schemaVersion: string;
  taxonomyVersion?: string;
}
export interface HumanCreativeReview extends LabellingSession {
  labelledAt: string;
  elapsedSeconds: number;
  labels: HumanCreativeLabels;
  notes: string;
  sourceUrl: string;
}

export function validateHumanCreativeLabels(value: unknown, schemaVersion: string = LABELLING_SCHEMA_VERSION): HumanCreativeLabels {
  if (schemaVersion !== LABELLING_SCHEMA_VERSION && schemaVersion !== "exter-human-labels-v1")
    throw new Error("This review uses an unsupported label schema. Start a new review.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a value for all seven label fields.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== LABELLING_FIELDS.length || Object.keys(record).some(key => !LABELLING_FIELDS.some(field => field.key === key)))
    throw new Error("Provide exactly the seven documented label fields.");
  for (const field of LABELLING_FIELDS) {
    const allowed: readonly string[] = schemaVersion === "exter-human-labels-v1"
      ? LEGACY_FIELD_VALUES_V1[field.key] : field.options.map(option => option[0]);
    if (!allowed.some(option => option === record[field.key]))
      throw new Error(`Choose a documented ${field.label.toLowerCase()} value, including Unsure when needed.`);
  }
  if (record.format === "UGC" && !["paid-partnership-label", "visible-creator-handle", "both"].includes(String(record.ugcEvidence)))
    throw new Error("UGC requires a qualifying partnership label or non-brand creator handle. Use Unsure when origin is unestablished.");
  return Object.fromEntries(LABELLING_FIELDS.map(field => [field.key, record[field.key]])) as HumanCreativeLabels;
}
