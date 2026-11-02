import type { DatabaseSync } from "node:sqlite";
import type { Ad, Brand } from "../../shared/types.js";
import type { VideoAnalysisResult } from "../../shared/video-analysis.js";
import type { ImageAnalysisResult } from "../../shared/image-analysis.js";
import { ANGLE_OPTIONS, FORMAT_OPTIONS, HOOK_TYPE_OPTIONS, OFFER_TYPE_OPTIONS } from "../../shared/creative-taxonomy.js";
import type { BrandDemoReport, DemoPattern } from "../../shared/brand-demo.js";
import { readBrand } from "../db.js";
import { buildOpportunities } from "./briefs.js";
import { buildPredictionPreview } from "./prediction.js";
import { creativeEvidence, scoreCreative, supported, type DemoCreative } from "./scores.js";
import { readWebsiteEvidence, refreshWebsiteEvidence, type DemoWebsiteOptions } from "./website.js";
import { linkedWorkspaceAnalyses, resolveDemoBrandId, workspaceAds } from "./reconcile.js";

export class BrandDemoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function tableExists(db: DatabaseSync, table: string) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
}
function dataRows<T>(db: DatabaseSync, table: "video_analysis_runs" | "image_analysis_runs", brandId: string): T[] {
  if (!tableExists(db, table)) return [];
  return (db.prepare(`SELECT data FROM ${table} WHERE brand_id=? ORDER BY created_at DESC,id DESC`).all(brandId) as { data: string }[]).flatMap(row => {
    try { return [JSON.parse(row.data) as T]; } catch { return []; }
  });
}
function validAnalysis(value: VideoAnalysisResult | ImageAnalysisResult | undefined, ad: Ad): boolean {
  return !!value && value.adId === ad.id && value.brandId === ad.brandId && typeof value.id === "string" &&
    typeof value.mediaId === "string" && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) &&
    !!value.fields?.format && typeof value.fields.format.value === "string" && !!value.fields.angle &&
    Array.isArray(value.fields.keyClaims) && Array.isArray(value.fields.onScreenText);
}
export function analysedCreatives(db: DatabaseSync, brandId: string, ads: Ad[]): DemoCreative[] {
  return ads.filter(ad => ad.source !== "sample").flatMap(ad => {
    const linked = linkedWorkspaceAnalyses(db, brandId, ad.id);
    const candidates: DemoCreative[] = [
      ...linked.map(item => ({ ad, analysis: item.analysis, mediaKind: item.mediaKind })),
    ];
    // This is also a persisted successful native analysis, not legacy sample annotations.
    if (validAnalysis(ad.videoAnalysis, ad) && !candidates.some(item => item.analysis.id === ad.videoAnalysis!.id))
      candidates.push({ ad, analysis: ad.videoAnalysis!, mediaKind: "video" });
    candidates.sort((a, b) => Date.parse(b.analysis.createdAt) - Date.parse(a.analysis.createdAt) || b.analysis.id.localeCompare(a.analysis.id));
    return candidates.length ? [candidates[0]] : [];
  });
}
function patterns(creatives: DemoCreative[], field: "format" | "hook_type" | "angle" | "offer_type", options: readonly (readonly [string, string])[]): DemoPattern[] {
  const eligible = creatives.flatMap(creative => {
    const annotation = creative.analysis.fields[field];
    return supported(annotation) && options.some(([value]) => value === annotation?.value) && annotation?.value !== "unsure"
      ? [{ creative, annotation: annotation! }] : [];
  });
  return options.filter(([value]) => value !== "unsure").map(([value, label]) => {
    const matches = eligible.filter(item => item.annotation.value === value);
    return { value, label, count: matches.length, denominator: eligible.length, totalAnalysed: creatives.length, share: eligible.length ? matches.length / eligible.length : null, evidence: matches.map(item => creativeEvidence(item.creative, field, item.annotation)) };
  }).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
export class BrandDemoService {
  constructor(private readonly db: DatabaseSync, private readonly options: DemoWebsiteOptions = {}) {}
  private brand(brandId: string): Brand {
    const brand = readBrand(this.db, resolveDemoBrandId(this.db, brandId));
    if (!brand) throw new BrandDemoError("Brand workspace not found.", 404);
    return brand;
  }
  report(brandId: string): BrandDemoReport {
    const brand = this.brand(brandId);
    const allAds = workspaceAds(this.db, brand.id);
    const realAds = allAds.filter(ad => ad.source !== "sample"), creatives = analysedCreatives(this.db, brand.id, realAds);
    const website = readWebsiteEvidence(this.db, brand);
    const patternGroups = { format: patterns(creatives, "format", FORMAT_OPTIONS), hookType: patterns(creatives, "hook_type", HOOK_TYPE_OPTIONS), angle: patterns(creatives, "angle", ANGLE_OPTIONS), offerType: patterns(creatives, "offer_type", OFFER_TYPE_OPTIONS) };
    return {
      version: "exter-brand-demo-v1", brand: { id: brand.id, name: brand.name, domain: brand.domain }, generatedAt: (this.options.now?.() || new Date()).toISOString(),
      analysedAdsCount: creatives.length,
      sample: { video: creatives.filter(item => item.mediaKind === "video").length, image: creatives.filter(item => item.mediaKind === "image").length, carousel: creatives.filter(item => item.mediaKind === "carousel").length, excludedUnanalysed: realAds.length - creatives.length, excludedSampleAds: allAds.length - realAds.length },
      patterns: patternGroups, opportunities: buildOpportunities(creatives, patternGroups.angle, website),
      scores: creatives.map(scoreCreative).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.coverage - a.coverage || a.adId.localeCompare(b.adId)),
      website, prediction: buildPredictionPreview(realAds, this.options.now?.() || new Date()),
      limitations: [
        "Only retained successful native video/image analyses from real source ads are included. Each ad contributes its latest successful analysis once; failed, pending and sample creatives are excluded.",
        "Pattern denominators count supported canonical labels separately for each field. Unknown, unsure and legacy free-text labels do not enter that field's denominator. This is a bounded analysed sample, not the complete market.",
        "A gap needs at least 10 supported angle labels and 70% sample coverage. Repetition needs at least four ads and 40% of eligible angle labels. These declared heuristics do not establish fatigue or performance.",
        "Briefs are deterministic draft recommendations based on cited observations, not new Gemini analyses, validated product facts or proven winners. Verify claims, commercial terms and rights before production.",
        "Best-practice scores describe an evidence rubric. They do not predict engagement, conversion, revenue or return on ad spend. Model confidence has not been calibrated and is not used to filter or rank evidence.",
      ],
    };
  }
  async refreshWebsite(brandId: string) {
    return refreshWebsiteEvidence(this.db, this.brand(brandId), this.options);
  }
}
