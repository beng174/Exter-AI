# Bound web memory with SQL selection and summaries

## Purpose and big picture
Keep the 512 MB web service responsive with 50,000 ads. Select media batches by
ID in SQL, paginate creative and winner rows, calculate full-workspace counts in
SQL, and expose process heap health without changing facts, formulas, budgets,
collection schedules, media priority or retained history.

## Progress
- [x] 2026-11-11 UTC: isolated worktree from exter-test-drive 994851d; read AGENTS and the existing full-library, media and UI paths.
- [x] Replace queueing and media diagnostics with bounded SQL selection/aggregation.
- [x] Serve paginated creative/winner rows and complete SQL research summaries.
- [x] Add minute heap logging and an 80% warning on Data sources.
- [x] Prove 50,000-ad memory bound with fixture database and real HTTP page reads.
- [x] Run all four checks and database/browser fixtures.
- [ ] Push the branch, open PR against exter-test-drive and confirm CI green.

## Surprises and discoveries
enqueueAdMedia streams raw observations but retains a BrowserCreative for every ad
before selecting 500 IDs. It also buffers every media row and request. The web
creative endpoint, media status, file checks and missing-media pagination rebuild
complete lists. Existing 7,800-ad tests prove streaming avoids raw buffering, but
still allow a full projected library and do not cover repeated media queueing.
The original /workspace/Exter-AI has unrelated presentation work; leave it alone.

## Decision log
2026-11-11: use database-side latest-observation, media-presence and request-state
queries shared by queue and read models. Keep raw payloads in Postgres and select
only required JSON keys for bounded page/detail projection. Keep pure formula
functions as parity oracles for SQL summaries. Preserve explicit demo behaviour
and legacy imported media/analysis; no production access or paid calls.

2026-11-11: cache only current narrow metadata, not raw payloads. Force complete
hash joins for bulk metadata relations: a fresh-table estimate otherwise picked
a merge on brand alone and rescanned its ads. Use exact indexed lookups during
cache bootstrap. Planner options/deadlines are local to each transaction.
2026-11-11: the two reported failures are dated refresh/video retry regressions.
Base refresh on the successful check date, and video backoff on video requests.

## Outcomes and retrospective
All 85 infrastructure tests and 631 unit tests pass. TypeScript, production build
and secrets checks pass. The 50,000-ad HTTP/queue fixture peaked at 116,319,648
bytes of web heap, below 200 MB. Both originally reported test files are unchanged.
Browser fixtures verified pagination, Back, preview filtering, full counts and the
memory warning at 1440px and 390px, with no page errors. Screenshots are in
docs/screenshots/sql-web-memory. These are not live Render measurements. PR/CI
confirmation remains the final delivery step.

## Context and orientation
Official history is Postgres ad_observations/public_ads, joined to current
watchlist revisions. Legacy imports/analysis are SQLite. Media queue/coverage are
server/ad-media; server/demo/creative-browser.ts currently builds whole responses.
The React research hooks share that response. Health is exposed through existing
infrastructure status and Data sources. Existing locks and budget guards remain.

## Plan of work
First bound media selection, file presence checks and missing diagnostics. Then
introduce SQL page/summary contracts and wire Creatives, Winners and Overview so
page size never becomes a count denominator. Preserve URL filters, like-for-like
groups, sorting, unknown values, sample sizes and detail navigation. Add heap
telemetry using the runtime's actual heap limit and test the warning at 80%.

## Concrete steps
Work in /tmp/Exter-web-memory, branch fix/sql-bounded-web-memory. Reuse installed
dependencies and disposable local Postgres. Use fixture-only SQL/HTTP tests,
including a child web process limited below 200 MiB heap and a separate client.
Run npm run check, npm test, npm run build, npm run secrets:check; run affected
infrastructure fixtures and responsive screenshots for the memory warning/pages.

## Validation and acceptance
50,000 ads, large raw fields and repeated 500-ID batches stay below 200 MB heap
while overlapping page requests complete. Assert SQL limits and projections, full
counts across pages, stable sorting/filtering, current Page/revision isolation,
missing versus real-zero values, restated observations, media retry modes and
legacy media preservation. Never replace missing data with an empty success.

## Idempotence and recovery
Only additive indexes/read models are permitted. Keep all rows/files. Queueing
uses the existing advisory lock and active-job checks; a crash cannot duplicate a
paid start. Rollback restores code while preserving added indexes and all history.
Unknown costs retain their holds. No environment, plan, budget or live gate changes.

## Interfaces and dependencies
No new dependencies or provider calls. API pages include authoritative totals,
filter options and SQL summaries alongside bounded rows; sample responses keep
their existing shapes. Health adds numeric heap used/limit/utilisation and a
controlled warning, never request contents, raw provider data, tokens or URLs.
