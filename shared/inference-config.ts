export type MediaResolution = "default" | "low";

export interface InferenceSettings {
  mediaResolution: MediaResolution;
  generationSeed: number;
}

export interface InferenceGenerationMetadata {
  temperature: 0;
  seedRequested: number;
  seedApplied: boolean;
  mediaResolutionRequested: MediaResolution;
  /** False for omitted provider defaults and unsupported preview controls. */
  mediaResolutionApplied: boolean;
  /** Only populated when the provider explicitly reports it. */
  providerMediaResolution: string | null;
}

export interface VideoSamplingMetadata {
  requestedFps: number[];
  /** Scheduled frames from duration × requested FPS, not observed provider frames. */
  estimatedFrames: number | null;
  actualFrames: number | null;
  videoInputTokens: number | null;
}

export function resolveInferenceSettings(
  input: Partial<InferenceSettings> = {},
  env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env,
): InferenceSettings {
  const mediaResolution = input.mediaResolution ?? env.GEMINI_MEDIA_RESOLUTION ?? "default";
  const rawSeed = input.generationSeed ?? env.GEMINI_GENERATION_SEED ?? 42;
  const generationSeed = typeof rawSeed === "number" ? rawSeed : rawSeed.trim() ? Number(rawSeed) : 42;
  if (mediaResolution !== "default" && mediaResolution !== "low")
    throw new Error("Gemini media resolution must be default or low.");
  if (!Number.isSafeInteger(generationSeed) || generationSeed < 0 || generationSeed > 2147483647)
    throw new Error("Gemini generation seed must be an integer between 0 and 2147483647.");
  return { mediaResolution, generationSeed };
}
