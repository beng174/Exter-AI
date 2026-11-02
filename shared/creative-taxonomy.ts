/** Shared by model output, human labelling and the guide. Never recode historical rows in place. */
export const CREATIVE_TAXONOMY_VERSION = "exter-creative-taxonomy-v2";

export const FORMAT_VALUES = ["UGC", "founder-led", "studio", "animation", "mixed", "static", "unsure"] as const;
export const HOOK_TYPE_VALUES = ["scarcity-restock", "problem", "question", "bold-claim", "offer-led", "social-proof", "demo", "testimonial", "curiosity", "none", "unsure"] as const;
export const ANGLE_VALUES = ["value-bundle", "scarcity-urgency", "gifting", "quality-luxury", "problem-solution", "identity-values", "social-proof", "novelty", "none", "unsure"] as const;
export const OFFER_TYPE_VALUES = ["percentage-discount", "fixed-discount", "bundle", "free-gift", "free-shipping", "trial-guarantee", "multiple", "none", "unsure"] as const;
export const AUDIO_TYPE_VALUES = ["voiceover", "on-camera-speech", "music-only", "music-plus-voiceover", "music-plus-on-camera-speech", "silent", "unsure"] as const;
export const CLAIM_TYPE_VALUES = ["price-discount", "comparative", "superlative", "performance", "provenance", "social-proof", "other", "unsure"] as const;
export const CREATIVE_BOOLEAN_TAGS = ["urgency_scarcity", "social_proof", "reviews_ratings", "made_in_uk", "provenance", "values", "price_shown", "discount_shown"] as const;

export type CreativeFormat = (typeof FORMAT_VALUES)[number];
export type HookType = (typeof HOOK_TYPE_VALUES)[number];
export type CreativeAngle = (typeof ANGLE_VALUES)[number];
export type OfferType = (typeof OFFER_TYPE_VALUES)[number];
export type AudioType = (typeof AUDIO_TYPE_VALUES)[number];
export type ClaimType = (typeof CLAIM_TYPE_VALUES)[number];
export type CreativeBooleanTag = (typeof CREATIVE_BOOLEAN_TAGS)[number];

function optionsFor<T extends readonly string[]>(values: T, labels: Readonly<Record<T[number], string>>): Array<readonly [T[number], string]> {
  return values.map(value => [value, labels[value as T[number]]] as const);
}

export const FORMAT_OPTIONS = optionsFor(FORMAT_VALUES, {
  UGC: "UGC (with creator evidence)", "founder-led": "Founder led", studio: "Studio / product production",
  animation: "Animation", mixed: "Mixed formats", static: "Static image / carousel", unsure: "Unsure",
});
export const HOOK_TYPE_OPTIONS = optionsFor(HOOK_TYPE_VALUES, {
  "scarcity-restock": "Scarcity / restock", problem: "Problem", question: "Question", "bold-claim": "Bold claim",
  "offer-led": "Offer led", "social-proof": "Social proof", demo: "Demonstration", testimonial: "Testimonial",
  curiosity: "Curiosity", none: "No hook", unsure: "Unsure",
});
export const ANGLE_OPTIONS = optionsFor(ANGLE_VALUES, {
  "value-bundle": "Value / bundle", "scarcity-urgency": "Scarcity / urgency", gifting: "Gifting", "quality-luxury": "Quality / luxury",
  "problem-solution": "Problem and solution", "identity-values": "Identity / values", "social-proof": "Social proof",
  novelty: "Novelty", none: "No discernible angle", unsure: "Unsure",
});
export const OFFER_TYPE_OPTIONS = optionsFor(OFFER_TYPE_VALUES, {
  "percentage-discount": "% off", "fixed-discount": "£ price drop / fixed discount", bundle: "Bundle / multi-buy",
  "free-gift": "Free gift", "free-shipping": "Free shipping", "trial-guarantee": "Trial / guarantee",
  multiple: "Multiple offer types", none: "No offer", unsure: "Unsure",
});
export const AUDIO_TYPE_OPTIONS = optionsFor(AUDIO_TYPE_VALUES, {
  voiceover: "Voiceover", "on-camera-speech": "On-camera speech", "music-only": "Music only",
  "music-plus-voiceover": "Music + voiceover", "music-plus-on-camera-speech": "Music + on-camera speech", silent: "Silent", unsure: "Unsure",
});
export const CLAIM_TYPE_OPTIONS = optionsFor(CLAIM_TYPE_VALUES, {
  "price-discount": "Price / discount", comparative: "Comparative", superlative: "Superlative", performance: "Performance",
  provenance: "Provenance", "social-proof": "Social proof", other: "Other", unsure: "Unsure",
});
export const CREATIVE_BOOLEAN_TAG_OPTIONS = optionsFor(CREATIVE_BOOLEAN_TAGS, {
  urgency_scarcity: "Urgency / scarcity", social_proof: "Social proof", reviews_ratings: "Reviews / ratings",
  made_in_uk: "Made in UK", provenance: "Provenance", values: "Values", price_shown: "Price shown", discount_shown: "Discount shown",
});
