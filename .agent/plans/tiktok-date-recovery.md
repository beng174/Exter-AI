# TikTok past-date windows and recovery

## Purpose and big picture
Fix TK-01/TK-02 queries rejected because max includes today. New collection,
backfill, smoke and advertiser discovery end yesterday UTC. Clamp at the client.
Automatically recover only this date rejection after deployment, with a bounded
two-day fallback. Keep history, budgets, pacing, identity and paid-analysis guards.

## Progress
- [x] 2026-11-24 UTC: verify merged PR 43 and target 1ea9e0a; inspect jobs/client.
- [x] 2026-11-24 UTC: implement shared calendar window, client clamp and targeted durable recovery.
- [x] 2026-11-24 UTC: focused date/source fixtures pass, including midnight, leap and recovery guards.
- [x] 2026-11-24 UTC: all four checks pass, with 667 unit tests and 27 focused fixtures.
- [x] Prepare the fix branch for a PR against verified target 1ea9e0a.
  Full database integration and final-commit CI results are recorded on the PR.
- Final commit CI is recorded on the PR before handoff. No live provider calls.

## Surprises and discoveries
The client already binds search_id to its exact date filters. A changed max cannot
reuse that cursor. Keep the rejected run and checkpoint as history, supersede it,
and create a fresh job through the existing worker queue. Calendar dates, rather
than a rolling millisecond threshold, avoid rejecting a leap-year boundary.

## Decision log
2026-11-24: yesterday is the default max. If that exact max is still rejected,
retry two days back once per UTC day. Do not recover other failures or analysis
jobs. Recovery only queues work; normal source/budget/pacing checks still run.
Use the current UTC day for the calendar-year minimum, so a two-day max fallback
does not move the minimum outside the allowed rolling year.

## Outcomes and retrospective
Focused fixtures pass for UTC boundaries, leap/year changes, next-day windows,
concurrent recovery, actual refusal-to-success fallback, legacy queued jobs and
worker dispatch. All four checks and 667 unit tests pass. Full integration and CI results are
recorded on the PR. Fixtures cannot establish live
recovery or clear existing gates.

## Context and orientation
server/tiktok/jobs.ts owns durable source steps and daily scheduling.
server/connectors/tiktok-commercial.ts validates queries and memory-only tokens.
New pure date helpers are used by both. Existing paused rows retain controlled
provider messages, which allow a narrowly targeted recovery without schema changes.

## Plan of work
Add date helpers; clamp request max and calendar minimum validation; recover only
matching paused jobs with expired/released leases and unchanged watch revisions.
Test ordinary, midnight, leap-year, resumed and repeated-rejection cases. Document
rollout and retain old state notes.

## Concrete steps
Use fix/tiktok-query-dates from 1ea9e0a in /tmp/Exter-tiktok-dates. Reuse pinned
dependencies and disposable Postgres. Run npm run check, npm test, npm run build,
npm run secrets:check and npm run test:infrastructure. No production DB or APIs.

## Validation and acceptance
Never send today/future max at either UTC boundary. Fresh ranges remain within a
calendar year. Recovery keeps observations, costs and cursors on the old run,
restarts discovery without manual entry, and stops repeated fallback loops.
Other errors, revisions, disabled collections and active leases stay protected.
The next daily query includes the previous day's ads.

## Idempotence and recovery
Lock the watchlist, then run and job before superseding. Do not delete records or
reuse a cursor with changed filters. Concurrent workers may create only one fresh
recovery job. Recovery never clears unrelated queue failures or paid holds.

## Interfaces and dependencies
No schema, dependency, secret, budget, model, schedule or Render plan changes.
Deploy web and worker together; the scheduler also needs the new date policy.
Live access and own-account gates remain open.
