# Current collection status and retained failure history

## Purpose and big picture
Respond to the owner's 8 November collection report. Distinguish resumed/completed collection from historical 6 November errors and show current automatic retries clearly. Preserve failure history, data, live guards, budgets, 03:00 schedule and provider fields. No live provider or production database calls.

## Progress
- [x] 2026-11-08 UTC: Read AGENTS, PRODUCT-SPEC source/honesty rules, UI rules and reference rules. Confirmed PR #20 is merged; repair branch starts at fetched exter-test-drive cfcbbc0.
- [x] Inspected the exact UI, projection, page checkpoint, queue and smaller-page recovery paths. Confirmed successful pages clear run.errors but MetaRunDetails always promotes failures[0].
- [x] 2026-11-08 03:12 UTC: Add current-versus-historical projection and truthful active labels, retry size/time and controlled date-error explanation.
- [x] 2026-11-08 03:12 UTC: Verify complete/resumed/active-retry/failed cases through unit, Postgres and browser fixtures; complete checks and prepare a PR against exter-test-drive.

## Surprises and discoveries
The owner's completed 8 November row still advertises its 6 November failure because the UI ignores run.message when showing failures[0]. Explicit resume and successful pages clear errors while intentionally preserving history. Graph code 1/HTTP 500 already retries the same cursor at 100/50/25/10 through the shared gate; no evidence was supplied of an exhausted 10-ad retry. Job available_at and the shared Meta gate already hold the earliest eligible next attempt. No Render credentials or production DB access are attached. This diagnosis concerns code plus pasted statuses, not direct live verification.

## Decision log
8 Nov: Derive current failure from the current disposition (status and cleared errors), never from history alone. Expose safe existing queue timestamps, not cursors or tokens. Retain all historical entries behind Failure history. Running/queued actions stay disabled and say Collecting/Queued; retries remain manual only for blocked work. Map the known 100/2334030 case to a controlled end-date explanation. Keep retry policy unchanged because fixtures already prove the shrinking-page path; verify the reported sequence again.

## Outcomes and retrospective
Implemented the status-only repair. npm run check, npm test (495 passed) and npm run build pass, with the existing large-bundle notice. Disposable Postgres: 10 recovery/activation tests pass, including a new current error after a successful page and unchanged failure rows after completion. Browser: current/history separation, guarded actions and disclosure controls pass at 1280/1440/1920/390; selected fictional screenshots and the reference comparison are under output/playwright/meta-current-status/. The final staged secret scan is recorded with the PR. Fixtures cannot confirm production cursor progress or deployment state.

## Context and orientation
server/infrastructure/meta-runs.ts projects watchlist progress; shared/meta-collection.ts holds controlled errors/types; MetaRunStatus.tsx is reused in Data sources and Edit watchlist. jobs.ts and meta-library.ts clear errors on resume/success and preserve failures separately. Existing tables provide queue timing; no schema change is needed.

## Plan of work
Add optional currentFailure and nextAttemptAt fields for read-only status. Keep old clients/fixtures readable through a shared pure current-failure helper. Update the shared status component without rebuilding the screen. Add fixtures matching the owner's statuses using fictional brands only. Record deployment instructions and screenshots.

## Concrete steps
Use the existing local dependencies via a temporary worktree symlink. Run npm run check, npm test, npm run build, npm run secrets:check. Run tests/meta-recovery.integration.ts against the existing disposable Postgres fixture instance only. Browser fixtures intercept APIs and block all external requests.

## Validation and acceptance
Completed and resumed progress must not promote old failures; history must remain expandable and unchanged. A new failure after successful progress must be current. A queued 50-ad failure must show an automatic 25-ad retry and the effective shared-gate time, with a disabled Queued action. Failed/paused states keep their actionable controlled errors. Unknown timestamps stay absent. Test sample, budget and access guards. Compare source/watchlist screenshots at desktop and mobile widths with the existing frame.

## Idempotence and recovery
No database migrations, deletes, paid starts or production writes. New status fields are optional for compatibility. Preserve retry-limit, cursor, pacing, lease and token boundaries. Deploy the web reader first; workers/scheduler need no code changes for this UI fix. PR #20's date correction still requires its already-merged worker to be deployed.

## Interfaces and dependencies
No new dependencies. Keep the Graph request contract, field set, enabled flags, budgets, models, media, own-account gates and kernel work untouched. Both live own-account gates remain open. Every failure remains available; a historical failure is not a current outage.
