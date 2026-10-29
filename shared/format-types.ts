import type { Category, Platform } from "./types";

export type FormatMetric = "engagement" | "cpa" | "conversionRate";
export interface FormatPerformance {
  name: string;
  platform: Platform;
  ads: number;
  observations: number;
  impressions: number;
  engagements: number;
  engagementRate: number;
  engagementDenominator: number;
  engagementRateBasis: string;
  measuredEngagements: number;
  ownedImpressions: number;
  conversions: number | null;
  spend: number | null;
  cpa: number | null;
  conversionRate: number | null;
  adIds: string[];
  rank: number | null;
  limitedSample: boolean;
}
export interface FormatPlatformAnalysis {
  platform: Platform;
  ads: number;
  observations: number;
  classifiedAds: number;
  unclassifiedAds: number;
  rankings: FormatPerformance[];
  winner: FormatPerformance | null;
  missingMetric: string | null;
}
export interface FormatSourceStatus {
  connected: boolean;
  lastSuccessfulSyncAt?: string | null;
}
export interface FormatAnalysis {
  brandId: string;
  category: Category;
  range: number;
  platform: string;
  metric: FormatMetric;
  totalAds: number;
  totalObservations: number;
  classifiedAds: number;
  unclassifiedAds: number;
  sampleAds: number;
  importedAds: number;
  liveAds: number;
  dataMode: "sample" | "imported" | "live" | "mixed" | "empty";
  generatedAt: string;
  lastObservedAt: string | null;
  sourceStatus: FormatSourceStatus | null;
  platforms: FormatPlatformAnalysis[];
  formats: FormatPerformance[];
  notes: string[];
}
