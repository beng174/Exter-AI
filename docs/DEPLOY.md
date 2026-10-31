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
legacy video inference remains in the web process and retains its existing explicit
interrupted-job recovery. A PostgreSQL migration of the legacy application is a
separate remaining task; do not run two independent SQLite copies.

1. Preserve existing `.data/exter.db` and media before redeploying or changing paths.
   A free ephemeral instance may already have lost earlier files; do not assume a
   disk migration recovers them. Copy a consistent online SQLite backup to
   `/var/data/exter.db` and media into `/var/data/media` before switching paths.
2. Apply `render.yaml` through Render Blueprints, or make matching changes to the
   existing service. Avoid creating a second public service accidentally. If you
   retain the Node runtime instead of Docker, build with `npm ci && npm run build`
   and start with `npm start`; install ffprobe and PostgreSQL 17 client tools too.
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
6. Set positive monthly GBP budgets for `inference` and `data_providers` through
   authenticated `PUT /api/budgets/inference` and
   `PUT /api/budgets/data_providers`, body `{"monthly_budget_gbp": 20}` (example,
   choose your own cap). Zero is the initial fail-closed budget, even for the
   official Meta connector's zero-cost requests. Configure a conservative
   `GEMINI_REQUEST_RESERVE_GBP` before requesting Gemini analysis.
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
| `GEMINI_REQUEST_RESERVE_GBP` | Conservative estimated GBP reserve for each Gemini HTTP request, including metadata/upload/poll/cleanup requests |
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

Gemini ledger entries are **estimated reservations**, not a measured invoice. Every
real Gemini HTTP attempt reserves the configured amount; failures and ambiguous
responses retain that reservation conservatively, and a static fallback reserves
again. This intentionally overcounts non-billable API operations. Set the reserve
above the maximum plausible charge for a request, based on current model pricing
and input limits. A provider could charge more than that assumption, so also use
provider-side controls. Observed token accounting, pricing-version reconciliation
and the 25-ad live-cost report are remaining Phase 1 work. Missing DATABASE_URL in
production disables paid inference, while existing pages remain available with an
explicit infrastructure warning. Local development without DATABASE_URL retains
the existing non-hosted workflow and does not provide these durable budget guards.

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
