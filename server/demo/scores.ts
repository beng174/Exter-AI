import type { Ad } from "../../shared/types.js";
import type { ImageAnalysisResult, ImageField } from "../../shared/image-analysis.js";
import type { VideoAnalysisResult, VideoField } from "../../shared/video-analysis.js";
import type { DemoAdScore, DemoEvidence, DemoScoreCriterion } from "../../shared/brand-demo.js";

export interface DemoCreative {
  ad: Ad;
  analysis: VideoAnalysisResult | ImageAnalysisResult;
  mediaKind: "video" | "image" | "carousel";
}
type Annotation = VideoField<unknown> | ImageField<unknown>;
export function publicSourceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function creativeEvidence(creative: DemoCreative, field: string, annotation?: Annotation): DemoEvidence {
  const value = annotation?.value;
  return {
    kind: "ad", adId: creative.ad.id, sourceUrl: publicSourceUrl(creative.ad.sourceUrl),
    quote: value === undefined ? `Retained ${creative.mediaKind} analysis ${creative.analysis.id}` : String(value).slice(0, 600),
    field, observedAt: creative.analysis.createdAt,
    ...(annotation && "timestamps" in annotation ? { timestamps: annotation.timestamps } : {}),
    ...(annotation && "imageIndices" in annotation ? { imageIndices: annotation.imageIndices } : {}),
  };
}
export function supported(annotation: Annotation | undefined): boolean {
  if (!annotation || annotation.value === undefined || annotation.value === null || ["unknown", "unsure", ""].includes(String(annotation.value).trim().toLowerCase())) return false;
  // Stored image annotations may cite supplied original copy via an empty slide array.
  return "imageIndices" in annotation || annotation.timestamps.length > 0;
}
const absence = (value: unknown) => typeof value === "string" && /^(?:none|no (?:visible |explicit |clear )?(?:cta|call.to.action|hook|offer|claims?|headline|on.screen text)(?: (?:shown|present|visible))?)\.?$/i.test(value.trim());
const CTA_ACTION = /\b(?:shop|buy|order|subscribe|sign\s*up|register|book|learn\s+more|discover|explore|try|contact|call|download|visit|click|tap|swipe|follow|comment|share|join|get|find|save)\b/i;
const TEXT_WORDS_PER_SECOND = 3;

function textExposureSeconds(annotation: VideoField<unknown>): number | null {
  const ranges = annotation.timestamps;
  if (!ranges.length || ranges.some(range => !Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds) || range.endSeconds <= range.startSeconds)) return null;
  let total = 0, end = -Infinity;
  for (const range of [...ranges].sort((a, b) => a.startSeconds - b.startSeconds)) {
    total += Math.max(0, range.endSeconds - Math.max(range.startSeconds, end));
    end = Math.max(end, range.endSeconds);
  }
  return total || null;
}

/** A limited deterministic rubric, never a learned effectiveness or conversion estimate. */
export function scoreCreative(creative: DemoCreative): DemoAdScore {
  const fields = creative.analysis.fields;
  function criterion(id: string, label: string, field: string, annotation: Annotation | undefined, explanation: string): DemoScoreCriterion {
    const known = supported(annotation), absent = known && absence(annotation?.value);
    return {
      id, label, weight: 20, status: !known ? "unknown" : absent ? "not-met" : "met",
      explanation: !known ? `Unavailable evidence: ${label.toLowerCase()} cannot be assessed; no points are awarded or deducted.` : absent ? `The retained analysis explicitly records an absence: ${String(annotation?.value)}.` : explanation,
      evidence: known ? [creativeEvidence(creative, field, annotation)] : [],
    };
  }
  const keyClaim = fields.keyClaims.find(item => supported(item));
  const onScreen = fields.onScreenText.find(item => supported(item));
  const offer = "offer" in fields ? fields.offer : fields.offer_explanation;
  const criteria = [
    criterion("opening-message", "Opening message is placed at the start", "hook", fields.hook, "The opening message is supported by the first three seconds or first retained image. Attention and message quality remain unmeasured."),
    criterion("claim-specificity", "Advertiser proposition is recorded", "keyClaims", keyClaim, "An advertiser proposition is recorded with evidence. This is an availability check; specificity, truth, substantiation and persuasive impact require human review."),
    criterion("visible-message", "On-screen text fits the pacing benchmark", "onScreenText", onScreen, "Video text exposure is assessed against a disclosed reading-rate heuristic. Visual legibility still needs human review."),
    criterion("cta", "Call to action contains an explicit action", "cta", fields.cta, "The recorded CTA contains a recognised action word. Click-through and conversion effectiveness are unknown."),
    criterion("offer-clarity", "Offer or no-offer decision is explicit", "offer", offer, "The creative's offer decision is described. A clearly stated lack of an offer is acceptable; current commercial terms still need verification."),
  ];
  const opening = criteria[0];
  if (opening.status === "met") {
    if (fields.hook_type?.value === "none") {
      opening.status = "not-met";
      opening.explanation = "The retained analysis explicitly records no opening hook. This rubric asks for an opening message; it does not establish the ad's effectiveness.";
    } else if ("timestamps" in fields.hook) {
      const ranges = fields.hook.timestamps;
      if (ranges.every(range => range.startSeconds >= 3)) {
        opening.status = "not-met";
        opening.explanation = "The recorded opening message starts after the first three seconds.";
      } else if (ranges.some(range => range.startSeconds < 0 || range.endSeconds > 3.05)) {
        opening.status = "unknown";
        opening.explanation = "The recorded interval extends beyond the opening three seconds, so precise opening placement needs human review.";
      }
    } else if (!fields.hook.imageIndices.includes(1)) {
      opening.status = fields.hook.imageIndices.length ? "not-met" : "unknown";
      opening.explanation = fields.hook.imageIndices.length
        ? "The hook evidence occurs on a later carousel image, rather than the first image."
        : "The hook is supported only by supplied copy; placement in the retained creative needs human review.";
    }
  }
  const cta = criteria[3];
  if (cta.status === "met" && !CTA_ACTION.test(String(fields.cta.value))) {
    cta.status = "unknown";
    cta.explanation = "No recognised English action word is present in the recorded CTA. Custom wording, visual buttons and other languages need human review; this is not treated as an absent CTA.";
  }
  const pacing = criteria[2];
  const textItems = fields.onScreenText.filter(supported);
  const videoText = textItems.filter((item): item is VideoField<string> => "timestamps" in item);
  if (!videoText.length || videoText.length !== textItems.length || textItems.some(item => absence(item.value))) {
    pacing.status = "unknown";
    pacing.explanation = "A video text exposure rate cannot be assessed. Still images have no known viewing duration; absent text is not a readability failure. Contrast, size, accuracy and accessibility need human review.";
    pacing.evidence = textItems.map(item => creativeEvidence(creative, "onScreenText", item));
  } else {
    const rates = videoText.map(item => {
      const seconds = textExposureSeconds(item);
      const words = String(item.value).match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
      return seconds && words ? words / seconds : null;
    });
    const knownRates = rates.filter((rate): rate is number => rate !== null);
    pacing.evidence = videoText.map(item => creativeEvidence(creative, "onScreenText", item));
    pacing.status = knownRates.some(rate => rate > TEXT_WORDS_PER_SECOND) ? "not-met" : knownRates.length !== rates.length ? "unknown" : "met";
    pacing.explanation = knownRates.length
      ? `Highest recorded text rate: ${Math.max(...knownRates).toFixed(2)} words/second; rubric benchmark: at most ${TEXT_WORDS_PER_SECOND}. This unvalidated heuristic uses model-reported text/timestamps; contrast, text size and actual readability need human review.`
      : "Recorded text has no usable exposure duration; reading pace and visual legibility require human review.";
  }
  // A deliberate no-offer creative is not penalised for having no discount.
  const offerCriterion = criteria[4];
  if (supported(offer) && absence(offer?.value)) {
    offerCriterion.status = "met";
    offerCriterion.explanation = "The analysis explicitly records no offer. An offer is optional; this checks whether its presence or absence is assessable.";
  }
  const assessedWeight = criteria.reduce((sum, criterion) => sum + (criterion.status === "unknown" ? 0 : criterion.weight), 0);
  const earnedWeight = criteria.reduce((sum, criterion) => sum + (criterion.status === "met" ? criterion.weight : 0), 0);
  return {
    adId: creative.ad.id, nativeId: creative.ad.providerAdId || creative.ad.id, sourceUrl: publicSourceUrl(creative.ad.sourceUrl),
    mediaKind: creative.mediaKind, analysisId: creative.analysis.id, analysedAt: creative.analysis.createdAt,
    score: assessedWeight ? Math.round(earnedWeight / assessedWeight * 100) : null,
    label: "Best-practice score, not a performance prediction.",
    method: "Five equally weighted checks: opening placement, a recorded advertiser proposition, video text pacing (at most 3 words/second), explicit CTA action language, and an assessable offer/no-offer decision. These limited rules and the reading-rate heuristic are not calibrated to outcomes. Score = met weight / assessed weight × 100. Unknown checks are excluded from both numerator and denominator; coverage is assessed weight / 100. A high partial score is not a complete assessment. Visual legibility, claim truth/substantiation and persuasion require human review. No spend, sales or conversion data is used.",
    coverage: assessedWeight / 100, provisional: assessedWeight < 100, assessedWeight, totalWeight: 100, criteria,
  };
}
