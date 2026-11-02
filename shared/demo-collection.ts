export type DemoCompetitorId = "aery-living" | "the-white-company" | "neom";
export type DemoCollectionStatus = "queued" | "collecting" | "preparing" | "analysing" | "complete" | "paused" | "interrupted" | "failed";
export interface DemoCollectionItem {
  adId: string;
  nativeId: string;
  advertiserPageId: string;
  status: "pending" | "stored" | "analysing" | "complete" | "unavailable" | "failed" | "interrupted";
  mediaKind: "video" | "image" | "carousel" | "unknown";
  mediaId?: string;
  jobId?: string;
  analysisId?: string;
  errorCode?: string;
  error?: string;
  sourceHttpStatus?: number;
}
export interface DemoCollectionRun {
  id: string;
  parentBrandId: string;
  competitorId: DemoCompetitorId;
  brandId: string;
  status: DemoCollectionStatus;
  target: 25;
  country: "GB";
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  message?: string;
  observedAt?: string;
  sourceUrl?: string;
  advertiserPageIds: string[];
  items: DemoCollectionItem[];
}
export interface DemoCompetitorSummary {
  id: DemoCompetitorId;
  name: string;
  domain: string;
  country: "GB";
  target: 25;
  brandId: string | null;
  collectedCount: number;
  storedCount: number;
  analysedCount: number;
  status: "not-started" | DemoCollectionStatus;
  identityNote?: string;
  lastRun: DemoCollectionRun | null;
}
export interface DemoCollectionSnapshot {
  brandId: string;
  hosted: boolean;
  competitors: DemoCompetitorSummary[];
  limitations: string[];
}
