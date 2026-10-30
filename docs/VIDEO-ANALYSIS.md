# Native video analysis

Exter retains each video's actual bytes before analysis and submits the stored file to a swappable `VideoAnalyser`. The first provider is Gemini Flash using the Files and Interactions APIs. The current default is `gemini-3.8-flash`; set `GEMINI_VIDEO_MODEL` to a supported Flash model when changing provider configuration. The TwelveLabs Pegasus implementation is an explicit stub and produces no benchmark predictions.

This replaces the planned frame-sampling, external speech-transcription and OCR pipeline. Gemini reads the native video, its audio and on-screen text. Exter owns media retention, prompts, validation, structured storage and comparisons. Claude remains an optional consumer of saved results. Native-video computation is performed by the configured external model provider, not by the existing local still-image model.

## Configure the full application

Install Node.js 24+, project dependencies and `ffprobe` (part of FFmpeg). Set `GEMINI_API_KEY` through server secret configuration. Do not paste credentials into chat or commit them. The example [.env.example](../.env.example) documents variable names; it is not automatically loaded by the application.

- `GEMINI_API_KEY`: server-side Gemini API credential.
- `GEMINI_VIDEO_MODEL`: Gemini Flash model ID; default `gemini-3.8-flash`.
- `EXTER_VIDEO_CONFIDENCE`: confidence threshold; default `0.75`.
- `EXTER_MEDIA_ROOT`: persistent video directory; default `.data/media`.
- `EXTER_MEDIA_ALLOWED_HOSTS`: comma-separated public media-host allowlist; default `*.fbcdn.net`. Add an actual source host when integrating another platform.
- `EXTER_DB_PATH`: persistent SQLite path; default `.data/exter.db`.

The server and standalone scripts must preserve the configured outbound proxy and TLS trust. In the managed cloud environment, start Node with `NODE_USE_ENV_PROXY=1`. The browser-only test drive does not perform uploads or model inference.

## Retain media before inference

The media store streams an allowed public HTTPS video into a temporary file, checks its byte limit, container signature and `ffprobe` video/duration metadata, then publishes an immutable hash-addressed object and per-ad manifest. Defaults are 250 MB and 600 seconds. Unsupported content, private-network addresses and invalid redirects fail without publishing a successful media object.

The manifest records the content hash, byte size, media type, duration, source ad/workspace, storage time and a source URL without its signed query. Later analysis reuses verified local bytes even after the original ad-library URL expires. A fresh URL is needed when the video has not yet been retained. `ffprobe` verifies the container; it does not extract analysis frames.

When a source record contains grouped variants, the current CLI selects its first exposed video file. The saved media hash identifies exactly that asset; results do not describe other variants in the group.

Put the media root and database on persistent volumes and back them up together. The local media implementation is not yet a cloud object-storage service. Downloading video also does not provide continuous collection, authentication or client isolation; those deployment tasks remain in the [completion plan](../research/COMPLETION-PLAN.md).

## Processing and structured output

The primary native-video input uses Interactions API `processing: "agentic"`. One inference request per ad attempt returns a structured JSON object. Files API upload, ACTIVE-state polling, model metadata and remote-file deletion are transport calls in addition to the inference request. Cleanup attempts to delete Gemini's remote file when the attempt ends; Exter keeps its own local copy. A cleanup failure does not turn a completed analysis into a fabricated failure or guarantee that the remote file was removed.

Only a provider response explicitly rejecting agentic capability triggers the static fallback. In that attempt the same stored file is supplied as native video clips: 5 FPS for seconds 0–5 (or the duration if shorter), followed by 1 FPS over the remainder, within the same inference request. Timestamps always refer to the original video. This can require two inference attempts total; both processing modes and outcomes are recorded. Authentication, rate limits, network failures and invalid JSON are reported without silently switching modes.

The returned fields are:

- Hook description, restricted to seconds 0–3.
- Format: `UGC`, `founder-led`, `studio`, `animation`, `mixed` or `unknown`.
- Angle, advertiser key claims, spoken transcript segments and on-screen text segments.
- CTA and whether a person talks to camera (`true`, `false` or `unknown`).
- Creator evidence: exact partnership-label or visible third-party handle, source and available timestamps.

Each scalar field and each list item carries a confidence estimate and supporting timestamp ranges. Low-confidence or unsupported observations become `unknown`; missing fields do not become fabricated negative observations. Claims are what the advertiser said, not independently verified product facts. Confidence scores are model estimates and need empirical validation.

A casual visual style, first-person voice or person talking to camera does not establish UGC or influencer origin. A UGC label requires recorded paid-partnership/creator-handle evidence. The brand's own handle is excluded. External ad-library evidence must match source-verified context; a model cannot manufacture it. Founder identity must come from explicit source information rather than facial identification.

## Versioned history and reruns

Each saved analysis identifies its ad/workspace, retained media ID and SHA-256, provider, requested model, provider-reported model, provider-reported model version, processing mode, prompt version, creation time, confidence threshold and covered intervals. Unknown provider versions remain `null`; an unpinned model alias is not represented as an immutable model revision. Retain original predictions when changing models or prompts so comparisons use the same media.

Job records and completed analyses persist in SQLite; successful runs are append-only. A single worker serializes requests. On server startup, unfinished jobs are marked `interrupted` rather than silently replaying a possibly billable remote call. Submit a new explicit request to retry; retained media and prior runs remain available. Matching saved results are reused unless forced. Durable native-video job records do not imply that a general scheduled collection worker, distributed queue or hosted production service is complete.

## Run the CLI

Use an existing real ad/workspace in Exter. The CLI accepts either the ad's Exter ID or native library ID. A raw Meta capture can supply the matching video URL without placing an expiring signed URL in shell history. Keep raw capture files outside the repository.

First retain the video without making an inference request or requiring a Gemini credential:

```sh
npm run video:analyse -- \
  --brand-id WORKSPACE_ID \
  --ad-id AD_LIBRARY_ID \
  --capture /tmp/meta-capture.json \
  --download-only
```

Then analyse the retained video and export that prediction:

```sh
npm run video:analyse -- \
  --brand-id WORKSPACE_ID \
  --ad-id AD_LIBRARY_ID \
  --provider gemini \
  --mode agentic \
  --output /tmp/gemini-predictions.json
```

Available options:

| Option | Meaning |
| --- | --- |
| `--brand-id`, `--ad-id` | Required existing workspace and real ad identifiers. |
| `--capture PATH` | Read the matching advertiser/ad from a raw Meta JSON capture and select its first video. |
| `--video-url HTTPS_URL` | Supply an allowed public video file URL instead of a capture. Mutually exclusive with `--capture`. |
| `--download-only` | Retain and verify media without calling the model. |
| `--provider gemini\|twelvelabs` | Select Gemini or the explicit, non-operational Pegasus stub. Default: Gemini. |
| `--mode agentic\|static-high-fps-hook` | Select the initial processing mode. Default: agentic. |
| `--force` | Create a new inference run instead of reusing a matching saved result; prior runs remain. It does not force a new source download. |
| `--output PATH` | Save JSON output; analysis output contains a `predictions` array suitable for the evaluator. |
| `--recover-interrupted` | Mark unfinished jobs interrupted before proceeding. Use only when this process owns the worker and another worker is not running. |

Omit the source option when verified media has already been stored for the ad. `npm run video:analyse -- --help` prints the current syntax. Credentials belong in environment secret settings, never CLI arguments. Requesting the TwelveLabs stub produces an explicit unavailable result, not a substitute Gemini run.

## Full application API

The API uses Exter's stored ad ID, with workspace IDs required for scoped records:

| Endpoint | Result |
| --- | --- |
| `GET /api/video/status` | Provider implementation/configuration status and prompt version; no credential values. |
| `POST /api/video/jobs` | Queue `{brandId, adId, sourceVideoUrl?, provider?, processingMode?, force?}` and return a job. |
| `GET /api/video/jobs/:id?brandId=...` | Read the persisted job status and recorded attempt outcomes. |
| `GET /api/video/analyses?brandId=...&adId=...` | Read saved successful analysis history, latest first. |
| `GET /api/video/export?brandId=...&adId=...&analysisId=...` | Download a chosen run as `{ "predictions": [...] }`; without `analysisId`, exports only the latest run. Full history remains in `/analyses`. |
| `GET /api/video/media/:id?brandId=...&adId=...` | Stream retained video after matching its stored media, workspace and ad references. |

These routes inherit the application's trusted-local deployment boundary; scoped identifiers do not add user authentication. Retain the same media when comparing providers or prompt versions.

## Evaluate real ads

Have humans label actual retained ads in a copy of [the CSV template](../evaluation/video-labels.template.csv), independently of model output. The committed template contains only column headings, not invented ground truth. Export saved predictions and run:

```sh
npm run video:evaluate -- \
  --labels /path/to/human-labels.csv \
  --predictions /path/to/gemini-predictions.json \
  --predictions /path/to/pegasus-predictions.json \
  --output /path/to/comparison.json
```

Omit the Pegasus input until a real adapter has produced predictions. The evaluator never calls a model or uploads human labels. It uses the same labelled ads for every provider/model/mode/prompt group; missing predictions count as incorrect. Blank labels are skipped, while explicit `unknown` is a label. Complete predictions require the retained video's SHA-256; comparisons reject different video assets for the same ad. Include `mediaSha256` in human labels to verify the exact labelled clip, especially for grouped creative variants.

The report separates exact-match accuracy, lexical token F1, answer coverage, abstentions, missing predictions and timestamp agreement. Free-text overlap is not semantic correctness and should be reviewed by a person. Timestamp scoring uses IoU or a documented boundary tolerance. Stub results are marked unavailable rather than scored as a working provider. See [the evaluation guide](../evaluation/README.md) for CSV escaping, thresholds and scoring details.

No human-labelled real-ad accuracy figure is supplied. Provider tests use fixtures; a live Gemini credential and actual ad run are still required to establish end-to-end service access.

## Provider references

- [Gemini video understanding and native processing](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Gemini Interactions API](https://ai.google.dev/api/interactions-api)
- [Gemini Files API](https://ai.google.dev/gemini-api/docs/files)
