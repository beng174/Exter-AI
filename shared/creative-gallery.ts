import type { CreatorEvidence, VideoAnalysisFields } from "./video-analysis.js";
import type { ImageAnalysisFields } from "./image-analysis.js";
import type { PatternLabelProjection } from "./pattern-labelling.js";

export type GalleryMediaKind = "video" | "image" | "carousel" | "unknown";
export type DemoGalleryAnalysis =
  | { id: string; mediaKind: "video"; createdAt: string; promptVersion: string; fields: VideoAnalysisFields; patternLabels?: PatternLabelProjection }
  | { id: string; mediaKind: "image" | "carousel"; createdAt: string; promptVersion: string; fields: ImageAnalysisFields; patternLabels?: PatternLabelProjection };

/** A presentation projection; stored media, paid runs and their source IDs remain immutable. */
export interface DemoGalleryCreative {
  adId: string;
  nativeId: string;
  brandId: string;
  brandName: string;
  title: string;
  copy: string;
  copyTruncated?: boolean;
  sourceUrl: string | null;
  adFormat?:"video"|"static_image"|"carousel"|"catalogue"|null;
  mediaKind: GalleryMediaKind;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  imageUrls: string[];
  imageCount: number;
  mediaAvailable: boolean;
  mediaStatus: "stored" | "not-stored" | "unavailable";
  /** Verified full creative content hash, never a poster-only fingerprint. */
  mediaSha256?:string|null;
  analysis: DemoGalleryAnalysis | null;
  creativeFormat: string | null;
  hookType: string | null;
  angle: string | null;
  offerType: string | null;
  ugc: boolean | null;
  creatorEvidence: CreatorEvidence[];
  partnershipAttribution: { name: string; pageId: string; profileUrl: string | null; adUrl: string | null } | null;
  deliveryStatus?: "active" | "inactive" | "unknown";
  deliveryStartAt: string | null;
  deliveryStopAt: string | null;
  observedAt: string | null;
  firstObservedAt: string | null;
  /** Days between a source-listed delivery start and source-observed endpoint, not proven continuity. */
  daysRunning: number | null;
  daysRunningAsOf: string | null;
  daysRunningBasis: string | null;
  searchText: string;
  platform?: string;
  owned?: boolean;
  placements?: string[];
  scenes?: {startSeconds:number;label:string}[];
}

export interface CreativeGalleryResponse {
  brand: { id: string; name: string; domain: string };
  collectedAdsCount: number;
  analysedAdsCount: number;
  mediaCounts: Record<GalleryMediaKind, number>;
  storedMediaCount: number;
  creatives: DemoGalleryCreative[];
  filters: { mediaKind: GalleryMediaKind[]; format: string[]; hookType: string[]; angle: string[]; offerType: string[] };
  dateRange: { from: string | null; to: string | null };
  limitations: string[];
}

export interface CreativeGalleryFilters {
  mediaKind?: string;
  format?: string;
  hookType?: string;
  angle?: string;
  offerType?: string;
  ugc?: "yes" | "no" | "unknown" | "all";
  search?: string;
}

export function filterGalleryCreatives(creatives: DemoGalleryCreative[], filters: CreativeGalleryFilters): DemoGalleryCreative[] {
  const search = filters.search?.trim().toLocaleLowerCase();
  return creatives.filter(creative =>
    (!filters.mediaKind || filters.mediaKind === "all" || creative.mediaKind === filters.mediaKind) &&
    (!filters.format || filters.format === "all" || creative.creativeFormat === filters.format) &&
    (!filters.hookType || filters.hookType === "all" || creative.hookType === filters.hookType) &&
    (!filters.angle || filters.angle === "all" || creative.angle === filters.angle) &&
    (!filters.offerType || filters.offerType === "all" || creative.offerType === filters.offerType) &&
    (!filters.ugc || filters.ugc === "all" || (filters.ugc === "yes" ? creative.ugc === true : filters.ugc === "no" ? creative.ugc === false : creative.ugc === null)) &&
    (!search || creative.searchText.toLocaleLowerCase().includes(search)));
}
