import type { GeminiReservation } from "../infrastructure/budget.js";
import { GeminiSession } from "../gemini/transport.js";
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
  releaseCost?: (reservationId: string) => Promise<void>;
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
function failedFile(value: unknown): VideoProviderError {
  // All file payloads have already passed the session's credential scrubber.
  const error = record(record(value).error);
  const message = typeof error.message === "string" && error.message.trim() ? error.message.slice(0, 64000) : "Gemini could not process the stored video.";
  return new VideoProviderError("unavailable", `Gemini file processing failed: ${message}`, undefined, {
    stage: "file_ready", httpStatus: 200, providerStatus: typeof error.status === "string" ? error.status : "FAILED", message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  });
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

/** Stable static GenerateContent or explicitly chosen preview Agentic Interactions. */
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
    const session = new GeminiSession({ ...this.options, apiKey: key, sleep: this.sleep });
    let uploadedName: string | null = null;
    try {
      const modelInfo = await session.json(new URL(`${API}/v1beta/models/${this.model}`), { headers: authorization }, { stage: "model_metadata", signal: input.signal });
      const resolvedModel = text(modelInfo.name)?.replace(/^models\//, "") || this.model;
      const version = text(modelInfo.version);
      const uploadStart = await session.request(new URL(`${API}/upload/v1beta/files`), {
        method: "POST",
        headers: {
          ...authorization, "Content-Type": "application/json",
          "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(input.media.bytes),
          "X-Goog-Upload-Header-Content-Type": input.media.mimeType,
        },
        body: JSON.stringify({ file: { display_name: `exter-${input.media.sha256.slice(0, 16)}` } }),
      }, { stage: "file_upload_start", signal: input.signal });
      const uploadHeader = uploadStart.headers.get("x-goog-upload-url");
      if (!uploadHeader) throw new VideoProviderError("invalid_output", "Gemini did not supply a resumable upload destination.");
      const uploadUrl = apiUrl(uploadHeader, true);
      const uploaded = await session.json(uploadUrl, () => ({
        method: "POST",
        headers: { "Content-Length": String(input.media.bytes), "Content-Type": input.media.mimeType,
          "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
        body: createReadStream(input.media.absolutePath) as unknown as BodyInit, duplex: "half",
      } as RequestInit), { stage: "file_upload", signal: input.signal });
      const rawFile = record(uploaded.file || uploaded);
      if (safeFileName(rawFile.name)) uploadedName = rawFile.name;
      let file = checkedFile(rawFile);
      if (file.state === "FAILED") throw failedFile(rawFile);
      const awaitActive = async () => {
        // Re-read before EVERY generation attempt, including retries. An ACTIVE
        // state observed before a rejected attempt is not reused blindly.
        for (let poll = 0; poll < this.maxFilePolls; poll++) {
          const metadata = await session.json(new URL(`${API}/v1beta/${file.name}`), { headers: authorization }, { stage: "file_status", signal: input.signal });
          const next = checkedFile(metadata);
          if (next.name !== file.name || next.uri !== file.uri)
            throw new VideoProviderError("invalid_output", "Gemini changed the uploaded video identity while processing.");
          file = next;
          if (file.state === "ACTIVE") return;
          if (file.state === "FAILED") throw failedFile(metadata);
          if (poll + 1 < this.maxFilePolls) await this.sleep(this.pollIntervalMs, input.signal);
        }
        throw new VideoProviderError("unavailable", "Gemini file processing timed out before analysis.", undefined, { stage: "file_status", message: "Uploaded file did not become ACTIVE within the bounded polling window; no inference was dispatched." });
      };
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
      let output: Record<string, any>;
      if (input.processingMode === "agentic") {
        const parts = coverage.segments.map(segment => ({ type: "video", uri: file.uri, mime_type: input.media.mimeType, processing: "agentic" }));
        output = await session.json(new URL(`${API}/v1beta/interactions`), {
          method: "POST", headers: { ...authorization, "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.model, input: [...parts, { type: "text", text: buildVideoPrompt(input, coverage) }],
            response_format: { type: "text", mime_type: "application/json", schema: VIDEO_RESPONSE_JSON_SCHEMA },
            generation_config: { temperature: 0, max_output_tokens: 16384 }, store: false, background: false }),
        }, { stage: "agentic_generation", billable: true, agenticAttempt: true, signal: input.signal, beforeAttempt: awaitActive,
          onRaw: raw => session.setRawResponse({ unparsedText: raw }) });
      } else {
        // Static is the stable GenerateContent path. No agentic/preview option is
        // present unless the caller explicitly chose the Agentic mode above.
        const parts = coverage.segments.map(segment => ({ fileData: { fileUri: file.uri, mimeType: input.media.mimeType },
          videoMetadata: { startOffset: `${segment.startSeconds}s`, endOffset: `${segment.endSeconds}s`, fps: segment.fps } }));
        output = await session.json(new URL(`${API}/v1beta/models/${this.model}:generateContent`), {
          method: "POST", headers: { ...authorization, "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [...parts, { text: buildVideoPrompt(input, coverage) }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 16384, responseMimeType: "application/json", responseJsonSchema: VIDEO_RESPONSE_JSON_SCHEMA } }),
        }, { stage: "static_generation", billable: true, signal: input.signal, beforeAttempt: awaitActive,
          onRaw: raw => session.setRawResponse({ unparsedText: raw }) });
      }
      // Preserve response/accounting even when structured field validation fails.
      session.setRawResponse(output);
      session.setUsage(usageOf(output));
      const pricing = this.pricing();
      if (pricing) await session.settle(pricing.inputGbpPerMillion, pricing.outputGbpPerMillion);
      let outputText = "";
      if (input.processingMode === "agentic") {
        if (output.status !== "completed") throw new VideoProviderError("invalid_output", "Gemini did not complete the structured video analysis.");
        const finalStep = Array.isArray(output.steps) ? [...output.steps].reverse().find(step => record(step).type === "model_output") : null;
        const parts = finalStep ? record(finalStep).content : output.outputs;
        outputText = Array.isArray(parts) ? parts.filter(part => record(part).type === "text" && typeof record(part).text === "string").map(part => part.text).join("") : "";
      } else {
        const candidate = record(Array.isArray(output.candidates) ? output.candidates[0] : undefined);
        if (candidate.finishReason && candidate.finishReason !== "STOP") throw new VideoProviderError("invalid_output", "Gemini did not finish the structured static video analysis.");
        const parts = record(candidate.content).parts;
        outputText = Array.isArray(parts) ? parts.filter(part => typeof record(part).text === "string" && !record(part).thought).map(part => part.text).join("") : "";
      }
      let fields: unknown;
      try { fields = JSON.parse(outputText); }
      catch { throw new VideoProviderError("invalid_output", "Gemini did not return the required structured video JSON."); }
      return {
        fields,
        model: text(output.model) || text(output.modelVersion) || resolvedModel,
        modelVersion: text(output.model_version) || text(output.modelVersion) || version,
        processingMode: input.processingMode,
        promptVersion: VIDEO_PROMPT_VERSION,
        coverage,
        accounting: session.accounting(this.pricing()),
        ...(text(output.id, 500) ? { providerRequestId: output.id } : {}),
      };
    } catch (error) {
      if (error instanceof VideoProviderError) {
        error.accounting = session.accounting(this.pricing());
        throw error;
      }
      throw new VideoProviderError("unavailable", "Gemini video analysis failed; retained media and earlier results were preserved.", session.accounting(this.pricing()));
    } finally {
      if (uploadedName) {
        try {
          // Cleanup is attempted even after cancellation, and never masks a saved result.
          await session.request(new URL(`${API}/v1beta/${uploadedName}`), {
            method: "DELETE", headers: authorization,
          }, { stage: "file_cleanup" });
        } catch {
          if (this.options.onCleanupFailure) this.options.onCleanupFailure();
          else console.warn("Gemini temporary video cleanup was unavailable; Exter's stored video is preserved.");
        }
      }
    }
  }
}
