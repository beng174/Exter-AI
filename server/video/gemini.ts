import { guardedGeminiCall, settleGeminiCost, type GeminiReservation } from "../infrastructure/budget.js";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { assertProxySupport } from "../connectors/http.js";
import { VIDEO_PROMPT_VERSION, type VideoAnalysisAccounting, type VideoCoverage } from "../../shared/video-analysis.js";
import { buildVideoPrompt, VIDEO_RESPONSE_JSON_SCHEMA } from "./prompt.js";
import {
  VideoProviderError,
  type VideoAnalyser,
  type VideoAnalyserInput,
  type VideoProviderResult,
} from "./types.js";

const HOST = "generativelanguage.googleapis.com";
const API = `https://${HOST}`;
export const DEFAULT_GEMINI_VIDEO_MODEL = "gemini-3.8-flash";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface GeminiVideoOptions {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  pollIntervalMs?: number;
  maxFilePolls?: number;
  requestTimeoutMs?: number;
  onCleanupFailure?: () => void;
  maxRetries?: number;
  retryBaseMs?: number;
  inputGbpPerMillion?: number;
  outputGbpPerMillion?: number;
  /** Test transports can inject the guard without a live database or API key. */
  reserveCost?: () => Promise<GeminiReservation | undefined>;
  settleCost?: (reservationId: string, estimatedGbp: number) => Promise<void>;
}

interface InferenceAccounting {
  reservations: GeminiReservation[];
  attempts: number;
  rawResponse?: unknown;
  usage: VideoAnalysisAccounting["usage"];
  tokenCostGbp: number | null;
  pricedReservationId?: string;
  settledReservationId?: string;
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function usageOf(payload: Record<string, any>): VideoAnalysisAccounting["usage"] {
  const usage = record(payload.usage);
  const metadata = record(payload.usageMetadata);
  const inputTokens = tokenCount(usage.total_input_tokens ?? usage.input_tokens ?? metadata.promptTokenCount);
  let outputTokens = tokenCount(usage.total_output_tokens ?? usage.output_tokens);
  if (outputTokens === null) {
    const candidates = tokenCount(metadata.candidatesTokenCount);
    const thoughts = tokenCount(metadata.thoughtsTokenCount);
    if (candidates !== null) outputTokens = candidates + (thoughts ?? 0);
  }
  const totalTokens = tokenCount(usage.total_tokens ?? metadata.totalTokenCount) ??
    (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  return { inputTokens, outputTokens, totalTokens };
}
/** The credential is only sent as a header and is scrubbed if a provider echoes it. */
function sanitiseResponse(payload: Record<string, any>, key: string): Record<string, any> {
  const encodedKey = JSON.stringify(key).slice(1, -1);
  return JSON.parse(JSON.stringify(payload).split(encodedKey).join("[REDACTED]"));
}

interface GeminiFile {
  name: string;
  uri: string;
  state: string;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any> : {};
}
function text(value: unknown, limit = 200): string | null {
  return typeof value === "string" && value.trim() && value.length <= limit
    ? value.trim() : null;
}
function safeFileName(value: unknown): value is string {
  return typeof value === "string" && /^files\/[a-zA-Z0-9_-]{1,200}$/.test(value);
}
function apiUrl(value: string, upload = false): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new VideoProviderError("invalid_output", "Gemini returned an invalid resource URL."); }
  if (url.protocol !== "https:" || url.hostname !== HOST || url.port ||
      url.username || url.password || url.hash ||
      (upload && !/^\/upload\/v1beta\/files\/?$/.test(url.pathname)))
    throw new VideoProviderError("invalid_output", "Gemini returned an unsupported resource destination.");
  return url;
}
function checkedFile(value: unknown): GeminiFile {
  const file = record(value);
  if (!safeFileName(file.name) || !text(file.uri, 2000))
    throw new VideoProviderError("invalid_output", "Gemini returned incomplete file metadata.");
  const uri = apiUrl(file.uri);
  if (uri.pathname !== `/v1beta/${file.name}` || uri.search)
    throw new VideoProviderError("invalid_output", "Gemini returned inconsistent file metadata.");
  const state = typeof file.state === "string" ? file.state : record(file.state).name;
  if (!["ACTIVE", "PROCESSING", "FAILED"].includes(state))
    throw new VideoProviderError("invalid_output", "Gemini returned an unknown file processing state.");
  return { name: file.name, uri: uri.href, state };
}
async function wait(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new VideoProviderError("unavailable", "Video analysis was cancelled.");
  await new Promise<void>((resolve, reject) => {
    const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new VideoProviderError("unavailable", "Video analysis was cancelled."));
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Native Files + Interactions API; Exter never submits an expiring ad-library URL. */
export class GeminiVideoAnalyser implements VideoAnalyser {
  readonly provider = "gemini";
  readonly model: string;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly maxFilePolls: number;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;

  constructor(private readonly options: GeminiVideoOptions = {}) {
    this.model = options.model || process.env.GEMINI_VIDEO_MODEL || DEFAULT_GEMINI_VIDEO_MODEL;
    if (!/^gemini-[a-zA-Z0-9._-]*flash[a-zA-Z0-9._-]*$/.test(this.model))
      throw new VideoProviderError("configuration", "GEMINI_VIDEO_MODEL must name a Gemini Flash model.");
    this.fetcher = options.fetch || fetch;
    this.sleep = options.sleep || wait;
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.maxFilePolls = options.maxFilePolls ?? 60;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 180000;
    this.maxRetries = options.maxRetries ?? Number(process.env.GEMINI_MAX_RETRIES ?? 2);
    this.retryBaseMs = options.retryBaseMs ?? 500;
    if (!Number.isInteger(this.pollIntervalMs) || this.pollIntervalMs < 0 || this.pollIntervalMs > 10000 ||
        !Number.isInteger(this.maxFilePolls) || this.maxFilePolls < 1 || this.maxFilePolls > 120 ||
        !Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1 || this.requestTimeoutMs > 300000 ||
        !Number.isInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 5 ||
        !Number.isInteger(this.retryBaseMs) || this.retryBaseMs < 0 || this.retryBaseMs > 10000)
      throw new VideoProviderError("configuration", "Gemini timeout or polling configuration is invalid.");
  }

  private pricing(): VideoAnalysisAccounting["pricing"] {
    const input = this.options.inputGbpPerMillion ?? Number(process.env.GEMINI_INPUT_GBP_PER_MILLION_TOKENS);
    const output = this.options.outputGbpPerMillion ?? Number(process.env.GEMINI_OUTPUT_GBP_PER_MILLION_TOKENS);
    return Number.isFinite(input) && input > 0 && Number.isFinite(output) && output > 0
      ? { inputGbpPerMillion: input, outputGbpPerMillion: output } : null;
  }

  private accounting(state: InferenceAccounting): VideoAnalysisAccounting {
    const unknown = state.reservations.filter(value => value.reservationId !== state.settledReservationId);
    const reservedCostGbp = state.reservations.length ? unknown.reduce((sum, value) => sum + value.reservedGbp, 0) : null;
    const tokenCostGbp = state.tokenCostGbp;
    const pricedReserve = unknown.find(value => value.reservationId === state.pricedReservationId)?.reservedGbp ?? 0;
    const retryReserves = unknown.filter(value => value.reservationId !== state.pricedReservationId)
      .reduce((sum, value) => sum + value.reservedGbp, 0);
    // If settlement failed, the known token estimate and its still-reserved ledger
    // entry describe the same generation attempt. Count their maximum once; only
    // reservations for separate, uncertain retries are additional costs.
    const estimatedCostGbp = tokenCostGbp !== null
      ? retryReserves + Math.max(tokenCostGbp, pricedReserve) : reservedCostGbp;
    return {
      usage: state.usage, tokenCostGbp, reservedCostGbp, estimatedCostGbp,
      costBasis: tokenCostGbp !== null
        ? reservedCostGbp ? "token_and_reservation_estimate" : "token_estimate"
        : reservedCostGbp !== null ? "reservation_estimate" : "unavailable",
      pricing: this.pricing(), requestAttempts: state.attempts,
      ...(state.rawResponse !== undefined ? { rawResponse: state.rawResponse } : {}),
    };
  }

  private async request(
    url: URL,
    init: RequestInit | (() => RequestInit),
    signal?: AbortSignal,
    agenticAttempt = false,
    accounting?: InferenceAccounting,
  ): Promise<Response> {
    apiUrl(url.href);
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new VideoProviderError("unavailable", "Video analysis was cancelled.");
      // Only generation can incur inference charges. File operations and cleanup must
      // remain available even when the monthly inference budget is paused.
      if (accounting) {
        try {
          const reserve = this.options.reserveCost || (!this.options.fetch ? guardedGeminiCall : undefined);
          const reservation = await reserve?.();
          if (reservation) accounting.reservations.push(reservation);
        } catch {
          throw new VideoProviderError("budget_paused", "Paid inference paused: the inference budget, request reserve or budget database is unavailable. Review Budgets before retrying.");
        }
        accounting.attempts++;
      }
      let response: Response;
      const request = typeof init === "function" ? init() : init;
      try {
        response = await this.fetcher(url, {
          ...request,
          redirect: "manual",
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeoutMs)])
            : AbortSignal.timeout(this.requestTimeoutMs),
        });
      } catch {
        throw new VideoProviderError("unavailable", "Gemini could not be reached or the video request timed out.");
      } finally {
        const body = request.body as unknown as { destroy?: () => void } | null | undefined;
        if (typeof body?.destroy === "function") body.destroy();
      }
      if (response.status >= 300 && response.status < 400)
        throw new VideoProviderError("unavailable", "Gemini redirected a request; credentials were not forwarded.");
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new VideoProviderError("authentication", "Gemini rejected the configured API credential or model permission.");
        // Only an explicit unsupported agentic capability permits a static retry.
        // Raw provider error text can echo credentials; never expose or persist it.
        if (agenticAttempt && [400, 422, 501].includes(response.status)) {
          let unsupported = false;
          try {
            const payload = await this.json(response);
            const message = String(record(payload.error).message || "");
            unsupported = /agentic/i.test(message) && /unsupported|not supported|not available|not enabled|not implemented/i.test(message);
          } catch {}
          if (unsupported)
            throw new VideoProviderError("unsupported_mode", "The selected Gemini model does not support agentic video processing.");
        }
        if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
          await response.body?.cancel().catch(() => {});
          await this.sleep(Math.min(30000, this.retryBaseMs * 2 ** attempt), signal);
          continue;
        }
        if (response.status === 429)
          throw new VideoProviderError("rate_limit", "Gemini rate or quota limit reached after bounded retries. No fallback inference was started.");
        throw new VideoProviderError("unavailable", `Gemini request failed (HTTP ${response.status}); no fallback inference was started.`);
      }
      return response;
    }
  }

  private async json(response: Response, onRaw?: (value: string) => void): Promise<Record<string, any>> {
    if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES)
      throw new VideoProviderError("invalid_output", "Gemini response exceeds the supported size.");
    const reader = response.body?.getReader();
    if (!reader) throw new VideoProviderError("invalid_output", "Gemini returned an empty response.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new VideoProviderError("invalid_output", "Gemini response exceeds the supported size.");
        }
        chunks.push(part.value);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      onRaw?.(raw);
      const payload: unknown = JSON.parse(raw);
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("not an object");
      return payload as Record<string, any>;
    } catch (error) {
      if (error instanceof VideoProviderError) throw error;
      throw new VideoProviderError("invalid_output", "Gemini returned invalid JSON.");
    } finally { reader.releaseLock(); }
  }

  async analyse(input: VideoAnalyserInput): Promise<VideoProviderResult> {
    const key = this.options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!key?.trim() || /[\r\n]/.test(key))
      throw new VideoProviderError("configuration", "Set GEMINI_API_KEY in the server's secret configuration before running video analysis.");
    if (!["agentic", "static-high-fps-hook"].includes(input.processingMode))
      throw new VideoProviderError("configuration", "Unsupported video processing mode.");
    if (input.media.sourceAdId !== input.adId || input.media.brandId !== input.brandId)
      throw new VideoProviderError("configuration", "Stored media belongs to another ad or workspace.");
    if (!Number.isFinite(input.media.durationSeconds) || input.media.durationSeconds <= 0 ||
        !Number.isSafeInteger(input.media.bytes) || input.media.bytes <= 0 ||
        !/^[a-f0-9]{64}$/.test(input.media.sha256) ||
        !["video/mp4", "video/webm", "video/quicktime", "video/mpeg", "video/x-msvideo"].includes(input.media.mimeType))
      throw new VideoProviderError("configuration", "Stored video metadata is invalid.");
    let stat;
    try { stat = await lstat(input.media.absolutePath); }
    catch { throw new VideoProviderError("configuration", "Stored video is missing; download it into Exter media storage first."); }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== input.media.bytes)
      throw new VideoProviderError("configuration", "Stored video size or file type does not match its saved metadata.");
    const hash = createHash("sha256");
    try { for await (const chunk of createReadStream(input.media.absolutePath)) hash.update(chunk); }
    catch { throw new VideoProviderError("configuration", "Stored video could not be read."); }
    if (hash.digest("hex") !== input.media.sha256)
      throw new VideoProviderError("configuration", "Stored video checksum does not match its saved metadata.");
    assertProxySupport(Boolean(this.options.fetch), process.env);
    const authorization = { "x-goog-api-key": key };
    let uploadedName: string | null = null;
    const state: InferenceAccounting = { reservations: [], attempts: 0, usage: { inputTokens: null, outputTokens: null, totalTokens: null }, tokenCostGbp: null };
    try {
      const modelInfo = sanitiseResponse(await this.json(await this.request(
        new URL(`${API}/v1beta/models/${this.model}`), { headers: authorization }, input.signal,
      )), key);
      const resolvedModel = text(modelInfo.name)?.replace(/^models\//, "") || this.model;
      const version = text(modelInfo.version);
      const uploadStart = await this.request(new URL(`${API}/upload/v1beta/files`), {
        method: "POST",
        headers: {
          ...authorization,
          "Content-Type": "application/json",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(input.media.bytes),
          "X-Goog-Upload-Header-Content-Type": input.media.mimeType,
        },
        body: JSON.stringify({ file: { display_name: `exter-${input.media.sha256.slice(0, 16)}` } }),
      }, input.signal);
      const uploadHeader = uploadStart.headers.get("x-goog-upload-url");
      if (!uploadHeader)
        throw new VideoProviderError("invalid_output", "Gemini did not supply a resumable upload destination.");
      const uploadUrl = apiUrl(uploadHeader, true);
      let uploaded: Record<string, any>;
      {
        const finalized = await this.request(uploadUrl, () => ({
          method: "POST",
          headers: {
            "Content-Length": String(input.media.bytes),
            "Content-Type": input.media.mimeType,
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
          },
          body: createReadStream(input.media.absolutePath) as unknown as BodyInit,
          duplex: "half",
        } as RequestInit), input.signal);
        uploaded = await this.json(finalized);
      }
      const rawFile = record(uploaded.file || uploaded);
      if (safeFileName(rawFile.name)) uploadedName = rawFile.name;
      let file = checkedFile(rawFile);
      for (let poll = 0; file.state === "PROCESSING" && poll < this.maxFilePolls; poll++) {
        await this.sleep(this.pollIntervalMs, input.signal);
        const next = checkedFile(await this.json(await this.request(
          new URL(`${API}/v1beta/${file.name}`), { headers: authorization }, input.signal,
        )));
        if (next.name !== file.name || next.uri !== file.uri)
          throw new VideoProviderError("invalid_output", "Gemini changed the uploaded video identity while processing.");
        file = next;
      }
      if (file.state !== "ACTIVE")
        throw new VideoProviderError("unavailable", file.state === "FAILED"
          ? "Gemini could not process the stored video." : "Gemini file processing timed out before analysis.");
      const duration = input.media.durationSeconds;
      const firstEnd = Math.min(5, duration);
      const coverage: VideoCoverage = {
        durationSeconds: duration,
        fullVideo: true,
        segments: input.processingMode === "agentic"
          ? [{ startSeconds: 0, endSeconds: duration, processing: "agentic" }]
          : duration <= 60 ? [{ startSeconds: 0, endSeconds: duration, processing: "static", fps: 3 }] : [
              { startSeconds: 0, endSeconds: firstEnd, processing: "static", fps: 5 },
              ...(duration > 5 ? [{ startSeconds: 5, endSeconds: duration, processing: "static" as const, fps: 1 }] : []),
            ],
      };
      const parts = coverage.segments.map((segment) => ({
        type: "video",
        uri: file.uri,
        mime_type: input.media.mimeType,
        processing: segment.processing === "agentic" ? "agentic" : {
          type: "static",
          start_offset: `${segment.startSeconds}s`,
          end_offset: `${segment.endSeconds}s`,
          fps: segment.fps,
        },
      }));
      const interaction = sanitiseResponse(await this.json(await this.request(new URL(`${API}/v1beta/interactions`), {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          input: [...parts, { type: "text", text: buildVideoPrompt(input, coverage) }],
          response_format: { type: "text", mime_type: "application/json", schema: VIDEO_RESPONSE_JSON_SCHEMA },
          generation_config: { temperature: 0, max_output_tokens: 16384 },
          store: false,
          background: false,
        }),
      }, input.signal, input.processingMode === "agentic", state), raw => { state.rawResponse = { unparsedText: raw.split(key).join("[REDACTED]") }; }), key);
      // Persist accounting even if the response's structured fields fail validation.
      state.rawResponse = interaction;
      state.usage = usageOf(interaction);
      const pricing = this.pricing();
      if (pricing && state.usage.inputTokens !== null && state.usage.outputTokens !== null) {
        state.tokenCostGbp = (state.usage.inputTokens * pricing.inputGbpPerMillion + state.usage.outputTokens * pricing.outputGbpPerMillion) / 1_000_000;
        const reservation = state.reservations.at(-1);
        if (reservation) {
          // Unknown retry charges keep their reserves. A failed database settlement
          // also leaves its reserve in the ledger; it must not discard valid output.
          state.pricedReservationId = reservation.reservationId;
          try {
            await (this.options.settleCost || settleGeminiCost)(reservation.reservationId, state.tokenCostGbp);
            state.settledReservationId = reservation.reservationId;
          }
          catch {}
        }
      }
      if (interaction.status !== "completed")
        throw new VideoProviderError("invalid_output", "Gemini did not complete the structured video analysis.");
      const finalStep = Array.isArray(interaction.steps)
        ? [...interaction.steps].reverse().find((step) => record(step).type === "model_output") : null;
      const output = finalStep ? record(finalStep).content : interaction.outputs;
      const outputText = Array.isArray(output)
        ? output.filter((part) => record(part).type === "text" && typeof record(part).text === "string")
            .map((part) => part.text).join("")
        : "";
      let fields: unknown;
      try { fields = JSON.parse(outputText); }
      catch { throw new VideoProviderError("invalid_output", "Gemini did not return the required structured video JSON."); }
      return {
        fields,
        model: text(interaction.model) || resolvedModel,
        modelVersion: text(interaction.model_version) || text(interaction.modelVersion) || version,
        processingMode: input.processingMode,
        promptVersion: VIDEO_PROMPT_VERSION,
        coverage,
        accounting: this.accounting(state),
        ...(text(interaction.id, 500) ? { providerRequestId: interaction.id } : {}),
      };
    } catch (error) {
      if (error instanceof VideoProviderError) {
        error.accounting = this.accounting(state);
        throw error;
      }
      throw new VideoProviderError("unavailable", "Gemini video analysis failed; retained media and earlier results were preserved.", this.accounting(state));
    } finally {
      if (uploadedName) {
        try {
          // Cleanup is attempted even after cancellation, and never masks a saved result.
          await this.request(new URL(`${API}/v1beta/${uploadedName}`), {
            method: "DELETE", headers: authorization,
          });
        } catch {
          if (this.options.onCleanupFailure) this.options.onCleanupFailure();
          else console.warn("Gemini temporary video cleanup was unavailable; Exter's stored video is preserved.");
        }
      }
    }
  }
}
