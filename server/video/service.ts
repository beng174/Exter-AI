import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { readBrand } from "../db.js";
import type { Ad } from "../../shared/types.js";
import { VIDEO_PROMPT_VERSION, type CreatorEvidence, type VideoAnalysisAttempt, type VideoAnalysisResult, type VideoProcessingMode, type VideoNormalization } from "../../shared/video-analysis.js";
import { resolveInferenceSettings, type InferenceSettings, type MediaResolution } from "../../shared/inference-config.js";
import { GeminiVideoAnalyser, DEFAULT_GEMINI_VIDEO_MODEL } from "./gemini.js";
import { TwelveLabsPegasusAnalyser } from "./twelvelabs.js";
import { LocalVideoMediaStore, MediaStorageError } from "./media.js";
import { normalizeVideoAnalysisFields } from "./validation.js";
import { prepareGeminiVideo, type PreparedGeminiVideo } from "./normalize.js";
import type { GeminiDiagnostic } from "../../shared/gemini-diagnostic.js";
import { VideoProviderError, type StoredVideo, type VideoAnalyser, type VideoMediaStore } from "./types.js";

export interface VideoJobInput {
  brandId: string;
  adId: string;
  sourceVideoUrl?: string;
  provider?: "gemini" | "twelvelabs";
  processingMode?: VideoProcessingMode;
  mediaResolution?: MediaResolution;
  generationSeed?: number;
  force?: boolean;
}
export interface VideoJob {
  id: string; brandId: string; adId: string; provider: string; model: string;
  status: "queued" | "downloading" | "analysing" | "complete" | "error" | "interrupted";
  createdAt: string; updatedAt: string;
  requestedMode: VideoProcessingMode;
  promptVersion: string;
  attempts: VideoAnalysisAttempt[];
  mediaId?: string;
  analysisId?: string;
  cached?: boolean;
  errorCode?: string;
  error?: string;
  geminiDiagnostic?: GeminiDiagnostic;
  normalization?: VideoNormalization;
  inferenceSettings?: InferenceSettings;
  analysisConfigSha256?: string;
}
export interface VideoServiceOptions {
  mediaStore?: VideoMediaStore;
  analyserFactory?: (provider: "gemini" | "twelvelabs") => VideoAnalyser;
  /** Deprecated. Model confidence is recorded but never filters uncalibrated results. */
  confidenceThreshold?: number;
  concurrency?: number;
  /** Injected adapters may supply fixture media. The production Gemini factory always normalizes. */
  normalizeMedia?: (media: StoredVideo) => Promise<PreparedGeminiVideo>;
}
export function ensureVideoTables(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS video_media (id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),ad_id TEXT NOT NULL REFERENCES ads(id),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS video_analysis_runs (id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),ad_id TEXT NOT NULL REFERENCES ads(id),created_at TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS video_analysis_history ON video_analysis_runs(brand_id,ad_id,created_at);
    CREATE TABLE IF NOT EXISTS video_jobs (id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),ad_id TEXT NOT NULL REFERENCES ads(id),provider TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS video_jobs_active ON video_jobs(brand_id,ad_id,provider) WHERE status IN ('queued','downloading','analysing');`);
}
function defaultAnalyser(provider: "gemini" | "twelvelabs"): VideoAnalyser {
  if (provider === "twelvelabs") return new TwelveLabsPegasusAnalyser();
  if (!process.env.GEMINI_API_KEY)
    throw new VideoProviderError("configuration", "Set GEMINI_API_KEY in server secret configuration before requesting video inference. Do not paste it into chat.");
  return new GeminiVideoAnalyser({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_VIDEO_MODEL });
}
export class VideoAnalysisService {
  readonly mediaStore: VideoMediaStore;
  private readonly factory: NonNullable<VideoServiceOptions["analyserFactory"]>;
  private readonly prepareMedia: NonNullable<VideoServiceOptions["normalizeMedia"]>;
  private readonly queues: Promise<void>[];
  private nextQueue = 0;
  constructor(readonly db: DatabaseSync, options: VideoServiceOptions = {}) {
    ensureVideoTables(db);
    this.mediaStore = options.mediaStore || new LocalVideoMediaStore();
    this.factory = options.analyserFactory || defaultAnalyser;
    this.prepareMedia = options.normalizeMedia || (options.analyserFactory ? async media => ({ media }) : prepareGeminiVideo);
    const concurrency = options.concurrency ?? Number(process.env.GEMINI_VIDEO_CONCURRENCY ?? process.env.GEMINI_CONCURRENCY ?? 3);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10)
      throw new VideoProviderError("configuration", "GEMINI_VIDEO_CONCURRENCY must be an integer between one and ten.");
    this.queues = Array.from({ length: concurrency }, () => Promise.resolve());
  }
  ad(brandId: string, adId: string): Ad {
    const brand = readBrand(this.db, brandId);
    const row = this.db.prepare("SELECT data FROM ads WHERE brand_id=? AND id=?").get(brandId, adId) as { data: string } | undefined;
    if (!brand || !row) throw new VideoProviderError("configuration", "Ad not found in this workspace.");
    const ad = JSON.parse(row.data) as Ad;
    if (ad.source === "sample") throw new VideoProviderError("configuration", "Use a real source ad for video analysis. Fictional sample ads have no original video.");
    return ad;
  }
  private saveJob(job: VideoJob) {
    job.updatedAt = new Date().toISOString();
    this.db.prepare("INSERT INTO video_jobs VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data")
      .run(job.id, job.brandId, job.adId, job.provider, job.status, job.createdAt, JSON.stringify(job));
  }
  job(brandId: string, id: string): VideoJob | null {
    const row = this.db.prepare("SELECT data FROM video_jobs WHERE brand_id=? AND id=?").get(brandId, id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  history(brandId: string, adId: string): VideoAnalysisResult[] {
    this.ad(brandId, adId);
    return (this.db.prepare("SELECT data FROM video_analysis_runs WHERE brand_id=? AND ad_id=? ORDER BY created_at DESC,rowid DESC").all(brandId, adId) as { data: string }[]).map((row) => JSON.parse(row.data));
  }
  /** Single-worker startup recovery: no billable inference is silently replayed. */
  recoverInterruptedJobs(): number {
    const rows = this.db.prepare("SELECT data FROM video_jobs WHERE status IN ('queued','downloading','analysing')").all() as { data: string }[];
    for (const row of rows) {
      const job = JSON.parse(row.data) as VideoJob;
      job.status = "interrupted";
      job.errorCode = "interrupted";
      job.error = "The worker restarted. Stored media and earlier analyses were retained. Submit a new explicit request to retry; paid inference was not replayed automatically.";
      this.saveJob(job);
    }
    return rows.length;
  }
  enqueue(input: VideoJobInput): VideoJob {
    this.ad(input.brandId, input.adId);
    const provider = input.provider || "gemini";
    if (!["gemini", "twelvelabs"].includes(provider)) throw new VideoProviderError("configuration", "Unknown video provider.");
    const mode = input.processingMode || "static-high-fps-hook";
    if (!["agentic", "static-high-fps-hook"].includes(mode)) throw new VideoProviderError("configuration", "Unknown video processing mode.");
    let inferenceSettings: InferenceSettings;
    try { inferenceSettings = resolveInferenceSettings(input); }
    catch (error) { throw new VideoProviderError("configuration", error instanceof Error ? error.message : "Invalid Gemini inference settings."); }
    const analyser = this.factory(provider);
    const active = this.db.prepare("SELECT data FROM video_jobs WHERE brand_id=? AND ad_id=? AND provider=? AND status IN ('queued','downloading','analysing')").get(input.brandId, input.adId, provider) as { data: string } | undefined;
    if (active) return JSON.parse(active.data);
    const now = new Date().toISOString();
    const analysisConfigSha256 = createHash("sha256").update(JSON.stringify({ provider: analyser.provider, requestedModel: analyser.model, processingMode: mode, promptVersion: VIDEO_PROMPT_VERSION, temperature: 0, ...inferenceSettings })).digest("hex");
    const job: VideoJob = { id: randomUUID(), brandId: input.brandId, adId: input.adId, provider, model: analyser.model, status: "queued", createdAt: now, updatedAt: now, requestedMode: mode, promptVersion: VIDEO_PROMPT_VERSION, attempts: [], inferenceSettings, analysisConfigSha256 };
    this.saveJob(job);
    // Signed source URLs remain in memory only. Persistent local media is the durable input.
    const lane = this.nextQueue++ % this.queues.length;
    this.queues[lane] = this.queues[lane].then(() => this.execute(job, input, analyser)).catch(() => {});
    return structuredClone(job);
  }
  async idle() { await Promise.all(this.queues); }
  async storeMedia(brandId: string, adId: string, sourceVideoUrl?: string): Promise<StoredVideo> {
    const ad = this.ad(brandId, adId);
    const media = await this.mediaStore.store({ adId, brandId, sourceUrl: sourceVideoUrl });
    if (media.brandId !== brandId || media.sourceAdId !== adId)
      throw new VideoProviderError("configuration", "Stored video belongs to another workspace or ad.");
    this.db.prepare("INSERT INTO video_media VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING").run(media.mediaId, brandId, adId, JSON.stringify(media));
    const current = this.ad(brandId, adId);
    this.db.prepare("UPDATE ads SET data=? WHERE id=? AND brand_id=?").run(JSON.stringify({ ...current, videoMediaId: media.mediaId }), ad.id, ad.brandId);
    return media;
  }
  private trustedEvidence(ad: Ad): CreatorEvidence[] {
    return ad.source === "public" && ad.advertiserPageId && ad.brandedContentPartner && ad.sourceUrl
      ? [{ kind: "paid-partnership-label", value: `Ad-library branded-content attribution: ${ad.brandedContentPartner.name}`, confidence: 1, timestamps: [], source: "ad-library", sourceUrl: ad.sourceUrl }]
      : [];
  }
  private async execute(job: VideoJob, input: VideoJobInput, analyser: VideoAnalyser) {
    try {
      if (analyser.implemented === false) throw new VideoProviderError("not_implemented", "The selected video provider is a benchmark stub; it does not produce analyses yet.");
      const ad = this.ad(job.brandId, job.adId);
      job.status = "downloading"; this.saveJob(job);
      const media = await this.storeMedia(ad.brandId, ad.id, input.sourceVideoUrl);
      job.mediaId = media.mediaId;
      const evidence = this.trustedEvidence(ad);
      const context = { brandName: ad.brand, adCopy: ad.copy, sourceUrl: ad.sourceUrl || undefined, creatorEvidence: evidence };
      const inputContextSha256 = createHash("sha256").update(JSON.stringify(context)).digest("hex");
      const existing = this.history(ad.brandId, ad.id).find((run) => run.provider === analyser.provider && (run.requestedModel || run.model) === analyser.model && run.mediaSha256 === media.sha256 && run.inputContextSha256 === inputContextSha256 && run.promptVersion === VIDEO_PROMPT_VERSION && run.processingMode === job.requestedMode && run.analysisConfigSha256 === job.analysisConfigSha256);
      if (existing && !input.force) {
        job.status = "complete"; job.analysisId = existing.id; job.cached = true; this.saveJob(job); return;
      }
      const prepared: PreparedGeminiVideo = analyser.provider === "gemini" ? await this.prepareMedia(media) : { media };
      if (prepared.normalization) job.normalization = prepared.normalization;
      job.status = "analysing"; this.saveJob(job);
      const call = async (processingMode: VideoProcessingMode) => {
        try {
          const value = await analyser.analyse({ adId: ad.id, brandId: ad.brandId, media: prepared.media, context, processingMode, inferenceSettings: job.inferenceSettings, mediaResolution: job.inferenceSettings?.mediaResolution, normalization: prepared.normalization });
          job.attempts.push({ processingMode, status: "succeeded", ...(value.accounting ? { accounting: value.accounting } : {}) }); this.saveJob(job); return value;
        } catch (error) {
          job.attempts.push({ processingMode, status: "failed", errorCode: error instanceof VideoProviderError ? error.code : "unavailable", ...(error instanceof VideoProviderError && error.diagnostic ? { diagnostic: error.diagnostic } : {}), ...(error instanceof VideoProviderError && error.accounting ? { accounting: error.accounting } : {}) }); this.saveJob(job); throw error;
        }
      };
      let result;
      try { result = await call(job.requestedMode); }
      catch (error) {
        if (job.requestedMode !== "agentic" || !(error instanceof VideoProviderError) || error.code !== "unsupported_mode") throw error;
        result = await call("static-high-fps-hook");
      }
      if (Math.abs(result.coverage.durationSeconds - prepared.media.durationSeconds) > 0.05 || !result.model || result.promptVersion !== VIDEO_PROMPT_VERSION || result.processingMode !== job.attempts.at(-1)?.processingMode || (result.modelVersion !== null && (typeof result.modelVersion !== "string" || !result.modelVersion.trim())))
        throw new VideoProviderError("invalid_output", "Provider provenance or source duration does not match the stored video.");
      const fields = normalizeVideoAnalysisFields(result.fields, { coverage: result.coverage, threshold: 0, trustedEvidence: evidence, brandName: ad.brand });
      const analysis: VideoAnalysisResult = { id: randomUUID(), adId: ad.id, brandId: ad.brandId, mediaId: media.mediaId, mediaSha256: media.sha256, inputContextSha256, provider: analyser.provider, model: result.model, requestedModel: result.requestedModel || analyser.model, ...(result.servedModel ? { servedModel: result.servedModel } : {}), modelVersion: result.modelVersion, processingMode: result.processingMode, promptVersion: result.promptVersion, createdAt: new Date().toISOString(), confidenceThreshold: 0, confidencePolicy: "uncalibrated-not-filtered", analysisConfigSha256: job.analysisConfigSha256, inferenceSettings: job.inferenceSettings, ...(result.generation ? { generation: result.generation } : {}), ...(result.sampling ? { sampling: result.sampling } : {}), coverage: result.coverage, fields, ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}), ...(result.accounting ? { accounting: result.accounting } : {}), ...(prepared.normalization ? { normalization: prepared.normalization } : {}) };
      this.db.exec("BEGIN");
      try {
        this.db.prepare("INSERT INTO video_analysis_runs VALUES (?,?,?,?,?)").run(analysis.id, ad.brandId, ad.id, analysis.createdAt, JSON.stringify(analysis));
        const current = this.ad(ad.brandId, ad.id);
        // Native results are separate from legacy still-image annotations; history is append-only.
        this.db.prepare("UPDATE ads SET data=? WHERE brand_id=? AND id=?").run(JSON.stringify({ ...current, videoMediaId: media.mediaId, videoAnalysis: analysis }), ad.brandId, ad.id);
        job.status = "complete"; job.analysisId = analysis.id; this.saveJob(job);
        this.db.exec("COMMIT");
      } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    } catch (error) {
      job.status = "error";
      if (error instanceof VideoProviderError && error.diagnostic) job.geminiDiagnostic = error.diagnostic;
      job.errorCode = error instanceof VideoProviderError || error instanceof MediaStorageError ? error.code : "unavailable";
      job.error = error instanceof VideoProviderError || error instanceof MediaStorageError ? error.message : "Video processing failed. Stored media and earlier successful analysis were preserved.";
      this.saveJob(job);
    }
  }
  async storedMedia(brandId: string, adId: string, mediaId: string): Promise<StoredVideo | null> {
    this.ad(brandId, adId);
    if (!this.db.prepare("SELECT id FROM video_media WHERE id=? AND brand_id=? AND ad_id=?").get(mediaId, brandId, adId)) return null;
    const media = await this.mediaStore.load(mediaId);
    return media?.brandId === brandId && media.sourceAdId === adId ? media : null;
  }
}

export function videoStatus() {
  return { providers: [{ provider: "gemini", model: process.env.GEMINI_VIDEO_MODEL || DEFAULT_GEMINI_VIDEO_MODEL, configured: Boolean(process.env.GEMINI_API_KEY), implementation: "normalized-files-generate-content-static-or-explicit-interactions-agentic" }, { provider: "twelvelabs", model: "pegasus", configured: false, implementation: "stub" }], promptVersion: VIDEO_PROMPT_VERSION, inferenceLocation: "Gemini API; Exter stores media, validates results and computes analytics", mediaStorage: "persistent local volume; configure EXTER_MEDIA_ROOT", disclosure: "No video result exists until stored source media has been analysed. Confidence is model-reported, not calibrated accuracy. This local application is not a multi-tenant hosted service." };
}
