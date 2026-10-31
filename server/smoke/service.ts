import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import source from "../../shared/cases/valentte-ads.json";
import caseData from "../../shared/cases/valentte.json";
import type { Ad, Brand } from "../../shared/types.js";
import { GEMINI_SMOKE_TARGET, type SmokeItem, type SmokeRun, type SmokeStatus } from "../../shared/gemini-smoke.js";
import { VIDEO_PROMPT_VERSION, type VideoAnalysisAccounting, type VideoProcessingMode } from "../../shared/video-analysis.js";
import { readJson } from "../db.js";
import { budgetStatus } from "../infrastructure/budget.js";
import { infrastructureDatabase } from "../infrastructure/database.js";
import { DEFAULT_GEMINI_VIDEO_MODEL } from "../video/gemini.js";
import { VideoAnalysisService } from "../video/service.js";
import { MediaStorageError } from "../video/media.js";
import { VideoProviderError } from "../video/types.js";
import { PublicValentteVideoSource, SmokeSourceError, VALENTTE_PAGE_ID, type SmokeVideoSource } from "./source.js";

const ACTIVE = new Set(["queued", "preparing", "analysing"]);
const now = () => new Date().toISOString();
export class SmokeRequestError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export interface SmokeOptions {
  sourceFactory?: (nativeIds: Set<string>) => SmokeVideoSource;
  /** Tests inject readiness; production always uses Render and budget checks. */
  readiness?: () => Promise<{ hosted: boolean; errors: string[] }>;
  concurrency?: number;
}
const isValentte = (brand: Brand) => brand.name.toLowerCase() === "valentte" && brand.domain.toLowerCase().replace(/^www\./, "") === "valentte.com";
function candidateAds(db: DatabaseSync): Ad[] {
  const brands = readJson<Brand>(db.prepare("SELECT data FROM brands").all()).filter(isValentte);
  if (!brands.length) return [];
  const ids = new Set(brands.map(brand => brand.id));
  const seen = new Set<string>();
  return readJson<Ad>(db.prepare("SELECT data FROM ads ORDER BY id").all()).filter(ad => {
    if (!ids.has(ad.brandId) || ad.source !== "public" || ad.advertiserPageId !== VALENTTE_PAGE_ID || !ad.providerAdId || !/^\d{5,30}$/.test(ad.providerAdId) || ad.format === "Static image" || seen.has(ad.providerAdId)) return false;
    seen.add(ad.providerAdId); return true;
  }).sort((a,b) => Number(Boolean(b.videoMediaId)) - Number(Boolean(a.videoMediaId)) || Number(b.format === "Video") - Number(a.format === "Video") || a.id.localeCompare(b.id));
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
  const sum = (key: "inputTokens" | "outputTokens" | "totalTokens") => parts.length && parts.every(part => part.requestAttempts <= 1 && part.usage[key] !== null) ? parts.reduce((total, part) => total + (part.usage[key] || 0), 0) : null;
  const knownCosts = parts.map(part => part.estimatedCostGbp).filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    usage: { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), totalTokens: sum("totalTokens") },
    estimatedCostGbp: parts.length && knownCosts.length === parts.length ? knownCosts.reduce((a,b) => a+b,0) : null,
    costBasis: parts.map(part => part.costBasis).filter((value,index,array) => array.indexOf(value) === index).join(", ") || "unavailable",
  };
}
export class GeminiSmokeService {
  readonly concurrency: number;
  private running: Promise<void> = Promise.resolve();
  constructor(readonly db: DatabaseSync, readonly video: VideoAnalysisService, private readonly options: SmokeOptions = {}) {
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
  async status(): Promise<SmokeStatus> {
    const readiness = await this.readiness();
    const ads = candidateAds(this.db);
    return { hosted: readiness.hosted, configured: !readiness.errors.length, configurationErrors: readiness.errors, model: process.env.GEMINI_VIDEO_MODEL || DEFAULT_GEMINI_VIDEO_MODEL, concurrency: this.concurrency, candidateCount: ads.length || source.ads.filter(ad => ad.format !== "Static image").length, storedCount: ads.filter(ad => Boolean(ad.videoMediaId)).length, run: this.active() || this.latest() };
  }
  async start(kind: "prepare" | "smoke", requestedMode: VideoProcessingMode = "agentic") {
    if (!["agentic", "static-high-fps-hook"].includes(requestedMode)) throw new SmokeRequestError("Choose agentic or static video processing.", 400);
    const current = this.active();
    if (current) return current;
    const ready = await this.readiness();
    if (!ready.hosted) throw new SmokeRequestError("Run this action in the deployed Render app.", 409);
    if (kind === "smoke" && ready.errors.length) throw new SmokeRequestError(ready.errors.join(" "), 409);
    const alreadyStarted = this.active();
    if (alreadyStarted) return alreadyStarted;
    ensureValentteCase(this.db);
    const ads = candidateAds(this.db);
    if (ads.length < GEMINI_SMOKE_TARGET) throw new SmokeRequestError(`Only ${ads.length} eligible public Valentte records are available; 25 videos are required.`, 409);
    const run: SmokeRun = { id: randomUUID(), kind, status: "queued", requestedMode, createdAt: now(), updatedAt: now(), items: ads.map(ad => ({ adId: ad.id, brandId: ad.brandId, nativeId: ad.providerAdId!, status: "pending" })) };
    this.save(run);
    this.launch(run);
    return structuredClone(run);
  }
  async resume(id: string) {
    let run = this.run(id);
    if (!run) throw new SmokeRequestError("Gemini smoke test not found.", 404);
    if (!["paused", "interrupted"].includes(run.status)) throw new SmokeRequestError("Only a paused or interrupted run can be resumed.");
    const active = this.active();
    if (active && active.id !== id) throw new SmokeRequestError("Another Gemini smoke run is already active.");
    const ready = await this.readiness();
    if (!ready.hosted || run.kind === "smoke" && ready.errors.length) throw new SmokeRequestError(ready.errors.join(" ") || "Run this action in Render.");
    // Read again after the awaited preflight: concurrent resume requests must not
    // launch two stale copies of the same billable batch.
    const fresh = this.run(id);
    if (!fresh) throw new SmokeRequestError("Gemini smoke test not found.", 404);
    if (ACTIVE.has(fresh.status)) return fresh;
    if (!["paused", "interrupted"].includes(fresh.status)) throw new SmokeRequestError("This run has already finished or resumed.");
    const otherActive = this.active();
    if (otherActive && otherActive.id !== id) throw new SmokeRequestError("Another Gemini smoke run is already active.");
    run = fresh;
    run.status = "queued"; delete run.finishedAt; delete run.message;
    this.save(run); this.launch(run); return structuredClone(run);
  }
  private launch(run: SmokeRun) {
    this.running = this.running.then(() => this.execute(run)).catch(() => {
      run.status = "failed"; run.finishedAt = now(); run.message = "The hosted test could not finish. Saved media, costs and prior outputs were retained."; this.save(run);
    });
  }
  async idle() { await this.running; }
  private async prepare(run: SmokeRun): Promise<boolean> {
    if (run.items.filter(item => ["stored", "complete", "analysing", "interrupted"].includes(item.status)).length >= GEMINI_SMOKE_TARGET) return true;
    run.status = "preparing"; run.message = "Retaining and verifying 25 source videos before any Gemini inference."; this.save(run);
    const source = (this.options.sourceFactory || (ids => new PublicValentteVideoSource(ids)))(new Set(run.items.map(item => item.nativeId)));
    try {
      for (const item of run.items) {
        if (item.status !== "pending") continue;
        item.status = "preparing"; this.save(run);
        try {
          let media;
          try { media = await this.video.storeMedia(item.brandId, item.adId); }
          catch (error) {
            if (!(error instanceof MediaStorageError)) throw error;
            const url = await source.resolve(item.nativeId);
            if (!url) throw new SmokeSourceError("video_not_available", "No verified public video was exposed for this ad. The stored source may be static, expired or restricted.");
            media = await this.video.storeMedia(item.brandId, item.adId, url);
          }
          item.mediaId = media.mediaId; item.mediaSha256 = media.sha256; item.status = "stored";
          delete item.error; delete item.errorCode;
        } catch (error) {
          item.status = "failed";
          item.errorCode = error instanceof SmokeSourceError || error instanceof MediaStorageError ? error.code : "media_unavailable";
          item.error = error instanceof SmokeSourceError || error instanceof MediaStorageError ? error.message : "This source video could not be retained. No inference was started for it.";
          // A challenge or missing browser affects the source, not just this ad. Stop cleanly.
          if (error instanceof SmokeSourceError && ["source_restricted", "browser_unavailable"].includes(error.code)) {
            this.save(run); break;
          }
        }
        this.save(run);
        if (run.items.filter(item => item.status === "stored" || item.status === "complete" || item.status === "interrupted").length >= GEMINI_SMOKE_TARGET) break;
      }
    } finally { await source.close(); }
    const stored = run.items.filter(item => ["stored", "complete", "interrupted"].includes(item.status));
    if (stored.length < GEMINI_SMOKE_TARGET) {
      run.status = "failed"; run.finishedAt = now();
      run.message = `Retained ${stored.length} of 25 required videos. No new Gemini inference was started. Some public media was unavailable; prepare again after refreshing source access or storing videos through the ad labelling screen.`;
      this.save(run); return false;
    }
    run.items = stored.slice(0, GEMINI_SMOKE_TARGET); this.save(run); return true;
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
    item.status = "complete"; item.analysisId = analysisId; item.model = analysis.model; item.processingMode = analysis.processingMode;
    this.applyAccounting(item, attempts);
    if (!item.accounting?.length && analysis.accounting) this.applyAccounting(item, [{ accounting: analysis.accounting }]);
  }
  private async execute(run: SmokeRun) {
    if (!await this.prepare(run)) return;
    if (run.kind === "prepare") { run.status = "complete"; run.finishedAt = now(); run.message = "25 verified Valentte videos are retained on the Render disk. No Gemini inference was started."; this.save(run); return; }
    run.status = "analysing"; run.message = "Running Gemini on the retained 25-video set. Each billable attempt reserves budget before calling the provider."; this.save(run);
    while (true) {
      const batch = run.items.filter(item => item.status === "stored").slice(0, this.concurrency);
      if (!batch.length) break;
      const launched: SmokeItem[] = [];
      let paused = false;
      for (const item of batch) {
        item.status = "analysing"; item.model = process.env.GEMINI_VIDEO_MODEL || DEFAULT_GEMINI_VIDEO_MODEL; item.processingMode = run.requestedMode; this.save(run);
        try {
          const job = this.video.enqueue({ brandId: item.brandId, adId: item.adId, provider: "gemini", processingMode: run.requestedMode, force: true });
          item.jobId = job.id; launched.push(item);
        } catch (error) {
          item.status = "failed";
          item.errorCode = error instanceof VideoProviderError ? error.code : "unavailable";
          item.error = error instanceof VideoProviderError ? error.message : "The video analysis could not be queued; no provider response is available.";
          if (item.errorCode === "budget_paused") { item.status = "stored"; paused = true; }
        }
        this.save(run);
      }
      await this.video.idle();
      for (const item of launched) {
        const job = this.video.job(item.brandId, item.jobId!);
        if (job) { item.model = job.model; item.processingMode = job.attempts.at(-1)?.processingMode || job.requestedMode; }
        if (!job) { item.status = "failed"; item.error = "The durable video job could not be found."; continue; }
        if (job.status === "complete" && job.analysisId) this.finishItem(item, job.analysisId, job.attempts);
        else {
          this.applyAccounting(item, job.attempts);
          item.errorCode = job.errorCode; item.error = job.error || "Gemini did not produce a validated output.";
          if (job.errorCode === "budget_paused") {
            const possiblyCharged = job.attempts.some(attempt => (attempt.accounting?.requestAttempts || 0) > 0);
            item.status = possiblyCharged ? "interrupted" : "stored";
            if (possiblyCharged) item.error = "Budget paused after an earlier provider attempt. Its cost accounting was retained; this ad will not be replayed on Resume. Review the report before starting a new test.";
            paused = true;
          }
          else item.status = job.status === "interrupted" ? "interrupted" : "failed";
        }
        this.save(run);
      }
      if (paused) { run.status = "paused"; run.message = "Inference budget paused this run. Increase the cap in Budgets, then Resume to continue pending ads; completed outputs and reserved charges are retained."; this.save(run); return; }
    }
    run.status = "complete"; run.finishedAt = now();
    const complete = run.items.filter(item => item.status === "complete").length;
    run.message = `${complete}/25 videos analysed. Phase 1 acceptance ${complete >= 24 ? "meets" : "does not meet"} the 24/25 success target; review the downloaded report.`;
    this.save(run);
  }
  report(id: string): string {
    const run = this.run(id);
    if (!run) throw new SmokeRequestError("Gemini smoke test not found.", 404);
    const successes = run.items.filter(item => item.status === "complete");
    const failures = run.items.filter(item => item.status === "failed" || item.status === "interrupted");
    const knownCostItems = run.items.filter(item => typeof item.estimatedCostGbp === "number");
    const costs = knownCostItems.reduce((total,item) => total + item.estimatedCostGbp!,0);
    const tokens = successes.filter(item => item.usage?.totalTokens !== null && item.usage?.totalTokens !== undefined);
    const totalTokens = tokens.reduce((total,item) => total + item.usage!.totalTokens!,0);
    const money = (value: number | null | undefined) => typeof value === "number" ? `£${value.toFixed(6)}` : "unavailable";
    const safe = (value: string) => value.replace(/[|\r\n]/g, " ");
    const sections = [
      "# Gemini live report", "", `Run: ${run.id}`, `Created: ${run.createdAt}`, `Updated: ${run.updatedAt}`, `Execution: Render web service; ${run.kind === "smoke" ? "live Gemini inference" : "media preparation only"}.`, `Status: ${run.status}`, `Requested processing mode: ${run.requestedMode}`, `Prompt version: ${VIDEO_PROMPT_VERSION}`, "",
      `Target: 25 retained Valentte videos. Successful outputs: ${successes.length}/25. Failed/interrupted ads: ${failures.length}. Pending/stored ads: ${run.items.filter(item => !["complete","failed","interrupted"].includes(item.status)).length}.`,
      `Phase 1 success acceptance: ${run.kind === "smoke" && successes.length >= 24 ? "met (at least 24/25)" : "not met"}.`,
      `Known estimated total cost, including reserved failed attempts: ${knownCostItems.length ? money(costs) : "unavailable"} (${knownCostItems.length}/${run.items.length} ads with complete cost accounting).`,
      `Average known estimated cost per attempted ad: ${knownCostItems.length ? money(costs/knownCostItems.length) : "unavailable"}.`,
      `Average total tokens per successful ad with complete usage: ${tokens.length ? (totalTokens/tokens.length).toFixed(1) : "unavailable"} (${tokens.length}/${successes.length} outputs).`,
      "Cost figures are estimates, not invoices. The ledger reserves conservatively before each paid attempt; failed requests and missing usage can retain the reserve. A total with incomplete accounting is only a known subtotal. Input/output prices are saved with each analysis. Per-ad tokens are unavailable if any retry has unknown usage; provider-reported final-response usage remains in the saved accounting.", "", run.message || "", "",
      "## Per-ad results", "", "| Ad ID | Status | Model | Mode | Input tokens | Output tokens | Total tokens | Estimated GBP | Basis | Failure reason |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...run.items.map(item => `| ${safe(item.nativeId)} | ${item.status} | ${safe(item.model || "unavailable")} | ${item.processingMode || run.requestedMode} | ${item.usage?.inputTokens ?? "unavailable"} | ${item.usage?.outputTokens ?? "unavailable"} | ${item.usage?.totalTokens ?? "unavailable"} | ${money(item.estimatedCostGbp)} | ${safe(item.costBasis || "unavailable")} | ${safe(item.error || "")} |`),
      "", "## Full sample outputs", "", `Up to five complete saved outputs (${Math.min(5,successes.length)} available). No synthetic outputs are supplied. Raw provider responses remain in authenticated analysis history on the persistent disk.`,
    ];
    for (const item of successes.slice(0,5)) {
      const analysis = this.video.history(item.brandId, item.adId).find(value => value.id === item.analysisId);
      sections.push("", `### Ad ${item.nativeId}`, "", "```json", JSON.stringify(analysis, null, 2), "```");
    }
    return sections.join("\n") + "\n";
  }
}
