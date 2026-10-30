import {
  VideoProviderError,
  type VideoAnalyser,
  type VideoAnalyserInput,
  type VideoProviderResult,
} from "./types.js";

/** Deliberate benchmark boundary: never manufacture Pegasus results or scores. */
export class TwelveLabsPegasusAnalyser implements VideoAnalyser {
  readonly provider = "twelvelabs";
  readonly model = "pegasus";
  readonly implemented = false;
  async analyse(_input: VideoAnalyserInput): Promise<VideoProviderResult> {
    throw new VideoProviderError("not_implemented", "TwelveLabs Pegasus is a provider stub. Add an authenticated native-video adapter before benchmarking it.");
  }
}
