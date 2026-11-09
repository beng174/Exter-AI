# Deploying Exter on Render

## Meta Ad Library activation

API access was confirmed by the owner on 4 Nov 2026 using Graph v26.0,
UK commercial ads and `ad_type=ALL`. Implementation fixtures are not live
verification. Live collection stays off until the switch is explicitly enabled.

1. Deploy the latest exter-test-drive commit to **exter-ai** and **exter-worker**.
   Keep the existing web disk and shared Postgres. Web and worker startup apply
   the additive migration; `npm run db:migrate` is also safe to repeat.
2. Put the approved `META_ACCESS_TOKEN` in **Render secrets on exter-ai and
   exter-worker**. The scheduler only enqueues and does **not** need this token.
   Do not put it in the browser, database, command arguments or logs. This public
   token is separate from the owned-account `EXTER_META_ACCESS_TOKEN`.
3. Leave `EXTER_META_LIBRARY_ENABLED` absent or `false` on **all three services**
   while checking setup. `META_API_VERSION` defaults to v26.0 on web and worker;
   remove an old v25.0 override or set the intended version explicitly.
4. In **Competitors > Edit watchlist**, or **Data sources > Meta Ad Library API > Edit watchlist**, save
   the numeric Meta Page ID for your brand and each competitor. Each brand gets
   its own durable watchlist. Keywords are separate category discovery and never
   assign ads to a brand. Legacy unassigned watchlists retain their history but
   must be assigned to brands before automatic collection.
5. Keep a non-zero **Data sources > Budgets and schedule** provider budget. The
   existing guard also applies to these zero-cost public requests.
6. When ready, set `EXTER_META_LIBRARY_ENABLED=true` on **exter-ai, exter-worker
   and exter-scheduler**, then redeploy/restart those services. Configure the
   existing scheduler cron as `0 2,3 * * *` UTC. The application admits one daily
   slot from 03:00 Europe/London, so BST and GMT both run at 3am UK time. These
   two invocations preserve the existing owned scheduler's daily idempotence.
7. At the next UK slot, each brand backfills the last 12 months. The date window,
   Page ID, countries and revision are saved with the run. Restarts resume the
   saved opaque cursor. Subsequent daily scans cover the rolling 12-month window
   to pick up both older ads and restated lifetime reach. Dispatch is serialised
   across workers, paced at least 20 seconds apart, and delayed further by Graph
   usage headers, Retry-After and bounded exponential retries. No media is
   downloaded through this API; existing browser-captured media stays attached.
8. Review the Meta Ad Library row's status and last successful check. Public
   reach is Observed; reach-based share of voice is an Estimated watchlist proxy,
   not weekly reach or impressions. No commercial spend or impressions are
   created. A revoked token or budget pause needs an explicit same-origin JSON
   `POST /api/public/meta/collect` with `watchlistId` to resume after correction.
   Saved pages and cursors are retained. Editing a Page ID supersedes active runs
   and starts a new backfill without deleting earlier observations.

Turn the switch off on all three services to stop new dispatch and scheduling.
Queued work and saved cursors remain. Before rolling back to an older worker
that does not understand the switch, stop that worker and scheduler and remove
META_ACCESS_TOKEN from the old worker. The flag alone cannot stop an old binary.
No owned-account live gates, model settings,
budgets or low-cost kernel switches are activated by this release.

### Find and confirm Page IDs

Once META_ACCESS_TOKEN is configured on **exter-ai**, open **Competitors > Edit
watchlist** or **Data sources > Meta Ad Library API > Edit watchlist**. Brands
without a confirmed watchlist Page ID are searched automatically by their saved
name, in GB with ad_type=ALL and ad_active_status=ALL. The web process performs
these lookups; no worker job or additional environment variable is required.
This explicit discovery action is allowed while the collection switch is false.
The source row's Off status, when shown, describes collection. The owner enabled
public collection in render.yaml at 84131ee; this follow-up preserves that setting.

Suggestions are grouped by Page ID and ordered by distinct ads whose link
captions match the saved website host (including its subdomains), then name
match, then distinct ad count. Lookalike domains and domains appearing only in
paths or text do not count. The editor shows the top three Pages, the searched
ad count, each Page's count, a profile picture and an example ad link. A missing
website stays Unavailable for the website comparison. Confirm writes only the
selected brand's Page ID through the existing watchlist transaction. Manual
entry and Save Page IDs remain available. Neither search nor confirmation starts
collection or enables its switch.

Searches and profile-picture requests share the collector's Postgres request
gate, usage cooldowns, Retry-After and provider budget guard. Allow at least 20
seconds between collection, Page-search and candidate-picture Graph requests
across web and worker; queued collection and
other searches can extend the wait. Up to ten pages (1,000 ads) are searched
initially. Search more ads explicitly adds another batch, up to 10,000 ads.
Counts describe ads actually searched, not a Page's entire historical library.

Suggestions and opaque cursors stay in a bounded 30-minute web-process cache;
they never enter watchlists, public_ads or ad_observations. Opening the editor
again reuses that cache. A web redeploy discards suggestions only, and the next
search safely starts again. Provider failures stay visible. Public Page pictures
use the existing bounded raster/DNS checks and local square media cache, with
monthly refresh and monogram fallback. Preview cache manifests use hashed Page
identities and never assign a logo or Page ID to a brand before confirmation.
Tokens, paging URLs and source error text are never stored or returned.

Sample mode never starts searches or picture retrieval. All implementation tests
use injected responses; fixture results are not live verification. No new Render
service, dependency, table, secret or deployment step is needed beyond PR #14's
web/worker deployment and the existing META_ACCESS_TOKEN on web.

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
| `META_API_VERSION` | Defaults to `v26.0`; optional override for public-library requests |
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

Ads are unique by platform/native ID. History retains changed states within each
workspace, watchlist and revision. An unchanged scan advances last_confirmed_at
on its latest observation; changed states append a new ad/run observation.
Original rows, observation times and source payloads are never removed. Raw JSON
is stored on the first observation and when its semantic content changes. A new
normalised state with identical raw JSON references that earlier payload directly;
readers resolve the complete payload. UK/location and EU reach are observed data;
missing reach remains unavailable. An absent stop date does not prove current
activity, so status remains unknown unless the source supplies a stop. Public
collection does not infer spend, conversions, performance winners or model scores.
Collection data is shown in its own panel and evidence endpoint; it is not yet
projected into legacy SQLite analytics. Snapshot URLs are not media files. The
existing bounded browser collector and media store remain a separate workflow;
automatic snapshot media capture is still outstanding.

### Meta collection diagnosis and retry

Data sources shows **Meta collection by brand** within Source health. Edit
watchlist shows the same progress beside each saved Page ID: latest run status,
ads saved, pages fetched, stopping/finish time, controlled error and numeric Graph
code, subcode and HTTP status when recorded. Ads saved counts newly written or
changed snapshots; unchanged checks confirm earlier snapshots without adding
rows. Pages fetched counts successfully committed pages at the saved cursor.
For older runs it is reconstructed from collection_cursors plus query_index.
Active progress refreshes every five seconds using small saved-status requests,
without downloading the ad dataset again. A failed refresh retains the last
details and shows one refresh notice. Unknown codes/times stay unknown.
The earlier 7,752-ad failure has no recoverable
Graph code if the old worker never recorded it; the generic message alone does
not establish that a page was too large.

Failed attempts retain a controlled error kind, timestamp, page size, numeric
Graph code/subcode, numeric HTTP status and timeout flag. The two explicitly
permitted Meta user-error fields are sanitised and limited to 300 characters
as described below. No generic provider message, request/paging URL, trace or
token is stored or logged. All events stay in the database; the latest 20 appear
under **Failure history**. Resuming an older failed run preserves its known
stopping time as a legacy event with no invented numeric code.

Current failures are separate from history. Explicit resume and successful pages
clear current errors; completed or resumed rows no longer promote an earlier
failure. A new failure after successful progress becomes current again. Queued
transient failures show the automatic retry and the next page size, not a manual
retry action. **Next attempt after** is the later of the saved queue availability
and the shared Meta pacing gate; it is an earliest eligible time, not a promise
that the worker will start at that instant. Missing times stay hidden. The known
100/2334030 code has a controlled end-date explanation. New occurrences require
checking that the already-merged date fix is deployed to the worker.

Each request has a 90-second deadline including body transfer. For Graph code 1,
HTTP 500 or a timeout, the queue retries the **same cursor** at page sizes
100, 50, 25 and 10, starting at the brand's remembered size. Each size reduction
is a new paced worker turn and does not consume a failed-page attempt. This
avoids four long requests exceeding the existing two-minute lease. After the
smallest size fails, the normal bounded attempts/backoff apply; terminal failure
retains the checkpoint. Other transient errors retain normal retry behaviour;
permission and rate-limit errors take priority over reducing page size.

A successful page commits its cursor, counters, observations and working size
atomically. The working size stays on that brand's watchlist for later pages and
runs; another brand keeps its own size. Pending smaller sizes survive a restart.
The request fields, Page/country filters, rolling 12-month window and daily
03:00 Europe/London schedule are unchanged.

Use **Retry collection** for a failed or paused brand. It resumes the existing
run from its saved cursor; it does not clear ads or start the backfill again.
The UI requires saved Page IDs, the live switch, configured token and available
data-provider budget. The authenticated same-origin POST checks workspace,
switch, token and budget again; worker dispatch also enforces the shared rate
slot, cooldown, budget and live lease. An unexpired lease cannot be stolen and
an unsaved Page ID cannot silently redirect a retry. Queued/running controls
stay disabled and read **Queued** or **Collecting**. **Collect ads** starts a brand with no run, and **Collect again**
starts the next run after completion. Deploying this change does not automatically
resume previously failed jobs.

### Meta collection storage and database health

The storage migration runs automatically at startup under the existing migration
lock. It adds nullable confirmation times, SHA-256 fingerprints, payload-source
references and a latest-observation index; it relaxes raw_payload to allow a
retained reference. It does not rewrite old payloads, remove rows or consolidate
historical duplicates. Existing full-payload rows remain readable and acquire
fingerprints only if confirmed again. The new foreign key/check applies to new
writes without a historical validation scan. The index build can briefly block
writers on a large history table; allow startup to finish before resuming deploys.

Comparison covers every sanitised stored field, including reach, delivery dates,
copy, placements and audience data, plus normalised reach/status. JSON object key
order is ignored; array order and absent versus explicit null are retained. A
reverted state still adds a change. Separate workspace/watchlist revisions keep
their own baseline, so a newly confirmed Page scope does not inherit an unrelated
source observation. The page's state writes, confirmations and cursor commit
atomically. Replay and concurrent scans cannot duplicate one state. Conflicting
states for one ad inside the same run fail the page rather than overwriting an
already committed observation. Tokens, paging URLs and provider error text remain
excluded. Storage changes do not alter collected fields or the schedule;
the recovery policy above adjusts only request page limits and deadlines.

In **Data sources > Source health > Collection database**, size is the physical
Postgres database allocation from pg_database_size(current_database()), covering
all workspaces and tables, indexes and TOAST. It excludes PostgreSQL WAL, backups,
web SQLite and stored media. The existing infrastructure health requests retain
at most one size sample per UTC hour. No background provider call or new polling
service is added. The displayed measurement time is in UK time.

Daily growth is `(latest bytes - baseline bytes) / elapsed days`, using the
nearest retained sample at least 24 hours older than the latest sample. The
actual interval appears beside it, so a gap between checks is an average over
that gap. It is Unavailable until there is a full-day baseline, and remains
Unavailable on measurement/permission failure, never an invented zero. Zero and
negative measured growth remain valid. Size measurement failure does not turn
working collection/budget health into a database connection failure. Samples are
retained; 720 hourly rows per 30-day month add only a small metadata overhead.

For **1,000 ads checked daily for a 30-day month**, a fresh watchlist retains
`1,000 + 29,000 × c` observations, where `c` is the fraction whose stored state
changes each day after the first check. An established watchlist adds about
`30,000 × c` new observations per month, plus newly discovered ads and scope
changes. Unchanged ads add no history rows, while their confirmation time advances.

Storage fixture measurements below use Postgres 17, the actual connector and
migration, and fictional ads with roughly 2.3 KiB of uncompressed source JSON,
including copy, reach and audience fields. JSON compression makes these fixtures
smaller than equally long, less repetitive real copy. This is a capacity example,
not a guaranteed upper bound. One scope, no new ads, 30 simulated daily checks:

| Changed per daily check | Retained observations / raw payloads | Live row bytes | Allocated observation relation, including indexes |
| --- | --- | --- | --- |
| None | 1,000 / 1,000 | 1.25 MiB | 17.0 MiB |
| 10% | 3,900 / 3,900 | 4.86 MiB | 25.0 MiB |
| All | 30,000 / 30,000 | 37.4 MiB | 44.6 MiB |

The old pattern retained 30,000 snapshots regardless of changes. If all active
ads change daily, little storage is saved and fingerprint metadata adds some
row overhead. Real payload lengths and reach breakdowns can be much larger.
These figures exclude collection-run/cursor/job, cost-ledger and health-sample
metadata. Size displayed in the app includes those and the rest of the database.

Confirmation updates still create Postgres MVCC tuple versions, including inline
fields. Normal autovacuum reclaims those dead versions for reuse; it does not
remove historical observations. Therefore allocated bytes can exceed live row
bytes and do not shrink immediately, even when no new history rows are added.
Keep normal autovacuum enabled and use the measured database growth for capacity
planning. Do not delete observations or run a compaction/data purge for rollout.
No claim of zero physical write cost or fixed compression ratio is made.

Reproduce each table row only in a **dedicated disposable** local Postgres/pgvector
database: set TEST_DATABASE_URL securely, then run
`node --import tsx tests/fixtures/meta-storage-benchmark.ts 0`, `0.1`, or `1`.
The benchmark truncates its fixture tables and must never target a real database.
It performs no live provider calls. It runs ordinary VACUUM on its disposable
relation before reporting physical allocation; it preserves every fixture history
row. Reproduction outputs are recorded with the PR's fixture evidence.

After merge, in Render deploy latest exter-test-drive to **exter-ai first**
(Manual Deploy > Deploy latest commit), wait for its startup migration and healthy
reader, then deploy **exter-worker**, followed by **exter-scheduler**. Keep existing
disks, secrets, flags, plans and budgets; no new environment variables or resources
are required. Old writers can still insert full payloads during rollout. Once
sparse payloads have been written, keep a hydration-compatible web reader when
rolling back; do not restore an older reader that assumes every raw_payload is
non-null. No live-account gate is closed by these fixture checks.

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

## Optional Meta ad media

This is media/format enrichment only. Official Meta API reach, delivery dates,
copy, status and audience evidence remain authoritative. Fixtures are not live
verification. No paid actor was run during implementation.

The selected actor is [automation_craft/facebook-ads-library-scraper](https://apify.com/automation_craft/facebook-ads-library-scraper),
pinned to build **1.3.12** (published 3 Nov 2026). Its public build definition and
Store metadata were checked on 5 Nov: maintained that week, about 12,900 successful
runs in the preceding month, direct Page and archive-ID inputs, explicit GB/date
filters and an exact result cap. Those capabilities allow subsequent batches to
request missing IDs rather than buying the full watchlist repeatedly. Current
base event prices are **$0.0005 per returned ad** ($0.50/1,000), plus
**$0.00005 per start** at its default 256 MiB. All optional detail, landing-page,
Page-details and Page-match charges are explicitly disabled. The better-known
curious_coder actor was considered, but its public input contract did not promise
retrieval of exact missing ad IDs. Recheck the chosen actor's maintenance, contract
and prices before deliberately updating the pinned build.

Every new batch requests exact archive IDs already collected for a confirmed
watchlist Page, UK, all commercial ads and all activity statuses, over the rolling
12-month window. maxAds and maxAdsPerQuery remain at most 500, with the same
maximum charge ($0.25005 for 500). The actor's required deliveredBefore is capped
to today's date in America/Los_Angeles. The official Graph connector sends only
ad_delivery_date_min, never ad_delivery_date_max, including legacy saved runs.
The 03:00 Europe/London schedule is unchanged.

Never-requested IDs take priority over daily retries. Successful batches refill
all eligible watchlists, not only the just-completed brand. An idle worker also
refills the queue (at most once per minute), repairing a missed completion
acknowledgement or restart without waiting for the next daily schedule. Brands
with paused/uncertain runs remain blocked by their existing guards. Actual
submitted IDs are recorded just before paid dispatch; queued target arrays are
not requests. A legacy Page search cannot prove that every target was requested.
Direct IDs come exclusively from that confirmed Page's official UK observations;
every output must match both archive and Page ID before any file is saved.
Unknown, wrong-Page, duplicate and unusable returned items still count against
the reservation. Existing gallery media is excluded from paid requests.
Missing/unsupported/expired assets are attempted at most once per 24 hours.

Data sources > Ad Library media shows distinct official ads per brand, images or
posters, full videos, requested, returned, matched and still missing. Missing
reasons partition ads without an image/poster: not requested, not returned,
expired, unsupported, wrong Page, budget, disk limit or failed download. Coverage
unions historical retained assets. Old Page searches are labelled incomplete:
only confirmed matched records establish their known requests and returns.
Run Details show the exact safe input (Page, GB, window, activity status and
caps), local counts, the actor's INPUT archive-ID count, and recognised numeric
run-summary requested/delivered/query counts and stop reasons. Unknown counts
stay "Not recorded". Legacy runs still show their saved Page-search cap and
window, clearly distinguished from recorded actor input. Summary/status rows
are not mistaken for matched ads. No
provider payload, media URL, console URL or token is stored with these counts.

The small-batch diagnosis is from code and public actor documentation, not access
to production logs: initial Page searches used a cap derived from the then-known
corpus, and continuation depended on a post-completion enqueue. The new exact-ID
inputs, durable request outcomes and idle refill remove those weaknesses. Future
Details distinguish a provider that returns only 20/4 ads from a locally small
request. Actor coverage itself still needs an owner-observed live run.

### Budget accounting

Every paid start first acquires the existing data_providers budget guard's maximum
hold. The existing 90% threshold and monthly budget are unchanged. Configure
**EXTER_AD_MEDIA_GBP_PER_USD** on the web service to an explicitly verified,
conservative upper GBP-per-USD rate including exchange/payment fees. There is no
invented/default exchange rate. The hold is the actor's maximum USD charge times
this ceiling, rounded up to six decimal places. The same USD maximum is sent as
Apify's maxTotalChargeUsd; maxAds is the separate actor result cap and automatic
provider restart is disabled. The final GBP ledger figure remains Estimated.

Data sources > Budgets and schedule shows results, ads retained, cost per run and
whether that cost is a maximum hold or a settled estimate. Settlement requires
recognised final numeric event counts/prices and retains at least the charge for
every consumed result plus the start. Unknown billing, optional charges, repricing
or unsupported over-cap output keeps the full hold. Ambiguous starts remain
Uncertain and cannot automatically start twice, including after a service restart.
Never clear a hold just because a file failed to download. No token, returned media
URL, provider error message or console URL enters run metadata or logs.

### Files and disk ownership

The existing web service owns /var/data/media; workers cannot read that disk. The
worker claims durable Postgres checkpoints and calls one narrowly authenticated
web media step at its fixed HTTPS origin. A dedicated service token grants this
operation only, not general app access. The web step validates the live lease,
real workspace, watchlist Page/revision and enable switch. A Postgres advisory
lock serialises media writes/transcodes across service processes.

Returned links are consumed immediately, never hotlinked or stored in Postgres.
Existing bounded raster/video downloaders enforce public HTTPS/CDN hosts, DNS and
redirect checks, MIME, magic bytes, decoded dimensions/duration and byte limits.
Images/posters: PNG, JPEG or WebP, at most 8 MiB and 40 million pixels each. Video
inputs: MP4, WebM or MOV, at most 128 MiB and ten minutes, downloaded to temporary
space only. Full video is retained only when official evidence shows 30+ running
days, top-20 published reach within its brand, or launch within the last seven days.
UK reach is used for ranking, falling back to EU reach; unknown reach never becomes
zero. Portrait and landscape output fit 720 x 1280 or 1280 x 720 respectively,
without upscaling, H.264/yuv420p with AAC when audio exists. Local ffmpeg uses two
threads, a 90-second encode deadline, stripped metadata and verified output duration.
A missing/expired poster can be generated from a retained priority video.
An unsupported/slow file remains missing without erasing previous media.

Files are immutable content-addressed objects under the existing media root's
public-ad-files directory, shared by identical files across ads in a workspace.
Only complete verified files are referenced. Temporary inputs are cleaned up;
existing media, paid analyses, observations and prior file references are never
deleted. A partial later result cannot hide an earlier retained image/poster.
Cards and Creative detail use authenticated local file routes; a poster can be
shown without a full video, and missing media keeps an ad-copy preview tile.

Data sources measures the actual media volume's used and available bytes. This
includes other files on that volume. Videos stop before 80% usage, with an extra
128 MiB preflight allowance and another check immediately before retention.
Missing disk measurements stop video downloads. Raster retention keeps an 8 MiB
headroom check. Other features retain their existing storage rules. Capacity is
unique image/poster bytes + unique eligible 720p video bytes + metadata, alongside
existing files; never assume every public ad needs a full original video.

### Render setup and rollout

1. Merge the prerequisite recovery and public-signal PRs, then this media PR into
   exter-test-drive. Render > exter-ai > Manual Deploy > Deploy latest commit.
   Wait for automatic Postgres migrations and a healthy authenticated app. Then
   deploy exter-worker and exter-scheduler. Preserve the owner's current enable flags on all three services. Do not reset
   them or raise the budget. Both switches currently remain owner-controlled.
2. In exter-ai > Environment, set APIFY_TOKEN as a Render secret and configure
   EXTER_AD_MEDIA_GBP_PER_USD. The token follows the existing creator provider
   pattern; never paste it into a database, shell log or Git file. Media actor
   access is unverified until a deliberately enabled run returns real results.
3. Generate a dedicated secret with at least 32 non-whitespace characters and put
   the same EXTER_AD_MEDIA_BROKER_TOKEN in exter-ai and exter-worker Environment.
   It must differ from admin, provider and kernel broker secrets. On exter-worker
   only, set EXTER_AD_MEDIA_BROKER_ORIGIN to exter-ai's public HTTPS origin with no
   path, query or credentials. The worker does not need APIFY_TOKEN; the scheduler
   needs neither token. Existing creator discovery still uses the web token.
4. Keep the current data provider budget; inspect available headroom in Data
   sources. When the owner chooses to start paid media collection, set
   EXTER_AD_MEDIA_ENABLED=true in **web, worker and scheduler**, save/redeploy,
   then use Data sources > Budgets and schedule > Collect missing media. Otherwise
   the next existing 03:00 UK schedule enqueues it. Official collection's switch,
   fields, pacing and schedule are unchanged. Owned sync and kernel flags stay off.
5. Check run costs, saved-file playback and disk headroom. Collect missing media
   explicitly resumes safe paused checkpoints after configuration/budget fixes.
   An Uncertain start needs operator reconciliation against Apify's run list:
   verify the exact actor/input/time and associate its confirmed run/dataset IDs
   with the existing held Postgres run before changing it back to running. Never
   issue a fresh paid start or release its reserve without evidence that no run
   was charged. This manual recovery is intentionally not an automatic retry.

Turning the flag off stops new local steps and starts; an already started remote
actor can finish within its reserved USD cap. Saved media and its read routes
remain available with the flag off. Schema additions are additive. A rollback can
leave the new tables/files in place; never remove retained files to roll back.

Fixtures: npm test covers strict source/format projection, bounded fetch failures,
priority rules, real local 720p encoding/deduplication, disk limits, token isolation
and sample/default-off guards. Against a dedicated disposable Postgres database:
`npx tsx --test --test-concurrency=1 tests/ad-media.integration.ts` with
TEST_DATABASE_URL set securely. It owns isolated schemas. No real provider calls
are permitted in tests.

### Pacific-safe collection diagnostics (6 Nov 2026)

Deploy exter-ai first and wait for additive Postgres migrations and health. Then
deploy exter-worker and exter-scheduler from the same commit. Keep the existing
Graph/media enable switches, per-run USD cap, monthly budget, actor build/prices
and 03:00 UK schedule. No rows or files are removed. Old readers can ignore new
columns; never delete request history when rolling back.

After deployment, Data sources or Edit watchlist > Retry collection resumes a
failed Graph run from its saved cursor through the existing guards. Meta's two
user-facing error fields, error_user_title and error_user_msg, are now sanitised
before storage: tokens/credential patterns and URLs are removed, controls are
stripped and each field is limited to 300 Unicode characters. They are displayed
as plain text alongside numeric codes. Generic provider messages, traces and
paging URLs remain excluded. Earlier failures cannot recover text never stored.

Use Collect missing media to resume safely paused media runs after correcting
configuration or budget. Uncertain starts still require charge reconciliation;
never create a second paid run just to replace an unknown start. Idle refill then
progresses every enabled Page watchlist automatically within the existing budget.
Fixtures include 1,200 official ads in 500/500/200-ID batches, a second brand,
partial 20-ad responses, restarts and GMT/BST boundary times. No live provider
calls were made; fixtures are not live verification.

### Collection status reader rollout (8 Nov 2026)

After merging the status fix into exter-test-drive, deploy exter-ai with
Manual Deploy > Deploy latest commit and wait for health. This repair changes
read-only status/UI code and needs no schema migration or worker retry-policy
change. Ensure exter-worker already includes PR #20's merged date fix if it has
not been deployed since 6 November; leave exter-scheduler and all enabled flags,
budgets and schedules unchanged. An old 6 November error under Failure history
is not proof of a new rejection. Review current status and progress before
manually retrying; queued/running work is already active.

### Workspace navigation and large tables (9 Nov 2026)

Research pages request `window=research` on the existing creative read endpoint.
It resolves the existing seven-day research window before reading owned cohorts,
so one response replaces the former two full-library responses. Explicit dates,
cohort separation and the default thirty-day API behaviour are preserved.

The browser shares pending reads and reuses library results for 30 seconds and
context/health results for 20 seconds. Keys include the URL, reporting dates and
sample mode. Retention is bounded to two unused library results and 24 context
results; active consumers retain their own results. Nothing is persisted in browser
storage or a new server cache. Leaving the last consumer cancels a pending read,
unless the next screen immediately takes it over. Failed reads are retryable.
Successful API writes and manual page refreshes invalidate these results.
Existing live-run status polling remains fresh and does not reload the full library.

Internal workspace links keep the app running and preserve browser history,
filters and sample scope. Action screens request only their relevant extra data.
Shared tables calculate alignment once per column and render 50 rows per page;
sorting, column availability and totals still use every matching row. Pagination
never discards ads or changes metric calculations. Small tables keep their layout.

The creative endpoint negotiates streaming gzip using Node's existing zlib at
the fastest compression level, with `Vary: Accept-Encoding`. Socket backpressure,
disconnect cleanup and the one-at-a-time library gate still apply. Clients asking
for identity encoding receive the same uncompressed JSON. No new dependency,
schema, provider call, Render setting, heap increase or worker change is required.

Fixture-only comparison against 0ee47f6: 7,800 fictional ads, 600 ms library delay
and 150 ms context delay. The recorded navigation flow drops from 14 full-library
requests to two, and four document loads to one. Winners drops from 24.6 seconds
to about 0.3 seconds. Cold Home drops from 3.25 seconds to about 1.8 seconds.
Some already fast transitions vary by a few hundred milliseconds; these local
measurements are not production timing guarantees. The identical fixture library
is 10,021,710 bytes as JSON and 185,369 bytes with gzip level 1. Browser timings use
uncompressed intercepted fixture responses, so they exclude the gzip benefit.
See `output/playwright/workspace-loading/` and the execution plan for raw results.

After merging into exter-test-drive: Render > exter-ai > Manual Deploy > Deploy
latest commit. Wait for `/health` to pass, then hard-refresh one browser tab to
load the new bundle. Check Home, Winners, a filtered Creatives link, Creative
detail and browser Back. Confirm the library request has `Content-Encoding: gzip`
and that recent navigation reuses it. Leave worker/scheduler, switches, secrets,
budgets and stored collection checkpoints unchanged. Roll back the web deploy if
needed; no migration or data recovery is involved. Live timing and heap recovery
still need observation after deployment.

### Web heap exhaustion and large-library reads (8 Nov 2026)

The owner reported `FATAL ERROR: Reached heap limit Allocation failed -
JavaScript heap out of memory` from exter-ai instance 6k9vd at 20:49 GMT. This
confirms a Node heap abort, not its exact allocation frame. Private Render logs
were not accessible from the development environment. A provider-disabled
7,800-ad fixture reproduced the same abort on the original aa7330f reader.

Public library reads now project pg row events directly into the creative list,
without retaining a second array of raw payloads. The same latest-observation
SELECT, workspace/revision checks, raw-payload references and 100,000-row bound
remain. Saved media history is grouped as rows arrive, preserving older posters
and files. Identity maps replace repeated full-list scans. An empty owned-account
result no longer clones every public creative. No database row or file changes.

The response keeps the same JSON shape and all its ads. It uses chunked HTTP
encoding, row by row, with socket backpressure instead of building one large JSON
string. Private no-store headers and authentication remain. Full-library builds
are limited to one active response per web process, with up to eight waiting
requests and a 30-second queue deadline. Queue overflow/expiry returns an explicit
503 busy response with Retry-After: 2, never an empty successful library. Closed
waiting requests are removed. Health, source-status and media routes do not use
this gate. A slow client can delay another full-library response; it cannot queue
unbounded copies of the dataset.

A clean original checkout and the repaired checkout were compared in production
mode with identical fixtures and a **192 MiB local test heap**. The original
aborted before returning a library. The repair returned three overlapping
responses, each with 7,800 ads and identical 11,326,079-byte JSON bodies. The
fixture includes a 24 KB stored-only raw field per ad to stress raw buffering;
its payload distribution is synthetic, not a production measurement. One final
run sampled a 160.8 MiB heap peak, 68.4 MiB heap at completion and 301.1 MiB RSS.
These figures vary by runtime and data. The full projected list still grows with
ad/analysis count; this repair bounds transient raw/history/encoding copies and
concurrent builds, without silently truncating records.

The heap flag belongs only to the regression fixture. **Do not set it in Render**
or raise the existing heap limit or plan for this patch. After merge into
exter-test-drive, use **exter-ai > Manual Deploy > Deploy latest commit** and wait
for health. Verify the authenticated /api/health route, the library ad count and
Render's memory graph while opening Home, Creatives and Creative detail. Leave
worker/scheduler checkpoints, flags, provider budgets, Gemini settings and the
03:00 schedule unchanged. No migration or fresh collection is needed. A code
rollback retains every observation, file and paid analysis.

Reproduction: `node --max-old-space-size=192 --import tsx
tests/fixtures/library-memory-server.ts` in production mode with fixture-only
admin settings and FIXTURE_REQUESTS=3. The fixture blocks provider fetches and
uses synthetic database responses. `npm test` includes this regression. Real pg
streaming and retained-history checks use tests/library-read.integration.ts with
a dedicated disposable TEST_DATABASE_URL. Fixtures are not live verification.
