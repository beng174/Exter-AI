# CA-01 and CA-02: owned reporting, fixture-only release

This release implements account metadata, daily sync and metric formulas from
research/CREATIVE-ANALYTICS-SPEC.md. Fixtures are not live verification.

Both live gates stay OPEN until the owner confirms them on Exter Media's own
ad account. Phase 0 is waiting on Meta identity verification. Phase 1 still needs
spend and impressions within 1% for 10 sampled ads. The user's 4 November instruction
explicitly authorises building Phase 1 on fixtures while Phase 0 remains open.
No production provider call, token verification or metric-field verification was run.

## Stored data and isolation

The additive Postgres migration creates owned_accounts, owned_ad_days,
owned_sync_jobs and owned_schedule_slots. Existing SQLite and public tables stay
unchanged. One workspace can link multiple accounts. Account status, last successful
sync, latest data date and controlled error messages are visible in Data sources.

Only metadata is accepted by POST /api/owned/accounts. The existing Basic Auth and
same-origin JSON request guard apply. Unknown body keys (including token fields)
are rejected. Workspace IDs must exist in the app. GET account/status and metrics
routes only read saved data and never trigger provider requests.

A sync fetches ad, ad set and campaign names and creative asset IDs. No CA-03 asset
fetch/grouping or later feature is implemented. Results are structured projections;
raw provider payloads, tokens and provider error text are not stored. The worker
loads one shared token per platform only from EXTER_META_ACCESS_TOKEN or
EXTER_TIKTOK_ACCESS_TOKEN in Render secrets. Public-library tokens are separate.
Never enter credential values in the app, database, chat or fixture files.

Daily keys include owned account, platform, native ad ID, day, attribution,
currency and conversion event. The latest pulled_at replaces an earlier row;
older or duplicate pulls cannot double-count or overwrite newer data. All pages
commit atomically after the live worker lease is checked. Lost leases fence writes;
retries replay read-only reporting, not paid inference. Revoked-token failures keep
all history and previous successful timestamps, expose a controlled reason, and
require explicit reconnect/queueing rather than automatic scheduled resumption.

## Schedule and metric semantics

The existing scheduler enqueues each eligible account once per UTC day. An initial
sync covers 90 inclusive days (today minus 89 through today); subsequent syncs
re-pull seven inclusive days. Changing currency, attribution or conversion event
resets backfill status while retaining older cohorts. Metadata IDs and credentials
are never taken from provider pagination URLs. Cursor and page counts are bounded.

Meta requests the spec's ad-level fields on v25.0 or later with explicit action
attribution windows. Purchase action aliases use the existing priority mapping,
never their sum. TikTok uses the existing ad-level integrated-report endpoint and
adds the spec's video metrics. Its attribution/event are account configured; the
currency supplied when linking must match that account. Confirm them live before
using results. TikTok purchase value remains unavailable until its field is
confirmed; no guessed revenue or ROAS is produced.

shared/owned-metrics.ts contains every formula and default minimum. Rates are
ratios of sums over eligible rows. Missing video values exclude image rows rather
than score them zero; results disclose rows used/excluded. Rates below the required
sample return status "too early" and null, never zero. Benchmarks include all
account creatives for the exact dates, currency, attribution and conversion event.
Platforms and accounts are never combined. Metrics API returns separate cohorts.
Frequency and average watch time are preserved as reported on individual rows;
multiple daily values cannot establish a period value and are not averaged.

## Validation

npm run check
npm test
npm run build
npm run secrets:check

Use a dedicated disposable Postgres 17 database with pgvector, never production:
set TEST_DATABASE_URL through the test environment, then npm run test:owned.
This command tests actual migrations twice, durable scheduling, two-account
isolation, replacement rows, mixed currencies, partial-page failure, revoked tokens,
lease recovery, authentication and metadata-only APIs. Provider transport is
synthetic, documented under tests/fixtures/owned/PROVENANCE.md. No fixture proves
provider permissions, v25+ attention-field availability or actual reporting parity.

## Render after merge

1. Keep existing Render plans, disk, secrets, budgets and disabled kernel stages.
2. Deploy the merged exter-test-drive commit on the existing exter-ai web service,
   exter-worker worker and exter-scheduler cron. Use Manual Deploy > Deploy latest
   commit for each, or verify their automatic deployments.
3. Startup runs the additive migrations under the existing migration lock. If
   deploying outside normal startup, run npm run db:migrate with the existing
   secure DATABASE_URL. No destructive migration or data reset is needed.
4. Keep EXTER_OWNED_SYNC_ENABLED absent or false. The scheduler can persist jobs,
   but the worker makes no owned-provider requests in normal default-off mode.
   Missing tokens also produce not connected without source requests.
5. Metadata and saved-status pages can be reviewed while gates remain open.
   Do not enable live dispatch or run a provider sync as part of this PR rollout.

After the owner confirms the gates and separately authorises live activation,
EXTER_OWNED_SYNC_ENABLED=true on web and worker enables dispatch and its status display using the existing
platform secrets and data-provider budget guard. This document does not authorise
that setting change or mark either live gate complete. Verify attention fields,
TikTok purchase value and account currency/event/attribution as part of that later
live work. No token is added by migration or by a Git push.
