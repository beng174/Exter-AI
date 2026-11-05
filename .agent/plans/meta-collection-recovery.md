# Diagnosable collection and smaller-page recovery

## Purpose and big picture
Extend open PR #17 on feat/meta-observation-storage, based on exter-test-drive 175ac77, so the user can inspect and retry each brand's interrupted Meta collection. Retain the already implemented change-only history, payload reuse, database health and monthly storage estimates. Preserve collection fields, UK/EU scope, 12-month window, 03:00 UK schedule, tokens, budgets and history.

## Progress
- [x] 2026-11-05 UTC: Read AGENTS, product/reference rules, worker, connector, saved cursor logic and watchlist editor. Confirmed storage PR #17 remains open and latest base is unchanged.
- [x] 2026-11-05 UTC: Added numeric-only failure events and safe latest-run projections, including reconstructable legacy page counts and preserved legacy stopping times.
- [x] 2026-11-05 UTC: Added durable paced page reductions, whole-request 90-second deadline and successful per-brand size memory. Disposable Postgres fixtures preserve 7,752 earlier ads and resume the exact cursor.
- [x] 2026-11-05 UTC: Added shared progress/details and explicit guarded retry actions in both entry points. Browser verification is in progress.
- [x] 2026-11-05 UTC: All four checks pass: 458 unit tests, build, type check and tracked-file secret scan. Sixteen affected disposable Postgres cases pass. Browser tests pass for both entry points at 1440px/390px, six explicit retries, polling/failure retention and budget/sample/unsaved-Page guards.
- [x] 2026-11-05 UTC: Pushed recovery commit 8d43b57 to PR #17 and rewrote its title/body around diagnosis, recovery and storage: https://github.com/beng174/Exter-AI/pull/17.

## Surprises and discoveries
The reported failure cannot be diagnosed retrospectively from the generic message: old workers discarded Graph codes. Job leases last two minutes. Four 90-second requests inside one claim would exceed that lease and bypass shared pacing, so size reductions must be persisted and dispatched on subsequent guarded worker turns. Existing collection_cursors plus query_index establish the number of successfully committed legacy pages. records_new plus records_updated counts newly saved/changed ad snapshots, not unchanged confirmations.

## Decision log
2026-11-05: Keep one request per worker claim. A code-1/HTTP-500/timeout failure queues the next smaller size at the same cursor and cancels that claim's attempt increment until size 10 is tried. Every HTTP failure, including a size probe, gets only controlled error kind/message and numeric code/subcode/status in a small diagnostic table. No request URL, cursor, provider text or token enters diagnostics.
2026-11-05: Remember successful size on the watchlist and pending size on its job. New normal pages use the remembered size, while retries preserve cursor/configuration. Shared pacing, cooldowns, switch, token and per-dispatch budget guards remain. A 90-second whole-request deadline fits one existing lease.
2026-11-05: Reuse the existing collection POST for explicit retries. Add optional workspace scope checking for new per-brand UI callers, preserving the old authenticated collection panel. Show real run summaries in both entry points using shared components and safe server projections; never expose raw errors or provider diagnostics JSON.

## Outcomes and retrospective
Implemented, fixture-validated and published in PR #17. Recovery fixtures preserve 7,752 earlier observations, resume the exact cursor, exhaust the full size ladder before failed-page accounting and retain independent sizes by brand. Active progress polls thin saved-status endpoints and keeps prior details when refresh fails. PR #17 already contains non-destructive storage changes, hourly size health and measured storage examples. The old failure's exact Graph cause remains unknown until numeric diagnostics are recorded; fixtures cannot verify live recovery.

## Context and orientation
server/connectors/meta-library.ts validates and sanitises one Graph page and commits observations/cursor. server/infrastructure/jobs.ts owns leases, attempts, pacing and manual resume. schema.sql is migrated on startup. api.ts serves authenticated watchlists/collection. MetaWatchlistEditor and DataSourcesPage share per-brand status and retry presentation. Meta collection storage helpers remain intact.

## Plan of work
1. Add small diagnostic/progress columns and failure history. Centralise controlled messages and numeric validation. Project latest run, progress, stopping time and safe failure details onto saved watchlists without returning cursors/config/payloads.
2. Accept bounded page sizes and 90-second timeout in the connector. Worker size fallback retains cursor, adjusts attempts atomically under its lease and observes the same global rate gate. Persist a successful size with the page checkpoint.
3. Add a shared progress table/status detail and retry button. Use it inside existing Source health and beside each Page ID in Edit watchlist; keep sample actions disabled.
4. Extend fixture unit, disposable Postgres and browser coverage for error codes, timeout, parsing/permissions/rate limits, fallback sequence, crash/manual resume, legacy progress, UI retry and storage invariants. Update deployment/state notes, screenshots and PR title/body.

## Concrete steps
From /workspace/Exter-AI run npm run check, npm test, npm run build and npm run secrets:check. Postgres integration tests use only a new task-owned disposable pgvector database through TEST_DATABASE_URL. All provider requests use injected responses; local browser previews disable transports and block external requests.

## Validation and acceptance
Numeric diagnostics survive failures and are visible per brand in both screens. Code 1, HTTP 500 and timeouts shrink the same request from 100 through 50/25/10 before consuming a failed-page attempt, with pacing and budget checks on every dispatch. Other errors retain correct pause/retry behaviour. A successful smaller size survives new runs and restarts. Retry resumes the same run/cursor and cannot bypass switches, credentials, budget, rate cooldown or a live lease. Unchanged scans and raw-payload reuse retain all existing storage acceptance checks. No fields or schedules change; no live verification claim.

## Idempotence and recovery
Additive repeatable migration; delete no rows or payloads. Older diagnostic fields may be unknown and must not become invented codes. Lease fencing protects progress and fallback changes. Web must retain hydration support for PR #17's sparse payloads. Roll out web first, then worker and scheduler; preserve disks, secrets, plans and flags. No automatic retry of previously failed jobs on deploy.

## Interfaces and dependencies
Extend MetaQuery with a validated page size and MetaCollectionError with only safe numeric/boolean metadata. Extend watchlist responses with typed latest-run summaries, not raw run objects. No dependencies, provider-field changes, services or new environment values. Own-account live gates remain open; kernel stays paused.
