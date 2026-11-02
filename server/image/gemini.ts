import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { assertProxySupport } from "../connectors/http.js";
import type { GeminiReservation } from "../infrastructure/budget.js";
import { GeminiSession } from "../gemini/transport.js";
import { geminiPricingConfig, generationMetadata, servedGeminiModel, type GeminiPricingOptions } from "../gemini/config.js";
import { resolveInferenceSettings, type InferenceGenerationMetadata, type InferenceSettings, type MediaResolution } from "../../shared/inference-config.js";
import { IMAGE_RESPONSE_SCHEMA, buildImagePrompt, validateImageAnalysisFields } from "./schema.js";
export { IMAGE_RESPONSE_SCHEMA } from "./schema.js";
import { DEFAULT_GEMINI_VIDEO_MODEL } from "../video/gemini.js";
import { VideoProviderError } from "../video/types.js";
import { IMAGE_PROMPT_VERSION, type ImageAnalysisFields, type StoredImageCreative } from "../../shared/image-analysis.js";
import type { VideoAnalysisAccounting } from "../../shared/video-analysis.js";

export interface GeminiImageOptions extends GeminiPricingOptions {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  inputGbpPerMillion?: number;
  outputGbpPerMillion?: number;
  reserveCost?: () => Promise<GeminiReservation | undefined>;
  settleCost?: (id: string, estimatedGbp: number) => Promise<void>;
  releaseCost?: (id: string) => Promise<void>;
  confidenceThreshold?: number;
}
export interface ImageAnalyserInput {
  media: StoredImageCreative;
  context: { brandName: string; adCopy: string };
  inferenceSettings?: InferenceSettings;
  mediaResolution?: MediaResolution;
}
export interface ImageProviderResult {
  model: string;
  requestedModel?: string;
  servedModel?: string;
  inferenceSettings?: InferenceSettings;
  generation?: InferenceGenerationMetadata;
  modelVersion: string | null;
  promptVersion: string;
  fields: ImageAnalysisFields;
  accounting: VideoAnalysisAccounting;
}
export interface ImageAnalyser {
  readonly model: string;
  analyse(input: ImageAnalyserInput): Promise<ImageProviderResult>;
}
const HOST = "https://generativelanguage.googleapis.com";
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const tokens = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
/** Retained image bytes are submitted directly; expiring source URLs never reach Gemini. */
export class GeminiImageAnalyser implements ImageAnalyser {
  readonly model: string;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private readonly retryBase: number;
  constructor(private readonly options: GeminiImageOptions = {}) {
    this.model = options.model || process.env.GEMINI_VIDEO_MODEL || DEFAULT_GEMINI_VIDEO_MODEL;
    if (!/^gemini-[a-zA-Z0-9._-]*flash[a-zA-Z0-9._-]*$/.test(this.model)) throw new VideoProviderError("configuration", "GEMINI_VIDEO_MODEL must name a Gemini Flash model.");
    this.maxRetries = options.maxRetries ?? Number(process.env.GEMINI_MAX_RETRIES ?? 2);
    this.timeout = options.requestTimeoutMs ?? 180000;
    this.retryBase = options.retryBaseMs ?? 500;
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 5 || !Number.isInteger(this.timeout) || this.timeout < 1 || this.timeout > 300000 || !Number.isFinite(this.retryBase) || this.retryBase < 0 || this.retryBase > 10000)
      throw new VideoProviderError("configuration", "Gemini image timeout or retry configuration is invalid.");
  }
  async analyse(input: ImageAnalyserInput): Promise<ImageProviderResult> {
    const key = this.options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!key?.trim() || /[\r\n]/.test(key)) throw new VideoProviderError("configuration", "Set GEMINI_API_KEY in the Render web service before image analysis.");
    let settings;
    try { settings = resolveInferenceSettings(input.inferenceSettings ?? { mediaResolution: input.mediaResolution }); }
    catch (error) { throw new VideoProviderError("configuration", error instanceof Error ? error.message : "Gemini inference settings are invalid."); }
    const pricingConfig = geminiPricingConfig(this.model, this.options);
    let pricingResult = pricingConfig.resolve(null);
    const session = new GeminiSession({
      apiKey: key, fetch: this.options.fetch, sleep: this.options.sleep,
      maxRetries: this.maxRetries, retryBaseMs: this.retryBase, requestTimeoutMs: this.timeout,
      reserveCost: this.options.reserveCost, settleCost: this.options.settleCost, releaseCost: this.options.releaseCost,
    });
    try {
      const count = input.media.images.length;
      if (input.media.kind === "image" ? count !== 1 : count < 2 || count > 10) throw new VideoProviderError("configuration", "Retain all supported image slides before analysis.");
      if (input.media.images.reduce((sum, image) => sum + image.bytes, 0) > 14 * 1024 * 1024)
        throw new VideoProviderError("configuration", "The complete retained image set exceeds the supported inline image payload limit. No slides were omitted and no inference was started.");
      const parts: Record<string, unknown>[] = [];
      for (const [index, image] of input.media.images.entries()) {
        const stat = await lstat(image.absolutePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== image.bytes || stat.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(image.mimeType)) throw new VideoProviderError("configuration", "Stored image metadata or size changed before analysis.");
        const bytes = await readFile(image.absolutePath);
        if (createHash("sha256").update(bytes).digest("hex") !== image.sha256) throw new VideoProviderError("configuration", "Stored image checksum changed before analysis.");
        parts.push({ text: `Slide ${index + 1} of ${count}.` }, { inline_data: { mime_type: image.mimeType, data: bytes.toString("base64") } });
      }
      assertProxySupport(Boolean(this.options.fetch), process.env);
      const model = await session.json(new URL(`/v1beta/models/${this.model}`, HOST), { headers: { "x-goog-api-key": key } }, { stage: "model_metadata" });
      const prompt = buildImagePrompt(input);
      parts.push({ text: prompt });
      const payload = await session.json(new URL(`/v1beta/models/${this.model}:generateContent`, HOST), {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0, seed: settings.generationSeed, ...(settings.mediaResolution === "low" ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}), maxOutputTokens: 8192, responseMimeType: "application/json", responseJsonSchema: IMAGE_RESPONSE_SCHEMA } }),
      }, { stage: "image_generation", billable: true, onRaw: raw => { session.setRawResponse({ unparsedText: raw }); } });
      session.setRawResponse(payload);
      const usage = record(payload.usageMetadata);
      const inputTokens = tokens(usage.promptTokenCount);
      const candidateTokens = tokens(usage.candidatesTokenCount);
      const thoughts = tokens(usage.thoughtsTokenCount);
      const outputTokens = candidateTokens === null ? null : candidateTokens + (thoughts ?? 0);
      session.setUsage({ inputTokens, outputTokens, totalTokens: tokens(usage.totalTokenCount) ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null) });
      const metadataModel = typeof model.name === "string" ? model.name.replace(/^models\//, "") : this.model;
      const servedModel = servedGeminiModel(payload);
      pricingResult = pricingConfig.resolve(servedModel);
      if (pricingResult.pricing) await session.settle(pricingResult.pricing);
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      const first = record(candidates[0]);
      if (first.finishReason && first.finishReason !== "STOP") throw new VideoProviderError("invalid_output", "Gemini did not finish the structured image output.");
      const outputs = record(first.content).parts;
      const output = Array.isArray(outputs) ? outputs.filter(part => typeof record(part).text === "string" && !record(part).thought).map(part => part.text).join("") : "";
      let parsed: unknown;
      try { parsed = JSON.parse(output); } catch { throw new VideoProviderError("invalid_output", "Gemini did not return structured image creative JSON."); }
      return { model: servedModel || metadataModel, requestedModel: this.model, ...(servedModel ? { servedModel } : {}),
        modelVersion: typeof payload.model_version === "string" ? payload.model_version : typeof payload.modelVersion === "string" ? payload.modelVersion : null,
        promptVersion: IMAGE_PROMPT_VERSION, fields: validateImageAnalysisFields(parsed, count, input.media.kind, 0, { requireV2: true }),
        inferenceSettings: settings, generation: generationMetadata(settings, payload),
        accounting: session.accounting(pricingResult.pricing, pricingResult.pricingReason) };
    } catch (error) {
      if (error instanceof VideoProviderError) { error.accounting = session.accounting(pricingResult.pricing, pricingResult.pricingReason); throw error; }
      throw new VideoProviderError("unavailable", "Image analysis failed; retained creative and earlier outputs were preserved.", session.accounting(pricingResult.pricing, pricingResult.pricingReason));
    }
  }
}
