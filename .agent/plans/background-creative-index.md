# Background creative index recovery

## Purpose and big picture
Restore real research pages for large workspaces. Requests must only read bounded
index data, including partial results, and never run an index rebuild. Background
chunks commit independently and resume after failures. No provider calls or changes
to collected facts, formulas, collection schedules or budgets.

## Progress
- [x] 2026-11-16 UTC: confirmed request-time refresh and all-or-nothing transaction.
- [x] 2026-11-16 UTC: Implement bounded, committed index chunks and persistent background queue.
- [x] 2026-11-16 UTC: Add partial-index progress, bounded empty-index fallback and safe API errors.
- [x] 2026-11-16 UTC: Prove recovery and all research routes on a 20,000-ad fixture.
- [x] 2026-11-16 UTC: Run infrastructure tests, four checks and open PR #39.
  Final CI status is recorded on the PR and must pass before handoff.

## Surprises and discoveries
The worker has no access to the web service SQLite disk. Existing machine-auth
broker steps run local-disk operations on the web service. Official-only indexing
can run in the worker; local import indexing needs the bounded broker pattern.
The page SQL also imports PUBLIC_ROWS_SQL, whose raw-payload reach fallbacks can
re-read every ad. Page reads must use index metadata and retained media only.

## Decision log
2026-11-16: use one persistent job per workspace with bounded checkpoints, short
transactions and idempotent upserts. Preserve earlier committed chunks on failure.
Reuse worker failure/backoff diagnostics and existing broker credentials. Do not
run paid or provider calls as part of indexing.

## Outcomes and retrospective
Public requests no longer build the index. The 20,000-ad fixture loaded cold in
196 ms and partial in 127 ms; reads overlapped writes and survived a cancelled
chunk. 637 unit tests and 98 integration tests pass, including the 50,000-ad heap
fixture. Eleven browser screens load with zero browser errors, writes or external
requests. Production recovery is not live verified; release requires merging and
deploying the same fix to web, worker and scheduler. Full-index aggregates remain
more expensive than bounded cold/partial reads; they do not decode raw history.

## Context and orientation
server/infrastructure/creative-index.ts projects official observations and local
imports into Postgres web_creative_index. creative-pages.ts aggregates and pages
that metadata. server/demo/creative-browser.ts serves it to research and action
screens. runtime.ts drives independent queues and broker requests.

## Plan of work
1. Split source selection from payload projection, LIMIT 500 before decompression.
   Commit checkpoint and index rows together; queue again until complete.
2. Enqueue at deployment and source updates. Remove request-time refresh. Read
   partial results and expose progress; read at most 48 source ads if index empty.
3. Log failed API responses with safe reason and path without query parameters.
4. Integration fixture validates fast reads during indexing, recovery after timeout,
   source invalidation, local imports and every requested screen.

## Concrete steps
From repository root run npm run test:infrastructure with TEST_DATABASE_URL pointing
to disposable Postgres, then npm run check, npm test, npm run build and
npm run secrets:check. Tests use fixtures only. Push fix/background-creative-index
and open against exter-test-drive. Never use production credentials in tests.

## Validation and acceptance
20,000 realistic payloads; first page under two seconds with cold/partial index;
chunks no larger than 500; forced timeout rolls back only current chunk. All named
research screens render; progress is visible. Existing tests retain assertions.
Record actual results and browser screenshots after running checks.

## Idempotence and recovery
Do not delete evidence or index history. Upserts and job checkpoints commit in the
same transaction. Failed jobs back off, then pause after three failures, preserving
progress. Retrying continues from the last committed key. Rollback of application
code leaves additive schema and original evidence intact.

## Interfaces and dependencies
No new dependencies or secrets. Existing broker token/origin protect local-import
steps. Additive Postgres schema uses existing migration receipt mechanism. Existing
API shape gains optional indexing progress. Collection and media switches unchanged.
