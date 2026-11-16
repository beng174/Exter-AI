# Creative page queue recovery

## Purpose and big picture
Fix the production screenshot showing the creative library busy after background
indexing was deployed. Preserve data, formulas, budgets and provider switches.

## Progress
- [x] 2026-11-16 UTC: identify global single-reader queue and overlapping index polls.
- [x] 2026-11-16 UTC: Make polling settle before scheduling its next refresh; retain loaded cards.
- [x] 2026-11-16 UTC: Bound concurrency to two pages and cancel abandoned Postgres reads.
- [x] 2026-11-16 UTC: Cover slow navigation, polling and cancellation with fixtures and browser checks.
- [x] 2026-11-16 UTC: Four checks and 101 integration tests pass. Final PR CI
  status must be verified and recorded on the PR before handoff.

## Surprises and discoveries
Index polling invalidates every cached workspace read at five-second intervals,
including unfinished reads. Slow reads can repeatedly restart before completion.
The old full-library memory gate still allows one request globally. SQL reads have
no disconnect signal, so obsolete work occupies the gate until completion.

## Decision log
2026-11-16: Keep memory bounded to two read pages, preserving the existing queue
limits. Use documented Postgres cancellation on our own tagged read transaction.
Polling waits for a settled load and expires completed creative results without
aborting peers or clearing the independent context-cache TTLs.

## Outcomes and retrospective
639 unit and 101 integration tests pass. Browser fixtures finish 6.52-second
refreshes without overlapping reads, retain results after a busy response and
recover on the next poll. The 50,000-ad fixture peaks at 111,337,224 heap bytes.
Production is not accessed or live verified.

## Context and orientation
LibraryReadGate serialises creative requests. creative-browser.ts owns its request
signal; creative-pages.ts owns a checked-out Postgres transaction. React research
and creative pages poll during indexing through ReadCache.

## Plan of work
1. Add safe settled cache expiry and a reusable completion-based refresh hook.
2. Permit two bounded reads and destroy/cancel disconnected SQL transactions.
3. Retain already displayed data on background refresh errors; avoid irrelevant
   date actions on a busy error. Add fixture coverage and record measurements.

## Concrete steps
Use the isolated fix/creative-read-queue worktree from latest exter-test-drive.
Run npm run check, npm test, npm run build and npm run secrets:check. Run disposable
Postgres integration tests and browser fixtures; never call providers.

## Validation and acceptance
A refresh slower than five seconds finishes without cancellation or overlapping
refreshes. Navigation cancels obsolete database work. Two independent bounded
requests progress concurrently and subsequent requests can acquire freed slots.
Retain the existing 50,000-ad heap check and all source/data assertions.

## Idempotence and recovery
Read-only changes need no migration or new secrets. Disconnect cleanup releases
connections once. Postgres cancellation matches both backend PID and a unique
transaction tag, so it cannot cancel a reused connection or another operation.
Rollback by reverting this branch; source history and index checkpoints are unchanged.

## Interfaces and dependencies
No dependencies, schema, collection or budget changes. Keep background indexing
from PR #39. CI status and deployment steps are recorded in the PR.
