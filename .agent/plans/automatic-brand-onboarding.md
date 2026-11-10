# Automatic UK brand onboarding

## Purpose and big picture
Enter a name and public website, then follow a durable checklist from website
understanding through Page matching, competitors, collection, media and tagging.
Keep budgets, official facts, manual overrides, sample isolation and live switches.

## Progress
- [x] 2026-11-10 UTC: finish PR #32 with a clean 596-test full run.
- [x] 2026-11-10 UTC: inspect existing website fetch, Page lookup, queue and budget code.
- [x] 2026-11-10 UTC: Implement pure identity, competitor and category rules and fixtures.
- [x] 2026-11-10 UTC: Add durable onboarding steps, bounded website crawl and budgeted text batches.
- [x] 2026-11-10 UTC: Add rate-limited Page/discovery lookups, multi-Page watchlists and manual overrides.
- [x] 2026-11-10 UTC: Connect downstream jobs, monthly suggestions, progress and two-field onboarding UI.
- [x] 2026-11-10 UTC: All four checks, 605 unit tests, 40 Postgres fixtures and four browser widths passed.
- [ ] Open the onboarding PR against exter-test-drive after pushing.

## Surprises and discoveries
PR #32 is open and the current exter-test-drive base is e2b36c7. This branch
builds on PR #32; target exter-test-drive and document that dependency until merged.
The existing website extraction favours fragrance keywords, so onboarding needs a
generic crawler. A unique brand-watchlist index prevents multiple Pages. Use one
single-Page watchlist per brand/Page so existing per-Page cursors and jobs remain.
Web owns the brand SQLite database and media disk; workers cannot read either.

## Decision log
2026-11-10: the owner's explicit automatic Page instruction supersedes the earlier
manual-confirmation-only policy for this onboarding flow. High confidence requires
website/domain evidence, not just name similarity or an AI suggestion. Ambiguous
matches stay in Needs one click. Confidence is an estimated match score, never a
validated prediction. Manual watchlists are authoritative and never overwritten.
Use the existing Flash-Lite asynchronous text batch method and financial guard.
Competitor sites share one batch so they do not wait a full batch window each.
Progress reads project only small state fields, excluding crawl work payloads.
Monthly checks suggest changes; they never silently replace saved competitors.
Never scrape private data, contact anyone, enable switches or call live providers
for verification. Website text is untrusted input and source statements are claims.

## Outcomes and retrospective
Implemented the complete fixture flow: two-field creation, bounded website
understanding, domain-backed multi-Page identity, six verified UK bottle rivals,
manual overrides, budget/rate/restart recovery and monthly suggestions. The full
pipeline fixture collects 15 ads across nine Page watchlists, retains 15 previews,
tags all 15 with specific categories and enables comparisons. Competitor websites
share one batch. Progress queries exclude crawl payloads, poll without overlapping
requests and slow down after completion. Parallel enqueue fixtures pass with only
two database connections. Existing paid research and prior evidence remain stored.

Verification: npm run check, npm test (605 passed), npm run build and
npm run secrets:check; 40 isolated Postgres fixtures, including 12 onboarding cases;
responsive Chromium fixtures at 390/1280/1440/1920px with zero external requests.
Screenshots and reference comparisons: docs/review/automatic-onboarding/README.md.
Fixtures cannot verify live identity, real match accuracy, costs, coverage or
prediction gates. Batch completion can take 24 hours. Blocked sites pause honestly;
weak matches need a click and missing media retains existing retries/reasons.
PR creation remains the final milestone; this branch depends on open PR #32.

## Context and orientation
server/brand-research.ts supplies bounded same-domain public HTML fetches.
server/onboarding will own durable jobs, website/profile discovery and APIs.
shared/onboarding will hold pure match/rank/category rules. Existing official
collection, media, category and budget jobs remain their sources of truth.

## Plan of work
Add a persisted, leased state machine with one bounded external operation per
step, restart-safe paid dispatch and controlled errors. Crawl at most eight pages
per website. Verify candidate advertisers against their own sites and UK ads.
Use explicit source-derived product categories as the shared comparison vocabulary.
Apply only high-confidence matches; show three ambiguous candidates for approval.
Expose costs before dispatch and actual known charges/holds afterwards. Collection
and enrichment remain automatic within switches and existing budget/disk limits.

## Concrete steps
Work in /tmp/Exter-onboarding on feat/automatic-brand-onboarding. Use fictional
HTTP/model fixtures and isolated schemas in the disposable local Postgres. Run
npm run check, npm test, npm run build and npm run secrets:check. Store screenshots
under docs/review/automatic-onboarding and explain differences from references.

## Validation and acceptance
Cover a bottle brand and same-category UK advertisers, retailer/self exclusions,
several UK/global/kids Pages, no UK ads, ambiguous identities, private/oversized
websites, pagination, budget pauses, missing tokens, rate limits, restart/lease
fencing, manual edits, monthly suggestions, source-category matching and sample
isolation. Prove all paid calls reserve first and ambiguous starts never duplicate.

## Idempotence and recovery
Keep history and paid holds. Derive durable step keys; use advisory locks and
leases. Never overwrite a manual Page/category/competitor choice. Retry known safe
reads; ambiguous paid starts require reconciliation. Resume paused steps after
configuration/budget repair. Schema changes are additive except replacing the
single-brand uniqueness index with per-brand/Page uniqueness; no data is deleted.

## Interfaces and dependencies
No new dependencies, model changes, secret names, global budget increases or live
test calls. Reuse existing machine auth for web-owned brand writes. Read-only
progress must never initiate provider work. No outcome model is authorised here.
