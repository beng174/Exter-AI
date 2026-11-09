# Bound web-library memory after a heap abort

## Purpose and big picture
Repair exter-ai's confirmed JavaScript heap exhaustion (instance 6k9vd, 8 Nov 2026 20:49 GMT). Keep all collected history, media, formulas and API shapes. Reproduce a large public library with synthetic provider/database fixtures, then reduce transient row buffering and concurrent full-library builds. Do not increase Render plans, heap limits, budgets or enabled flags.

## Progress
- [x] 2026-11-08 UTC: Read AGENTS, source/honesty rules and Render troubleshooting instructions. Owner confirmed web service and the fatal heap-limit message. Private Render logs are inaccessible here; exact production allocation stack is unknown.
- [x] Created fix/bounded-public-library-memory from fetched exter-test-drive aa7330f. Existing presentation work remains in a separate untouched worktree.
- [x] 2026-11-08 21:35 UTC: Reproduce the original fatal heap error in a clean aa7330f production-mode checkout under a fixed 192 MiB fixture heap.
- [x] 2026-11-08 21:35 UTC: Stream and project public/retained-media rows, index identity matching, remove redundant clones, bound concurrent builds and incrementally encode responses with socket backpressure.
- [x] 2026-11-08 21:35 UTC: Verify parity, retained history, workspace boundaries, row/query failures, queue overflow/cancellation, response aborts and concurrent fixture loads. Complete required checks and prepare the PR against exter-test-drive.

## Surprises and discoveries
readPublicObservations returns up to 100,001 raw JSON rows before projecting any. readRetainedMedia similarly buffers all history, then groups it. Both are called while constructing a full library response. The endpoint also clones the whole public result for an optional owned lookup and allows concurrent full-library builds. The pg driver already supports row events without result.rows accumulation, using a checked-out client and a Query with no callback. This permits the same SELECT and database snapshot without a new dependency or changing collection/storage. These code risks do not identify the exact production allocation frame.

## Decision log
8 Nov: Use the existing pg row-event API with synchronous projection and guaranteed connection release; a visitor failure must drain and reject safely. Preserve the same SQL, latest-observation ordering, limits and data fields. Retained file references remain unioned from history. Build private cohorts only where present and preserve public records on read failure. Bound the heavy endpoint per process with a small waiting queue and explicit busy responses; health/status/media routes remain independent. The initial streamed-reader probe exposed a further peak in whole-response JSON encoding under concurrency, so encode rows incrementally and keep the permit until the response finishes or closes. Compare the final versions in production mode at the same 192 MiB fixture heap; do not alter Render heap settings.

## Outcomes and retrospective
Implemented the reader and response repair without changing API data or production configuration. The clean original checkout aborts with the reported fatal error under a 192 MiB production-mode fixture heap. The repaired checkout returns three full 7,800-ad responses under the same limit. Each body is 11,326,079 bytes with identical hashes. One final sample measured 168,644,824 bytes heap peak, 71,711,296 bytes heap after completion and 315,752,448 bytes RSS. These are synthetic fixture measurements, not production profiling. No live provider/production database calls were made. Live recovery still requires deployment and observation.

## Context and orientation
server/demo/creative-browser.ts builds the shared full-library API used by research screens. infrastructure/meta-evidence.ts projects latest public observations. ad-media/read.ts attaches saved media. infrastructure/database.ts uses the existing five-connection pool. Retained raw rows and concurrent builds can exceed the web heap while the final screen response is much smaller.

## Plan of work
Create a deterministic 7,800-ad fixture with representative copy/reach and large stored-only raw fields, plus media-history duplicates. Measure current versus repaired processes under the same heap. Add a reusable bounded row visitor, incremental identity-indexed public projection and streaming retained-history grouping. Serialize heavy response builds with bounded waiting and disconnect cleanup, preserving authentication and workspace/date validation. Record actual peak figures and practical limits.

## Concrete steps
Use existing local node_modules through a temporary link. Run isolated child processes with explicit fixture-only heap flags, not production settings. Use disposable Postgres for row-driver and projection parity checks. Run npm run check, npm test, npm run build and npm run secrets:check. Never log payloads, tokens or provider URLs; memory diagnostics contain counts/bytes/timing only.

## Validation and acceptance
The same bounded-heap fixture that aborts before the fix must complete afterwards, return all expected creatives with unchanged reach/copy/media and remain healthy under concurrent requests. Verify real pg row events do not accumulate raw rows, callback failures release connections and query/limit errors do not expose partial official results as complete. Waiting/aborted requests must release the web gate; status and health routes remain responsive. No schema/data deletion, paid calls or Render configuration changes. Validation: npm run check, npm test, npm run build and npm run secrets:check. All four checks passed: check, 504 unit tests, build (existing bundle-size notice), and the final staged secret scan. Seventeen disposable Postgres streaming/media/activation cases passed. The real pg test confirms result.rows remains empty, while row/query errors release healthy connections. No screenshots are required: UI code and response values are unchanged; JSON parity, actual HTTP responses, health and fixed-heap fixtures cover this backend repair.

## Idempotence and recovery
All changes are readers and admission control. No migration or stored-data change. Deploy exter-ai after merge and verify health, library counts and memory while collection continues. Worker/scheduler configuration and original checkpoints remain intact. Rollback code only; retain every row/file.

## Interfaces and dependencies
Preserve shared creative response shapes, Meta/TikTok/private cohort separation, provider fields, collection schedule/caps and original creative components. No new packages or schema. Kernel work remains paused and own-account live gates stay open.
