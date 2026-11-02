import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import source from "../../shared/cases/valentte-ads.json";
import caseData from "../../shared/cases/valentte.json";
import type { Ad, Brand } from "../../shared/types.js";
import { GEMINI_SMOKE_TARGET, GEMINI_SMOKE_MIN_SAMPLE, type SmokeItem, type SmokePreparationAttempt, type SmokeRun, type SmokeStatus, type SmokeFormatCounts } from "../../shared/gemini-smoke.js";
import { VIDEO_PROMPT_VERSION, type VideoAnalysisAccounting, type VideoProcessingMode } from "../../shared/video-analysis.js";
import { readJson } from "../db.js";
import { budgetStatus } from "../infrastructure/budget.js";
import { infrastructureDatabase } from "../infrastructure/database.js";
import { DEFAULT_GEMINI_VIDEO_MODEL } from "../video/gemini.js";
import { VideoAnalysisService } from "../video/service.js";
import { MediaStorageError } from "../video/media.js";
import { VideoProviderError } from "../video/types.js";
import { PublicValentteVideoSource, SmokeSourceError, VALENTTE_PAGE_ID, type SmokeVideoSource } from "./source.js";
import { ImageAnalysisService } from "../image/service.js";
import type { GeminiDiagnostic } from "../../shared/gemini-diagnostic.js";
import { resolveInferenceSettings, type InferenceSettings } from "../../shared/inference-config.js";
import { CREATIVE_TAXONOMY_VERSION } from "../../shared/creative-taxonomy.js";

const ACTIVE = new Set(["queued", "preparing", "analysing"]);
const now = () => new Date().toISOString();
export class SmokeRequestError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
function inferenceSettings(input: Partial<InferenceSettings>, mode: VideoProcessingMode, preparation = false): InferenceSettings {
  let settings: InferenceSettings;
  try { settings = resolveInferenceSettings(input); }
  catch (error) { throw new SmokeRequestError(error instanceof Error ? error.message : "Choose Default or Low media resolution.", 400); }
  if (!preparation && mode === "agentic" && settings.mediaResolution === "low")
    throw new SmokeRequestError("Low media resolution requires Static mode. Agentic preview does not support this control.", 400);
  return settings;
}
export interface SmokeOptions {
  sourceFactory?: (nativeIds: Set<string>) => SmokeVideoSource;
  /** Tests inject readiness; production always uses Render and budget checks. */
  readiness?: () => Promise<{ hosted: boolean; errors: string[] }>;
  concurrency?: number;
  imageService?: Pick<ImageAnalysisService, "storeMedia" | "latestMedia" | "storedMedia" | "analyse" | "history" | "attemptAccounting">;
}
const formatCounts = (items: SmokeItem[]): SmokeFormatCounts => items.reduce((counts, item) => {
  const kind = item.mediaKind || "video";
  if (kind !== "unknown") counts[kind]++;
  return counts;
}, { video: 0, image: 0, carousel: 0 });
const isValentte = (brand: Brand) => brand.name.toLowerCase() === "valentte" && brand.domain.toLowerCase().replace(/^www\./, "") === "valentte.com";
function candidateAds(db: DatabaseSync, deduplicate = true): Ad[] {
  const brands = readJson<Brand>(db.prepare("SELECT data FROM brands").all()).filter(isValentte);
  if (!brands.length) return [];
  const ids = new Set(brands.map(brand => brand.id));
  const seen = new Set<string>();
  return readJson<Ad>(db.prepare("SELECT data FROM ads ORDER BY id").all()).filter(ad => {
    return ids.has(ad.brandId) && ad.source === "public" && ad.advertiserPageId === VALENTTE_PAGE_ID && Boolean(ad.providerAdId && /^\d{5,30}$/.test(ad.providerAdId));
  }).sort((a,b) => Number(Boolean(b.videoMediaId)) - Number(Boolean(a.videoMediaId)) || Number(b.format === "Video") - Number(a.format === "Video") || a.id.localeCompare(b.id))
    .filter(ad => {
      if (!deduplicate) return true;
      if (seen.has(ad.providerAdId!)) return false;
      seen.add(ad.providerAdId!); return true;
    });
}
/** Explicit setup imports verified public evidence, preserving all existing records and media. */
function ensureValentteCase(db: DatabaseSync) {
  const brands = readJson<Brand>(db.prepare("SELECT data FROM brands").all());
  const existing = brands.find(isValentte);
  const saved = caseData.brand as Brand;
  const collision = brands.some(brand => brand.id === saved.id && !isValentte(brand));
  const brand: Brand = existing || { ...saved, id: collision ? randomUUID() : saved.id, mode: "imported" };
  const ads = source.ads as Ad[];
  if (!ads.length || ads.some(ad => ad.source !== "public" || ad.advertiserPageId !== VALENTTE_PAGE_ID || !ad.providerAdId || ad.sourceUrl !== `https://www.facebook.com/ads/library/?id=${ad.providerAdId}`)) throw new SmokeRequestError("The saved public Valentte evidence failed verification.", 503);
  db.exec("BEGIN");
  try {
    if (!existing) db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
    const currentIds = new Set(readJson<Ad>(db.prepare("SELECT data FROM ads WHERE brand_id=?").all(brand.id)).map(ad => ad.providerAdId));
    const insert = db.prepare("INSERT OR IGNORE INTO ads VALUES (?,?,?,?,?,?)");
    for (const original of ads) {
      if (currentIds.has(original.providerAdId)) continue;
      const ad = { ...original, brandId: brand.id, id: `meta-library:${brand.id}:${original.providerAdId}` };
      insert.run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
function accountingSummary(parts: VideoAnalysisAccounting[]) {
  const accepted = parts.filter(part => part.requestAttempts > (part.rejectedAttempts || 0));
  const sum = (key: "inputTokens" | "outputTokens" | "totalTokens") => accepted.length && accepted.every(part => part.requestAttempts - (part.rejectedAttempts || 0) <= 1 && part.usage[key] !== null) ? accepted.reduce((total, part) => total + (part.usage[key] || 0), 0) : null;
  const knownCosts = parts.map(part => part.estimatedCostGbp).filter((value): value is number => value !== null && Number.isFinite(value));
  const costSum = (key: "reservedCostGbp" | "tokenCostGbp" | "billedCostGbp" | "initialReservedCostGbp") => {
    const selected = key === "tokenCostGbp" ? accepted : parts;
    return selected.length && selected.every(part => typeof part[key] === "number" && Number.isFinite(part[key])) ? selected.reduce((total, part) => total + part[key]!, 0) : null;
  };
  return {
    usage: { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), totalTokens: sum("totalTokens") },
    estimatedCostGbp: parts.length && knownCosts.length === parts.length ? knownCosts.reduce((a,b) => a+b,0) : null,
    costBasis: parts.map(part => part.costBasis).filter((value,index,array) => array.indexOf(value) === index).join(", ") || "unavailable",
    reservedCostGbp: costSum("reservedCostGbp"), tokenCostGbp: costSum("tokenCostGbp"), billedCostGbp: costSum("billedCostGbp"), initialReservedCostGbp: costSum("initialReservedCostGbp"),
    retryAttempts: parts.reduce((total, part) => total + (part.retryAttempts ?? Math.max(0, part.requestAttempts - 1)), 0),
    rejectedAttempts: parts.reduce((total, part) => total + (part.rejectedAttempts || 0), 0),
  };
}
export class GeminiSmokeService {
  readonly concurrency: number;
  readonly images: NonNullable<SmokeOptions["imageService"]>;
  private running: Promise<void> = Promise.resolve();
  constructor(readonly db: DatabaseSync, readonly video: VideoAnalysisService, private readonly options: SmokeOptions = {}) {
    this.images = options.imageService || new ImageAnalysisService(db);
    this.concurrency = options.concurrency ?? Number(process.env.GEMINI_VIDEO_CONCURRENCY || 3);
    if (!Number.isInteger(this.concurrency) || this.concurrency < 1 || this.concurrency > 10) throw new SmokeRequestError("GEMINI_VIDEO_CONCURRENCY must be an integer from 1 to 10.", 503);
    db.exec(`CREATE TABLE IF NOT EXISTS gemini_smoke_runs (id TEXT PRIMARY KEY,status TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS gemini_smoke_single_active ON gemini_smoke_runs((1)) WHERE status IN ('queued','preparing','analysing');`);
    this.recover();
  }
  private save(run: SmokeRun) {
    run.updatedAt = now();
    this.db.prepare("INSERT INTO gemini_smoke_runs VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data").run(run.id, run.status, run.createdAt, JSON.stringify(run));
  }
  private recover() {
    const rows = this.db.prepare("SELECT data FROM gemini_smoke_runs WHERE status IN ('queued','preparing','analysing')").all() as { data: string }[];
    for (const row of rows) {
      const run = JSON.parse(row.data) as SmokeRun;
      for (const item of run.items) {
        if (item.status === "preparing") item.status = "pending";
        if (item.status === "analysing") {
          if (item.mediaKind === "image" || item.mediaKind === "carousel") {
            const result = this.images.history(item.brandId, item.adId).find(value => value.id === item.jobId);
            if (result) this.finishImageItem(item, result);
            else {
              item.status = "interrupted"; item.errorCode = "interrupted";
              item.error = "The web service restarted during image inference. Its charge may have occurred; Resume will not replay this ad.";
              const accounting = item.jobId ? this.images.attemptAccounting(item.brandId, item.adId, item.jobId) : null;
              if (accounting) this.applyAccounting(item, [{ accounting }]);
            }
            continue;
          }
          const job = item.jobId ? this.video.job(item.brandId, item.jobId) : null;
          if (job?.status === "complete" && job.analysisId) {
            this.finishItem(item, job.analysisId, job.attempts);
          } else {
            item.status = "interrupted";
            item.errorCode = "interrupted";
            item.error = "The web service restarted during an inference attempt. Its charge may have occurred. This ad will not be replayed automatically.";
            if (job) {
              item.model = job.model; item.processingMode = job.attempts.at(-1)?.processingMode || job.requestedMode;
              this.applyAccounting(item, job.attempts);
              if (job.geminiDiagnostic) item.geminiDiagnostic = job.geminiDiagnostic;
            }
          }
        }
      }
      run.status = "interrupted";
      run.message = "The Render web service restarted. Stored media and completed analyses were retained. Resume continues only work that had not started; uncertain paid attempts remain marked interrupted.";
      this.save(run);
    }
  }
  run(id: string): SmokeRun | null {
    const row = this.db.prepare("SELECT data FROM gemini_smoke_runs WHERE id=?").get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  private active(): SmokeRun | null {
    const row = this.db.prepare("SELECT data FROM gemini_smoke_runs WHERE status IN ('queued','preparing','analysing') LIMIT 1").get() as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  latest(): SmokeRun | null {
    const row = this.db.prepare("SELECT data FROM gemini_smoke_runs ORDER BY created_at DESC,rowid DESC LIMIT 1").get() as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  private async readiness() {
    if (this.options.readiness) return this.options.readiness();
    const hosted = process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID);
    const errors: string[] = [];
    if (!hosted) errors.push("Run live inference from the Render app. Codex and local execution are disabled for this action.");
    if (!process.env.GEMINI_API_KEY) errors.push("Set GEMINI_API_KEY in the Render web service environment.");
    for (const key of ["GEMINI_REQUEST_RESERVE_GBP", "GEMINI_INPUT_GBP_PER_MILLION_TOKENS", "GEMINI_OUTPUT_GBP_PER_MILLION_TOKENS"]) {
      if (!Number.isFinite(Number(process.env[key])) || Number(process.env[key]) <= 0) errors.push(`Set a positive ${key} in Render before paid inference.`);
    }
    if (!process.env.DATABASE_URL) errors.push("Configure DATABASE_URL on the Render web service for inference budget enforcement.");
    else {
      try {
        const budget = (await budgetStatus(infrastructureDatabase())).find(row => row.cost_type === "inference");
        if (!budget || budget.paused) errors.push("Inference is paused: set or increase its monthly GBP budget in Budgets. The next request must fit below the 90% threshold.");
      } catch { errors.push("The inference budget database is unavailable. Check Render database configuration and migrations."); }
    }
    return { hosted, errors };
  }
  /** Read-only integrity check. Metadata alone does not establish a retained input. */
  private async retainedCreatives() {
    const retained: SmokeItem[] = [];
    const seen = new Set<string>();
    for (const ad of candidateAds(this.db, false)) {
      if (seen.has(ad.providerAdId!)) continue;
      if (ad.videoMediaId) {
        try {
          const media = await this.video.storedMedia(ad.brandId, ad.id, ad.videoMediaId);
          if (media) {
            retained.push({ adId: ad.id, brandId: ad.brandId, nativeId: ad.providerAdId!, status: "stored", mediaKind: "video", mediaId: media.mediaId, mediaSha256: media.sha256, durationSeconds: media.durationSeconds });
            seen.add(ad.providerAdId!); continue;
          }
        } catch { /* Missing/corrupt disk objects do not count towards a sample. */ }
      }
      try {
        const media = await this.images.latestMedia(ad.brandId, ad.id);
        if (media) {
          retained.push({ adId: ad.id, brandId: ad.brandId, nativeId: ad.providerAdId!, status: "stored", mediaKind: media.kind, mediaId: media.mediaId, mediaSha256: media.sha256, imageCount: media.images.length });
          seen.add(ad.providerAdId!);
        }
      } catch { /* Retained image bytes must also pass integrity checks. */ }
    }
    return retained;
  }
  async status(): Promise<SmokeStatus> {
    const readiness = await this.readiness();
    const ads = candidateAds(this.db);
    const retained = await this.retainedCreatives();
    return { hosted: readiness.hosted, configured: !readiness.errors.length, configurationErrors: readiness.errors, model: process.env.GEMINI_VIDEO_MODEL || DEFAULT_GEMINI_VIDEO_MODEL, concurrency: this.concurrency, candidateCount: ads.length || source.ads.length, storedCount: retained.length, storedCounts: formatCounts(retained), minSampleSize: GEMINI_SMOKE_MIN_SAMPLE, targetSampleSize: GEMINI_SMOKE_TARGET, run: this.active() || this.latest() };
  }
  async creatives() {
    const items = await this.retainedCreatives();
    return { defaultVideoMode: "static-high-fps-hook" as const, creatives: items.map(({ brandId, adId, nativeId, mediaKind, imageCount, durationSeconds }) => ({ brandId, adId, nativeId, mediaKind, ...(imageCount ? { imageCount } : {}), ...(durationSeconds ? { durationSeconds } : {}) })) };
  }
  async testOne(brandId: string, adId: string, requestedMode: VideoProcessingMode = "static-high-fps-hook", options: Partial<InferenceSettings> = {}) {
    if (!["agentic", "static-high-fps-hook"].includes(requestedMode)) throw new SmokeRequestError("Choose Static or explicitly select Agentic preview.", 400);
    const settings = inferenceSettings(options, requestedMode);
    const ready = await this.readiness();
    if (!ready.hosted || ready.errors.length) throw new SmokeRequestError(ready.errors.join(" ") || "Run this diagnostic in the deployed Render app.");
    const selected = (await this.retainedCreatives()).find(item => item.brandId === brandId && item.adId === adId);
    if (!selected) throw new SmokeRequestError("The selected creative is not retained and verified in this workspace. Prepare it first.", 404);
    const active = this.active();
    if (active) {
      if (active.kind === "diagnostic" && active.requestedMode === requestedMode && active.mediaResolution === settings.mediaResolution && active.generationSeed === settings.generationSeed && active.items.length === 1 && active.items[0].brandId === brandId && active.items[0].adId === adId) return active;
      throw new SmokeRequestError("Another test or preparation is active. Wait for it to finish before testing one ad.");
    }
    const run: SmokeRun = { id: randomUUID(), kind: "diagnostic", status: "queued", requestedMode, ...settings, createdAt: now(), updatedAt: now(), sampleSize: 1, sampleCounts: formatCounts([selected]), targetSampleSize: 1, minimumSampleSize: 1, items: [selected] };
    this.save(run); this.launch(run); return structuredClone(run);
  }
  async start(kind: "prepare" | "smoke", requestedMode: VideoProcessingMode = "static-high-fps-hook", options: Partial<InferenceSettings> & { refreshFailed?: boolean } = {}) {
    if (!["agentic", "static-high-fps-hook"].includes(requestedMode)) throw new SmokeRequestError("Choose agentic or static video processing.", 400);
    const settings = inferenceSettings(options, requestedMode, kind === "prepare");
    const current = this.active();
    if (current) return current;
    const ready = await this.readiness();
    if (!ready.hosted) throw new SmokeRequestError("Run this action in the deployed Render app.", 409);
    if (kind === "smoke" && ready.errors.length) throw new SmokeRequestError(ready.errors.join(" "), 409);
    const alreadyStarted = this.active();
    if (alreadyStarted) return alreadyStarted;
    ensureValentteCase(this.db);
    let items: SmokeItem[];
    if (kind === "smoke") {
      const retained = await this.retainedCreatives();
      if (retained.length < GEMINI_SMOKE_MIN_SAMPLE)
        throw new SmokeRequestError(`Only ${retained.length} verified Valentte creatives are stored. Prepare at least ${GEMINI_SMOKE_MIN_SAMPLE} before starting inference.`, 409);
      items = retained;
    } else {
      const priorRow = this.db.prepare("SELECT data FROM gemini_smoke_runs WHERE json_extract(data,'$.kind')='prepare' ORDER BY created_at DESC,rowid DESC LIMIT 1").get() as { data: string } | undefined;
      const previous = priorRow ? JSON.parse(priorRow.data) as SmokeRun : null;
      const priorItems = new Map(previous?.items.map(item => [item.nativeId, item]) || []);
      items = candidateAds(this.db).map(ad => {
        const prior = priorItems.get(ad.providerAdId!);
        const history = prior?.preparationAttempts || (prior?.error ? [{ at: previous!.updatedAt, source: "snapshot" as const, errorCode: prior.errorCode, error: prior.error, ...(prior.sourceHttpStatus ? { httpStatus: prior.sourceHttpStatus } : {}) }] : []);
        return { adId: ad.id, brandId: ad.brandId, nativeId: ad.providerAdId!, status: "pending", mediaKind: prior?.mediaKind || (ad.format === "Static image" ? "image" : ad.format === "Video" ? "video" : "unknown"), ...(history.length ? { preparationAttempts: history.slice(-20) } : {}) };
      });
    }
    // Retained-media checks await disk reads. Recheck before claiming the active slot.
    const racingRun = this.active();
    if (racingRun) return racingRun;
    const run: SmokeRun = { id: randomUUID(), kind, status: "queued", requestedMode, ...settings, createdAt: now(), updatedAt: now(), sampleSize: kind === "smoke" ? items.length : 0, sampleCounts: kind === "smoke" ? formatCounts(items) : { video: 0, image: 0, carousel: 0 }, targetSampleSize: GEMINI_SMOKE_TARGET, minimumSampleSize: GEMINI_SMOKE_MIN_SAMPLE, ...(options.refreshFailed ? { refreshFailed: true } : {}), items };
    this.save(run);
    this.launch(run);
    return structuredClone(run);
  }
  async resume(id: string, requestedMode: VideoProcessingMode = "static-high-fps-hook", options: Partial<InferenceSettings> = {}) {
    let run = this.run(id);
    if (!run) throw new SmokeRequestError("Gemini smoke test not found.", 404);
    if (!["agentic", "static-high-fps-hook"].includes(requestedMode)) throw new SmokeRequestError("Choose Static or explicitly select Agentic preview.", 400);
    const settings = inferenceSettings({ ...options, generationSeed: run.generationSeed }, requestedMode, run.kind === "prepare");
    if (run.kind !== "prepare" && (run.mediaResolution ?? "default") !== settings.mediaResolution)
      throw new SmokeRequestError("This saved run uses a different media resolution. Select its recorded resolution to resume, or start a new comparison run.");
    if (run.kind !== "prepare" && run.requestedMode !== requestedMode)
      throw new SmokeRequestError("This saved run uses a different video mode. Select its recorded mode explicitly to resume it, or start a new Static test; earlier paid results will not be relabelled.");
    if (!["paused", "interrupted"].includes(run.status)) throw new SmokeRequestError("Only a paused or interrupted run can be resumed.");
    const active = this.active();
    if (active && active.id !== id) throw new SmokeRequestError("Another Gemini smoke run is already active.");
    const ready = await this.readiness();
    if (!ready.hosted || run.kind !== "prepare" && ready.errors.length) throw new SmokeRequestError(ready.errors.join(" ") || "Run this action in Render.");
    // Read again after the awaited preflight: concurrent resume requests must not
    // launch two stale copies of the same billable batch.
    const fresh = this.run(id);
    if (!fresh) throw new SmokeRequestError("Gemini smoke test not found.", 404);
    if (ACTIVE.has(fresh.status)) return fresh;
    if (!["paused", "interrupted"].includes(fresh.status)) throw new SmokeRequestError("This run has already finished or resumed.");
    const otherActive = this.active();
    if (otherActive && otherActive.id !== id) throw new SmokeRequestError("Another Gemini smoke run is already active.");
    run = fresh;
    if (run.kind !== "prepare" && run.requestedMode !== requestedMode) throw new SmokeRequestError("The saved run mode changed. Refresh its status before resuming.");
    if (run.kind !== "prepare" && (run.mediaResolution ?? "default") !== settings.mediaResolution) throw new SmokeRequestError("The saved resolution changed. Refresh its status before resuming.");
    if (run.kind === "prepare") run.requestedMode = requestedMode;
    run.mediaResolution = settings.mediaResolution; run.generationSeed ??= settings.generationSeed;
    if (run.kind === "smoke" && run.sampleSize === undefined) {
      // Legacy runs had no fixed sample metadata and sometimes retained all
      // preparation candidates. Resume only their retained or already-paid set.
      const selected = run.items.filter(item => ["stored", "complete", "analysing", "interrupted"].includes(item.status) || item.jobId || item.analysisId);
      if (selected.length < GEMINI_SMOKE_MIN_SAMPLE) throw new SmokeRequestError("Prepare at least 10 retained inputs, then start a new smoke test.");
      run.items = selected.slice(0, GEMINI_SMOKE_TARGET);
      run.sampleSize = run.items.length; run.sampleCounts = formatCounts(run.items);
      run.targetSampleSize = GEMINI_SMOKE_TARGET; run.minimumSampleSize = GEMINI_SMOKE_MIN_SAMPLE;
    }
    run.status = "queued"; delete run.finishedAt; delete run.message;
    this.save(run); this.launch(run); return structuredClone(run);
  }
  private launch(run: SmokeRun) {
    this.running = this.running.then(() => this.execute(run)).catch(() => {
      run.status = "failed"; run.finishedAt = now(); run.message = "The hosted test could not finish. Saved media, costs and prior outputs were retained."; this.save(run);
    });
  }
  async idle() { await this.running; }
  private preparationFailure(item: SmokeItem, cause: unknown, origin: SmokePreparationAttempt["source"]) {
    const known = cause instanceof SmokeSourceError || cause instanceof MediaStorageError;
    const errorCode = known ? cause.code : "media_unavailable";
    const error = known ? cause.message : "The source creative could not be retained. No inference was started for it.";
    const httpStatus = known ? cause.sourceHttpStatus : undefined;
    item.errorCode = errorCode; item.error = error;
    if (httpStatus !== undefined) item.sourceHttpStatus = httpStatus; else delete item.sourceHttpStatus;
    item.failureCategory = errorCode === "media_expired" || errorCode === "source_expired"
      ? item.mediaKind === "video" ? "expired_video_link" : "expired_media_link"
      : httpStatus === 401 || httpStatus === 403 || ["source_restricted", "source_forbidden", "source_authentication"].includes(errorCode)
        ? "blocked_restricted" : "other";
    this.preparationAttempt(item, { at: now(), source: origin, errorCode, error, ...(httpStatus ? { httpStatus } : {}) });
  }
  private preparationAttempt(item: SmokeItem, attempt: SmokePreparationAttempt) {
    item.preparationAttempts = [...(item.preparationAttempts || []), attempt].slice(-20);
  }
  private retainedItem(item: SmokeItem, media: { mediaId: string; sha256: string }, kind: "video" | "image" | "carousel", origin: SmokePreparationAttempt["source"]) {
    item.mediaId = media.mediaId; item.mediaSha256 = media.sha256; item.mediaKind = kind; item.status = "stored";
    delete item.error; delete item.errorCode; delete item.sourceHttpStatus; delete item.failureCategory;
    this.preparationAttempt(item, { at: now(), source: origin });
  }
  private async prepare(run: SmokeRun): Promise<void> {
    run.status = "preparing";
    run.message = `Checking all ${run.items.length} candidates until ${GEMINI_SMOKE_TARGET} playable creatives are retained. Images and carousels are valid inputs.`;
    this.save(run);
    const source = (this.options.sourceFactory || (ids => new PublicValentteVideoSource(ids)))(new Set(run.items.map(item => item.nativeId)));
    const retained = () => run.items.filter(item => item.status === "stored");
    try {
      for (const item of run.items) {
        if (retained().length >= GEMINI_SMOKE_TARGET) break;
        if (item.status === "stored") continue;
        if (item.status !== "pending") continue;
        item.status = "preparing"; this.save(run);
        let local = false;
        try {
          // Reuse retained inputs even if their signed source links have expired.
          const ad = this.video.ad(item.brandId, item.adId);
          try {
            const media = await this.video.storeMedia(item.brandId, item.adId);
            this.retainedItem(item, media, "video", "stored"); local = true;
          } catch (error) {
            if (ad.videoMediaId) this.preparationFailure(item, error, "stored");
          }
          if (!local) {
            const image = await this.images.latestMedia(item.brandId, item.adId);
            if (image) { this.retainedItem(item, image, image.kind, "stored"); item.imageCount = image.images.length; local = true; }
          }
        } catch (error) { this.preparationFailure(item, error, "stored"); }
        if (!local) {
          const resolveAndStore = async (refresh: boolean) => {
            const origin = refresh ? "refreshed_snapshot" : "snapshot";
            try {
              const creative = source.resolveCreative
                ? await source.resolveCreative(item.nativeId, { refresh })
                : await source.resolve(item.nativeId, { refresh }).then(videoUrl => videoUrl
                  ? { kind: "video" as const, videoUrl }
                  : { kind: "unknown" as const, reason: "No verified creative media URL was exposed by this ad snapshot." });
              if (creative.kind === "video") {
                item.mediaKind = "video";
                const media = await this.video.storeMedia(item.brandId, item.adId, creative.videoUrl);
                this.retainedItem(item, media, "video", origin);
              } else if (creative.kind === "image" || creative.kind === "carousel") {
                item.mediaKind = creative.kind;
                const media = await this.images.storeMedia(item.brandId, item.adId, creative.imageUrls, creative.kind);
                this.retainedItem(item, media, creative.kind, origin);
                item.imageCount = media.images.length;
              } else {
                if ("candidateKind" in creative && creative.candidateKind) item.mediaKind = creative.candidateKind;
                throw new SmokeSourceError("source_media_unavailable", creative.reason);
              }
              return true;
            } catch (error) { this.preparationFailure(item, error, origin); return false; }
          };
          const refreshed = run.refreshFailed === true;
          let stored = await resolveAndStore(refreshed);
          // One bounded fresh-snapshot retry bypasses a stale URL or initial library page.
          if (!stored && !refreshed && item.errorCode !== "browser_unavailable") stored = await resolveAndStore(true);
          if (!stored) item.status = item.mediaKind === "image" || item.mediaKind === "carousel" ? "unavailable" : "failed";
        }
        run.sampleSize = retained().length; run.sampleCounts = formatCounts(retained());
        this.save(run);
      }
    } finally { await source.close().catch(() => {}); }
    run.sampleSize = retained().length; run.sampleCounts = formatCounts(retained());
    run.status = run.sampleSize >= GEMINI_SMOKE_MIN_SAMPLE ? "complete" : "failed";
    run.finishedAt = now();
    const tried = run.items.filter(item => item.status !== "pending").length;
    const counts = run.sampleCounts;
    run.message = `Retained ${run.sampleSize} of ${GEMINI_SMOKE_TARGET} target creatives (${counts.video} videos, ${counts.image} images, ${counts.carousel} carousels), after checking ${tried}/${run.items.length} candidates. ` +
      (run.sampleSize >= GEMINI_SMOKE_MIN_SAMPLE
        ? `You can run this ${run.sampleSize}-ad sample now. ${run.sampleSize < GEMINI_SMOKE_TARGET ? "This is a partial sample. " : ""}Unresolved sources remain listed; refresh their media links to try again.`
        : `At least ${GEMINI_SMOKE_MIN_SAMPLE} retained inputs are required. Refresh unavailable media links or retain current source media before retrying.`) +
      " No Gemini inference was started during preparation.";
    this.save(run);
  }
  private applyAccounting(item: SmokeItem, attempts: { accounting?: VideoAnalysisAccounting }[]) {
    const parts = attempts.flatMap(attempt => {
      if (!attempt.accounting || attempt.accounting.requestAttempts === 0) return [];
      const { rawResponse: _raw, ...summary } = attempt.accounting;
      return [summary];
    });
    item.accounting = parts;
    Object.assign(item, accountingSummary(parts));
  }
  private finishItem(item: SmokeItem, analysisId: string, attempts: { accounting?: VideoAnalysisAccounting }[]) {
    const analysis = this.video.history(item.brandId, item.adId).find(value => value.id === analysisId);
    if (!analysis) { item.status = "failed"; item.error = "The saved analysis could not be found."; return; }
    delete item.error; delete item.errorCode;
    delete item.geminiDiagnostic;
    item.status = "complete"; item.analysisId = analysisId; item.model = analysis.model; item.processingMode = analysis.processingMode;
    item.requestedModel = analysis.requestedModel; item.servedModel = analysis.servedModel;
    item.generation = analysis.generation; item.sampling = analysis.sampling; item.normalization = analysis.normalization;
    this.applyAccounting(item, attempts);
    if (!item.accounting?.length && analysis.accounting) this.applyAccounting(item, [{ accounting: analysis.accounting }]);
  }
  private finishImageItem(item: SmokeItem, result: ReturnType<ImageAnalysisService["history"]>[number]) {
    item.status = "complete"; item.analysisId = result.id; item.model = result.model; item.processingMode = result.processingMode;
    item.requestedModel = result.requestedModel; item.servedModel = result.servedModel; item.generation = result.generation;
    delete item.error; delete item.errorCode;
    delete item.geminiDiagnostic;
    this.applyAccounting(item, [{ accounting: result.accounting }]);
  }
  private inferenceFailure(item: SmokeItem, code: string, message: string, accounting?: VideoAnalysisAccounting, diagnostic?: GeminiDiagnostic) {
    if (accounting) this.applyAccounting(item, [{ accounting }]);
    item.errorCode = code; item.error = message;
    if (diagnostic) item.geminiDiagnostic = diagnostic;
    if (code === "budget_paused") {
      const possiblyCharged = item.accounting?.some(part => part.requestAttempts > (part.rejectedAttempts || 0));
      item.status = possiblyCharged ? "interrupted" : "stored";
      if (possiblyCharged) item.error = "Budget paused after an earlier provider attempt. Its cost accounting was retained; Resume will not replay this ad. Review the report before starting a new test.";
      return true;
    }
    item.status = code === "interrupted" ? "interrupted" : "failed";
    return false;
  }
  private async execute(run: SmokeRun) {
    if (run.kind === "prepare") { await this.prepare(run); return; }
    const sampleSize = run.sampleSize ?? run.items.length;
    const minimum = run.kind === "diagnostic" ? 1 : GEMINI_SMOKE_MIN_SAMPLE;
    if (sampleSize < minimum) throw new SmokeRequestError(`At least ${minimum} retained input${minimum === 1 ? " is" : "s are"} required before inference.`);
    run.status = "analysing";
    run.message = `Running Gemini on ${sampleSize} retained creatives. Each billable attempt reserves budget before calling the provider.`;
    this.save(run);
    while (true) {
      const batch = run.items.filter(item => item.status === "stored").slice(0, this.concurrency);
      if (!batch.length) break;
      const launched: SmokeItem[] = [];
      const imageCalls: Promise<void>[] = [];
      let paused = false;
      for (const item of batch) {
        item.status = "analysing"; item.model = process.env.GEMINI_VIDEO_MODEL || DEFAULT_GEMINI_VIDEO_MODEL;
        item.processingMode = item.mediaKind === "image" || item.mediaKind === "carousel" ? item.mediaKind : run.requestedMode;
        if (item.mediaKind === "image" || item.mediaKind === "carousel") {
          item.jobId = randomUUID(); this.save(run);
          imageCalls.push((async () => {
            try { this.finishImageItem(item, await this.images.analyse(item.brandId, item.adId, item.mediaId!, item.jobId, { mediaResolution: run.mediaResolution ?? "default", generationSeed: run.generationSeed })); }
            catch (error) {
              const known = error instanceof VideoProviderError;
              if (this.inferenceFailure(item, known ? error.code : "unavailable", known ? error.message : "Image inference could not finish; retained inputs and earlier results were preserved.", known ? error.accounting : undefined, known ? error.diagnostic : undefined)) paused = true;
            }
            this.save(run);
          })());
          continue;
        }
        this.save(run);
        try {
          const job = this.video.enqueue({ brandId: item.brandId, adId: item.adId, provider: "gemini", processingMode: run.requestedMode, mediaResolution: run.mediaResolution ?? "default", generationSeed: run.generationSeed, force: true });
          item.jobId = job.id; launched.push(item);
        } catch (error) {
          if (this.inferenceFailure(item, error instanceof VideoProviderError ? error.code : "unavailable", error instanceof VideoProviderError ? error.message : "The video analysis could not be queued; no provider response is available.", error instanceof VideoProviderError ? error.accounting : undefined, error instanceof VideoProviderError ? error.diagnostic : undefined)) paused = true;
        }
        this.save(run);
      }
      await Promise.all([this.video.idle(), ...imageCalls]);
      for (const item of launched) {
        const job = this.video.job(item.brandId, item.jobId!);
        if (job) { item.model = job.model; item.processingMode = job.attempts.at(-1)?.processingMode || job.requestedMode; }
        if (!job) { item.status = "failed"; item.error = "The durable video job could not be found."; continue; }
        if (job.status === "complete" && job.analysisId) this.finishItem(item, job.analysisId, job.attempts);
        else {
          this.applyAccounting(item, job.attempts);
          if (this.inferenceFailure(item, job.errorCode || "unavailable", job.error || "Gemini did not produce a validated output.", undefined, job.geminiDiagnostic)) paused = true;
        }
        this.save(run);
      }
      if (paused) { run.status = "paused"; run.message = "Inference budget paused this run. Increase the cap in Budgets, then Resume to continue pending ads; completed outputs and reserved charges are retained."; this.save(run); return; }
    }
    run.status = "complete"; run.finishedAt = now();
    const complete = run.items.filter(item => item.status === "complete").length;
    const counts = run.sampleCounts || formatCounts(run.items);
    const fullVideoGate = run.kind === "smoke" && counts.video === GEMINI_SMOKE_TARGET && complete >= 24;
    run.message = `${run.kind === "diagnostic" ? "One-ad diagnostic: " : ""}${complete}/${sampleSize} creatives analysed (${counts.video} videos, ${counts.image} images, ${counts.carousel} carousels in the sample). ` +
      (fullVideoGate ? "The 24/25 video success target is met; review costs and outputs in the report." : "This sample is exploratory and does not establish the original 25-video Phase 1 acceptance target.");
    this.save(run);
  }
  report(id: string): string {
    const run = this.run(id);
    if (!run) throw new SmokeRequestError("Gemini smoke test not found.", 404);
    const successes = run.items.filter(item => item.status === "complete");
    const failures = run.items.filter(item => item.status === "failed" || item.status === "interrupted");
    const unavailable = run.items.filter(item => item.status === "unavailable");
    const stored = run.items.filter(item => item.status === "stored");
    const legacyInputs = run.items.filter(item => ["stored", "complete", "analysing", "interrupted"].includes(item.status) || item.jobId || item.analysisId);
    const sampleSize = run.sampleSize ?? (run.kind === "prepare" ? stored.length : legacyInputs.length);
    const counts = run.sampleCounts || formatCounts(run.kind === "prepare" ? stored : run.sampleSize === undefined ? legacyInputs : run.items);
    const knownCostItems = run.items.filter(item => typeof item.estimatedCostGbp === "number");
    const costs = knownCostItems.reduce((total,item) => total + item.estimatedCostGbp!,0);
    const costAmount = (item: SmokeItem, field: "reservedCostGbp" | "tokenCostGbp" | "billedCostGbp" | "initialReservedCostGbp") => {
      if (typeof item[field] === "number") return item[field];
      const parts = (item.accounting || []).filter(part => field !== "tokenCostGbp" || part.requestAttempts > (part.rejectedAttempts || 0));
      return parts.length && parts.every(part => typeof part[field] === "number") ? parts.reduce((sum, part) => sum + part[field]!, 0) : null;
    };
    const costTotal = (field: "reservedCostGbp" | "tokenCostGbp" | "billedCostGbp" | "initialReservedCostGbp") => {
      const values = run.items.map(item => costAmount(item, field));
      const known = values.filter((value): value is number => typeof value === "number");
      return { amount: known.length ? known.reduce((a,b) => a+b, 0) : null, known: known.length };
    };
    const reserved = costTotal("reservedCostGbp"), estimatedTokens = costTotal("tokenCostGbp"), billed = costTotal("billedCostGbp"), initialReserved = costTotal("initialReservedCostGbp");
    const tokens = successes.filter(item => item.usage?.totalTokens !== null && item.usage?.totalTokens !== undefined);
    const totalTokens = tokens.reduce((total,item) => total + item.usage!.totalTokens!,0);
    const videoSuccesses = successes.filter(item => !item.mediaKind || item.mediaKind === "video").length;
    const fullVideoGate = run.kind === "smoke" && counts.video === GEMINI_SMOKE_TARGET && videoSuccesses >= 24;
    const money = (value: number | null | undefined) => typeof value === "number" ? `£${value.toFixed(6)}` : "unavailable";
    const safe = (value: string) => value.replace(/[|\r\n]/g, " ");
    const category = (item: SmokeItem) => item.failureCategory === "expired_video_link" ? "Expired or removed video link"
      : item.failureCategory === "expired_media_link" ? "Expired or removed media/source link"
      : item.failureCategory === "blocked_restricted" ? "Blocked/restricted" : item.failureCategory === "other" ? "Other" : "none";
    const mediaLabel = (item: SmokeItem) => item.mediaKind || (item.mediaId || item.jobId || item.analysisId ? "video (historical)" : "unknown (historical)");
    const analyses = new Map(run.items.filter(item => item.analysisId).map(item => {
      const history = item.mediaKind === "image" || item.mediaKind === "carousel" ? this.images.history(item.brandId, item.adId) : this.video.history(item.brandId, item.adId);
      return [item.analysisId!, history.find(value => value.id === item.analysisId)] as const;
    }));
    const dimensions = (width: number | null | undefined, height: number | null | undefined) => width && height ? `${width} × ${height}` : "unavailable";
    const modelRows = run.items.map(item => {
      const analysis = item.analysisId ? analyses.get(item.analysisId) : undefined;
      const generation = item.generation || analysis?.generation;
      const videoAnalysis = analysis && "coverage" in analysis ? analysis : undefined;
      const sampling = item.sampling || videoAnalysis?.sampling;
      const normalization = item.normalization || videoAnalysis?.normalization;
      const pricing = item.accounting?.flatMap(part => part.pricing?.model ? [part.pricing.model] : []) || [];
      const pricingReasons = item.accounting?.flatMap(part => part.pricingReason ? [part.pricingReason] : []) || [];
      return `| ${safe(item.nativeId)} | ${safe(item.requestedModel || analysis?.requestedModel || "unrecorded (historical)")} | ${safe(item.servedModel || analysis?.servedModel || "unrecorded (historical)")} | ${safe([...new Set(pricing)].join(", ") || "unbound / unavailable")} | ${generation ? `${generation.temperature}; ${generation.seedRequested} (${generation.seedApplied ? "applied" : "not supported / not applied"})` : "unavailable (historical)"} | ${generation ? `${generation.mediaResolutionRequested}${generation.providerMediaResolution ? `; reported ${safe(generation.providerMediaResolution)}` : "; provider resolution not reported"}` : "unavailable (historical)"} | ${normalization ? `${dimensions(normalization.originalWidth, normalization.originalHeight)} → ${dimensions(normalization.uploadWidth, normalization.uploadHeight)}` : "unavailable"} | ${sampling?.requestedFps.join(", ") || "unavailable"} | ${sampling?.estimatedFrames ?? "unavailable"} (estimated) | ${sampling?.actualFrames ?? "not reported"} | ${sampling?.videoInputTokens ?? "unavailable"} | ${safe([...new Set(pricingReasons)].join("; "))} |`;
    });
    const taxonomyRows = successes.map(item => {
      const analysis = item.analysisId ? analyses.get(item.analysisId) : undefined;
      const fields = analysis?.fields;
      const audio = fields && "audio_type" in fields ? fields.audio_type?.value : undefined;
      const lyrics = fields && "music_lyrics_present" in fields ? fields.music_lyrics_present?.value : undefined;
      const licence = fields && "has_licensed_music_lyrics" in fields ? fields.has_licensed_music_lyrics?.value : undefined;
      const claims = fields?.keyClaims.map(claim => `${claim.value}: ${(claim.claim_type || []).join(", ") || "historical / untagged"}${claim.may_need_substantiation_asa ? " — may need substantiation (ASA)" : ""}`).join("; ");
      return `| ${safe(item.nativeId)} | ${safe(String(fields?.format.value ?? "unavailable"))} | ${safe(String(fields?.hook_type?.value ?? "historical / unavailable"))} | ${safe(String(fields?.angle.value ?? "unavailable"))} | ${safe(String(fields?.offer_type?.value ?? "historical / unavailable"))} | ${safe(String(audio ?? (item.mediaKind === "image" || item.mediaKind === "carousel" ? "not applicable" : "historical / unavailable")))} | ${lyrics ?? "unknown"} | ${licence ?? "unknown"} | ${safe(claims || "none recorded")} |`;
    });
    const exploratory = counts.video !== GEMINI_SMOKE_TARGET || sampleSize !== GEMINI_SMOKE_TARGET;
    const sections = [
      "# Gemini live report", "", `Run: ${run.id}`, `Created: ${run.createdAt}`, `Updated: ${run.updatedAt}`,
      `Execution: Render web service; ${run.kind === "prepare" ? "media preparation only" : run.kind === "diagnostic" ? "one-ad diagnostic inference" : "live Gemini inference"}.`, `Status: ${run.status}`,
      `Requested video processing mode: ${run.requestedMode}. Image and carousel ads use native image input, independent of the video mode.`, "",
      `Requested media resolution: ${run.mediaResolution ?? "unrecorded (historical)"}. Generation temperature: ${run.generationSeed === undefined ? "unrecorded (historical)" : "0"}. Fixed seed: ${run.generationSeed ?? "unrecorded (historical)"} where supported. A seed reduces variation but does not guarantee identical provider responses.`,
      `Current creative taxonomy: ${CREATIVE_TAXONOMY_VERSION}; see research/LABELLING-GUIDE.md. Historical outputs retain their original prompt and vocabulary; a new deployment does not relabel earlier results.`,
      `Actual ${run.kind === "prepare" ? "retained input" : "sample"} size: ${sampleSize} ads — ${counts.video} videos, ${counts.image} static images, ${counts.carousel} carousels. Each carousel counts as one ad; every retained slide is supplied to Gemini.`,
      `Preparation target: ${GEMINI_SMOKE_TARGET} creatives. Minimum batch sample: ${GEMINI_SMOKE_MIN_SAMPLE}; one-ad diagnostics require only the selected retained creative. ${run.kind === "diagnostic" ? "This run tests exactly one ad and is not a batch or accuracy benchmark." : exploratory ? "This is an exploratory partial or mixed-media sample; it is not the original 25-video acceptance set." : "This sample contains the full 25-video target."}`,
      `Successful outputs: ${successes.length}/${sampleSize}. Failed/interrupted ads: ${failures.length}. Source-unavailable image/carousel ads: ${unavailable.length} (not format failures). Pending/stored ads: ${run.items.filter(item => ["pending", "preparing", "stored", "analysing"].includes(item.status)).length}.`,
      `Original Phase 1 video success acceptance: ${fullVideoGate ? "met (at least 24/25 videos)" : "not established by this run"}.`,
      `Known estimated total cost, including reserved failed attempts: ${knownCostItems.length ? money(costs) : "unavailable"} (${knownCostItems.length}/${run.kind !== "prepare" ? sampleSize : 0} ads with complete cost accounting).`,
      `Outstanding reserved budget: ${money(reserved.amount)} (${reserved.known}/${sampleSize} ads with reservation accounting). Original holds created: ${money(initialReserved.amount)}. Reservations are not charges.`,
      `Token-based estimated processing cost: ${money(estimatedTokens.amount)} (${estimatedTokens.known}/${sampleSize} ads with a known token estimate). This is calculated from usage and configured prices, not a provider invoice.`,
      `Actually billed by Google: ${billed.known === sampleSize && sampleSize > 0 ? money(billed.amount) : "unavailable — no provider billing/invoice feed is connected"}. Missing billed amounts remain unavailable; they are never filled with the reservation or token estimate.`,
      `Average known estimated cost per attempted ad: ${knownCostItems.length ? money(costs/knownCostItems.length) : "unavailable"}.`,
      `Average total tokens per successful ad with complete usage: ${tokens.length ? (totalTokens/tokens.length).toFixed(1) : "unavailable"} (${tokens.length}/${successes.length} outputs).`,
      "A logical request reuses its budget reservation when Google explicitly rejects a retryable request with 5xx. A final confirmed rejection releases that hold; ambiguous timeouts retain their hold and require a new reservation before another dispatch. Historical unknown holds are not automatically cleared. Estimates are not invoices. Incomplete accounting gives a known subtotal. Per-ad tokens remain unavailable if any retry has unknown usage.",
      "A missing media URL does not prove expiration. HTTP 403 means blocked/forbidden; HTTP 410 means expired or removed. Images and carousels are valid creative types and do not count as failures merely because they are not video.", "", run.message || "", "",
      "Confidence scores are uncalibrated model self-assessments, not accuracy probabilities. New outputs are not filtered by confidence. Calibrate against human labels before using a threshold; historical outputs may already reflect an earlier threshold.",
      "New v2 spoken transcripts exclude sung lyrics and background music; historical transcripts remain unchanged. Lyric presence is separate from licensing: a music licence cannot be determined from audio alone. Comparative and superlative claim tags mark claims that may need substantiation (ASA); this is a review cue, not a legal finding.", "",
      "## Per-ad results", "", "| Ad ID | Format | Status | Model | Actual mode | Input tokens | Output tokens | Total tokens | Reserved GBP | Token estimate GBP | Actually billed GBP | Estimated exposure GBP | Source/failure category | Reason / HTTP |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...run.items.map(item => `| ${safe(item.nativeId)} | ${mediaLabel(item)}${item.imageCount ? ` (${item.imageCount} images)` : ""} | ${item.status} | ${safe(item.model || "unavailable")} | ${run.kind === "prepare" ? "no inference" : item.processingMode || run.requestedMode} | ${item.usage?.inputTokens ?? "unavailable"} | ${item.usage?.outputTokens ?? "unavailable"} | ${item.usage?.totalTokens ?? "unavailable"} | ${money(costAmount(item,"reservedCostGbp"))} | ${money(costAmount(item,"tokenCostGbp"))} | ${money(costAmount(item,"billedCostGbp"))} | ${money(item.estimatedCostGbp)} | ${category(item)} | ${safe(item.error || "")}${item.sourceHttpStatus ? ` (HTTP ${item.sourceHttpStatus})` : ""} |`),
      "", "## Model, pricing and sampling audit", "",
      "Default omits the provider resolution override; it does not assert a particular pixel or token budget. Low explicitly requests MEDIA_RESOLUTION_LOW. Pixel dimensions describe the retained source and normalized upload, not Gemini's internal frame resolution. Scheduled frames are estimated from duration and requested FPS; actual sampled frames stay unknown unless the provider explicitly returns a count. Video input tokens are the VIDEO modality count where returned, not total input tokens divided by a guessed per-frame rate.", "",
      "| Ad ID | Requested model | Served model / revision | Priced model | Temperature; seed | Resolution request | Source → upload pixels | Requested FPS | Scheduled frames | Actual provider frames | Video input tokens | Pricing note |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...modelRows,
      "", "## Creative taxonomy and audio audit", "",
      "The creative format below uses the guide vocabulary; the per-ad results table records the media container (video, image or carousel). Free-text explanations, boolean tags and evidence remain in the full saved outputs.", "",
      "| Ad ID | Creative format | Hook type | Angle | Offer type | Audio type | Lyrics present | Licensed music lyrics | Claim types / review flags |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |", ...taxonomyRows,
      "", "## Sanitised Gemini diagnostics", "", "Provider messages are retained for debugging with credentials and sensitive URL values redacted. No raw request headers are logged.",
      ...run.items.filter(item => item.geminiDiagnostic).flatMap(item => ["", `### Gemini error for ad ${safe(item.nativeId)}`, "", "```json", JSON.stringify(item.geminiDiagnostic,null,2), "```"]),
      "", "## Source preparation attempts", "", "Prior errors remain recorded when a fresh snapshot later succeeds. Signed source URLs are never included.",
      ...run.items.filter(item => item.preparationAttempts?.length).flatMap(item => ["", `### Source ad ${safe(item.nativeId)}`, ...item.preparationAttempts!.map(attempt => `- ${attempt.at}: ${attempt.source}; ${attempt.errorCode ? `${safe(attempt.errorCode)} — ${safe(attempt.error || "source unavailable")}${attempt.httpStatus ? ` (HTTP ${attempt.httpStatus})` : ""}` : "retained successfully"}.`)]),
      "", "## Full sample outputs", "", `Up to five saved outputs, including each available input format. No synthetic outputs are supplied. Raw responses remain in the authenticated persistent analysis history.`,
    ];
    const samples: SmokeItem[] = [];
    for (const kind of ["video", "image", "carousel"]) {
      const item = successes.find(value => (value.mediaKind || "video") === kind);
      if (item) samples.push(item);
    }
    for (const item of successes) if (samples.length < 5 && !samples.includes(item)) samples.push(item);
    for (const item of samples) {
      const analysis = analyses.get(item.analysisId!);
      sections.push("", `### Ad ${item.nativeId} (${item.mediaKind || "video"})`, "", "```json", JSON.stringify(analysis, null, 2), "```");
    }
    return sections.join("\n") + "\n";
  }
}
