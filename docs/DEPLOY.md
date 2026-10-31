# Deploying Exter on Render

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
| `GEMINI_REQUEST_RESERVE_GBP` | Conservative estimated GBP reserve before each billable inference attempt, including retries and static fallback; choose above the maximum plausible request charge |
| `GEMINI_INPUT_GBP_PER_MILLION_TOKENS`, `GEMINI_OUTPUT_GBP_PER_MILLION_TOKENS` | Positive prices for the selected model, converted to GBP per million tokens. Set from current provider pricing; no default exchange rate or price is invented |
| `GEMINI_VIDEO_CONCURRENCY` | Web inference and smoke-test concurrency, default `3`, integer `1`–`10` |
| `GEMINI_MAX_RETRIES` | Retries of 429/5xx responses with exponential backoff, default `2`, integer `0`–`5`; each inference attempt reserves separately |
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

Gemini ledger entries are **estimated costs**, not a measured invoice. Each inference
POST reserves the configured amount before dispatch. Metadata, upload, polling and
cleanup do not consume an inference reservation. Known token usage and configured
GBP prices settle the successful attempt; unknown or failed attempts retain their
reservation. Static fallback and retries reserve separately. Raw responses, token
counts, pricing assumptions and accounting are retained with the analysis attempts.
Missing usage remains unavailable. Set the reserve above the maximum plausible
request charge using current pricing, media limits and the output-token limit. A
provider could charge more than that assumption, so also use provider-side controls.
Missing DATABASE_URL in
production disables paid inference, while existing pages remain available with an
explicit infrastructure warning. Local development without DATABASE_URL retains
the existing non-hosted workflow and does not provide these durable budget guards.

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
3. In **Budgets & tests**, save an inference cap large enough for your intended
   run. With 25 videos and three concurrent requests, each next reservation must
   still fit inside 90% of that cap. Data-provider budget is separate; preparing
   public media makes no Gemini calls and uses no paid discovery provider.
4. Click **Prepare Valentte videos**. This explicitly loads the saved verified
   public Valentte records if they are absent, preserves existing records, and
   retains 25 playable videos with checksums. Missing URLs are resolved from
   ordinary public Ad Library pages for verified ad IDs. If Meta requires a login
   or challenge, preparation stops visibly. Expired, static or unavailable inputs
   do not count towards the 25-video target. You can retain current approved video
   URLs through Labelling and retry preparation. No inference starts with fewer
   than 25 retained inputs.
5. Choose Agentic or Static and click **Run Gemini smoke test**. Missing media is
   prepared automatically as well. Short videos in static mode use 3 FPS across
   the full clip; longer videos use the higher-FPS opening segment. The page shows
   each ad's status, model, actual mode, tokens and estimated GBP cost.
6. Download **gemini-live-report.md** from that run. It includes success/failure
   counts, reasons, per-ad accounting, averages, known total cost and up to five
   complete saved outputs. At least 24 of 25 successful analyses is the Phase 1
   success target. Missing cost or usage is disclosed rather than treated as zero;
   compare estimated costs with provider billing separately.

Runs and reports remain in the web SQLite database on the persistent disk.
Refresh and download are read-only. If the budget pauses, increase the cap and
click **Resume pending items**. After a restart, completed work remains intact;
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
versions. Download JSON or CSV from the tool. Static-image byte retention and the
stratified 200-ad/50-ad holdout sampling protocol are separate follow-up work.

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
