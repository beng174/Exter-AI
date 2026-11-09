# Faster workspace navigation

## Purpose and big picture

Reduce waiting on every screen without changing collected data, metrics, layouts,
provider calls or deployment settings. Work from exter-test-drive and target it.

## Progress

- [x] 2026-11-09 UTC: traced the common load path on the merged PR #22 baseline.
- [x] 2026-11-09 UTC: Remove the duplicate full-library read while preserving reporting dates.
- [x] 2026-11-09 UTC: Share bounded, short-lived reads across navigation; invalidate after changes.
- [x] 2026-11-09 UTC: Remove unrelated loading waterfalls and full-document internal navigation.
- [x] 2026-11-09 UTC: Verify with fictional fixtures, 90 desktop and two mobile browser cases, and all four checks (511 unit tests).
- [x] 2026-11-09 UTC: Document results, push 39c4e08 and open PR #23 against exter-test-drive: https://github.com/beng174/Exter-AI/pull/23.

## Surprises and discoveries

`useResearchData` reads the full library, calculates its seven-day research
window, then reads the same library again for owned metrics. The server default
is thirty days. The 7,800-ad fixture responses are 10 to 11 MB. Five
ancillary requests start only afterwards; action screens then wait for four more.
Cleanup ignores results but does not cancel abandoned requests. Shared DataTable
also renders all 7,800 rows and re-infers alignment with a full scan for every
cell; the parent Winners transition takes 24.6 seconds in the final fixture run.
Several internal links reload the document. PR #22 correctly serialises heavy reads to protect the
web heap, making duplicate and abandoned reads especially costly.

## Decision log

2026-11-09: add an optional research-window preset to the existing read endpoint,
using the existing shared date calculation before owned metrics are read. Keep
default API behaviour. Reuse client reads with short freshness, bounded capacity,
request sharing and cancellation. Preserve server memory protection; do not add
a large server cache or increase heap, cost caps or plans. Also stream negotiated
gzip with Node zlib, keeping the memory gate and backpressure. Compute alignment
once per column and paginate large tables at 50 rows; sort and count the complete
set.

## Outcomes and retrospective

The matched 7,800-ad flow uses two full-library requests instead of 14 and one document instead of four. Winners opens in about 0.3 seconds instead of 24.6 seconds; cold Home falls from 3.25 seconds to about 1.8 seconds. The 10,021,710-byte fixture compresses to 185,369 bytes; browser route-intercept timings exclude this transfer benefit. Some already fast transitions vary by hundreds of milliseconds. Home, Creatives and Creative detail before/after screenshots are pixel-identical. All 15 real/sample screens pass at 1280, 1440 and 1920px, plus two 390px checks. Local fixtures are not live verification of Render response times or provider access.

## Context and orientation

`server/demo/creative-browser.ts` builds the full read-only library.
`src/components/research/useResearchData.ts`, the creative browser and action
workspace load it. `src/navigation.ts` owns URL history; `src/lib/api.ts` scopes
sample requests. Sample data stays isolated behind demo=1. Existing database,
collection and memory regression tests remain in force.

## Plan of work

1. Resolve research reporting dates on the server in one response; test dates and
   owned cohort parity without providers.
2. Add bounded client resource sharing, freshness and invalidation. Load small
   contextual requests concurrently, and only action extras a screen needs.
3. Keep internal navigation inside the running app with normal browser back,
   modified links, external links, downloads and sample isolation preserved.
4. Measure fixture request counts and readiness, run checks, update docs and PR.

## Concrete steps

From `/workspace/Exter-coverage-fix`, use the existing dependency installation.
Run focused tests, then `npm run check`, `npm test`, `npm run build` and
`npm run secrets:check`. Use only local fixture HTTP and database services.
Compare the parent revision and this revision with the same fixture delays.

## Validation and acceptance

One full-library response per research reporting window, reused during fresh
navigation. Correct account, currency and date cohorts; expired/changed data
reloads; failures remain visible and retryable. Abandoned reads cancel. Cache
size stays bounded, sample and real keys differ, and browser back works. Test
direct creative links and all main views. Final commands passed: `npm run check`,
`npm test` (511 passed), `npm run build` (existing bundle-size notice) and
`npm run secrets:check`. The fixed 192 MiB memory regression returns three full,
overlapping 7,800-ad responses with matching hashes. The browser script checks
90 desktop cases and two mobile cases, external/write blocking, global sort and
pagination, mode/date boundaries and history. Artifacts and raw timings are in
`output/playwright/workspace-loading/`. The final staged secret scan also passed
before push. PR #23 is open; live deployment and timing verification remain pending.

## Idempotence and recovery

All changes concern reads and navigation. No migrations or stored data changes.
Reloading clears the in-memory cache. Failed requests are never cached as
successful empty results. Rollback is the previous web commit; worker, scheduler,
secrets, budgets and flags are unchanged.

## Interfaces and dependencies

Keep the CreativeBrowserResponse contract, existing API defaults and all metric
formulas. Add no dependencies. Retain PR #22's bounded response writer and read
gate. Live production timings require deployment; fixture results do not prove
production recovery.
