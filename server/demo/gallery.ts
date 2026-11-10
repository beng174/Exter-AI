import {sourceAdFormat} from "../../shared/source-ad-format.js";
import type { Express, Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import { lstat } from "node:fs/promises";
import type { Ad, Brand } from "../../shared/types.js";
import type { ImageAnalysisResult, StoredImageCreative } from "../../shared/image-analysis.js";
import type { VideoAnalysisResult, CreatorEvidence } from "../../shared/video-analysis.js";
import { ANGLE_VALUES, FORMAT_VALUES, HOOK_TYPE_VALUES, OFFER_TYPE_VALUES } from "../../shared/creative-taxonomy.js";
import { filterGalleryCreatives, type CreativeGalleryFilters, type CreativeGalleryResponse, type DemoGalleryAnalysis, type DemoGalleryCreative, type GalleryMediaKind } from "../../shared/creative-gallery.js";
import { readBrand } from "../db.js";
import { ImageAnalysisService } from "../image/service.js";
import { VideoAnalysisService } from "../video/service.js";
import type { StoredVideo } from "../video/types.js";
import { prepareGeminiVideo } from "../video/normalize.js";
import { videoPoster } from "./gallery-media.js";
import { resolveDemoBrandId, workspaceAd, workspaceAdAliases, workspaceAds } from "./reconcile.js";
import { applyPatternLabelOverlay } from "./pattern-labelling.js";

type Scope = { brandId: string; adId: string; nativeId: string };
type Analysis = VideoAnalysisResult | ImageAnalysisResult;
type AnalysisRef = { value: Analysis; scope: Scope; kind: "video" | "image" | "carousel" };
type Media = { kind: "video"; video: StoredVideo } | { kind: "image" | "carousel"; images: StoredImageCreative };
interface CachedMedia { media: Media; stamps: string[] }
export interface CreativeGalleryOptions {
  video?: Pick<VideoAnalysisService, "storedMedia">;
  images?: Pick<ImageAnalysisService, "storedMedia">;
  mediaRoot?: string;
}
export class GalleryError extends Error { constructor(message: string, public status = 400) { super(message); } }
const DAY = 86_400_000;
const identifier = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim() || value.length > 350) throw new GalleryError("Choose a source ad in this workspace.");
  return value.trim();
};
function iso(value: unknown): string | null { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
function rows<T>(db: DatabaseSync, table: "video_analysis_runs" | "image_analysis_runs" | "video_media" | "image_media", scope: Scope): T[] {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) return [];
  return (db.prepare(`SELECT data FROM ${table} WHERE brand_id=? AND ad_id=? ORDER BY rowid DESC`).all(scope.brandId, scope.adId) as { data: string }[]).flatMap(row => {
    try { return [JSON.parse(row.data) as T]; } catch { return []; }
  });
}
function sourceUrl(ad: Ad): string | null {
  if (ad.platform === "Meta" && /^\d{5,30}$/.test(ad.providerAdId || "")) return `https://www.facebook.com/ads/library/?id=${ad.providerAdId}`;
  try {
    const url = new URL(ad.sourceUrl || "");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    for (const key of [...url.searchParams.keys()]) if (!["id", "v"].includes(key)) url.searchParams.delete(key);
    url.hash = ""; return url.href;
  } catch { return null; }
}
const canonical = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value) && !["unknown", "unsure"].includes(value) ? value : null;
const sourceKind = (ad: Ad): GalleryMediaKind => /carousel/i.test(ad.format) ? "carousel" : /video/i.test(ad.format) ? "video" : /static|image/i.test(ad.format) ? "image" : "unknown";
function publicEvidenceUrl(value: string | undefined | null): string | undefined {
  try {
    const url = new URL(value || "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || !/(^|\.)(facebook|instagram|tiktok)\.com$/.test(url.hostname)) return undefined;
    const adId = url.hostname.endsWith("facebook.com") && /^\/ads\/library\/?$/.test(url.pathname) ? url.searchParams.get("id") : null;
    url.search = ""; url.hash = "";
    if (adId && /^\d{5,30}$/.test(adId)) url.searchParams.set("id", adId);
    return url.href;
  } catch { return undefined; }
}
const safeCreatorEvidence = (values: CreatorEvidence[] = []) => values.map(({ sourceUrl, ...evidence }) => {
  const url = publicEvidenceUrl(sourceUrl);
  return { ...evidence, ...(url ? { sourceUrl: url } : {}) };
});
function safeAnalysis(ref: AnalysisRef | null): DemoGalleryAnalysis | null {
  if (!ref) return null;
  const projection = ref.value as typeof ref.value & { patternLabels?: import("../../shared/pattern-labelling.js").PatternLabelProjection };
  const common = { id: ref.value.id, createdAt: ref.value.createdAt, promptVersion: ref.value.promptVersion, ...(projection.patternLabels ? { patternLabels: projection.patternLabels } : {}) };
  return ref.kind === "video" ? { ...common, mediaKind: "video", fields: { ...(ref.value as VideoAnalysisResult).fields, creatorEvidence: safeCreatorEvidence((ref.value as VideoAnalysisResult).fields.creatorEvidence) } }
    : { ...common, mediaKind: ref.kind, fields: (ref.value as ImageAnalysisResult).fields };
}
function chronology(ad: Ad) {
  const start = iso(ad.deliveryStartAt), observed = iso(ad.observedAt), stop = iso(ad.deliveryStopAt);
  // An old active flag never extends a run through today. Use only source endpoints.
  const through = ad.active ? observed : stop || observed;
  const valid = start && through && Date.parse(through) >= Date.parse(start);
  return { deliveryStartAt: start, deliveryStopAt: stop, observedAt: observed, firstObservedAt: iso(ad.firstObservedAt),
    daysRunning: valid ? Math.floor((Date.parse(through!) - Date.parse(start!)) / DAY) : null,
    daysRunningAsOf: valid ? through : null,
    daysRunningBasis: valid ? "Days since the source-listed delivery start at the recorded source endpoint. Continuous delivery and performance are unverified." : null };
}
async function stamp(path: string): Promise<string> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || !stat.size) throw new GalleryError("Stored creative is unavailable.", 404);
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}
const paths = (media: Media) => media.kind === "video" ? [media.video.absolutePath] : media.images.images.map(image => image.absolutePath);

export class CreativeGalleryService {
  private readonly video: NonNullable<CreativeGalleryOptions["video"]>;
  private readonly images: NonNullable<CreativeGalleryOptions["images"]>;
  private readonly cache = new Map<string, CachedMedia>();
  private readonly playable = new Map<string, { pending: Promise<StoredVideo>; stamp?: string }>();
  constructor(private readonly db: DatabaseSync, private readonly options: CreativeGalleryOptions = {}) {
    this.video = options.video || new VideoAnalysisService(db);
    this.images = options.images || new ImageAnalysisService(db);
  }
  private brand(id: string): Brand {
    const brand = readBrand(this.db, resolveDemoBrandId(this.db, identifier(id)));
    if (!brand) throw new GalleryError("Brand workspace not found.", 404);
    return brand;
  }
  private ad(brandId: string, adId: string): Ad {
    const brand = this.brand(brandId);
    const value = workspaceAd(this.db, brand.id, identifier(adId));
    if (!value || value.source === "sample") throw new GalleryError("Source ad not found in this workspace.", 404);
    return value;
  }
  private analysis(ad: Ad): AnalysisRef | null {
    const found: AnalysisRef[] = [];
    for (const scope of workspaceAdAliases(this.db, ad.brandId, ad.id)) {
      const video = rows<VideoAnalysisResult>(this.db, "video_analysis_runs", scope);
      const image = rows<ImageAnalysisResult>(this.db, "image_analysis_runs", scope);
      for (const value of video) if (value.adId === scope.adId && value.brandId === scope.brandId && value.fields && value.mediaId && iso(value.createdAt)) found.push({ value, scope, kind: "video" });
      for (const value of image) if (value.adId === scope.adId && value.brandId === scope.brandId && value.fields && value.mediaId && iso(value.createdAt) && ["image", "carousel"].includes(value.processingMode)) found.push({ value, scope, kind: value.processingMode });
      const saved = this.db.prepare("SELECT data FROM ads WHERE id=? AND brand_id=?").get(scope.adId, scope.brandId) as { data: string } | undefined;
      if (saved) try {
        const value = (JSON.parse(saved.data) as Ad).videoAnalysis;
        if (value && value.adId === scope.adId && value.brandId === scope.brandId && value.fields && value.mediaId && iso(value.createdAt) && !found.some(item => item.value.id === value.id)) found.push({ value, scope, kind: "video" });
      } catch { /* A malformed historical annotation cannot fabricate an analysis. */ }
    }
    const latest = found.sort((a, b) => Date.parse(b.value.createdAt) - Date.parse(a.value.createdAt) || b.value.id.localeCompare(a.value.id))[0];
    return latest ? { ...latest, value: applyPatternLabelOverlay(this.db, ad, latest.value) } : null;
  }
  private async load(scope: Scope, mediaId: string, kind: "video" | "image" | "carousel"): Promise<Media | null> {
    const key = JSON.stringify([scope.brandId, scope.adId, mediaId, kind]);
    const cached = this.cache.get(key);
    if (cached) try {
      const current = await Promise.all(paths(cached.media).map(stamp));
      if (JSON.stringify(current) === JSON.stringify(cached.stamps)) return cached.media;
    } catch { /* Verify changed or missing immutable media before using it again. */ }
    this.cache.delete(key);
    try {
      const media: Media | null = kind === "video"
        ? await this.video.storedMedia(scope.brandId, scope.adId, mediaId).then(video => video ? { kind: "video", video } : null)
        : await this.images.storedMedia(scope.brandId, scope.adId, mediaId).then(images => images?.kind === kind ? { kind, images } : null);
      if (media) this.cache.set(key, { media, stamps: await Promise.all(paths(media).map(stamp)) });
      return media;
    } catch { return null; }
  }
  private async media(ad: Ad, analysis: AnalysisRef | null): Promise<Media | null> {
    if (analysis) {
      const media = await this.load(analysis.scope, analysis.value.mediaId, analysis.kind);
      const hash = media?.kind === "video" ? media.video.sha256 : media?.images.sha256;
      // Do not pair an old result with a different newly retained grouped variant.
      return hash && analysis.value.mediaSha256 === hash ? media : null;
    }
    for (const scope of workspaceAdAliases(this.db, ad.brandId, ad.id)) {
      for (const value of rows<{ mediaId: string }>(this.db, "video_media", scope)) {
        const media = await this.load(scope, value.mediaId, "video"); if (media) return media;
      }
      for (const value of rows<{ mediaId: string; kind: "image" | "carousel" }>(this.db, "image_media", scope)) {
        if (!["image", "carousel"].includes(value.kind)) continue;
        const media = await this.load(scope, value.mediaId, value.kind); if (media) return media;
      }
    }
    return null;
  }
  private async project(ad: Ad): Promise<DemoGalleryCreative> {
    const result = this.analysis(ad), media = await this.media(ad, result);
    const kind = result?.kind || media?.kind || sourceKind(ad);
    const fields = result?.value.fields;
    const format = canonical(fields?.format.value, FORMAT_VALUES);
    const creatorEvidence: CreatorEvidence[] = result?.kind === "video" ? safeCreatorEvidence((result.value as VideoAnalysisResult).fields.creatorEvidence) : [];
    const base = `/api/brands/${encodeURIComponent(ad.brandId)}/demo/creatives/${encodeURIComponent(ad.id)}`;
    const imageUrls = media && media.kind !== "video" ? media.images.images.map((_image, index) => `${base}/images/${index}`) : [];
    const videoUrl = media?.kind === "video" ? `${base}/video` : null;
    const transcript = result?.kind === "video" ? (result.value as VideoAnalysisResult).fields.spokenTranscript || [] : [];
    const partner = ad.brandedContentPartner;
    return {
      advertiserPageId:ad.advertiserPageId,adId: ad.id, nativeId: ad.providerAdId || ad.id, brandId: ad.brandId, brandName: ad.brand,
      adFormat:sourceAdFormat({mediaType:ad.mediaType||ad.format}),
      title: ad.title, copy: ad.copy || "", copyTruncated:ad.copyTruncated===true, sourceUrl: sourceUrl(ad), mediaKind: kind,
      durationSeconds: media?.kind === "video" ? media.video.durationSeconds : result?.kind === "video" ? (result.value as VideoAnalysisResult).coverage?.durationSeconds ?? null : null,
      thumbnailUrl: videoUrl ? `${base}/poster` : imageUrls[0] || null,
      videoUrl, imageUrls, imageCount: imageUrls.length, mediaAvailable: Boolean(media), mediaStatus: media ? "stored" : result ? "unavailable" : "not-stored",
      mediaSha256:media?.kind==="video"?media.video.sha256:media?.images.sha256||null,
      analysis: safeAnalysis(result), creativeFormat: format,
      hookType: canonical(fields?.hook_type?.value, HOOK_TYPE_VALUES), angle: canonical(fields?.angle.value, ANGLE_VALUES), offerType: canonical(fields?.offer_type?.value, OFFER_TYPE_VALUES),
      ugc: format === "UGC" ? creatorEvidence.length > 0 ? true : null : format ? false : null,
      creatorEvidence,
      partnershipAttribution: partner ? { name: partner.name, pageId: partner.pageId, profileUrl: publicEvidenceUrl(partner.profileUrl) || null, adUrl: sourceUrl(ad) } : null,
      deliveryStatus: ad.deliveryStatus || "unknown",
      platform: ad.platform, owned: ad.owned && ["import","live"].includes(ad.source), placements: ad.publisherPlatforms || [],
      scenes: [],
      ...chronology(ad),
      searchText: [ad.title, ad.copy, ...transcript.map(item => item.value), ...(fields?.onScreenText || []).map(item => item.value)].filter(Boolean).join("\n"),
    };
  }
  async list(brandId: string, filters: CreativeGalleryFilters = {}): Promise<CreativeGalleryResponse> {
    const brand = this.brand(brandId);
    const source = workspaceAds(this.db, brand.id).filter(ad => ad.source !== "sample");
    const all: DemoGalleryCreative[] = [];
    // Bounded disk verification; cached checks avoid rehashing every byte on seeks.
    for (let offset = 0; offset < source.length; offset += 4) all.push(...await Promise.all(source.slice(offset, offset + 4).map(ad => this.project(ad))));
    const options = (field: "creativeFormat" | "hookType" | "angle" | "offerType") => [...new Set(all.flatMap(ad => ad[field] ? [ad[field]!] : []))].sort();
    const dates = all.flatMap(ad => [ad.firstObservedAt, ad.observedAt].filter((value): value is string => Boolean(value))).sort();
    return { brand: { id: brand.id, name: brand.name, domain: brand.domain }, collectedAdsCount: all.length, analysedAdsCount: all.filter(ad => ad.analysis).length,
      storedMediaCount: all.filter(ad => ad.mediaAvailable).length, mediaCounts: all.reduce((counts, ad) => { counts[ad.mediaKind]++; return counts; }, { video: 0, image: 0, carousel: 0, unknown: 0 }),
      creatives: filterGalleryCreatives(all, filters), filters: { mediaKind: [...new Set(all.map(ad => ad.mediaKind))], format: options("creativeFormat"), hookType: options("hookType"), angle: options("angle"), offerType: options("offerType") },
      dateRange: { from: dates[0] || null, to: dates.at(-1) || null },
      limitations: ["Includes collected source ads even when media or analysis is not yet retained. Missing thumbnails and analyses are not invented.", "Days shown use source-listed delivery dates and actual observed endpoints, not today's date or proof of uninterrupted delivery.", "Legacy free-text labels remain readable in the analysis but do not become fabricated fixed-taxonomy chips."] };
  }
  async videoFile(brandId: string, adId: string): Promise<StoredVideo> {
    const ad = this.ad(brandId, adId), media = await this.media(ad, this.analysis(ad));
    if (media?.kind !== "video") throw new GalleryError("Stored video is unavailable for this creative.", 404);
    const key = `${media.video.mediaId}:${media.video.sha256}`;
    let prepared = this.playable.get(key);
    if (prepared) {
      try {
        const value = await prepared.pending;
        if (prepared.stamp === await stamp(value.absolutePath)) return value;
      } catch { /* A missing or modified derivative must be reverified. */ }
      this.playable.delete(key);
    }
    const entry: { pending: Promise<StoredVideo>; stamp?: string } = { pending: prepareGeminiVideo(media.video, { root: this.options.mediaRoot }).then(result => result.media) };
    this.playable.set(key, entry);
    void entry.pending.catch(() => { if (this.playable.get(key) === entry) this.playable.delete(key); });
    const value = await entry.pending;
    entry.stamp = await stamp(value.absolutePath);
    return value;
  }
  async posterFile(brandId: string, adId: string): Promise<string> { return videoPoster(await this.videoFile(brandId, adId), this.options.mediaRoot); }
  async imageFile(brandId: string, adId: string, index: number) {
    const ad = this.ad(brandId, adId), media = await this.media(ad, this.analysis(ad));
    if (!Number.isInteger(index) || index < 0 || media?.kind === "video" || !media?.images.images[index]) throw new GalleryError("Retained image is unavailable for this creative.", 404);
    return media.images.images[index];
  }
}

function sendMedia(res: Response, path: string, mime: string) {
  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(path, { acceptRanges: true, cacheControl: false, dotfiles: "deny" }, error => {
    if (!error) return;
    if (res.headersSent) { res.end(); return; }
    const status = (error as { status?: number }).status === 416 ? 416 : 404;
    res.status(status).json({ error: status === 416 ? "Requested media range is unavailable." : "Stored creative is unavailable." });
  });
}
export function attachCreativeGallery(app: Express, db: DatabaseSync, options: CreativeGalleryOptions = {}) {
  const service = new CreativeGalleryService(db, { video: options.video || app.locals.videoAnalysis, ...options });
  app.locals.creativeGallery = service;
  const fail = (res: Response, error: unknown) => res.status(error instanceof GalleryError ? error.status : 503).json({ error: error instanceof GalleryError ? error.message : "This stored creative is unavailable. Source records were preserved." });
  app.get("/api/brands/:brandId/demo/creatives", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      const filters: CreativeGalleryFilters = {};
      for (const field of ["mediaKind", "format", "hookType", "angle", "offerType", "ugc", "search"] as const) {
        const value = req.query[field]; if (value !== undefined && (typeof value !== "string" || value.length > 500)) throw new GalleryError("Choose a supported gallery filter.");
        if (typeof value === "string") (filters as Record<string, string>)[field] = value;
      }
      if (filters.ugc && !["yes", "no", "unknown", "all"].includes(filters.ugc)) throw new GalleryError("Choose Yes, No or Unknown for the UGC filter.");
      res.json(await service.list(identifier(req.params.brandId), filters));
    } catch (error) { fail(res, error); }
  });
  app.get("/api/brands/:brandId/demo/creatives/:adId/video", async (req, res) => {
    try { const media = await service.videoFile(identifier(req.params.brandId), identifier(req.params.adId)); sendMedia(res, media.absolutePath, media.mimeType); }
    catch (error) { fail(res, error); }
  });
  app.get("/api/brands/:brandId/demo/creatives/:adId/poster", async (req, res) => {
    try { sendMedia(res, await service.posterFile(identifier(req.params.brandId), identifier(req.params.adId)), "image/jpeg"); }
    catch (error) { fail(res, error); }
  });
  app.get("/api/brands/:brandId/demo/creatives/:adId/images/:index", async (req, res) => {
    try {
      if (!/^\d{1,2}$/.test(req.params.index)) throw new GalleryError("Choose a retained image position.");
      const image = await service.imageFile(identifier(req.params.brandId), identifier(req.params.adId), Number(req.params.index)); sendMedia(res, image.absolutePath, image.mimeType);
    } catch (error) { fail(res, error); }
  });
  return service;
}
