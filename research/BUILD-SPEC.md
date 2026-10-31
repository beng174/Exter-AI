# Exter AI — Build Spec for Limitations 1, 2, 3, 4, 7 and 8

**For:** Codex. Save this file as `research/BUILD-SPEC.md` in `beng174/Exter-AI` and implement it phase by phase, in the order below.
**Goal:** Exter must produce its intelligence, its estimates and, eventually, predictive creative scores **from public data only**. Connecting a client's ad account is an optional extra, never a requirement.

---

## Rules that apply to every phase

1. **Every number has a type**, stored in the database and shown in the UI:
   - `observed`: published by the source (e.g. Meta's UK reach figure, Instagram like count).
   - `estimated`: calculated from observed numbers plus stated assumptions (e.g. spend = impressions × CPM).
   - `modelled`: predicted by a trained model (e.g. reach for an ad whose reach isn't published).
   - `unavailable`: never filled with a guess or a zero.
2. **Every estimate or modelled value** is stored as `low / mid / high`, together with `method`, `inputs` (the IDs of the inputs used), `assumptions_version` and `computed_at`.
3. **No uncited claims.** Every statement the engine generates must link to one or more evidence IDs, and the UI must be able to open those records.
4. **Swappable providers.** Every external service (Gemini, data providers, embedding models) sits behind an interface, so it can be replaced without rewriting the pipeline.
5. **Idempotent jobs.** Running any job twice must never create duplicates. A crash must never lose completed work.

---

## Phase 0: Hosting, secrets and budget guardrails

**Benjamin's prerequisites:**

- A hosting account (Render or Railway), connected to the `beng174/Exter-AI` GitHub repo.
- `GEMINI_API_KEY` entered as a secret in the host's environment settings.
- A budget alert set in Google Cloud Billing.

**Codex never receives account passwords or dashboard access.** Codex deploys by pushing to GitHub, and the host auto-deploys.

Codex tasks:

1. Add a `Dockerfile` and a host blueprint (`render.yaml` or `railway.json`) defining four parts:
   - `web`: the app and API
   - `worker`: the job queue consumer
   - `scheduler`: cron jobs that enqueue collection jobs
   - `postgres`: with the `pgvector` extension enabled
2. Store media in object storage, either S3-compatible or the host's persistent disk, configured through `MEDIA_STORAGE_*` environment variables.
3. Read all credentials only from environment variables: `GEMINI_API_KEY`, `META_ACCESS_TOKEN`, `APIFY_TOKEN`, `YOUTUBE_API_KEY` and `DATABASE_URL`. Log their presence at startup, never their values. Add a CI check that fails if a key pattern appears in the repo.
4. **Spend guardrails inside Exter:**
   - a `monthly_budget_gbp` setting per cost type (inference, data providers)
   - a cost ledger table recording every Gemini and provider call with its cost
   - jobs pause, with a visible banner, when 90% of a monthly budget is used
5. Write `docs/DEPLOY.md` covering: how to deploy, how to add or rotate a secret, how to restore a backup, and how to read the logs.
6. Turn on daily database backups on the host, and test a restore once.

---

## Phase 1: Connect Gemini live

**Benjamin's prerequisite:** the API key is in `.env` as `GEMINI_API_KEY`. Billing is enabled on the Google Cloud project, so it's on the paid tier.

Codex tasks:

1. Load `GEMINI_API_KEY` from the environment and fail with a clear message if it's missing. Add `.env` to `.gitignore`, and add a `.env.example` containing placeholder values only.
2. Make the model configurable with `GEMINI_VIDEO_MODEL`. At startup, call the models list endpoint and confirm the model exists. At the time of writing, the current Flash model with agentic video is `gemini-3.7-flash`.
3. Upload each stored video through the Files API. Wait until the file's state is no longer `PROCESSING` before sending the analysis request.
4. Support both processing modes:
   - **Agentic:** in the Interactions API, set `processing: "agentic"` on the video input. In the GenerateContent path, set `media_processing: "AGENTIC"` (`mediaProcessing` in JS).
   - **Static with a custom frame rate:** use 2–4 fps for ads of 60 seconds or less, so fast cuts in the hook aren't missed.
   - Decide the default mode by accuracy on the labelled set (Phase 5), not by assumption. Google's docs note that static can still be preferable for short clips.
5. Use structured output with a JSON response schema, matching the fields in the existing native-video brief. Low-confidence fields return `"unknown"`.
6. Persist, per analysis: the raw response, input and output tokens, calculated cost, model ID, processing mode, prompt version and timestamp.
7. Retry with exponential backoff on 429 and 5xx errors. Make concurrency configurable, with a default of 3.
8. Use the Batch API for backfills of more than 100 videos, since it's priced at roughly half the standard rate.
9. **Live smoke test:** run 25 real Valentte ads and produce `research/gemini-live-report.md` containing: success and failure counts, failure reasons, average tokens and cost per ad, total cost, and 5 full sample outputs for Benjamin to review.

**Acceptance:** at least 24 of 25 ads analysed, cost reported, raw responses stored, no API key in git history.

---

## Phase 2: Complete public collection

### 2.1 Data model

- `sources` (platform, connector, config)
- `watchlists`: one per workspace. Each lists advertisers (Meta page IDs, Google advertiser IDs or domains, TikTok and Instagram handles) plus category keyword searches.
- `collection_runs`: source, watchlist, started_at, finished_at, status, records_new, records_updated, errors (JSON).
- `ads`: platform, native_id (unique per platform), advertiser_id, first_seen_at, start_time, stop_time, last_seen_active_at.
- `ad_observations`: **one row per ad per run.** Holds active status, reach figures, impression ranges, platforms and raw payload. This table is the history; it is never overwritten.
- `media_assets`: sha256, perceptual hash (pHash for images, video keyframe hash), storage path, duration.
- `organic_posts` and `post_metric_snapshots` (one row per post per check).

### 2.2 Meta Ad Library API (primary source)

- Endpoint: `https://graph.facebook.com/v25.0/ads_archive`. Read the version from config, since Meta releases a new one quarterly.
- Coverage: commercial ads appear only if they were delivered to the UK or EU, and stay searchable for one year. Show that note wherever Meta data appears.
- Query by `search_page_ids` for watchlist advertisers, and by `search_terms` for category discovery. Use `ad_reached_countries=["GB"]` plus any relevant EU countries, and `ad_active_status=ALL`.
- Request these fields: `id, page_id, page_name, ad_creation_time, ad_delivery_start_time, ad_delivery_stop_time, ad_creative_bodies, ad_creative_link_titles, ad_creative_link_descriptions, ad_creative_link_captions, ad_snapshot_url, publisher_platforms, languages, target_ages, target_gender, target_locations, eu_total_reach, total_reach_by_location, age_country_gender_reach_breakdown, beneficiary_payers`.
- **Reach is the key field.** `total_reach_by_location` supports EU, BR and UK. Store it as `observed` reach. This is the denominator the current Valentte records are missing, so re-collect Valentte with these fields.
- Pagination: follow `paging.next` until it's exhausted, saving the cursor so an interrupted run can resume.
- Rate limits: read the usage headers and back off before hitting the limit.
- Media: the API returns `ad_snapshot_url`, not the media file. Use the existing browser workflow to open the snapshot and download the video or image into `media_assets`, then hash it.

### 2.3 Google Ads Transparency Center

- There is no official API. Use a provider adapter: first implementation an Apify Google Ads Transparency actor, alternative SerpApi.
- Store: advertiser ID, creative ID, format, first and last shown dates, regions, and **impression ranges (min/max) by region where Google publishes them**, as `observed` ranges.
- Run weekly per watchlist domain. Detect new and stopped creatives by comparing with the previous run.

### 2.4 TikTok

- The official Commercial Content API is restricted to approved researchers, and commercial users are not eligible. Don't build on it.
- Use a provider adapter that reads the public Commercial Content Library (EEA, UK and Switzerland ads). Mark this connector `experimental` and record which provider was used.
- Lowest priority of the platforms. Build it after Meta and Google pass acceptance.

### 2.5 Organic content (needed for engagement and creator work)

- **Instagram:** the Graph API Business Discovery endpoint, via Exter Media's own Instagram business account. It returns public business and creator accounts' follower counts and their media's like and comment counts.
- **YouTube:** the YouTube Data API (views, likes, comments). It's official and has a free quota.
- **TikTok organic:** a provider adapter, marked `experimental`.

### 2.6 Scheduling and reliability

- Use a job queue with persistent jobs (e.g. a Postgres-backed queue), not in-memory timers.
- Schedule:
  - Meta: daily per watchlist.
  - Google: weekly.
  - Organic posts: daily while a post is under 30 days old, then weekly until it's 90 days old.
- Every job is an idempotent upsert keyed by `(platform, native_id)`. Observations are inserted, never updated.
- Store `last_successful_check` per source per advertiser and show it next to every chart and answer.
- A failed source shows as **failed** in the UI with its reason. It is never silently empty.

**Acceptance:** two consecutive Valentte runs produce zero duplicate ads and two observation rows per active ad. Killing the worker mid-run and restarting completes the run without loss or duplication.

---

## Phase 3: Computed estimates (Exter fills the gaps itself)

Build a **metric registry**: a table or code module where each metric has a name, definition, formula, input metrics, output type (`observed`, `estimated` or `modelled`) and version. All metrics below are registered there.

### 3.1 Observed base metrics

`reach_uk`, `reach_eu`, `google_impressions_range`, `days_active`, `is_active`, `variant_count`, `organic_likes`, `organic_comments`, `organic_views`, `followers`.

### 3.2 Estimated impressions

```
impressions = reach × frequency
```

- Frequency priors live in an editable config table, keyed by days active (≤7, 8–30, 31–90, >90) and platform, each with a low, mid and high value.
- Seed values are **assumptions** that Benjamin supplies from his paid media experience. Label them as such in the UI, and version them with `assumptions_version`.

### 3.3 Estimated spend

```
spend = impressions / 1000 × CPM
```

- CPM bands live in an editable config table keyed by country × platform × month (Q4 is higher), with low, mid and high values.
- Seed values come from Benjamin's experience across his accounts, entered as aggregate benchmarks only, with no client-identifiable data.
- Always show spend as a range, e.g. "£3.1k–£6.8k (estimated)", never as a single number.

### 3.4 Modelled reach (for ads whose reach isn't published)

- Train a quantile regression model (LightGBM, quantiles 0.1 / 0.5 / 0.9) on ads that **do** have observed reach. Features: days active, variant count, number of publisher platforms, format, the advertiser's median reach per day, the advertiser's count of active ads, and month.
- Predict reach for ads without it and label the result `modelled`, with the 0.1–0.9 interval.
- Report the model's error on held-out ads that have real reach. If the median absolute percentage error is above 50%, show the field as `unavailable` instead.

### 3.5 Longevity

- `days_active = (stop_time or last_seen_active_at) − start_time`. Set `censored = true` while the ad is still running.
- `relative_longevity = days_active / the advertiser's median days_active`. Compute it only for advertisers with at least 10 ads and at least 3 stopped ads; otherwise it's `unavailable`. Normalising per advertiser removes the "this brand never turns anything off" bias.

### 3.6 Scaling and iteration

- **Duplicates:** the number of ad IDs sharing the same media hash. A brand reusing one creative across many ads is putting money behind it.
- **Concepts:** cluster each advertiser's creatives by embedding similarity of transcript, hook and visual description (using Gemini embeddings). A concept is a cluster.
- **Iteration count:** the number of new variants in a concept launched within 45 days of the concept's first ad. Brands iterate on winners.

### 3.7 Organic engagement (only with a declared denominator)

- Match each ad creative to an organic post through the media hash first, then embedding similarity above a threshold. Store the match confidence.
- `engagement_per_view = (likes + comments + shares) / views`
- `engagement_per_follower = (likes + comments) / followers` (at the time of the snapshot)
- Never mix the two, and never compute either without its denominator.

### 3.8 Share of voice

`sov = an advertiser's estimated impressions / the watchlist's total estimated impressions`, per week. Show it as a range, propagating the low and high values.

### 3.9 Proven-ad signal, v0 (rules; replaced by the model in Phase 6)

An ad is `proven_v0` if:

- it ran at least 30 days, **and**
- it is in the top third of `relative_longevity` for its advertiser, **and**
- it meets at least one of: duplicates ≥ 2, iteration count ≥ 2, or (where reach exists) top third of reach per day for its advertiser.

### 3.10 UI

- Badges: Observed / Estimated / Modelled / Unavailable.
- Hovering an estimate shows its formula, inputs and assumptions version.
- A coverage line on every view, e.g. "Reach published for 41 of 58 ads; modelled for 12; unavailable for 5."

**Acceptance:** every metric for the 58 Valentte ads has a type. Spend shows as a range. Modelled reach reports its holdout error.

---

## Phase 4: The intelligence engine

### 4.1 Evidence store

- Postgres with `pgvector`.
- An `evidence_items` table holding atomic statements, each with: source record ID, type (ad hook, ad claim, transcript segment, on-screen text, review sentence, comment), text, timestamp within the media (if any), and embedding.
- Populate it from Gemini analyses (Phase 1), reviews and comments.

### 4.2 Retrieval

- Hybrid search: full-text plus vector search, merged with reciprocal rank fusion.
- Filters: workspace, advertiser, category, platform, date range, evidence type, `proven_v0` / model score.
- Expose it as a tool function: `search_evidence(query, filters, k)`.

### 4.3 Tension clustering

- Use the LLM to extract **tension statements** from reviews and ads, typed as `problem`, `desire`, `objection` or `outcome`, e.g. "watch stops when not worn" (problem) or "worried it's noisy at night" (objection).
- Embed them and cluster with HDBSCAN. The LLM names each cluster from its 10 most central members.
- Compute, per cluster:
  - review frequency (how often customers raise it)
  - competitor coverage (how many watchlist advertisers' ads address it)
  - share of estimated impressions behind it
  - proven-ad rate (the share of ads addressing it that are proven, or their mean model score)
  - the client's own coverage

### 4.4 Opportunity scoring (transparent formula, components shown)

- **Gap opportunity:** customers raise it often, competitors rarely address it.
- **Proven opportunity:** competitors address it, with a high proven rate, and the client doesn't.
- **Saturated:** high coverage and low proven rate. Avoid.
- Each opportunity lists its top 5 supporting evidence items.

### 4.5 Brand-voice profile

- Input: the client's site copy, their existing ads and their organic posts.
- Output as JSON: tone attributes with examples, the vocabulary customers use (from reviews) versus the vocabulary the brand uses, phrases to avoid, and the reading level.

### 4.6 Reasoning workflow (replaces the rules-based assistant)

A fixed pipeline, not open-ended chat:

1. **Plan:** turn the question into sub-questions and a list of needed metrics.
2. **Retrieve:** call `search_evidence`, plus SQL metric tools (`get_metric`, `compare_advertisers`, `get_concepts`).
3. **Analyse:** draft findings. Each finding is `{claim, evidence_ids, metrics_used, confidence}`.
4. **Verify:** a separate check rejects any claim without evidence IDs, and any number that doesn't match the metric tool output. Drop or rewrite until everything passes.
5. **Output:** return either the answer, or opportunities plus briefs.

The reasoning model sits behind a provider interface. Use Gemini Pro first, with structured outputs.

### 4.7 Creative brief template

Each brief contains: the angle and tension it targets, 3 hook options, recommended format and length, script beats, proof points, the creator profile needed, the brand-voice notes that apply, and the evidence behind each choice.

### 4.8 Golden-question evaluation

Benjamin writes 20 real client questions with what a good answer must contain. Run them after every engine change and score coverage of the required points, citation validity and numeric accuracy.

---

## Phase 5: Accuracy and scale (limitation 7)

### 5.1 Labelling tool, inside Exter

- Shows the ad (video player, copy) and the label fields as dropdowns, each with an `unsure` option.
- The labeller can't see the model's output.
- Stores the labeller, the time taken and any notes.

### 5.2 Labelling guide

Write `research/LABELLING-GUIDE.md` with a definition and 2 examples for every value of every field (format, hook type, angle, person on camera, UGC evidence, offer type, CTA). Benjamin reviews and edits it before labelling starts.

### 5.3 Sample

- 200 ads, stratified: at least 10 advertisers, a mix of video and static, of formats, and of lengths.
- Hold out 50 as a **test set** that is never used to tune prompts.
- Benjamin re-labels 30 ads a week later, to measure his own consistency.

### 5.4 Metrics, per field

- Accuracy, macro F1, a confusion matrix, and Cohen's kappa against Benjamin's labels.
- A field ships only if test-set accuracy is at least 85% **and** kappa is at least 0.7. Otherwise mark it `beta` or hide it.
- If Benjamin agrees with himself less than 80% of the time on a field, the definition is too vague. Rewrite the guide before blaming the model.
- Write `research/accuracy-report.md`, comparing processing modes (agentic vs static) and providers.

### 5.5 Scale test

- Run 5,000 ads and 1,000 videos through the full pipeline, using the Batch API.
- Report: throughput, p95 time per item, failure rate (target under 1%), duplicate rate (target 0), cost per ad, total cost, and database size.
- Kill the worker during the run and confirm it resumes cleanly.
- Write `research/scale-report.md`.

---

## Phase 6: Predictive creative scoring from public data only (limitation 8)

### 6.1 The core idea

Advertisers can see their own sales data, and they keep paying for ads that work and switch off ads that don't. **Their spending decisions, which are public through survival, scaling and reach, are the outcome label.** Exter learns which creative features predict that an ad will become a long-running, scaled ad.

### 6.2 Outcome labels

- `survives_30`, `survives_60`, `survives_90`: binary, with right-censoring handled.
- `scaled`: duplicates ≥ 2 or iteration count ≥ 2.
- `reach_per_day_tercile` (within advertiser, where reach exists).
- Primary target: `proven`, defined as survives_30 **and** top-third relative longevity **and** (scaled or top-tercile reach per day).

### 6.3 Exclusions (to remove noise)

- Catalogue and dynamic product ads: no creative decision was made.
- Advertisers with fewer than 10 ads, or no ads stopped in the last 60 days (they may never turn anything off).
- Ads with dated offers (e.g. "Black Friday ends Sunday"). They stop because the offer ended, not because they failed. Detect these from the Gemini analysis.
- Ads still running and under 30 days old: not yet resolved, so exclude them from training.

### 6.4 Features (all from public data)

- **Creative, from the Gemini analysis:** format, hook type, seconds until the product appears, person on camera, speaking to camera, captions present, cut count in the first 3 seconds, length, music or voiceover, claim types, social proof present, offer type, CTA, on-screen text density.
- **Copy:** length, question in the headline, emoji, price shown.
- **Context:** category, month, platforms, advertiser size (active ad count, median reach).
- **Embedding similarity** to the advertiser's and the category's existing proven ads.

### 6.5 Models

- Gradient-boosted classifier (LightGBM) for `proven`, calibrated with isotonic regression.
- Survival model (Cox proportional hazards or random survival forest) for days active, which uses still-running ads correctly.
- Nearest-neighbour retrieval: the 5 most similar proven ads, shown as evidence with every score.

### 6.6 Validation (must pass before any score is shown to clients)

- **Time-based split only:** train on ads launched before date T, and test on ads launched in the 60 days after T once their outcomes have resolved. Never a random split.
- Report: ROC-AUC, precision in the top 10% of scores, a calibration curve, and comparison against two baselines (advertiser base rate, and "same format as most recent proven ad").
- Ship threshold: AUC at least 0.65 **and** it beats both baselines on the time-split test set.
- Minimum data: about 3,000 resolved ads from at least 30 advertisers in the category group. Until then, show the `proven_v0` rule signal and label it "rules-based".
- Re-train monthly. Version every model and store the version against every score.

### 6.7 Scoring a new, unlaunched creative

1. Upload the draft video or image.
2. Run the Gemini analysis to get features.
3. Score it with the model.

Output, for example: "62% chance of becoming a proven ad in this category (calibrated; model v3)." Include the top 5 feature drivers (SHAP values) in plain English, the 5 most similar proven ads with links, and the 5 most similar ads that failed.

### 6.8 Honest-claims rule

The UI and exports describe the score as "likelihood of becoming a long-running, scaled ad, based on how advertisers in this category behave". Never call it "predicted ROAS" or "predicted sales". Connected client accounts can later be used to calibrate the score against real conversions; that's optional.

---

## Build order summary

| Phase | Depends on | Can start |
|---|---|---|
| 0. Hosting and secrets | Host account, Gemini key, budget alert | Now |
| 1. Gemini live | API key | Now |
| 2. Collection (Meta first) | Meta identity verification + app | Now (in parallel with 1) |
| 5.1–5.3 Labelling tool and labels | Phase 1 outputs | After Phase 1 |
| 3. Computed estimates | Phase 2 Meta reach data | After Meta connector |
| 4. Intelligence engine | Phases 1–3 | After Phase 3 |
| 5.4–5.5 Accuracy and scale reports | Labels, pipeline | Ongoing |
| 6. Predictive scoring | ~3,000 resolved ads (needs months of collection history) | Build the pipeline early; ship scores when validation passes |

---

## Sources

- Gemini agentic video, `processing` parameter and model names: https://ai.google.dev/gemini-api/docs/video-understanding ; https://aireiter.com/blog/gemini-agentic-video-understanding-api ; https://pub.towardsai.net/gemini-agentic-video-understanding-pipeline-build-long-video-ai-that-does-not-waste-tokens-44f2f0bd3462
- Gemini billing and data use on the paid tier: https://ai.google.dev/gemini-api/docs/billing
- Meta Ad Library API fields, including `total_reach_by_location`: https://developers.facebook.com/docs/graph-api/reference/archived-ad/
- Meta Ad Library coverage (UK and EU commercial ads, one year): https://adsuploader.com/blog/facebook-ad-library-api ; https://docs.zernio.com/platforms/meta-ads/ad-library
- Google Ads Transparency Center data via providers (impression ranges by region): https://apify.com/amernas/google-ads-transparency-analyzer
- TikTok Commercial Content API eligibility: https://developers.tiktok.com/products/commercial-content-api ; https://www.keyapi.ai/blog/tiktok-research-api-commercial-trend-scanning/
