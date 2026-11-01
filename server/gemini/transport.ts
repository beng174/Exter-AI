import { guardedGeminiCall, releaseGeminiCost, settleGeminiCost, type GeminiReservation } from "../infrastructure/budget.js";
import { VideoProviderError } from "../video/types.js";
import type { GeminiDiagnostic } from "../../shared/gemini-diagnostic.js";
import type { VideoAnalysisAccounting } from "../../shared/video-analysis.js";

const HOST = "generativelanguage.googleapis.com";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
export interface GeminiSessionOptions {
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  maxRetries?: number;
  retryBaseMs?: number;
  requestTimeoutMs?: number;
  reserveCost?: () => Promise<GeminiReservation | undefined>;
  settleCost?: (reservationId: string, estimatedGbp: number) => Promise<void>;
  releaseCost?: (reservationId: string) => Promise<void>;
}
export interface GeminiRequestOptions {
  stage: string;
  billable?: boolean;
  signal?: AbortSignal;
  beforeAttempt?: () => Promise<void>;
  agenticAttempt?: boolean;
  onRaw?: (raw: string) => void;
}

/** Remove secret material while preserving the provider's explanatory message. */
export function sanitiseGeminiText(input: string, key: string): string {
  let value = input;
  const known = [key, ...["GEMINI_API_KEY", "META_ACCESS_TOKEN", "APIFY_TOKEN", "YOUTUBE_API_KEY", "DATABASE_URL", "EXTER_ADMIN_PASSWORD"].map(name => process.env[name]).filter((item): item is string => Boolean(item))];
  for (const secret of known) {
    for (const form of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)])
      if (form) value = value.split(form).join("[REDACTED]");
  }
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bBasic\s+[A-Za-z0-9+/]+=*/gi, "Basic [REDACTED]")
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, "[REDACTED]")
    .replace(/((?:x[-_]goog[-_]api[-_]key|api[-_]?key|access[-_]?token|authorization|password|secret)\s*[:=]\s*)[^\s,;"'}]+/gi, "$1[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>\\]+/gi, raw => {
      try { const url = new URL(raw); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.href; }
      catch { return "[REDACTED URL]"; }
    });
}
export function sanitiseGeminiValue(value: unknown, key: string, depth = 0): any {
  if (depth > 16) return "[TRUNCATED]";
  if (typeof value === "string") return sanitiseGeminiText(value, key);
  if (Array.isArray(value)) return value.slice(0, 200).map(item => sanitiseGeminiValue(item, key, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 200).map(([name, item]) => [name,
    /^(?:authorization|x[-_]goog[-_]api[-_]key|api[-_]?key|access[-_]?token|password|secret|cookie)$/i.test(name) ? "[REDACTED]" : sanitiseGeminiValue(item, key, depth + 1)]));
  return value;
}
async function sleep(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new VideoProviderError("unavailable", "Gemini request was cancelled.");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, milliseconds);
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(new VideoProviderError("unavailable", "Gemini request was cancelled.")); };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
class ReadFailure extends Error {}
class ResponseLimit extends Error {}

/** One analysis session. Explicit rejections reuse one hold; ambiguous retries
 * retain the earlier hold before reserving a separate possible charge. */
export class GeminiSession {
  private readonly fetcher: typeof fetch;
  private readonly sleeper: NonNullable<GeminiSessionOptions["sleep"]>;
  private readonly maxRetries: number;
  private readonly retryBase: number;
  private readonly timeout: number;
  private holds: GeminiReservation[] = [];
  private released = new Set<string>();
  private active?: GeminiReservation;
  private holdRequested = false;
  private activeRejected = false;
  private settled?: string;
  private priced?: string;
  private attempts = 0;
  private rejected = 0;
  private usage: VideoAnalysisAccounting["usage"] = { inputTokens: null, outputTokens: null, totalTokens: null };
  private tokenCost: number | null = null;
  private raw?: unknown;
  constructor(private readonly options: GeminiSessionOptions) {
    this.fetcher = options.fetch || fetch;
    this.sleeper = options.sleep || sleep;
    this.maxRetries = options.maxRetries ?? Number(process.env.GEMINI_MAX_RETRIES ?? 2);
    this.retryBase = options.retryBaseMs ?? 500;
    this.timeout = options.requestTimeoutMs ?? 180000;
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 5 || !Number.isFinite(this.retryBase) || this.retryBase < 0 || this.retryBase > 10000 || !Number.isInteger(this.timeout) || this.timeout < 1 || this.timeout > 300000)
      throw new VideoProviderError("configuration", "Gemini timeout or retry configuration is invalid.");
  }
  setRawResponse(value: unknown) { this.raw = sanitiseGeminiValue(value, this.options.apiKey); }
  setUsage(value: VideoAnalysisAccounting["usage"]) { this.usage = value; }
  async settle(inputGbpPerMillion: number, outputGbpPerMillion: number) {
    if (!Number.isFinite(inputGbpPerMillion) || inputGbpPerMillion <= 0 || !Number.isFinite(outputGbpPerMillion) || outputGbpPerMillion <= 0 || this.usage.inputTokens === null || this.usage.outputTokens === null) return;
    this.tokenCost = (this.usage.inputTokens * inputGbpPerMillion + this.usage.outputTokens * outputGbpPerMillion) / 1_000_000;
    if (this.active) {
      this.priced = this.active.reservationId;
      try {
        await (this.options.settleCost || settleGeminiCost)(this.active.reservationId, this.tokenCost);
        this.settled = this.active.reservationId;
      } catch { /* Keep the hold if the ledger cannot confirm settlement. */ }
    }
  }
  accounting(pricing: VideoAnalysisAccounting["pricing"]): VideoAnalysisAccounting {
    const remaining = this.holds.filter(hold => hold.reservationId !== this.settled && !this.released.has(hold.reservationId));
    const reservedCostGbp = this.holds.length ? remaining.reduce((sum, hold) => sum + hold.reservedGbp, 0) : null;
    const currentPriced = remaining.find(hold => hold.reservationId === this.priced)?.reservedGbp || 0;
    const earlier = remaining.filter(hold => hold.reservationId !== this.priced).reduce((sum, hold) => sum + hold.reservedGbp, 0);
    return { usage: this.usage, tokenCostGbp: this.tokenCost, reservedCostGbp,
      estimatedCostGbp: this.tokenCost === null ? reservedCostGbp : earlier + Math.max(this.tokenCost, currentPriced),
      costBasis: this.tokenCost !== null ? reservedCostGbp ? "token_and_reservation_estimate" : "token_estimate" : reservedCostGbp !== null ? "reservation_estimate" : "unavailable",
      pricing, requestAttempts: this.attempts, retryAttempts: Math.max(0, this.attempts - 1), rejectedAttempts: this.rejected,
      initialReservedCostGbp: this.holds.length ? this.holds.reduce((sum, hold) => sum + hold.reservedGbp, 0) : null,
      billedCostGbp: null, ...(this.raw !== undefined ? { rawResponse: this.raw } : {}) };
  }
  private async reserve() {
    if (this.holdRequested) return;
    try {
      const guard = this.options.reserveCost || (!this.options.fetch ? guardedGeminiCall : undefined);
      const hold = await guard?.();
      if (hold) { this.holds.push(hold); this.active = hold; }
      this.holdRequested = true; this.activeRejected = false;
    } catch { throw new VideoProviderError("budget_paused", "Paid inference paused: review the inference budget, request reserve and database before retrying."); }
  }
  private async releaseRejected() {
    if (this.active && this.activeRejected) {
      try {
        const release = this.options.releaseCost || (!this.options.fetch ? releaseGeminiCost : undefined);
        await release?.(this.active.reservationId);
        this.released.add(this.active.reservationId);
      } catch { /* An unconfirmed release remains reserved in both ledger and report. */ }
    }
    this.active = undefined; this.holdRequested = false; this.activeRejected = false;
  }
  private async rawText(response: Response, limit: number): Promise<string> {
    if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel().catch(() => {}); throw new ResponseLimit(); }
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const item = await reader.read(); if (item.done) break;
        size += item.value.byteLength;
        if (size > limit) { await reader.cancel(); throw new ResponseLimit(); }
        chunks.push(item.value);
      }
      return Buffer.concat(chunks).toString("utf8");
    } catch (error) { if (error instanceof ResponseLimit) throw error; throw new ReadFailure(); }
    finally { reader.releaseLock(); }
  }
  private retryDelay(response: Response | undefined, attempt: number): number {
    const value = response?.headers.get("retry-after");
    const parsed = value && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : value ? Date.parse(value) - Date.now() : 0;
    return Math.min(30000, Math.max(this.retryBase * 2 ** attempt, Number.isFinite(parsed) ? parsed : 0));
  }
  private async failure(response: Response, options: GeminiRequestOptions): Promise<VideoProviderError> {
    let payload: Record<string, any> = {};
    let raw = "";
    try { raw = await this.rawText(response, MAX_ERROR_BYTES); payload = record(JSON.parse(raw)); } catch {}
    payload = sanitiseGeminiValue(payload, this.options.apiKey);
    const provider = record(payload.error);
    const message = typeof provider.message === "string" && provider.message.trim() ? provider.message
      : raw.trim() ? sanitiseGeminiText(raw, this.options.apiKey).trim() : `Gemini returned HTTP ${response.status} without a readable provider error message.`;
    const diagnostic: GeminiDiagnostic = { stage: options.stage, httpStatus: response.status, message,
      ...(typeof provider.status === "string" ? { providerStatus: provider.status } : {}),
      ...(provider.details !== undefined ? { details: provider.details } : {}),
      ...(response.headers.get("x-request-id") || response.headers.get("x-goog-request-id") ? { requestId: sanitiseGeminiText(response.headers.get("x-request-id") || response.headers.get("x-goog-request-id")!, this.options.apiKey) } : {}),
      ...(response.headers.has("retry-after") ? { retryAfterMs: this.retryDelay(response, 0) } : {}) };
    const unsupported = options.agenticAttempt && [400,422,501].includes(response.status) && /agentic/i.test(message) && /unsupported|not supported|not available|not enabled|not implemented/i.test(message);
    const code = unsupported ? "unsupported_mode" : [401,403].includes(response.status) ? "authentication" : response.status === 429 ? "rate_limit" : "unavailable";
    return new VideoProviderError(code, `Gemini ${options.stage} failed (HTTP ${response.status}${diagnostic.providerStatus ? ` ${diagnostic.providerStatus}` : ""}): ${message}`, undefined, diagnostic);
  }
  async request(url: URL, init: RequestInit | (() => RequestInit), options: GeminiRequestOptions): Promise<Response> {
    return this.execute(url, init, options, async response => response);
  }
  async json(url: URL, init: RequestInit | (() => RequestInit), options: GeminiRequestOptions): Promise<Record<string, any>> {
    return this.execute(url, init, options, async response => {
      const raw = await this.rawText(response, MAX_BYTES);
      const safe = sanitiseGeminiText(raw, this.options.apiKey); options.onRaw?.(safe);
      try {
        const value = JSON.parse(safe);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        return sanitiseGeminiValue(value, this.options.apiKey);
      } catch { throw new VideoProviderError("invalid_output", "Gemini returned invalid JSON.", undefined, { stage: options.stage, httpStatus: response.status, message: "Gemini returned invalid JSON." }); }
    });
  }
  private async execute<T>(url: URL, init: RequestInit | (() => RequestInit), options: GeminiRequestOptions, consume: (response: Response) => Promise<T>): Promise<T> {
    if (url.protocol !== "https:" || url.hostname !== HOST || url.port || url.username || url.password || url.hash)
      throw new VideoProviderError("configuration", "Gemini requests require the official HTTPS endpoint.");
    for (let attempt = 0; ; attempt++) {
      if (options.signal?.aborted) {
        if (options.billable && this.activeRejected) await this.releaseRejected();
        throw new VideoProviderError("unavailable", "Gemini request was cancelled.");
      }
      try { await options.beforeAttempt?.(); }
      catch (error) { if (options.billable) await this.releaseRejected(); throw error; }
      if (options.billable) { await this.reserve(); this.attempts++; }
      const request = typeof init === "function" ? init() : init;
      let response: Response | undefined;
      try {
        const timeout = AbortSignal.timeout(this.timeout);
        const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
        response = await this.fetcher(url, { ...request, headers: { ...Object.fromEntries(new Headers(request.headers)), "x-goog-api-key": this.options.apiKey }, redirect: "manual", signal });
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel().catch(() => {}); throw new VideoProviderError("unavailable", "Gemini redirected a request; credentials were not forwarded.", undefined, { stage: options.stage, httpStatus: response.status, message: "Redirect blocked; credentials were not forwarded." }); }
        if (!response.ok) {
          if (options.billable) { this.rejected++; this.activeRejected = true; }
          const error = await this.failure(response, options);
          if ((response.status === 429 || response.status >= 500) && error.code !== "unsupported_mode" && attempt < this.maxRetries) {
            await this.sleeper(this.retryDelay(response, attempt), options.signal); continue;
          }
          if (options.billable) await this.releaseRejected();
          throw error;
        }
        if (options.billable) this.activeRejected = false;
        return await consume(response);
      } catch (error) {
        if (error instanceof VideoProviderError) {
          if (options.billable && this.activeRejected) await this.releaseRejected();
          throw error;
        }
        if (error instanceof ResponseLimit) throw new VideoProviderError("invalid_output", "Gemini response exceeds the supported size.", undefined, { stage: options.stage, message: "Gemini response exceeds the supported size." });
        // No definitive rejected response means the request could have incurred a
        // charge. Keep its hold and reserve independently for the next attempt.
        if (options.billable) { this.active = undefined; this.holdRequested = false; this.activeRejected = false; }
        if (!options.signal?.aborted && attempt < this.maxRetries) { await this.sleeper(this.retryDelay(response, attempt), options.signal); continue; }
        const detail = sanitiseGeminiText(error instanceof Error ? error.message : "Transport failure", this.options.apiKey);
        const message = options.signal?.aborted ? "Gemini request was cancelled." : `Gemini request timed out or could not be reached after bounded retries${detail ? `: ${detail}` : "."}`;
        throw new VideoProviderError("unavailable", message, undefined, { stage: options.stage, message });
      } finally {
        const body = request.body as unknown as { destroy?: () => void } | null | undefined;
        if (typeof body?.destroy === "function") body.destroy();
      }
    }
  }
}
