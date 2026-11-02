import type { VideoAnalysisAccounting } from "./video-analysis.js";
import type { InferenceGenerationMetadata } from "./inference-config.js";

export type CreatorPlatform = "instagram" | "tiktok";
export interface CreatorPost {
  id: string; url: string; publishedAt: string | null; caption: string | null;
  views: number | null; likes: number | null; comments: number | null; shares: number | null;
  observedAt: string; evidenceUrl: string;
}
export interface CreatorPublicProfile {
  platform: CreatorPlatform; handle: string; displayName: string; profileUrl: string;
  sourceUrl: string; bio: string | null; followers: number | null; following: number | null;
  postsCount: number | null; country: string | null; category: string | null; observedAt: string;
  evidenceUrl: string; recentPosts: CreatorPost[];
  metricCoverage?: { postsSampled: number; postsWithViews: number; postsWithLikes: number; postsWithComments: number; postsWithShares: number; followersAvailable: boolean };
  evidence?: { field: string; value: number | string | null; evidenceUrl: string; observedAt: string }[];
}
export interface CreatorSeedEvidence {
  kind: "meta-branded-content-partner-label";
  adId: string; providerAdId: string | null; adUrl: string; advertiserPageId: string;
  partnerPageId: string; partnerName: string; partnerProfileUrl: string | null; observedAt: string | null;
}
export interface CreatorMetricRate {
  valuePercent: number | null; numerator: "likes + comments";
  denominator: "views on eligible posts" | "current observed followers × eligible posts";
  eligiblePosts: number; excludedPosts: number; numeratorTotal: number | null; denominatorTotal: number | null;
}
export interface CreatorResearchMetrics {
  postsSampled: number; windowStart: string | null; windowEnd: string | null; observedAt: string | null;
  undatedPosts: number;
  followers: number | null; averageViews: number | null; averageLikes: number | null; averageComments: number | null;
  engagementPerView: CreatorMetricRate; engagementPerFollower: CreatorMetricRate;
  caveat: string;
}
export interface CreatorFitAssessment {
  id: string; status: "complete" | "unavailable" | "failed"; createdAt: string;
  categoryRelevance: "high" | "medium" | "low" | "unknown";
  toneFit: "high" | "medium" | "low" | "unknown";
  reason: string; evidencePostUrls: string[]; brandSourceUrls: string[];
  basis: "public-post-captions-and-saved-brand-context";
  requestedModel?: string; servedModel?: string; generation?: InferenceGenerationMetadata;
  accounting?: VideoAnalysisAccounting; error?: string;
  sourceContext: { brandName: string; category: string; voice: string[]; brandEvidence?: { value: string; sourceUrl: string }[]; profileUrl: string | null; posts: { id: string; url: string; caption: string }[] };
}
export interface CreatorCandidate {
  id: string; brandId: string; displayName: string; handle: string | null;
  platform: CreatorPlatform | "meta"; profileUrl: string | null;
  source: "meta-branded-content" | "apify-public";
  seedEvidence: CreatorSeedEvidence[]; profile: CreatorPublicProfile | null;
  metrics: CreatorResearchMetrics; fit: CreatorFitAssessment | null; shortlisted: boolean;
  searchContext?: { country: string; category: string; query: string; searchedAt: string };
}
export interface CreatorProviderAccounting {
  reservedCostGbp: number | null; billedCostGbp: null; requestAttempts: number; runIds: string[];
}
export interface CreatorSearchObservation {
  id: string; createdAt: string; platform: CreatorPlatform; country: string; category: string; query: string;
  profilesReturned: number; accounting: CreatorProviderAccounting; warnings: string[];
  status?: "complete" | "failed";
  error?: string;
}
export interface CreatorResearchSnapshot {
  brandId: string; brandName: string; candidates: CreatorCandidate[]; totalCandidates: number;
  seeds: CreatorCandidate[]; searches: CreatorSearchObservation[];
  providerStatus: { configured: boolean; platforms: CreatorPlatform[]; message?: string };
  limitations: string[];
}
