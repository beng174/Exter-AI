# Creator paid-run recovery

## Purpose and big picture
Let public creator runs finish, keep partial results, display provider progress and
settle real charges. Reconcile earlier failed searches without starting new paid
runs. Preserve strict qualification, budget caps, source privacy and saved history.

## Progress
- [x] 2026-11-10 UTC: read repository/creator rules and trace current polling/budget flow.
- [x] 2026-11-10 UTC: implement bounded long polling, transient GET retries and partial datasets.
- [x] 2026-11-10 UTC: persist run/reservation identities, progress and recoverable job state.
- [x] 2026-11-10 UTC: settle confirmed usage and add guarded reconciliation, including legacy holds.
- [x] 2026-11-10 UTC: show run links/live counts and add provider/database/browser fixtures.
- [x] 2026-11-10 UTC: all four checks pass; npm test reports 588 passed.
- [ ] Publish the verified changes as a PR against exter-test-drive.

## Surprises and discoveries
Base e2332a3 includes PR #30. collectPublic starts runs with timeout=120, stops
polling after 120 seconds, then aborts unfinished paid runs in finally. The worker
lease lasts five minutes. Discovery discards provider run/reservation IDs, so old
holds cannot safely be released by amount or timestamp alone. Unknown identities
need explicit verified mapping, never a guessed refund.

## Decision log
2026-11-10: extend actor timeout to 900 seconds, poll up to 20 minutes using 5s
then 15s intervals. Retry only safe provider GETs, at most five retries per check.
Never retry paid POST dispatch. A transient status failure must not abort the actor.
Terminal timed-out/aborted/failed runs still expose partial datasets and real usage.
Persist run and ledger IDs before progressing. Unknown charge or identity keeps
its hold. Long jobs need lease renewal and durable resumption without redispatch.
Reconciliation starts no actor and leaves running/unknown charges reserved.
Historical IDs were discarded, so the UI requires an explicit run/hold selection
and the worker verifies actor, input, timing and uniqueness before settlement.
Provider documentation confirms usageTotalUsd is authenticated total real cost.

## Outcomes and retrospective
Provider and isolated Postgres/API fixtures pass. They cover a fifteen-minute
run, read retries, no duplicate dispatch, lease renewal, partial result projection,
real settlement and confirmed historical mappings. Browser checks pass at 1280/1440/1920/390px, including both reconciliation
actions and no overflow/console errors. npm run check, npm test (588 passed), npm run build and npm run secrets:check
pass. Both isolated Postgres/API tests pass. Screenshots and reference differences
are in docs/review/creator-run-recovery/.
Fixtures are not live verification or evidence of actual refunded funds.

## Context and orientation
server/creators/apify.ts owns authenticated transport and paid dispatch. Discovery
jobs use Postgres; cost_ledger holds conservative reserves. CreatorDiscoveryPage
shows search history. Provider accounting also serves the legacy creator route.

## Plan of work
Use a shared run-lifecycle helper for both creator APIs; add durable per-step runs
and real settlement. Wire progress to the worker/UI, preserve partial profiles and
advance finished steps. Reconcile known and verified legacy run mappings safely.

## Concrete steps
Work in /workspace/Exter-creator-recovery, branch fix/creator-run-recovery from
exter-test-drive. Run npm run check, npm test, npm run build, npm run secrets:check;
run isolated local Postgres integration and a read-only browser fixture.

## Validation and acceptance
Simulate long completion, backoff, 429/5xx/network failures, partial terminal runs,
read retry exhaustion without abort, real/unknown usage, duplicate settlement,
expired leases and legacy reconciliation. No live or paid provider tests.

## Idempotence and recovery
Persist the actor ID immediately and resume that same run after a worker restart.
Use the existing budget row lock for settlement. Preserve original holds and
unknown costs; reconciliation is idempotent. Schema changes are additive.

## Interfaces and dependencies
No new dependencies, secrets, budget increases or model changes. Tokens remain
in server headers only. Store controlled status, counters, validated IDs and
numeric usage only, never provider errors, paging URLs or raw datasets.
