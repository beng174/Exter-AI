import type { VideoTimestamp } from "./video-analysis.js";
import type { CreativeAngle } from "./creative-taxonomy.js";

/** Every observation and draft recommendation carries the material that motivated it. */
export interface DemoEvidence {
  kind: "ad" | "website";
  adId?: string;
  sourceUrl: string | null;
  quote: string;
  field?: string;
  timestamps?: VideoTimestamp[];
  imageIndices?: number[];
  observedAt?: string;
}
export interface DemoPoint {
  text: string;
  kind: "observation" | "recommendation" | "limitation";
  evidence: DemoEvidence[];
}
export interface DemoPattern {
  value: string;
  label: string;
  count: number;
  /** Only analysed creatives with a supported, canonical value in this dimension. */
  denominator: number;
  totalAnalysed: number;
  share: number | null;
  evidence: DemoEvidence[];
}
export interface DemoBrief {
  label: "Draft recommendation - review before production";
  hooks: DemoPoint[];
  format: DemoPoint;
  scriptBeats: DemoPoint[];
  proof: DemoPoint[];
  creatorProfile: DemoPoint;
}
export interface DemoOpportunity {
  id: string;
  title: string;
  angle: CreativeAngle;
  status: "saturated" | "gap" | "unknown";
  count: number;
  denominator: number;
  rationale: DemoPoint;
  evidence: DemoEvidence[];
  brief: DemoBrief;
}
export interface DemoScoreCriterion {
  id: string;
  label: string;
  weight: number;
  status: "met" | "not-met" | "unknown";
  explanation: string;
  evidence: DemoEvidence[];
}
export interface DemoAdScore {
  adId: string;
  nativeId: string;
  sourceUrl: string | null;
  mediaKind: "video" | "image" | "carousel";
  analysisId: string;
  analysedAt: string;
  score: number | null;
  label: "Best-practice score, not a performance prediction.";
  method: string;
  /** Known rubric weight / total rubric weight. Unknown is neither earned nor lost. */
  coverage: number;
  provisional: boolean;
  assessedWeight: number;
  totalWeight: number;
  criteria: DemoScoreCriterion[];
}
export interface DemoWebsiteEvidence {
  status: "not-refreshed" | "available";
  url: string;
  fetchedAt: string | null;
  title: string;
  excerpts: DemoEvidence[];
  limitations: string[];
}
export interface DemoPredictionPreview {
  label: "Future proven-ad likelihood";
  status: "preview";
  message: "Trains as collection history builds.";
  probability: null;
  trainingStatus: "not-trained";
  history: { eligibleAds: number; repeatedlyObservedAds: number; firstObservedAt: string | null; lastObservedAt: string | null; definition: string };
  observations: { adId: string; sourceUrl: string | null; firstObservedAt: string; lastObservedAt: string; observationCount: number | null; observedSpanDays: number; source: "stored-public-captures" | "durable-collection"; continuousDeliveryConfirmed: false; evidence: DemoEvidence[] }[];
  limitations: string[];
}
export interface BrandDemoReport {
  version: "exter-brand-demo-v1";
  brand: { id: string; name: string; domain: string };
  generatedAt: string;
  analysedAdsCount: number;
  sample: { video: number; image: number; carousel: number; excludedUnanalysed: number; excludedSampleAds: number };
  patterns: { format: DemoPattern[]; hookType: DemoPattern[]; angle: DemoPattern[]; offerType: DemoPattern[] };
  opportunities: DemoOpportunity[];
  scores: DemoAdScore[];
  website: DemoWebsiteEvidence;
  prediction: DemoPredictionPreview;
  limitations: string[];
}
