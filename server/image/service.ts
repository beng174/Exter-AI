import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Ad } from "../../shared/types.js";
import type { ImageAnalysisResult, ImageCreativeKind, StoredImageCreative } from "../../shared/image-analysis.js";
import type { VideoAnalysisAccounting } from "../../shared/video-analysis.js";
import { resolveInferenceSettings, type InferenceSettings } from "../../shared/inference-config.js";
import { VideoProviderError } from "../video/types.js";
import { LocalImageMediaStore } from "./media.js";
import { GeminiImageAnalyser, type ImageAnalyser } from "./gemini.js";

export interface ImageMediaStore {
  store(input: { brandId: string; adId: string; sourceUrls: string[]; kind: ImageCreativeKind }): Promise<StoredImageCreative>;
  load(mediaId: string): Promise<StoredImageCreative | null>;
}
export interface ImageServiceOptions {
  mediaStore?: ImageMediaStore;
  analyserFactory?: () => ImageAnalyser;
}
interface StoredAttempt {
  id: string;
  brandId: string;
  adId: string;
  mediaId: string;
  status: "analysing" | "complete" | "failed";
  createdAt: string;
  errorCode?: string;
  accounting?: VideoAnalysisAccounting;
  inferenceSettings?: InferenceSettings;
}
export class ImageAnalysisService {
  readonly mediaStore: ImageMediaStore;
  private readonly factory: () => ImageAnalyser;
  constructor(readonly db: DatabaseSync, options: ImageServiceOptions = {}) {
    this.mediaStore = options.mediaStore || new LocalImageMediaStore();
    this.factory = options.analyserFactory || (() => new GeminiImageAnalyser());
    db.exec(`CREATE TABLE IF NOT EXISTS image_media (
      id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),ad_id TEXT NOT NULL REFERENCES ads(id),data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS image_media_ad ON image_media(brand_id,ad_id);
      CREATE TABLE IF NOT EXISTS image_analysis_runs (
      id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),ad_id TEXT NOT NULL REFERENCES ads(id),created_at TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS image_analysis_attempts (
      id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),ad_id TEXT NOT NULL REFERENCES ads(id),created_at TEXT NOT NULL,data TEXT NOT NULL);`);
  }
  private ad(brandId: string, adId: string): Ad {
    const row = this.db.prepare("SELECT data FROM ads WHERE brand_id=? AND id=? AND source!='sample'").get(brandId,adId) as { data: string } | undefined;
    if (!row) throw new VideoProviderError("configuration", "Choose a real source ad in this workspace for image analysis.");
    return JSON.parse(row.data) as Ad;
  }
  async storeMedia(brandId: string, adId: string, imageUrls: string[], kind: ImageCreativeKind) {
    this.ad(brandId,adId);
    const media = await this.mediaStore.store({ brandId,adId,sourceUrls: imageUrls,kind });
    if (media.brandId !== brandId || media.adId !== adId || media.kind !== kind) throw new VideoProviderError("configuration", "Retained images belong to another ad or workspace.");
    this.db.prepare("INSERT INTO image_media VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING").run(media.mediaId,brandId,adId,JSON.stringify(media));
    return media;
  }
  async storedMedia(brandId: string, adId: string, mediaId: string): Promise<StoredImageCreative | null> {
    this.ad(brandId,adId);
    const row = this.db.prepare("SELECT data FROM image_media WHERE brand_id=? AND ad_id=? AND id=?").get(brandId,adId,mediaId) as { data: string } | undefined;
    if (!row) return null;
    const saved = JSON.parse(row.data) as StoredImageCreative;
    const media = await this.mediaStore.load(mediaId);
    return media?.brandId === brandId && media.adId === adId && media.sha256 === saved.sha256 && media.kind === saved.kind ? media : null;
  }
  async latestMedia(brandId: string, adId: string): Promise<StoredImageCreative | null> {
    this.ad(brandId,adId);
    const rows = this.db.prepare("SELECT id FROM image_media WHERE brand_id=? AND ad_id=? ORDER BY rowid DESC").all(brandId,adId) as { id: string }[];
    for (const row of rows) {
      try { const media = await this.storedMedia(brandId,adId,row.id); if (media) return media; }
      catch { /* Another retained version may remain valid after disk damage. */ }
    }
    return null;
  }
  history(brandId: string, adId: string): ImageAnalysisResult[] {
    this.ad(brandId,adId);
    return (this.db.prepare("SELECT data FROM image_analysis_runs WHERE brand_id=? AND ad_id=? ORDER BY created_at DESC,rowid DESC").all(brandId,adId) as { data: string }[]).map(row => JSON.parse(row.data));
  }
  attemptAccounting(brandId: string, adId: string, attemptId: string): VideoAnalysisAccounting | null {
    const row = this.db.prepare("SELECT data FROM image_analysis_attempts WHERE id=? AND brand_id=? AND ad_id=?").get(attemptId,brandId,adId) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as StoredAttempt).accounting || null : null;
  }
  private saveAttempt(attempt: StoredAttempt) {
    this.db.prepare("INSERT INTO image_analysis_attempts VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(attempt.id,attempt.brandId,attempt.adId,attempt.createdAt,JSON.stringify(attempt));
  }
  async analyse(brandId: string, adId: string, mediaId: string, attemptId: string = randomUUID(), settings: Partial<InferenceSettings> = {}): Promise<ImageAnalysisResult> {
    const ad = this.ad(brandId,adId);
    let inferenceSettings: InferenceSettings;
    try { inferenceSettings = resolveInferenceSettings(settings); }
    catch (error) { throw new VideoProviderError("configuration", error instanceof Error ? error.message : "Invalid Gemini inference settings."); }
    const previous = this.db.prepare("SELECT data FROM image_analysis_attempts WHERE id=?").get(attemptId) as { data: string } | undefined;
    if (previous) {
      const attempt = JSON.parse(previous.data) as StoredAttempt;
      if (attempt.brandId !== brandId || attempt.adId !== adId || attempt.mediaId !== mediaId) throw new VideoProviderError("configuration", "Image attempt belongs to another source input.");
      if (attempt.inferenceSettings && (attempt.inferenceSettings.mediaResolution !== inferenceSettings.mediaResolution || attempt.inferenceSettings.generationSeed !== inferenceSettings.generationSeed))
        throw new VideoProviderError("configuration", "This image attempt already uses different inference settings. Start a new explicit attempt to compare settings.");
      const existing = this.history(brandId,adId).find(result => result.id === attemptId);
      if (attempt.status === "complete" && existing) return existing;
      throw new VideoProviderError("unavailable", "This image attempt already started. Its earlier charge may have occurred and will not be replayed.", attempt.accounting);
    }
    const media = await this.storedMedia(brandId,adId,mediaId);
    if (!media) throw new VideoProviderError("configuration", "Retained images are unavailable or changed. Prepare them before inference.");
    // Disk verification yielded to other callers. Recheck before claiming dispatch.
    if (this.db.prepare("SELECT id FROM image_analysis_attempts WHERE id=?").get(attemptId))
      return this.analyse(brandId,adId,mediaId,attemptId,inferenceSettings);
    const attempt: StoredAttempt = { id: attemptId,brandId,adId,mediaId,status: "analysing",createdAt: new Date().toISOString(),inferenceSettings };
    // Persist the caller's identity before dispatch. Restart recovery can reconcile it.
    this.saveAttempt(attempt);
    try {
      const provider = this.factory();
      const output = await provider.analyse({ media, context: { brandName: ad.brand,adCopy: ad.copy || "" }, inferenceSettings, mediaResolution: inferenceSettings.mediaResolution });
      attempt.accounting = output.accounting;
      const analysisConfigSha256 = createHash("sha256").update(JSON.stringify({ provider: "gemini", requestedModel: provider.model, processingMode: media.kind, promptVersion: output.promptVersion, temperature: 0, ...inferenceSettings })).digest("hex");
      const result: ImageAnalysisResult = { id: attemptId,brandId,adId,mediaId,mediaSha256: media.sha256,provider: "gemini",model: output.model,requestedModel: output.requestedModel || provider.model,...(output.servedModel ? { servedModel: output.servedModel } : {}),modelVersion: output.modelVersion,processingMode: media.kind,promptVersion: output.promptVersion,createdAt: new Date().toISOString(),confidencePolicy: "uncalibrated-not-filtered",analysisConfigSha256,inferenceSettings,...(output.generation ? { generation: output.generation } : {}),fields: output.fields,accounting: output.accounting };
      this.db.exec("BEGIN");
      try {
        this.db.prepare("INSERT INTO image_analysis_runs VALUES (?,?,?,?,?)").run(result.id,brandId,adId,result.createdAt,JSON.stringify(result));
        attempt.status = "complete"; this.saveAttempt(attempt);
        this.db.exec("COMMIT");
      } catch (error) { this.db.exec("ROLLBACK"); throw error; }
      return result;
    } catch (error) {
      attempt.status = "failed";
      attempt.errorCode = error instanceof VideoProviderError ? error.code : "unavailable";
      attempt.accounting = error instanceof VideoProviderError ? error.accounting || attempt.accounting : attempt.accounting;
      this.saveAttempt(attempt);
      if (error instanceof VideoProviderError) throw error;
      throw new VideoProviderError("unavailable", "Image analysis could not finish. Retained images and earlier outputs were preserved.", attempt.accounting);
    }
  }
}
