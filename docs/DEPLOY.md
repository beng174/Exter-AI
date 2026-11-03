# Deploying Exter on Render

## Low-cost kernel release

This release adds durable kernel jobs, a scoped authenticated artifact broker,
an opt-in media staging worker and `/api/kernel/status`. It does not enable the
new extraction pipeline or automatically enqueue a worker job. Deploy the latest `exter-test-drive` commit using
the existing service configuration. Keep the current persistent disk, credentials
and reference Gemini model setting. No new Render resources or model downloads
are required for this release; do not apply the blueprint just for this change.

TikTok remains `not_connected` while either `TIKTOK_CLIENT_KEY` or
`TIKTOK_CLIENT_SECRET` is absent. Meta remains `not_connected` without
`META_ACCESS_TOKEN`. Configured credentials are not evidence of API approval.
Enter future credentials only in secure Render environment settings. The
candidate pipeline stays `not_ready` until live artifact transport, worker
capacity and labelled-set evaluation pass the gates in
[the kernel plan](../research/KERNEL-REBUILD-PLAN.md).

### Optional K02 media staging setup

Keep `EXTER_KERNEL_WORKER_ENABLED` unset or `false` for a normal deployment.
The following setup is only for checking the new media transport on an existing
worker; it does not analyse a creative or make an inference reservation.

1. Use the same existing `DATABASE_URL` on web and worker. Startup applies the
   additive `kernel_jobs` and `kernel_dispatches` schema under the migration lock.
   Existing SQLite ads, media and paid analyses are preserved.
2. Create a dedicated random 64-character hexadecimal service token using a
   password manager. Enter it directly as `EXTER_ARTIFACT_BROKER_TOKEN` in secure
   Render settings on web and worker. Do not put the value in chat or logs.
3. On web, set `EXTER_ARTIFACT_BROKER_WORKSPACES` to the canonical workspace IDs
   permitted for transfer, separated by commas. Find the actual IDs through the
   authenticated `/api/brands` response; do not assume a display name is an ID.
4. On worker, set `EXTER_ARTIFACT_BROKER_ORIGIN=https://exter-ai.onrender.com`,
   `EXTER_KERNEL_CACHE_PATH=/tmp/exter-kernel-cache`, and
   `EXTER_KERNEL_WORKER_ENABLED=true`. The cache belongs to this worker, and is
   allowed to be ephemeral. No additional disk is required for this transport
   check. A later extraction job must retrieve/reverify media after cache loss.
5. Redeploy the affected existing services. Check `/api/kernel/status` while
   signed in. `configured` describes settings, not a successful worker transfer.
6. Submit a same-origin authenticated JSON `POST /api/kernel/jobs` with
   `workspaceId`, `adId`, and `kind` (`video`, `image`, or `carousel`). Optional
   `mediaId` selects an immutable retained version; `imageIndex` is a zero-based
   carousel slide. Each image/slide uses its own file hash. Only already retained,
   verified media is accepted. This endpoint cannot select a model or start inference.
7. Read `GET /api/kernel/jobs/{id}?workspaceId={workspaceId}`. Success is
   `complete` with result stage `media-ready`. Repeating the same request returns
   the same job. A worker restart or stale lease must not create another job.
   Scoped JSON `POST /api/kernel/jobs/{id}/cancel` cancels active work;
   `.../resume` only resumes paused work. `review_required` paid work never
   resumes through this endpoint.

The broker accepts its machine token only for exact artifact download routes,
and only for the configured workspace allowlist. It grants no access to ordinary
app pages, health, status, job mutation or admin settings. The browser continues
to use the existing Basic Auth. Transport references contain hashes and scope,
never file paths, source URLs or provider credentials. The original retained file
is streamed without running ffmpeg, a browser or a local model on the web service.

Meta collection now pauses on permission, missing-key and budget errors until an
explicit manual collect request. Scheduled jobs do not resume those pauses.
Transient failures stop after five failed attempts for the current page; a
successful committed page resets that allowance and preserves the saved cursor.

## Current deployment and the new blueprint

The existing Node service auto-deploys `exter-test-drive`. A Git push updates its code,
but does **not** automatically apply `render.yaml`, add PostgreSQL, attach a disk, or
create a worker. No Render dashboard credentials are needed by Codex.

The blueprint defines web, worker, daily cron scheduler and PostgreSQL 17. The
migration enables pgvector. The web disk is mounted at `/var/data` (10 GB), holding
SQLite, downloaded media and rolling database backups. Render free web instances
cannot attach persistent disks: adopting this blueprint requires paid web, worker
and PostgreSQL plans. Review current Render prices before applying it. Keep a
single web instance while legacy application data lives in SQLite; separate workers
use PostgreSQL only. The worker currently consumes Meta public collection jobs;
video inference and the Gemini smoke runner execute in the web process, which owns
the media disk. Interrupted paid work requires explicit review and is never replayed
by a status request. A PostgreSQL migration of the legacy application is a
separate remaining task; do not run two independent SQLite copies.

1. Preserve existing `.data/exter.db` and media before redeploying or changing paths.
   A free ephemeral instance may already have lost earlier files; do not assume a
   disk migration recovers them. Copy a consistent online SQLite backup to
   `/var/data/exter.db` and media into `/var/data/media` before switching paths.
2. Apply `render.yaml` through Render Blueprints, or make matching changes to the
   existing service. Avoid creating a second public service accidentally. If you
   retain the Node runtime instead of Docker, build with `npm ci && npm run build`
   and start with `npm start`; install Chromium, ffprobe and PostgreSQL 17 client
   tools too. The Docker image includes these tools and is recommended for media
   preparation. A code push alone cannot convert an existing Node service to Docker.
3. Supply the variables below in Render environment settings. Reuse the existing
   admin username/password. Set the Meta token on **both web and worker** when
   approved; leave it absent until then. The scheduler does not need it.
4. Run `npm run db:migrate`. Web, worker and scheduler also run this idempotently at
   startup, using a transaction-scoped migration lock.
5. Check the web page with Basic Auth. Check `/api/health`,
   `/api/infrastructure/status` and the Meta collection panel using the same browser
   login. Every route, including health, static assets and unknown paths, requires
   authentication. Do not configure an unauthenticated HTTP health check: use
   Render's default TCP check. HTTPS is supplied by Render.
6. Sign in and open **Budgets & tests**. Save your monthly GBP caps for `inference`
   and `data_providers`. Zero pauses that cost type, including the official Meta
   connector's zero-cost requests. The page shows usage, the 90% pause threshold,
   the next inference reservation and the reason for any pause. Settings apply
   immediately; no Render restart is needed to change a cap. Configure a conservative
   `GEMINI_REQUEST_RESERVE_GBP` and both token prices before requesting live inference.
7. Set a Google Cloud Billing alert separately. Exter cannot configure your billing
   dashboard or guarantee a provider-side spending cap.

## Variables and secret rotation

All credentials come from environment variables. `.env` is ignored; locally copy
`.env.example` to `.env`. npm dev/start/worker/scheduler load it without overriding
injected environment values. Never put values in source, reports, commands pasted
into chat, screenshots or URLs. If a credential has been shared in chat, rotate it
in the provider console and enter its replacement directly in host secret settings.

| Variable | Use |
| --- | --- |
| `EXTER_ADMIN_USER`, `EXTER_ADMIN_PASSWORD` | Both required in production; partial configuration also fails in development |
| `DATABASE_URL` | PostgreSQL, internal Render connection string; no TLS verification bypass |
| `GEMINI_API_KEY`, `GEMINI_VIDEO_MODEL` | Optional until live video analysis; model availability is checked by the existing adapter on each analysis |
| `GEMINI_REQUEST_RESERVE_GBP` | Conservative GBP hold before inference; explicit 5xx retries reuse the hold, while ambiguous timeout retries reserve separately |
| `GEMINI_INPUT_GBP_PER_MILLION_TOKENS`, `GEMINI_OUTPUT_GBP_PER_MILLION_TOKENS` | Positive prices for the selected model, converted to GBP per million tokens. Set from current provider pricing; no default exchange rate or price is invented |
| `GEMINI_VIDEO_CONCURRENCY` | Web inference and smoke-test concurrency, default `3`, integer `1`–`10` |
| `GEMINI_MAX_RETRIES` | Extra attempts after HTTP 500/503/429 or transport timeouts, default `2` (three attempts total), integer `0`–`5`; exponential backoff honours bounded Retry-After |
| `CHROMIUM_PATH` | `/usr/bin/chromium` in the Docker image; needed only to resolve missing public Valentte media |
| `META_ACCESS_TOKEN` | Approved Meta Ad Library access; never required merely to start the app |
| `META_API_VERSION` | Defaults to `v25.0`; verify supported fields/version with your approved app |
| `APIFY_TOKEN`, `YOUTUBE_API_KEY` | Reserved for later connectors; no implemented paid calls yet |
| `MEDIA_STORAGE_TYPE`, `MEDIA_STORAGE_PATH` | `disk`, `/var/data/media`; unsupported types are rejected |
| `EXTER_DB_PATH` | Legacy application SQLite path, `/var/data/exter.db` |
| `EXTER_BACKUPS_ENABLED`, `EXTER_BACKUP_PATH` | `true`, `/var/data/backups` (default path); disk required |

Rotate a secret in its provider, replace the environment value on every relevant
Render service, redeploy/restart those services, then verify a small authorised
request. Revoke the old credential. Do not print secret values to establish that
they loaded. Startup logs report presence only for the configured provider names.
`npm run secrets:check` scans tracked text files for common credential patterns;
CI also runs it. This is a useful check, not proof that every possible secret
format or historical commit is clean.

## Budget and cost semantics

Reservations are serialized per cost type in PostgreSQL. A request that would
exceed 90% of the monthly budget is blocked before network dispatch; usage at the
threshold pauses further jobs. Month boundaries use UTC. Concurrent workers share
one ledger. The UI shows paused budgets and collection failures. Setting a higher
budget resumes collection on its next persisted retry, or on a new run once failed
work has completed. Never clear the ledger to bypass the cap.

Gemini holds and token prices are **estimates**, not provider invoices. Reserve
before a logical inference request. Explicit HTTP 5xx/429 rejections reuse that
hold during bounded retries, and a final confirmed rejection releases it. A
transport timeout or unreadable response can be ambiguous: retain its hold and
reserve separately before another possible charge. File operations and cleanup
have no inference hold. Successful known usage settles its hold to the token-based
estimate; unknown usage or unconfirmed release/settlement stays conservatively
reserved. The ledger preserves the original hold separately from its current
amount and status. Existing historical unknown holds are not retroactively cleared.

Reports and the one-ad diagnostic show **outstanding reserved budget**, **token-based
estimated processing cost** and **actually billed by Google** separately. No Google
billing/invoice feed is connected, so billed amounts remain **Unavailable**; neither
holds nor token estimates are presented as observed charges. Current model prices
and the reserve remain owner configuration. Keep provider billing alerts as well.
Production paid inference still requires DATABASE_URL and an enabled budget.

## Hosted Gemini smoke test

The authenticated action is restricted to Render's runtime. Do not move
`GEMINI_API_KEY` into Codex, a local `.env`, a shell command, or the repository to
run this test. Keep the existing key in the **web service** environment. The Meta
collection worker and scheduler do not execute this smoke test and do not need it.

1. Deploy the current commit from `exter-test-drive`. For automatic public media
   capture, use the Docker image (Chromium and ffprobe included), the mounted
   `/var/data` disk, `EXTER_DB_PATH=/var/data/exter.db`, and
   `MEDIA_STORAGE_TYPE=disk`, `MEDIA_STORAGE_PATH=/var/data/media`.
2. Keep `DATABASE_URL` and both administrator variables on the web service. Add
   positive `GEMINI_REQUEST_RESERVE_GBP`, `GEMINI_INPUT_GBP_PER_MILLION_TOKENS` and
   `GEMINI_OUTPUT_GBP_PER_MILLION_TOKENS`. Check that `GEMINI_VIDEO_MODEL` names a
   model available to your Google project. Redeploy after environment changes.
   Model availability is verified before uploading each input; an unavailable model
   produces a recorded failure, never a fabricated result.
   The successful report requested `gemini-3.7-flash` but recorded served model
   `gemini-3.8-flash`. To use the served model directly, set
   `GEMINI_VIDEO_MODEL=gemini-3.8-flash`, verify that the existing input/output GBP
   rates apply to it, and set `GEMINI_PRICING_MODEL=gemini-3.8-flash`. Alternatively
   keep the requested alias and bind the rates to the actual served model, or add
   exact served-model entries in `GEMINI_MODEL_PRICING_GBP_JSON` (see
   [configuration](VIDEO-ANALYSIS.md)). No prices are guessed. If the served model
   has no matching prices, the report shows an unavailable token estimate and
   retains its conservative hold. Do not relabel earlier reports or clear their
   reservations without reconciling actual provider usage.
3. In **Budgets & tests**, keep your chosen inference cap. The same 90% budget
   guard applies to videos, still images and carousels. No new Render environment
   variables are needed for image analysis. Preparing public media makes no Gemini
   calls and uses no paid discovery provider.
4. Your existing retained videos are reused, even if their old CDN links have
   expired. **Run Gemini smoke test** is enabled when at least **10 verified
   creatives** are stored; you can run the existing 12-video sample immediately.
   The button shows the exact number of stored inputs that will be analysed.
   A carousel counts as one ad, with every supported slide supplied to Gemini.
5. To add more inputs, select the desired **video processing mode**, then click
   **Prepare Valentte creatives**. Preparation checks every candidate until 25
   creatives are retained or the candidate set is exhausted. It includes the eight
   explicitly static records as well as the previous 50 video/dynamic candidates.
   A blocked snapshot does not end preparation for the remaining ads. Per-ad rows
   preserve the actual format, source error code, HTTP status and attempt history.
   Images and carousels are valid creative types, not video failures. Unsupported
   or unavailable image sets are listed separately. A missing URL stays **Other**;
   it is not proof of expiration. HTTP 403 is blocked/forbidden and HTTP 410 is
   expired or removed.
6. Use **Refresh failed media links** to reopen each unresolved ad's own snapshot
   page and capture fresh URLs. This bypasses the source cache and keeps already
   retained media. Ordinary preparation also makes one fresh-snapshot retry after
   a failed URL. Browser login/challenges are recorded and never bypassed. Old
   reports remain available with their original evidence; new attempts retain the
   recent failure history instead of erasing it.
7. **Static** is the default, including after a page reload. Agentic is a preview
   feature used only when explicitly selected. Before another full batch, choose
   one retained creative in **Test one ad** and click the button. It runs exactly
   that creative, even when fewer than 10 are stored, and shows the full sanitised
   Gemini message, request stage, HTTP/provider status and details. No preparation
   or other creative is silently queued. Credentials and sensitive URL values are
   redacted before persistence/display. The same result has a downloadable report.
   To proceed with a batch, click **Run Gemini smoke test**. This uses
   the verified stored set and does not wait for further source downloads. The
   chosen video mode is passed to preparation, diagnostics and inference and shown
   on the run. Static uses stable GenerateContent with a retained file; only an
   explicit Agentic selection uses preview Interactions. Every generation attempt
   and retry checks that the uploaded file is ACTIVE. Static videos up to 60 seconds use 3 FPS throughout. Image/carousel rows
   show **Image input** or **Carousel image inputs**, with no invented video FPS.
   Images use Gemini's native image input for format, hook/headline, angle, claims,
   on-screen text, offer and CTA. Retained images/slides can be opened from the table.
   Choose **Default** or **Low** media resolution before a one-ad or batch run.
   Default omits Google's override; Low explicitly requests lower media resolution
   and requires Static. Run both settings on the same labelled set to compare.
   Temperature `0` and seed `42` are defaults; optional `GEMINI_GENERATION_SEED`
   changes the fixed seed. Seed support is recorded per result. No new secret or
   manual database migration is required. Resume requires the saved mode and
   resolution and preserves the run's seed.
8. Download **gemini-live-report.md**. It records actual sample size and counts by
   format, per-ad tokens/costs, source diagnostics and up to five complete saved
   outputs covering available input types. A 12-video or mixed-media sample is
   exploratory and does not establish the original 24-of-25-video acceptance gate.
   Missing cost or usage is disclosed rather than filled with zero. Compare
   estimated costs with provider billing separately.
   The new audit tables show requested/served/priced models, source/upload pixel
   dimensions, requested FPS, estimated scheduled frames, actual frames only when
   reported, taxonomy tags and audio/claim review fields. Confidence remains
   uncalibrated and is not used to filter new outputs. Historical outputs keep their
   original schema; start a new run to get the new fields.

Before upload, ffprobe checks retained video encoding. Compatible MP4/H.264/AAC
(or silent H.264) inputs pass through. Other supported videos are normalized with
ffmpeg to MP4/H.264/AAC, using a bounded two-thread transcode. Original bytes stay
unchanged; normalized derivatives are verified/cached under the persistent media
root. Jobs/results record source and upload hashes, sizes, codecs and mode. The
existing Docker image already includes both ffmpeg and ffprobe. No new environment
variables or manual migrations are needed; startup applies the additive ledger
migration automatically.

Image storage supports JPEG, PNG and WebP, one still image or 2–10 ordered image
carousel slides. Every slide must be exposed and retained: no partial carousel or
unordered dynamic-creative variants are silently treated as a complete carousel.
Limits are 8 MiB/40 megapixels per image, and 14 MiB for the complete inline image
set before inference. Oversized sets fail before a paid request, with no omitted
slides. Images live under the configured persistent media root; their SQLite
metadata and analysis tables are created automatically at startup.

Runs and reports remain in the web SQLite database on the persistent disk.
Refresh and download are read-only. If the budget pauses, increase the cap and
click **Resume pending items** with the same explicitly selected mode as that
saved run. An old Agentic run cannot resume under a Static selection; start a new
Static one-ad diagnostic instead of relabelling earlier paid results. After a restart, completed work remains intact;
resume continues work that had not started. An uncertain paid attempt stays
interrupted for review. Starting a new test is an explicit new paid run.

## Human labelling

Open **Labelling** in a workspace containing real source ads. Read
`research/LABELLING-GUIDE.md` first: it is a draft for Benjamin's review, not an
approved measurement protocol. The tool shows original copy and creative while
withholding model predictions and prior labels. Retain full videos before review.
Choose a labeller name, start a review, complete all seven dropdowns (each supports
Unsure), add notes and save. Time taken is server wall-clock time including pauses.
Human reviews are append-only and include source/media identity, schema and guide
versions. Download JSON or CSV from the tool. The new smoke-test image store retains
image bytes, while binding those retained images into human labelling and the
stratified 200-ad/50-ad holdout sampling protocol remain separate follow-up work.

Official Meta calls are recorded at £0 per request; they still require an enabled
data-provider budget. No APIFY or other paid discovery call is implemented yet.
A future connector must call the same reservation interface before dispatch.

## Collection and recovery

Use the Meta collection panel in a real workspace: supply numeric advertiser page
IDs and/or category searches, and country codes (`GB` by default). Saving without
a token succeeds and displays **Meta not connected**. With approved access,
collection is queued. Valentte's previously verified page ID is `172851066181411`.

`npm run scheduler` enqueues one daily run per enabled watchlist. `npm run worker`
consumes persisted PostgreSQL jobs. Each run freezes its watchlist configuration,
stores a cursor and query index, and commits each page with its observations in
one transaction. A killed worker's lease expires after two minutes; another worker
resumes from the committed cursor. Provider-supplied pagination URLs are never
followed or stored; only the cursor is used on the fixed official host. Usage at
80% postpones the next page; failures use persisted exponential retry delays.
Errors remain visible rather than appearing as a successful empty source.

Ads are unique by platform/native ID. History is unique by ad/run; subsequent runs
append observations. UK/location and EU reach are stored as observed source data;
missing reach remains unavailable. An absent stop date does not prove current
activity, so status remains unknown unless the source supplies a stop. Public
collection does not infer spend, conversions, performance winners or model scores.
Collection data is shown in its own panel and evidence endpoint; it is not yet
projected into legacy SQLite analytics. Snapshot URLs are not media files. The
existing bounded browser collector and media store remain a separate workflow;
automatic snapshot media capture is still outstanding.

## Backups and restore

The web process makes online SQLite and custom-format PostgreSQL backups at
startup and checks hourly for the next UTC day when `EXTER_BACKUPS_ENABLED=true`.
It retains seven days on the mounted disk. PostgreSQL dumps are atomically renamed
only after pg_dump succeeds; credentials are passed through libpq's environment,
never as command arguments. Logs contain only success/failure summaries. Runtime
images include PostgreSQL 17 tools and ffprobe. Monitor failures: a sleeping,
stopped or unhealthy web process cannot guarantee daily backups.

Disk-local backups protect against logical mistakes, not loss of the entire disk.
Enable/verify Render's managed PostgreSQL backups/PITR for the selected paid plan
and verify persistent disk snapshots in Render. Add an off-host backup policy
before storing customer-level data. This requires the owner to verify the host
settings; committing a blueprint does not establish that backups are active.
Media is covered by a separate persistent-disk snapshot, not the database dump.

Restore into a **new**, empty database first:

1. Stop collection and video work. Preserve current files and take a fresh backup.
2. Select a dated `.dump` and `.sqlite` backup and the matching media snapshot.
3. In a secure shell with the replacement database connection already injected,
   configure libpq variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`,
   `PGDATABASE` and TLS settings) through secure environment settings or an operator
   service file, then run `pg_restore --no-owner --exit-on-error --dbname=""
   /path/to/backup.dump`. `PGDATABASE` must be the database name, not a URL.
   Never put a connection string or password in command arguments or enable shell tracing.
4. Open the restored SQLite backup separately; verify workspace/ad counts and
   reports, then replace `/var/data/exter.db` while the app is stopped. Do not copy
   a live SQLite file without its WAL; use the online backup instead.
5. Verify pgvector exists, observation counts and run cursors match, and sample
   media hashes resolve. Update DATABASE_URL to the restored database and restart
   web, worker and scheduler. Verify authenticated pages and APIs.
6. Keep the pre-restore copies until the restored workflow passes its checks.

Local restore validation is recorded in `research/IMPLEMENTATION-REVIEW.md`.
A local restore is not evidence of a restore from Render's own managed backups.

## Logs and validation

Use each Render service's Logs view. Web reports only credential presence,
startup port and sanitised backup summaries. Worker errors are stored as safe,
controlled messages in collection runs. Do not enable request-header, raw provider
response or connection-string logging. HTTP access logs must omit Authorization.

Run `npm test`, `npm run build`, `npm run secrets:check` and, against a dedicated
disposable PostgreSQL/pgvector database, `TEST_DATABASE_URL=... npm run test:infrastructure`.
The integration test truncates its test tables: never point it at production.
Neither CI nor fixture tests prove Meta approval, Gemini model availability or live
accuracy. Live reports must record real results and costs after secure credentials,
budgets, media, and labels are available.

## K03 scene extraction worker

Normal deployments require no configuration changes. Scene extraction remains
opt-in and never runs on the web service. The full labels pipeline stays disabled.
After the K02 live transfer check, build the optional `Dockerfile.worker` for the
existing worker and measure its peak memory before enabling scene work. This image
has pinned PySceneDetect/OpenCV dependencies; the ordinary web image is unchanged.
Set EXTER_KERNEL_SCENES_PATH to a separate worker cache directory and
EXTER_KERNEL_SCENES_ENABLED=true only on that worker. Existing staging settings
are also required. POST /api/kernel/jobs accepts stage="scenes" for retained videos;
its result is scenes-ready, not a completed analysis. Other requests still stage
media only. No inference or provider budget is reserved by either operation.

Feature cache entries expire after seven days; exact scope/hash/tool versions
control reuse. A root lock serialises extraction and crash cleanup. Feature output
is bounded to 128MiB per video and the feature cache to 2GiB, with 256MiB disk
headroom. Source downloads remain in the separate K02 cache; provision headroom
for both caches and validate overall retention on Render before production use.
Each process has a ten-minute watchdog; ffmpeg commands use one thread and a
three-minute timeout. Videos are limited to ten minutes and 250MiB. Up to eight
frames carry source times; missing audio stays absent. Near-duplicate media never
reuses an exact-match result. No model weights are downloaded by this stage.

## K04 offline audio adapters (validation pending)

No Render changes are required for this release. Keep EXTER_KERNEL_AUDIO_ENABLED
unset or false. The audio stage is not model-quality or capacity verified.
To prepare a later trial, the optional worker image can include audio libraries
with build argument EXTER_BUILD_AUDIO=true. Install a reviewed offline model pack
following worker/AUDIO-MODELS.md, then set EXTER_KERNEL_AUDIO_MODELS_PATH on that
worker. Do not add model dependencies or weights to the web service. Enable
EXTER_KERNEL_AUDIO_ENABLED only after the actual model and peak-memory checks.
POST /api/kernel/jobs accepts stage="audio" for retained videos, but queues it
without dispatch while the worker flag is disabled. It runs cached scene/audio
preparation and then local models; it never calls Gemini. Full timed audio
features are stored with the worker scene cache, and the job returns a summary.

## K05 visual evidence (validation pending)

Normal deployment requires no settings changes. Keep EXTER_KERNEL_VISUAL_ENABLED
unset or false. The optional worker image can include visual libraries with build
argument EXTER_BUILD_VISUAL=true; it installs headless OpenCV, not GUI libraries.
The pinned RapidOCR package contains OCR assets, but production adapters use only
the reviewed local pack described in worker/VISUAL-MODELS.md. No models download
at worker startup or from a web request. Set EXTER_KERNEL_VISUAL_MODELS_PATH only
on a capacity-verified worker with that pack installed, then enable the flag.

POST /api/kernel/jobs accepts stage="visual" for retained videos, images and
individual carousel slides. Videos reuse the verified scene samples; stills use
one untimed frame. The result is visual-ready with a small summary. Full timed
OCR and generic presence evidence remains in the worker cache. No Gemini call or
provider budget reservation occurs. Real OCR synthetic-text smoke passed; actual
face/product models, labelled-set accuracy and Render capacity remain unverified.
