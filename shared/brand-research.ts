import type { AdAnalysis } from "./ad-intelligence";

export interface BrandResearchSource {
  id: string;
  url: string;
  title: string;
  kind: "website" | "creator_programme" | "competitor_website";
  observedAt: string;
  textExcerpt: string;
  status: "available" | "unavailable";
}
export interface BrandResearchFact {
  label: string;
  value: string;
  sourceUrl: string;
  quote: string;
  kind: "observed" | "brand_claim";
}
export interface BrandResearch {
  brandId: string;
  brandName: string;
  domain: string;
  category: string;
  observedAt: string;
  sources: BrandResearchSource[];
  facts: BrandResearchFact[];
  analysis: AdAnalysis | null;
  analysisStatus: "complete" | "analysis_unavailable";
  analysisError?: string | null;
  socialProfiles: { platform: string; url: string }[];
  creatorFeatures: {
    handle: string;
    url: string;
    sourceUrl: string;
    relationship: "featured_on_brand_website";
  }[];
  competitorCandidates: {
    name: string;
    domain: string;
    sourceUrl: string;
    summary: string;
    evidence: string[];
    status: "candidate";
  }[];
  limitations: string[];
  proposedTests: {
    format: string;
    hypothesis: string;
    evidenceSourceUrls: string[];
    status: "hypothesis";
  }[];
  visualEvidence?: {
    sourceUrl: string;
    imagePath: string;
    description: string;
    kind: "website_image";
  }[];
  coverageChecks?: {
    label: string;
    url: string;
    status: string;
    message: string;
  }[];
}
