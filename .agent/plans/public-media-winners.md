# Public media diagnostics and Winners recovery

## Purpose and big picture
Explain every missing public preview, keep the media queue working within its
existing budgets, repair copy tiles and card alignment, and keep Winners useful
while category/format coverage is incomplete. Add cheap text tagging controls.

## Progress
- [x] 2026-11-10 UTC: read repository rules and trace media, categorisation and comparison paths.
- [x] 2026-11-10 UTC: Build per-ad missing-media diagnostics and disk-aware coverage with fixture tests.
- [x] 2026-11-10 UTC: Queue all missing previews, include historical exact IDs and retry downloads safely.
- [x] 2026-11-10 UTC: Repair card/preview layout and add responsive fixture screenshots.
- [x] 2026-11-10 UTC: Infer source formats, explain coverage and add honest Winners fallback.
- [x] 2026-11-10 UTC: Run tagging after collection and add an estimated-cost Tag ads now action.
- [x] 2026-11-10 UTC: Ran all four checks, database/browser fixtures and opened PR #32 against exter-test-drive.

## Surprises and discoveries
Base e2b36c7 includes PR #31. Retained asset metadata is currently counted as a
preview without checking the disk. Exact-ID media requests still carry a rolling
12-month date filter, which can exclude old ads retained from earlier collection.
Winners receives an already-filtered library, so untagged/unknown-format ads vanish
before duration ranking. Text category jobs are incorrectly coupled to the media
switch and broker despite using only Postgres text.
The workspace volume filled during checkout; work continues on the separate /tmp
volume without deleting saved files. Live access returned 502 and no production
credentials are configured. The owner explicitly cancelled production verification:
use fixtures and diagnostics; the owner will check the three ads after deployment.

## Decision log
2026-11-10: latest owner instructions supersede the earlier live trace request.
Do not query production or start live providers. Preserve stored media/history,
actor caps, disk thresholds, official reach/dates, model configuration and budgets.
Exact retained IDs must not be excluded by a fresh date window. Diagnose missing
files separately from metadata and never describe an unknown cause as verified.
Winners fallback is explicitly Not yet like-for-like, never a prediction or a
relaxed qualified cohort. Keep the minimum rule for comparable groups unchanged.
Use the existing text-only batch model/budget first; visual analysis is only a
follow-up for unclear text, not a prerequisite for every ad.

## Outcomes and retrospective
PR #32 contains 1440px/390px screenshots and zero-provider-call browser checks. Type check, build and secrets check passed; 25 isolated Postgres tests passed. The full test command passed 513 cases before nine files lost dependency resolution during local disk recovery. All 83 cases in those nine files passed after restoring the path, giving 596 passing cases across the run and recovery. The initial full command exited nonzero for the environment interruption. No remaining assertion failures were observed. Fixtures are not production verification. No diagnosis of the three live
ads will be claimed; their IDs in the latest message were placeholders.

## Context and orientation
server/ad-media owns the disk broker, queue, bounded download and coverage.
server/public-categories owns low-cost text batches. Meta evidence and shared
public comparisons supply formats/categories; ResearchScreens renders Winners.
CreativeCard and AdPreview own poster tiles and metric/source-link alignment.

## Plan of work
Add controlled per-ad reason states and paginated reads. Verify retained files
on the disk-owning service, expose counts/list/coverage and reuse them for cards.
Broaden exact-ID handling and keep bounded download retries. Restore a raw public
fallback for Winners and explain exact coverage gaps/minimums with shared functions.
Queue text enrichment independently of downloads and expose estimates/actions.

## Concrete steps
Use /tmp/Exter-media-winners, branch fix/public-media-winners. Run npm run check,
npm test, npm run build and npm run secrets:check; use isolated local Postgres and
responsive browser fixtures. Never call live providers in tests.

## Validation and acceptance
Cover never-requested, queued, no media, missing result, failed download and missing
file states; active/inactive/historical IDs; three download retries; budget stops;
source-format inference; untagged Winners fallback and exact minimum explanations.
Capture cards with and without media at desktop, tablet and mobile widths and
check non-overlapping UK reach labels and source links below metrics.

## Idempotence and recovery
Preserve old observations and assets. Retry existing downloads without starting
another paid scraper when possible; unknown paid starts retain holds. Use the
existing queue locks and revision guards. Schema additions must be idempotent.

## Interfaces and dependencies
No new dependencies, secrets, budget increases or global model changes. Media disk
checks belong on the web service, not the diskless worker. Real and sample records
remain isolated. Owner production verification remains explicitly deferred.
