# Differentiation and build review

## 1 November 2026: Static request path and one-ad diagnostics

A hosted 14-creative report had no successful outputs and exposed that Static was
still sent through preview Interactions, with legacy Agentic defaults/restoration
in several entry points. Static now defaults throughout UI/API/service/CLI and
uses stable GenerateContent. Agentic preview is explicit; an old Agentic run
cannot resume under a Static selection or have earlier results relabelled.

Uploaded files must be ACTIVE before every generation dispatch and retry. Server
errors and transport/response-read timeouts use bounded exponential retries
(default three total attempts). Explicit rejections reuse one hold and final
rejections release it; ambiguous timeouts retain their hold before an independently
reserved retry. Outstanding reservations, original holds, token estimates and
provider-confirmed billed costs are separate. Billing is unavailable without a
provider invoice feed; historical unknown holds are preserved.

Retained videos are codec-probed and normalized to MP4/H.264/AAC when needed,
without overwriting the original. Source/upload SHA values and normalization
provenance are retained. A new authenticated Test one ad action works on one
verified stored video, image or carousel, without preparing or queuing a batch.
It exposes the full bounded, sanitised provider error and stage/status/details.
All credentials and sensitive URL values are redacted before persistence/display.
Live Gemini execution continues only on Render. Existing Docker tooling and
startup migrations cover the change; no new secret or manual migration is needed.

## 1 November 2026: source diagnostics and mixed-media smoke tests

The owner reported 12 retained videos and 38 unresolved sources. Preparation now
continues across all eligible candidates instead of stopping on the first source
restriction, retains per-ad HTTP/error details and retry history, and can refresh
URLs by reopening the exact ad snapshot. Verified images and complete carousels
are valid inputs; unordered variants and incomplete/mixed carousels remain
explicitly unavailable. No missing URL is labelled expired without evidence.

The hosted action runs the verified retained set once it contains at least 10 ads,
including the existing 12 videos, without forcing another round of downloads.
Native image/carousel inputs use the same budget ledger and retain structured
fields, raw responses, tokens, estimates and immutable source hashes. Reports
state actual sample size and video/image/carousel counts. A mixed or smaller
sample does not claim the original 25-video acceptance. The selected video mode
is passed through preparation/inference and displayed separately from image input.
No live Gemini inference runs in Codex. No new Render variables or manual
migrations are required; deploy this commit and refresh the app.

## 31 October 2026 follow-up: budgets, hosted smoke test and labelling

Implemented authenticated **Budgets & tests** with monthly GBP caps, usage,
90% threshold and pause reasons. The Render-only Gemini action prepares and
retains 25 verified playable Valentte inputs before inference, persists run/item
progress, raw responses and cost accounting, and downloads `gemini-live-report.md`.
Resume does not replay uncertain paid attempts. Retries and capability fallback
reserve separately; unknown usage and costs remain explicit.

Implemented blind human labelling with seven dropdowns, labeller identity, server
timing, notes and append-only JSON/CSV exports. Known video and unresolved dynamic
creatives cannot be reviewed from thumbnails. `LABELLING-GUIDE.md` is a draft for
Benjamin's review, covering every allowed value with definitions and two examples.
Static-image byte retention, stratified sampling and measured accuracy are later
work; no human or Gemini accuracy result has been invented.

Validation: production TypeScript/Vite build, unit/API suite, disposable PostgreSQL
integration tests, and authenticated desktop/mobile browser checks passed. Browser
checks exercised cap persistence, paused state, Render-only live-action guard,
blind review save/export, and full-video gating. No live Gemini inference ran in
Codex. The Docker image build could not finish because the execution environment
ran out of disk space; Render must build the image during deployment. The actual
24-of-25 live acceptance and current public media availability remain unverified
until the owner runs the action on Render. See `docs/DEPLOY.md` for exact setup.

The review below records the earlier baseline and remaining wider platform scope.

## Product direction and document precedence

Both supplied documents are preserved unmodified as `DIFFERENTIATION-BRIEF.md` and
`BUILD-SPEC.md`. They are specifications to assess, not evidence that the described
capabilities, APIs or model names already work. The current user request explicitly
prioritises authentication, Phase 0 and the Meta public connector.

The briefs conflict on the central product dependency. The differentiation brief
makes connected account results the moat and first milestone. BUILD-SPEC instead
requires public-data-only intelligence, with connected accounts optional. Implement
public collection and evidence-grounded recommendations as the base workflow;
retain the existing optional read-only private-account connectors. Only connected
results support statements about actual conversions, CPA, ROAS or customer value.
Public survival, scaling and reach can support labelled behavioural signals, never
“what actually converts.” The original positioning sentence must be qualified in
public-only prospect demos. Predicted public ad survival is not predicted sales.

The main deliverable should be a sourced, ranked decision about what to make next,
not another large ad library. Competitor ads are an input alongside customer
language and, when authorised, measured account results. Count, score, rank and
calculate in code; language models label, extract and explain. Do not let an LLM
invent missing measurements or evidence IDs.

## Existing implementation, checked against the differentiation brief

| Requirement | Existing capability | Gap / decision |
| --- | --- | --- |
| D1: real account outcomes | Read-only Meta/TikTok/Google reporting adapters; scoped imports; owned-only spend/conversion calculations | No complete configurable median-based winner/fatigue lifecycle or human-confirmed structured taxonomy. Real API permissions are required. Public metrics must remain separate. |
| D2: category benchmarks | Category-filtered workspace analytics | No contract consent flags, cross-client anonymisation or minimum-brand thresholds. Do not label existing comparisons anonymised client benchmarks. |
| D3: customer evidence | Stored review/sample research data and grounded website observations | No production review/returns/support ingestion or fully evidenced theme pipeline. Sample reviews are not client evidence. |
| D4: ranked angle map | Rule-based grounded answers, creative-format comparisons and reports | No full verified hybrid-retrieval reasoning pipeline, tension clusters, transparent opportunity score or fully cited brief generator. |
| D5: customer value | Owned conversion reporting only | No Shopify first-order attribution, cohort LTV, coverage or pseudonymised customer pipeline. |
| D6: creator tracking | Creator discovery, shortlist, creator-evidence checks in video analysis | No gifting ledger, disclosure audit, rights/expiry workflow or actual creator-to-LTV attribution. |
| D7: win-back | No implementation located | Requires Klaviyo access, persistent random assignment and a causal evaluation design; do not infer incrementality from ordinary attributed sales. |
| Structured taxonomy | Existing multi-label creative styles, video field schema and validation | Human review, controlled vocabularies across all fields and taxonomy versioning still needed. |
| Privacy/access | This change adds Basic Auth across the HTTP app | Shared credentials are an internal access gate, not individual users, workspace roles or an access audit. Client deletion, consent, minimisation and audited access remain necessary before personal customer data. |

Existing calculations already avoid treating competitor engagement as conversions.
Preserve these protections when introducing future estimates and models.

## Models and data sources actually present

- Gemini native video analysis uses a Files/Interactions adapter behind the
  `VideoAnalyser` interface. `GEMINI_API_KEY` is read server-side. The existing
  default model name is `gemini-3.8-flash`; the attached spec names
  `gemini-3.7-flash`. Neither name was validated live in this task, because the key
  is not injected into this cloud machine. Configure an actually available model
  using `GEMINI_VIDEO_MODEL`; do not present either name as verified availability.
- Local Hugging Face MiniLM and CLIP models are used for the existing research
  brain. Weights are downloaded and inference runs locally. Their model names and
  revisions are in `server/brain.ts`. This is distinct from paid Gemini inference.
- TwelveLabs Pegasus is explicitly a stub. No working OpenAI or Anthropic provider
  call was found in this build. Claude MCP exposes tools for an external client;
  that does not mean Exter's server calls Anthropic.
- Existing public collection supports submitted oEmbed URLs, bounded Meta browser
  capture, website research and dated Valentte cases. The new Meta API adapter
  does not imply every platform is connected or that historical cases are live.

## Implemented in this change

Authentication was pushed first as commit `69c7028`. All routes are behind the
same middleware, including static files and health checks; production refuses
missing or partial admin credentials. Tests cover both middleware behavior and
real app routes with subsequently mounted static files.

Phase 0 implementation adds the Docker image; Render web/worker/cron/PostgreSQL
blueprint; pgvector migration; disk configuration at `/var/data`; environment-only
credentials; tracked-text secret scanning in CI; a concurrency-safe cost ledger
and per-type monthly budgets; visible paused states; daily on-disk database
backups and restore instructions. The existing application's SQLite data remains
on the disk; new collection/queue/budget/history tables use PostgreSQL. This is an
incremental deployment, not a claim that all legacy storage and jobs migrated.

The Phase 2 Meta connector adds configurable Graph API version, public page-ID
and category queries, required reach fields, fixed-host cursor pagination,
usage-header backoff, per-page atomic commits, frozen run configurations and
lease-based resume. Missing credentials produce **Meta not connected**, including
in the UI; startup continues. Duplicate native IDs upsert once while subsequent
runs append observations. Replaying a committed page/run does not duplicate
history. Source failures remain visible. Reach is typed observed/unavailable;
missing stop time does not become a false claim that the ad is active. The UI
provides watchlist editing, run status and observation inspection. API credentials
are sent in headers, never pagination URLs, persistent payloads or log output.

## Acceptance evidence and remaining gates

- The final unit/API suite passes 110 tests, including real-app authentication,
  static-file protection, backup restore, and Meta transport validation.
- PostgreSQL 17 with pgvector was started locally. The dedicated integration test
  verifies repeated migrations, serialized budget reservations, daily scheduling
  idempotency, two ads with four observations over two runs, missing reach types,
  failed-source status, lease exclusion and resumption at the committed cursor
  after both simulated lease expiry and a real SIGKILL to a fixture worker process.
  The test advances the dead worker's lease to avoid waiting two minutes. Provider
  transport is a fixture, not Meta.
- A real `pg_dump`/`pg_restore` into a different local database restored two ads,
  four observations and the vector extension. The SQLite backup test verifies
  that a separate database opens and reads committed content from its online backup.
- TypeScript, the Vite production build and the Docker image build passed. The
  running image returned 401 without credentials and 200 with credentials for
  `/`, `/api/health`, `/favicon.svg` and `/api/infrastructure/status`. A workspace
  created through the authenticated API survived a container restart on its disk.
  The container produced both SQLite and PostgreSQL backups; its actual automatic
  PostgreSQL dump restored four observations into another local database.
- The live Render `/api/health` endpoint returned 401 without credentials after
  the urgent authentication commit. Authenticated production access cannot be
  checked without the existing Render admin credentials, which are not available
  to this cloud task.
- No Gemini/Meta credentials or DATABASE_URL were available in this cloud machine.
  No live Meta collection or Gemini billing/model check was performed. No live
  accuracy, scale or predictive scoring report is asserted.
- Render's free instance cannot attach a disk. Applying paid infrastructure,
  connecting all services, preserving current ephemeral SQLite/media, verifying
  managed backups/PITR and running a host-backup restore require Render owner
  actions. A Git push alone does not perform those actions.
- Cost ledger amounts are conservative estimated reservations per HTTP attempt,
  not observed invoices. Exact token/cost reconciliation and validated pricing
  assumptions remain Phase 1 work. Provider billing alerts remain external.
- Automatic snapshot media download and projection of new collection data into
  legacy analytics remain unfinished. Google/organic/TikTok Phase 2 connectors
  are not implemented by the Meta work.

## Remaining build sequence and practical feasibility

1. Finish Phase 0 host activation and managed restore verification; then configure
   Gemini securely, validate available models and pricing, store raw response/usage
   provenance, add retry and batch behavior, and run the actual 25-ad acceptance.
   Existing native video tests cover upload/poll/structured outputs and scoped
   immutable media, but do not substitute for this live gate.
2. Complete Meta live acceptance after app approval: two real Valentte collections,
   UK/location reach verification, permission-field compatibility and a real
   process-kill recovery exercise. The current local recovery test kills a fixture worker and advances lease expiry;
   it does not establish behavior of a deployed Render worker. Then add the
   Google provider; experimental TikTok stays last. Validate organic permissions
   independently; Meta Ad Library access is not Instagram Business Discovery access.
3. Implement the metric registry and versioned assumptions. Frequency/CPM values
   must come from the owner; do not invent seeds. Missing data remains unavailable.
4. Add evidence retrieval, citations, tension clustering and transparent opportunity
   scoring; keep all numeric claims checked against code/SQL tool outputs.
5. Complete blind labelling and the 200-ad/50-holdout evaluation. Do not publish
   made-up accuracy, kappa or scale reports. Golden questions and human labels are
   owner inputs. Compare static/agentic modes on those labels.
6. Train public behavioural models only after sufficient resolved, representative
   history exists. Enforce advertiser exclusions, censoring, time-split evaluation,
   calibration and baseline gates before showing scores. This cannot be accelerated
   merely by writing training code or duplicating ads.

Indicative engineering ranges after access/data are ready (not fixed delivery
promises): Phase 1 hardening/live acceptance 3–7 days; remaining Phase 2 collection
and media 1–3 weeks; Phase 3 metrics 1–2 weeks; Phase 4 intelligence 2–4 weeks;
Phase 5 tools/evaluation 1–3 weeks plus human labelling; Phase 6 model pipeline
2–4 weeks plus collection history. Connected-account differentiators are a separate
scope: full D1/tagging/lifecycle about 2–4 weeks; Shopify/D5 another 2–4 weeks;
D6 about 1–2 weeks; D2 about 1–2 weeks after consent/sample prerequisites; D7 about
1–2 weeks after audience/holdout design. Review estimates after real API access.

Meta identity/app approval, a Google Ads developer token for private reporting,
separate provider credentials for Google public transparency, Shopify read scopes,
and customer-evidence permissions are distinct prerequisites. Prefer the official
Meta API for eligible UK/EU commercial data; evaluate a licensed provider only for
specific measured gaps. Do not build a general scraper platform. Hosted personal
data requires access controls, retention/deletion, consent and provider processing
terms beyond this internal Basic Auth deployment.
