export const LABELLING_SCHEMA_VERSION = "exter-human-labels-v1";
export const LABELLING_GUIDE_VERSION = "draft-v1";

export const LABELLING_FIELDS = [
  { key: "format", label: "Format", options: [
    ["UGC", "UGC (with creator evidence)"], ["founder-led", "Founder led"], ["studio", "Studio / product production"],
    ["animation", "Animation"], ["mixed", "Mixed formats"], ["static", "Static image"], ["unsure", "Unsure"],
  ] },
  { key: "hookType", label: "Hook type", options: [
    ["question", "Question"], ["problem", "Problem"], ["bold-claim", "Bold claim"], ["demonstration", "Demonstration"],
    ["testimonial", "Testimonial"], ["offer", "Offer"], ["curiosity", "Curiosity"], ["none", "No hook"], ["unsure", "Unsure"],
  ] },
  { key: "angle", label: "Angle", options: [
    ["problem-solution", "Problem and solution"], ["product-benefit", "Product benefit"], ["social-proof", "Social proof"],
    ["value-price", "Value / price"], ["lifestyle", "Lifestyle"], ["comparison", "Comparison"], ["founder-story", "Founder story"],
    ["gifting-seasonal", "Gifting / seasonal"], ["none", "No discernible angle"], ["unsure", "Unsure"],
  ] },
  { key: "personOnCamera", label: "Person on camera", options: [
    ["yes", "Yes"], ["no", "No"], ["unsure", "Unsure"],
  ] },
  { key: "ugcEvidence", label: "UGC evidence", options: [
    ["paid-partnership-label", "Paid partnership label"], ["visible-creator-handle", "Visible non-brand creator handle"],
    ["both", "Partnership label and creator handle"], ["none", "No qualifying evidence"], ["unsure", "Unsure"],
  ] },
  { key: "offerType", label: "Offer type", options: [
    ["percentage-discount", "Percentage discount"], ["fixed-discount", "Fixed amount discount"], ["bundle", "Bundle / multi-buy"],
    ["free-gift", "Free gift"], ["free-shipping", "Free shipping"], ["trial-guarantee", "Trial / guarantee"],
    ["multiple", "Multiple offer types"], ["none", "No offer"], ["unsure", "Unsure"],
  ] },
  { key: "cta", label: "Call to action", options: [
    ["shop", "Shop / buy"], ["learn-more", "Learn more"], ["sign-up", "Sign up"], ["contact", "Contact"],
    ["download", "Download"], ["visit-store", "Visit a physical store"], ["engage", "Comment / follow / share"],
    ["none", "No CTA"], ["unsure", "Unsure"],
  ] },
] as const;

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
}
export interface HumanCreativeReview extends LabellingSession {
  labelledAt: string;
  elapsedSeconds: number;
  labels: HumanCreativeLabels;
  notes: string;
  sourceUrl: string;
}

export function validateHumanCreativeLabels(value: unknown): HumanCreativeLabels {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a value for all seven label fields.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== LABELLING_FIELDS.length || Object.keys(record).some(key => !LABELLING_FIELDS.some(field => field.key === key)))
    throw new Error("Provide exactly the seven documented label fields.");
  for (const field of LABELLING_FIELDS) {
    if (!field.options.some(option => option[0] === record[field.key]))
      throw new Error(`Choose a documented ${field.label.toLowerCase()} value, including Unsure when needed.`);
  }
  if (record.format === "UGC" && !["paid-partnership-label", "visible-creator-handle", "both"].includes(String(record.ugcEvidence)))
    throw new Error("UGC requires a qualifying partnership label or non-brand creator handle. Use Unsure when origin is unestablished.");
  return Object.fromEntries(LABELLING_FIELDS.map(field => [field.key, record[field.key]])) as HumanCreativeLabels;
}
