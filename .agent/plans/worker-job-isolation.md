# Keep independent worker queues running after job failures

## Purpose and big picture
Prevent one failed onboarding, collection, owned sync, media, creator, category or
kernel step from terminating every queue. Preserve checkpoints, paid holds and
history. Record safe diagnostics, back off individual failures and pause the same
job after three consecutive failures. Show the reason on Data sources.

## Progress
- [x] 2026-11-11 UTC: branch from deployed exter-test-drive b8a2e8a; inspect runtime, queue claims and migration rules.
- [x] Add per-queue supervision, fenced recovery and safe error diagnostics.
- [x] Reproduce media follow-up timeout corruption and bound historical payload extraction. The production job remains unconfirmed.
- [x] Surface paused jobs and guarded checkpoint retries on Data sources.
- [x] Run database fixtures, all four checks and browser verification.

Delivery gate: push fix/worker-job-isolation, open a PR against exter-test-drive
and verify the final head's CI before handing back. Record the CI link and result
in the PR rather than this static plan.

## Surprises and discoveries
runtime.ts awaits all queues inside one outer try. Errors in queue refill or
status persistence escape. Media/onboarding broker failures are also swallowed.
The supplied logs invoke server/index.ts and show historical web OOMs and normal
deploy replacements, not a worker exception. There is no production database or
authenticated Render connection in this environment. Do not claim a production
job identity without worker diagnostics.
The completed media-run path also performs follow-up enqueueing inside its error
handler's scope. A fixture proves an enqueue timeout could overwrite completed,
settled work with paused status. Preserve completion and treat refill separately.

## Decision log
2026-11-11: capture the actual claimed job and lease through an optional observer.
Use durable failure records and lease-fenced disposition, not process-local retry
counts. Keep paid dispatch identities and uncertain holds intact. Isolate kernel
configuration inside its own guard. Only verified database connection loss stops
the running worker; statement timeouts are recoverable job failures.
2026-11-11: count handled transient provider errors too, while excluding pending
polls, pacing and smaller-page fallback. Preserve earlier permanent/uncertain
pauses. A final safety fixture caught uncertain state being made resumable; the
disposition and retry guards now preserve it and its hold.
2026-11-11: creator reconciliation can throw while saving its own error. Wrap the
entire claimed job in finally so even this path releases its heartbeat timer.
2026-11-11: kernel claims accept queued jobs only. Recover unexpected status-write
failures to queued, with their original checkpoint, and preserve in-flight paid
markers as blocked. A real Postgres trigger fixture verifies retry/pausing.
2026-11-11: preserve the driver error when an owned-sync failure cannot be saved;
its old generic wrapper discarded SQLSTATE. A trigger fixture verifies the code
reaches the safe diagnostic without any provider call.

## Outcomes and retrospective
Recovery fixtures cover SQL timeouts, broker diagnostics, handled provider errors,
three-failure pausing across restarts, stale leases, successful streak reset,
manual retry, uncertain holds and all seven claim gates. A history fixture retains
18,000 observations for 2,000 ads and returns only current fields. All 96
infrastructure tests, both owned-sync tests and 636 unit tests pass. TypeScript,
production build and secrets checks pass. The existing 50,000-ad fixture peaked
at 116,861,384 bytes of heap. Browser fixtures verified failure details and retry
at 1440px/390px with no page errors. Screenshots are in docs/screenshots/worker-recovery.
Final CI results and rollout steps are recorded in the PR. Fixtures cannot verify
production recovery or identify the actual production job from the supplied web logs.

## Context and orientation
server/infrastructure/runtime.ts is the process entry. Seven work-once functions
own their queue claims. Media and onboarding execute retained-disk steps through
the web broker. Existing guards prevent duplicate paid starts. Source health and
diagnostics appear in src/components/workspace/DataSourcesPage.tsx.

## Plan of work
Add a small injectable worker supervisor, claim observers and a durable failure
table. Back off the same checkpoint twice, then pause it. Exclude paused records
from every automatic claimant and refill. Add scoped diagnostic/retry routes and
reuse existing section/table components. Test failures before/after claims,
database loss, statement timeouts, restart persistence and redaction.

## Concrete steps
Work in /tmp/Exter-worker-recovery. Use existing dependencies and the disposable
local fixture database. Run npm run test:infrastructure, npm run check, npm test,
npm run build and npm run secrets:check. Open one PR against exter-test-drive and
verify all CI jobs on the final head.

## Validation and acceptance
One job throws while the others complete. Three consecutive failures pause only
that job across restarts; success resets the streak. Logs include type, ID, safe
message, SQLSTATE and application stack location, without token, URL or provider
body. Data sources shows the saved reason. Paid reservations and checkpoints stay.

## Idempotence and recovery
Use additive tables/indexes. Recover only a still-owned claim; never overwrite a
new lease or completed job. Retrying reuses the existing checkpoint and all live,
budget and paid-dispatch guards. No deployment, live calls, settings changes or
production database mutations are authorised by the fixture test work.

## Interfaces and dependencies
No new packages, environment variables, provider behaviour or budget changes.
The optional claim observer is inert outside the supervised runtime. Keep all
existing integration assertions. Report production diagnosis limits explicitly.
