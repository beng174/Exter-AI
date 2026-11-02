import type { InferenceGenerationMetadata, InferenceSettings, VideoSamplingMetadata } from "../../shared/inference-config.js";
import type { VideoAnalysisAccounting, VideoCoverage } from "../../shared/video-analysis.js";
import { VideoProviderError } from "../video/types.js";

export interface GeminiModelRates { inputGbpPerMillion: number; outputGbpPerMillion: number }
export interface GeminiPricingOptions {
  inputGbpPerMillion?: number;
  outputGbpPerMillion?: number;
  pricingModel?: string;
  modelPricingGbp?: Record<string, GeminiModelRates>;
}
export interface GeminiPricingResolution {
  pricing: VideoAnalysisAccounting["pricing"];
  pricingReason: string;
}
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const rate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const modelId = (value: string) => value.replace(/^models\//, "");

/** Validate operator-supplied rates before any paid inference is dispatched. */
export function geminiPricingConfig(requestedModel: string, options: GeminiPricingOptions = {}, env: NodeJS.ProcessEnv = process.env) {
  let raw: unknown = options.modelPricingGbp;
  if (raw === undefined && env.GEMINI_MODEL_PRICING_GBP_JSON?.trim()) {
    try { raw = JSON.parse(env.GEMINI_MODEL_PRICING_GBP_JSON); }
    catch { throw new VideoProviderError("configuration", "GEMINI_MODEL_PRICING_GBP_JSON must contain a JSON model-to-GBP-rate map."); }
  }
  const rates: Record<string, GeminiModelRates> = {};
  if (raw !== undefined) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new VideoProviderError("configuration", "GEMINI_MODEL_PRICING_GBP_JSON must contain a JSON model-to-GBP-rate map.");
    for (const [model, value] of Object.entries(raw)) {
      const item = record(value);
      if (!/^gemini-[a-zA-Z0-9._-]+$/.test(modelId(model)) || !rate(item.inputGbpPerMillion) || !rate(item.outputGbpPerMillion))
        throw new VideoProviderError("configuration", "Each Gemini model pricing entry requires a model ID and non-negative inputGbpPerMillion/outputGbpPerMillion rates.");
      rates[modelId(model)] = { inputGbpPerMillion: item.inputGbpPerMillion, outputGbpPerMillion: item.outputGbpPerMillion };
    }
  }
  const envRate = (value: string | undefined) => value?.trim() ? Number(value) : NaN;
  const input = options.inputGbpPerMillion ?? envRate(env.GEMINI_INPUT_GBP_PER_MILLION_TOKENS);
  const output = options.outputGbpPerMillion ?? envRate(env.GEMINI_OUTPUT_GBP_PER_MILLION_TOKENS);
  const configuredModel = modelId(options.pricingModel || env.GEMINI_PRICING_MODEL || requestedModel);
  const legacy = rate(input) && rate(output) ? { inputGbpPerMillion: input, outputGbpPerMillion: output } : null;
  return {
    resolve(servedModel: string | null): GeminiPricingResolution {
      if (!servedModel) return { pricing: null, pricingReason: "The provider has not reported the served model; the conservative budget hold is retained." };
      const served = modelId(servedModel);
      if (rates[served]) return { pricing: { ...rates[served], model: served, source: "model-pricing-map" }, pricingReason: "GBP rates matched the served model in GEMINI_MODEL_PRICING_GBP_JSON." };
      if (legacy && served === configuredModel) return { pricing: { ...legacy, model: served, source: "configured-model-rates" }, pricingReason: "GBP rates matched GEMINI_PRICING_MODEL (or the explicitly requested model by default)." };
      return { pricing: null, pricingReason: legacy && served !== configuredModel
        ? `Served model ${served} differs from pricing model ${configuredModel}; no matching model-specific GBP rates are configured. The conservative budget hold is retained.`
        : `No GBP rates are configured for served model ${served}; the conservative budget hold is retained.` };
    },
  };
}

export function servedGeminiModel(output: Record<string, any>): string | null {
  // GenerateContent reports its served model in modelVersion; Interactions in model.
  const candidate = [output.modelVersion, output.model_version, output.model].find(value => typeof value === "string" && /^(?:models\/)?gemini-[a-zA-Z0-9._-]+$/.test(value));
  // A models.get name can describe a requested alias; it is not evidence of the
  // model that served this particular generation request.
  return candidate ? modelId(candidate) : null;
}

export function generationMetadata(settings: InferenceSettings, output: Record<string, any>, agentic = false): InferenceGenerationMetadata {
  const observed = output.mediaResolution ?? record(output.usageMetadata).mediaResolution ?? record(output.responseMetadata).mediaResolution;
  return { temperature: 0, seedRequested: settings.generationSeed, seedApplied: !agentic,
    mediaResolutionRequested: settings.mediaResolution, mediaResolutionApplied: !agentic && settings.mediaResolution === "low",
    providerMediaResolution: typeof observed === "string" && observed.length <= 100 ? observed : null };
}

export function videoSamplingMetadata(coverage: VideoCoverage, output: Record<string, any>): VideoSamplingMetadata {
  const requestedFps = [...new Set(coverage.segments.flatMap(segment => segment.fps === undefined ? [] : [segment.fps]))];
  const details = record(output.usageMetadata).promptTokensDetails;
  const videoDetails = Array.isArray(details) ? details.filter(item => record(item).modality === "VIDEO") : [];
  const tokenCounts = videoDetails.map(item => record(item).tokenCount);
  const explicitFrames = record(output.usageMetadata).videoFrameCount ?? record(output.videoMetadata).framesSampled;
  return { requestedFps, estimatedFrames: requestedFps.length ? coverage.segments.reduce((sum, segment) => sum + Math.ceil((segment.endSeconds - segment.startSeconds) * (segment.fps ?? 0)), 0) : null,
    actualFrames: Number.isSafeInteger(explicitFrames) && explicitFrames >= 0 ? explicitFrames : null,
    videoInputTokens: tokenCounts.length && tokenCounts.every(value => Number.isSafeInteger(value) && value >= 0) ? tokenCounts.reduce((sum, value) => sum + value, 0) : null };
}
