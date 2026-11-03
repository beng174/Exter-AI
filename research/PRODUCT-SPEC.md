# Exter product specification

Updated 3 November 2026. Status: requirements supplied in the conversation,
with unresolved details listed below. This file supersedes the implementation
priority in WINNING-ADS-SPEC.md. It is not a copy of an unseen full specification.

## Current priority

Build a stable, economical collection and analysis kernel. Defer further UI,
Working Score and weekly-report expansion until source APIs and the worker
pipeline meet their acceptance gates. Preserve existing ads, stored media,
paid analyses and read-only reports.

## How a video is analysed

1. Verify ownership and the retained media hash. Deduplicate identical media
   before extraction or inference; do not reuse labels across different ad-copy
   contexts without a matching context hash.
2. On the Render worker, use ffmpeg and PySceneDetect to normalise media, detect
   scenes and select bounded, source-timed frames.
3. Transcribe speech with faster-whisper. Classify audio with YAMNet so song
   lyrics and background music are not treated as spoken voiceover.
4. Extract timestamped text with RapidOCR. Detect face presence and product
   candidates using versioned worker adapters. Face presence does not establish
   identity, age, gender or audience demographics. A generic object detection
   does not verify a brand/product identity.
5. Send a compact, bounded evidence bundle to `gemini-3.1-flash-lite` for the
   shared categorical labels only. Do not ask Gemini to regenerate transcripts,
   OCR or lengthy explanations already produced locally.
6. Use `minimal` thinking. The user accepted this after provider documentation
   confirmed that this model does not guarantee fully disabled thinking. Record
   reported thought tokens separately from visible output tokens; unknown is
   null, not zero. Preserve requested and served model identifiers.
7. Escalate uncertain ads to the current full-video method under an explicit,
   versioned quality policy and the inference budget. Model self-confidence alone
   is not a calibrated escalation rule. Bound escalation volume and stop when
   budgets, evidence validity or worker resources do not permit another call.
8. Retain the current full-video method as the reference. Compare both methods on
   the same human-labelled set and media hashes before changing the default.

All extraction stages run on the worker, never on web startup. Cache keys include
media hash, stage/model versions and configuration. Each result retains source
timestamps, quality flags, cost basis, processing duration and artifact references.
Missing or failed stages remain explicit; they must not become fabricated labels.

## Public source connectors

- TikTok Commercial Content API: use `TIKTOK_CLIENT_KEY` and
  `TIKTOK_CLIENT_SECRET`, which are not set yet. Use server-side client-credentials
  tokens and the commercial ad-library endpoints, not private advertiser reporting
  or oEmbed as a substitute. Missing either key means `not_connected` with zero
  provider requests. Configured credentials do not prove access approval.
- Meta Ad Library API: finish against sanitised recorded responses, including
  empty pages, pagination, permission failures, rate limits and missing reach.
  Missing `META_ACCESS_TOKEN` means `not_connected` with zero provider requests.
- Credentials stay in secure runtime settings. Never print, log or commit them.
  Signed media URLs are transient transport data, not report/debug output.
- Preserve native IDs exactly, including integer IDs larger than JavaScript's
  safe integer range. Missing source metrics remain unavailable.

## Cost and reliability requirements

- Reuse verified media/features and completed results before paid dispatch.
- Enforce the existing inference and data-provider budgets on workers too.
- Separate reserved, token-estimated and actually billed cost. Unknown billing
  remains unavailable. Rejected 5xx retries reuse the existing reservation;
  uncertain dispatches must not be silently replayed after restart.
- Prefer compact structured outputs, stable prompt prefixes, bounded input and
  output, prompt/schema versions and regression evaluations over larger prompts.
- Keep the 512MB web service free of local ML model sessions. A worker memory
  benchmark and shared-artifact design are required before production extraction.

## Evaluation and release

The candidate pipeline stays behind a feature flag until its labelled-set quality,
total cost, escalation rate, peak RSS and recovery tests meet explicit targets.
Total cost includes worker CPU/memory and artifact storage, not just Gemini tokens.
The reference method and prior results remain available for rollback/comparison.

## Open details

- The complete revised product document and its original "How a video is
  analysed" section have not been attached. No additional requirements are assumed.
- Supply or locate sanitised recorded Meta responses; documented examples and
  synthetic tests must not be described as live recordings.
- Worker artifact access: the existing Render worker cannot read the web service's
  private `/var/data` disk. Choose shared object storage or another authenticated
  artifact transport before implementing cross-service extraction.
- Select and pin speech/audio/OCR/face/product model weights and verify licences.
- Calibrate quality/escalation thresholds against human labels. Existing model
  confidence values are not calibrated.
- Set model-specific GBP prices and measure worker capacity; no price or required
  plan size is invented here.
