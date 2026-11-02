import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Ad, Brand } from "../../shared/types.js";
import type { DemoCollectionItem, DemoCollectionRun, DemoCollectionSnapshot, DemoCompetitorId } from "../../shared/demo-collection.js";
import { readBrand } from "../db.js";
import { VideoAnalysisService } from "../video/service.js";
import { ImageAnalysisService } from "../image/service.js";
import { VideoProviderError } from "../video/types.js";
import { MediaStorageError } from "../video/media.js";
import { DEMO_COMPETITORS, CompetitorSourceError, PublicCompetitorSource, type CollectedCompetitorCreative, type CompetitorDefinition, type CompetitorSource } from "./competitor-source.js";
import type { SmokeCreative } from "../smoke/source.js";

export class DemoCollectionRequestError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export interface DemoCollectionOptions {
  sourceFactory?: (definition: CompetitorDefinition) => CompetitorSource;
  imageService?: Pick<ImageAnalysisService, "storeMedia" | "latestMedia" | "analyse" | "history" | "attemptAccounting">;
  readiness?: () => { hosted: boolean; inferenceErrors: string[] };
}
const active = new Set(["queued", "collecting", "preparing", "analysing"]);
const isoNow = () => new Date().toISOString();
const nativeUrl = (id: string) => `https://www.facebook.com/ads/library/?id=${id}`;
const tableExists = (db: DatabaseSync, name: string) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
const rows = <T>(db: DatabaseSync, table: "video_media" | "image_media" | "video_analysis_runs" | "image_analysis_runs", brandId: string): T[] => tableExists(db, table)
  ? (db.prepare(`SELECT data FROM ${table} WHERE brand_id=?`).all(brandId) as { data: string }[]).flatMap(row => { try { return [JSON.parse(row.data) as T]; } catch { return []; } }) : [];

/** Durable hosted-only work. Reads never start a browser or make an inference request. */
export class DemoCollectionService {
  readonly images: NonNullable<DemoCollectionOptions["imageService"]>;
  private running: Promise<void> = Promise.resolve();
  constructor(readonly db: DatabaseSync, readonly video: VideoAnalysisService, private readonly options: DemoCollectionOptions = {}) {
    this.images = options.imageService || new ImageAnalysisService(db);
    db.exec(`CREATE TABLE IF NOT EXISTS demo_competitor_runs (id TEXT PRIMARY KEY,parent_brand_id TEXT NOT NULL REFERENCES brands(id),competitor_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS demo_competitor_single_active ON demo_competitor_runs(parent_brand_id,competitor_id) WHERE status IN ('queued','collecting','preparing','analysing');`);
    this.recover();
  }
  private readiness() {
    if (this.options.readiness) return this.options.readiness();
    const hosted = process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID);
    const errors: string[] = [];
    if (!process.env.GEMINI_API_KEY?.trim()) errors.push("Configure the existing Gemini key on the Render web service.");
    if (!process.env.DATABASE_URL?.trim()) errors.push("Configure DATABASE_URL for inference budget enforcement.");
    const reserve = Number(process.env.GEMINI_REQUEST_RESERVE_GBP);
    if (!process.env.GEMINI_REQUEST_RESERVE_GBP?.trim() || !Number.isFinite(reserve) || reserve <= 0) errors.push("Configure a positive GEMINI_REQUEST_RESERVE_GBP before paid inference.");
    return { hosted, inferenceErrors: errors };
  }
  private parent(raw: unknown): Brand {
    if (typeof raw !== "string" || raw.length > 300) throw new DemoCollectionRequestError("Choose the Valentte workspace.", 400);
    const brand = readBrand(this.db, raw);
    if (!brand || brand.name.trim().toLowerCase() !== "valentte" || brand.domain.toLowerCase().replace(/^www\./, "") !== "valentte.com")
      throw new DemoCollectionRequestError("This authorized competitor collection belongs to the Valentte workspace.", 400);
    // All verified aliases share one durable campaign and one 25-ad cap.
    return this.brands().filter(candidate => candidate.mode === "imported" && candidate.name.trim().toLowerCase() === "valentte" && candidate.domain.toLowerCase().replace(/^www\./, "") === "valentte.com")
      .sort((a, b) => Number(b.id === "valentte") - Number(a.id === "valentte") || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0] || brand;
  }
  private definition(raw: unknown): CompetitorDefinition {
    const definition = DEMO_COMPETITORS.find(item => item.id === raw);
    if (!definition) throw new DemoCollectionRequestError("Choose Aery Living, The White Company or NEOM.", 400);
    return definition;
  }
  private brands(): Brand[] {
    return (this.db.prepare("SELECT data FROM brands").all() as { data: string }[]).flatMap(row => { try { return [JSON.parse(row.data) as Brand]; } catch { return []; } });
  }
  private findBrand(definition: CompetitorDefinition) {
    return this.brands().filter(brand => brand.mode === "imported" && definition.domains.includes(brand.domain.toLowerCase().replace(/^www\./, "")))
      .sort((a, b) => Number(b.id === `demo-competitor:${definition.id}`) - Number(a.id === `demo-competitor:${definition.id}`) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
  }
  private ensureBrand(definition: CompetitorDefinition): Brand {
    const existing = this.findBrand(definition); if (existing) return existing;
    const id = this.brands().some(brand => brand.id === `demo-competitor:${definition.id}`) ? randomUUID() : `demo-competitor:${definition.id}`;
    const brand: Brand = { id, name: definition.name, domain: definition.domain, category: "Home fragrance & gifting", color: "#0C1F96", initials: definition.name.split(/\s+/).map(part => part[0]).slice(0, 2).join(""), voice: [], competitors: [], mode: "imported", createdAt: isoNow() };
    this.db.prepare("INSERT INTO brands VALUES (?,?)").run(id, JSON.stringify(brand)); return brand;
  }
  private ads(brandId: string): Ad[] {
    return (this.db.prepare("SELECT data FROM ads WHERE brand_id=? AND source='public'").all(brandId) as { data: string }[]).flatMap(row => { try { return [JSON.parse(row.data) as Ad]; } catch { return []; } });
  }
  private counts(brandId: string | null) {
    if (!brandId) return { collectedCount: 0, storedCount: 0, analysedCount: 0 };
    const ads = this.ads(brandId), ids = new Set(ads.map(ad => ad.id));
    const stored = new Set([...rows<{ sourceAdId: string }>(this.db, "video_media", brandId).map(media => media.sourceAdId), ...rows<{ adId: string }>(this.db, "image_media", brandId).map(media => media.adId)].filter(id => ids.has(id)));
    const analysed = new Set([...rows<{ adId: string }>(this.db, "video_analysis_runs", brandId), ...rows<{ adId: string }>(this.db, "image_analysis_runs", brandId)].filter(result => ids.has(result.adId)).map(result => result.adId));
    return { collectedCount: new Set(ads.map(ad => ad.providerAdId || ad.id)).size, storedCount: stored.size, analysedCount: analysed.size };
  }
  private save(run: DemoCollectionRun) {
    run.updatedAt = isoNow();
    this.db.prepare("INSERT INTO demo_competitor_runs VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data").run(run.id, run.parentBrandId, run.competitorId, run.status, run.createdAt, JSON.stringify(run));
  }
  private latest(parentBrandId: string, competitorId: DemoCompetitorId): DemoCollectionRun | null {
    const row = this.db.prepare("SELECT data FROM demo_competitor_runs WHERE parent_brand_id=? AND competitor_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(parentBrandId, competitorId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  private recover() {
    const saved = this.db.prepare("SELECT data FROM demo_competitor_runs WHERE status IN ('queued','collecting','preparing','analysing')").all() as { data: string }[];
    for (const row of saved) {
      const run = JSON.parse(row.data) as DemoCollectionRun;
      for (const item of run.items) if (item.status === "analysing") {
        const video = item.jobId ? this.video.job(run.brandId, item.jobId) : null;
        const image = item.jobId ? this.images.history(run.brandId, item.adId).find(result => result.id === item.jobId) : undefined;
        if (video?.status === "complete" && video.analysisId) { item.status = "complete"; item.analysisId = video.analysisId; }
        else if (image) { item.status = "complete"; item.analysisId = image.id; }
        else { item.status = "interrupted"; item.errorCode = "interrupted"; item.error = "The service restarted after this attempt was claimed. Its possible provider charge is not replayed automatically."; }
      }
      run.status = "interrupted"; run.message = "The service restarted. Stored media and completed results remain; explicit Resume continues only work that had not started.";
      this.save(run);
    }
  }
  snapshot(rawBrandId: unknown): DemoCollectionSnapshot {
    const parent = this.parent(rawBrandId);
    return { brandId: parent.id, hosted: this.readiness().hosted, competitors: DEMO_COMPETITORS.map(definition => {
      const brand = this.findBrand(definition), lastRun = this.latest(parent.id, definition.id);
      return { id: definition.id, name: definition.name, domain: definition.domain, country: "GB", target: 25, brandId: brand?.id || null, ...this.counts(brand?.id || null), status: lastRun?.status || "not-started", ...(definition.identityNote ? { identityNote: definition.identityNote } : {}), lastRun };
    }), limitations: ["Bounded public Meta collection, up to 25 source creatives and at most 25 analysed ads per competitor. It is not a complete market or continuous feed.", "An advertiser ID must be established from a matching public snapshot and official landing domain. Keyword similarity alone is insufficient.", "Stored counts refer to persisted media records; media routes verify the retained files. Missing measurements and failed analyses are never filled with samples.", "Browser collection is unpaid. Every Gemini generation reserves the shared inference budget; estimates and reservations are not invoices.", "No spend, conversion, sales or effectiveness comparison is inferred from creative frequency or library longevity."] };
  }
  async start(rawBrandId: unknown, rawCompetitorId?: unknown): Promise<DemoCollectionSnapshot> {
    const parent = this.parent(rawBrandId);
    if (!this.readiness().hosted) throw new DemoCollectionRequestError("Run competitor collection from the deployed Render app.");
    const definitions = rawCompetitorId === undefined ? DEMO_COMPETITORS : [this.definition(rawCompetitorId)];
    for (const definition of definitions) {
      const last = this.latest(parent.id, definition.id);
      if (last && (active.has(last.status) || last.status === "complete")) continue;
      if (last && ["paused", "interrupted", "failed"].includes(last.status) && last.items.length) {
        last.status = "queued"; delete last.finishedAt; delete last.message; this.save(last); this.launch(last); continue;
      }
      const brand = this.ensureBrand(definition);
      const run: DemoCollectionRun = { id: randomUUID(), parentBrandId: parent.id, competitorId: definition.id, brandId: brand.id, status: "queued", target: 25, country: "GB", createdAt: isoNow(), updatedAt: isoNow(), advertiserPageIds: [], items: [] };
      this.save(run); this.launch(run);
    }
    return this.snapshot(parent.id);
  }
  /** User-authorized campaign only once on Render; deployments never replay an existing run. */
  async startAuthorizedOnce(rawBrandId?: string) {
    if (!this.readiness().hosted) return;
    const parent = rawBrandId ? this.parent(rawBrandId) : this.brands().filter(brand => brand.mode === "imported" && brand.name.toLowerCase() === "valentte" && brand.domain.toLowerCase().replace(/^www\./, "") === "valentte.com").sort((a, b) => Number(b.id === "valentte") - Number(a.id === "valentte") || a.id.localeCompare(b.id))[0];
    if (!parent) return;
    for (const definition of DEMO_COMPETITORS) if (!this.latest(parent.id, definition.id)) await this.start(parent.id, definition.id);
  }
  private launch(run: DemoCollectionRun) {
    this.running = this.running.then(() => this.execute(run)).catch(() => { run.status = "failed"; run.finishedAt = isoNow(); run.message = "The hosted collection could not finish. Saved sources, media and previous outputs were preserved."; this.save(run); });
  }
  async idle() { await this.running; }
  private importCreative(brand: Brand, source: CollectedCompetitorCreative): Ad {
    const existing = this.ads(brand.id).find(ad => ad.providerAdId === source.nativeId);
    const ad: Ad = { id: existing?.id || `meta-library:${brand.id}:${source.nativeId}`, brandId: brand.id, brand: brand.name, platform: "Meta", category: brand.category,
      title: source.title, copy: source.copy, copyTruncated: source.copyTruncated, angle: existing?.angle || "Not analysed", audience: existing?.audience || "Not inferred", format: source.format,
      creativeFormats: source.creative.kind === "image" ? ["Static"] : source.creative.kind === "carousel" ? ["Carousel"] : [], contentSource: "paid",
      providerAdId: source.nativeId, advertiserPageId: source.advertiserPageId, publisherPlatforms: source.publisherPlatforms, ...(source.brandedContentPartner ? { brandedContentPartner: source.brandedContentPartner } : {}),
      observedAt: source.observedAt, firstObservedAt: existing?.firstObservedAt || existing?.observedAt || source.observedAt, deliveryStartAt: source.deliveryStartAt, deliveryStopAt: source.deliveryStopAt,
      dateBasis: source.deliveryStartAt ? "delivery" : "observed", publishedAt: source.deliveryStartAt || source.observedAt, active: source.active, deliveryStatus: source.active ? "active" : "inactive",
      image: "", color: brand.color, metricsAvailable: false, engagementRateBasis: "unavailable", engagementMetric: "Not supplied by Meta Ad Library", impressions: 0, engagements: 0,
      spend: null, conversions: null, revenue: null, owned: false, source: "public", sourceUrl: nativeUrl(source.nativeId),
      ...(existing?.analysis ? { analysis: existing.analysis } : {}), ...(existing?.videoAnalysis ? { videoAnalysis: existing.videoAnalysis } : {}), ...(existing?.videoMediaId ? { videoMediaId: existing.videoMediaId } : {}) };
    this.db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET published_at=excluded.published_at,data=excluded.data").run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
    return ad;
  }
  private async prepare(item: DemoCollectionItem, descriptor: SmokeCreative, brandId: string) {
    if (descriptor.kind === "unknown") { item.status = "unavailable"; item.errorCode = "source_media_unavailable"; item.error = descriptor.reason; return; }
    item.mediaKind = descriptor.kind;
    const media = descriptor.kind === "video" ? await this.video.storeMedia(brandId, item.adId, descriptor.videoUrl) : await this.images.storeMedia(brandId, item.adId, descriptor.imageUrls, descriptor.kind);
    item.mediaId = media.mediaId; item.status = "stored"; delete item.error; delete item.errorCode; delete item.sourceHttpStatus;
  }
  private failure(item: DemoCollectionItem, error: unknown) {
    const known = error instanceof CompetitorSourceError || error instanceof MediaStorageError;
    item.status = "unavailable"; item.errorCode = known ? error.code : "source_media_unavailable";
    item.error = known ? error.message : "Source media could not be retained. No synthetic creative was substituted.";
    if (error instanceof CompetitorSourceError && error.httpStatus) item.sourceHttpStatus = error.httpStatus;
    if (error instanceof MediaStorageError) item.sourceHttpStatus = error.sourceHttpStatus;
  }
  private existingAnalysis(brandId: string, item: DemoCollectionItem) {
    const video = this.video.history(brandId, item.adId)[0];
    const image = this.images.history(brandId, item.adId)[0];
    const existing = [video, image].filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (existing) { item.status = "complete"; item.analysisId = existing.id; item.mediaId = existing.mediaId; return true; }
    return false;
  }
  private async execute(run: DemoCollectionRun) {
    const definition = this.definition(run.competitorId), brand = readBrand(this.db, run.brandId)!;
    const source = this.options.sourceFactory?.(definition) || new PublicCompetitorSource(definition);
    try {
      if (!run.items.length || run.items.some(item => item.status === "pending")) {
        run.status = "collecting"; run.message = "Reading a bounded ordinary public Meta result and verifying advertiser identities."; this.save(run);
        const collected = await source.collect();
        await source.close();
        run.observedAt = collected.observedAt; run.sourceUrl = collected.sourceUrl;
        if (!run.items.length) {
          const seen = new Set<string>();
          for (const creative of collected.creatives) {
            if (seen.has(creative.nativeId) || run.items.length >= 25) continue;
            seen.add(creative.nativeId); const ad = this.importCreative(brand, creative);
            run.items.push({ adId: ad.id, nativeId: creative.nativeId, advertiserPageId: creative.advertiserPageId, status: "pending", mediaKind: creative.creative.kind });
          }
        }
        run.advertiserPageIds = [...new Set(run.items.map(item => item.advertiserPageId))]; run.status = "preparing"; this.save(run);
        const descriptors = new Map(collected.creatives.map(item => [item.nativeId, item.creative]));
        for (const item of run.items.filter(item => item.status === "pending")) {
          if (this.existingAnalysis(brand.id, item)) { this.save(run); continue; }
          try {
            const descriptor = descriptors.get(item.nativeId) || await source.refresh(item.nativeId, item.advertiserPageId);
            try { await this.prepare(item, descriptor, brand.id); }
            catch (error) {
              if (!(error instanceof MediaStorageError)) throw error;
              // One normal fresh-snapshot retry, never a challenge or access bypass.
              const fresh = await source.refresh(item.nativeId, item.advertiserPageId);
              await this.prepare(item, fresh, brand.id);
            }
          } catch (error) { this.failure(item, error); }
          finally { await source.close(); }
          this.save(run);
        }
      }
      const readiness = this.readiness();
      if (!readiness.hosted || readiness.inferenceErrors.length) { run.status = "paused"; run.message = readiness.inferenceErrors.join(" ") || "Continue this run from Render."; this.save(run); return; }
      run.status = "analysing"; run.message = "Analysing retained competitor creatives in Static mode under the inference budget."; this.save(run);
      for (const item of run.items.filter(item => item.status === "stored")) {
        if (this.existingAnalysis(brand.id, item)) { this.save(run); continue; }
        if (this.counts(brand.id).analysedCount >= 25) break;
        item.status = "analysing"; this.save(run);
        try {
          if (item.mediaKind === "video") {
            const job = this.video.enqueue({ brandId: brand.id, adId: item.adId, provider: "gemini", processingMode: "static-high-fps-hook", mediaResolution: "default", force: false });
            item.jobId = job.id; this.save(run); await this.video.idle();
            const saved = this.video.job(brand.id, job.id);
            if (saved?.status === "complete" && saved.analysisId) { item.status = "complete"; item.analysisId = saved.analysisId; }
            else {
              const accounting = saved?.attempts.flatMap(attempt => attempt.accounting ? [attempt.accounting] : []) || [];
              const mayCharge = accounting.some(part => part.requestAttempts > (part.rejectedAttempts || 0));
              item.status = saved?.errorCode === "budget_paused" && !mayCharge ? "stored" : saved?.status === "interrupted" ? "interrupted" : "failed";
              item.errorCode = saved?.errorCode || "inference_unavailable"; item.error = saved?.error || "Gemini did not produce a completed validated analysis.";
              if (saved?.errorCode === "budget_paused") { run.status = "paused"; run.message = "Inference budget paused collection. Resume continues only unstarted retained creatives."; this.save(run); return; }
            }
          } else {
            item.jobId = randomUUID(); this.save(run);
            const result = await this.images.analyse(brand.id, item.adId, item.mediaId!, item.jobId, { mediaResolution: "default" });
            item.status = "complete"; item.analysisId = result.id;
          }
          if (item.status === "complete") { delete item.error; delete item.errorCode; }
        } catch (error) {
          const known = error instanceof VideoProviderError;
          const mayCharge = known && error.accounting && error.accounting.requestAttempts > (error.accounting.rejectedAttempts || 0);
          item.status = known && error.code === "budget_paused" && !mayCharge ? "stored" : "failed";
          item.errorCode = known ? error.code : "inference_unavailable"; item.error = known ? error.message : "Inference did not finish; retained media and earlier results were preserved.";
          if (known && error.code === "budget_paused") { run.status = "paused"; run.message = "Inference budget paused collection. Resume continues only unstarted retained creatives."; this.save(run); return; }
        }
        this.save(run);
      }
      run.status = "complete"; run.finishedAt = isoNow();
      run.message = `${run.items.filter(item => item.status === "complete").length}/${run.items.length} captured creatives have saved analyses. Source and inference failures remain explicit; no complete-market or performance claim is made.`;
      this.save(run);
    } catch (error) {
      run.status = "failed"; run.finishedAt = isoNow(); run.message = error instanceof CompetitorSourceError ? error.message : "The hosted competitor collection could not finish. Earlier source evidence and outputs remain available.";
      this.save(run);
    } finally { await source.close(); }
  }
}
