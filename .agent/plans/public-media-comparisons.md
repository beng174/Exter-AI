# Complete public previews and comparable ad groups

## Purpose and big picture

After official collection, automatically fill image/poster coverage, retry missing
previews daily, and retain additional 720p videos within existing disk and budget
guards. Classify product categories with low-cost asynchronous Flash-Lite batches.
Default comparisons to the workspace's editable primary categories and matching
media formats, including source-linked sample sizes and similar competitor ads.
Official reach, dates, history and provider caps must remain intact.

## Progress

- [x] 2026-11-09 UTC: read repository/spec/reference instructions and create the
  branch from exter-test-drive 0d92d2e, including merged PR #23.
- [x] 2026-11-09 UTC: daily preview outcomes, collection handoff, legacy poster upgrades and guarded video ordering; disposable Postgres fixtures pass.
- [x] 2026-11-09 UTC: genuine asynchronous category batches, cost holds, exact keys, source hashes and failure recovery; fixture validation passes.
- [x] 2026-11-09 UTC: primary category settings, grouped overview tables, chart switches, exact detail matches and category/format evidence links.
- [x] 2026-11-09 UTC: pure selector, settings, local media and Postgres fixtures; 34 real-like screen/width cases and all 15 sample screens at three desktop widths plus mobile.
- [x] 2026-11-09 UTC: all four required checks pass; 522 unit cases, 22 Postgres media/category cases and real-like/sample browser verification.
- [ ] Publish the reviewed feature and screenshot evidence against exter-test-drive.

## Surprises and discoveries

Existing media runs request exact official IDs in batches of at most 500. A
refill gate already visits all watchlists. Present media detection depends on
complete results and only upgrades priority videos. Missing attempts have no
seven-day outcome summary. Creative style and media type currently share display
fields, and comparisons do not filter product categories. The kernel remains
paused; this is a separate, authorised text-only classification workflow.

## Decision log

9 Nov: reuse media runs, disk broker, budget ledger and bounded file stores.
Preserve official fields and put category labels in separate tables. Treat media
type as Observed from media; product categories are Modelled. Unknown tags never
silently enter a comparable group. “Same format” groups multi-format pages into
separate format cohorts; detail uses its selected creative's format. Keep an
explicit all-category option for exploration, with format cohorts still separate.
The owner clarified compact overviews: one table with format row groups, largest
own count first, a sample per group, hide only when both sides have fewer than ten,
and one chart format switch defaulting to the largest visible own group. Detail
always uses its own format. No separate repeated page sections per format.
Use existing inference credentials/rate configuration and genuine provider batch
jobs, without changing any existing analysis model or enabling the kernel.

## Outcomes and retrospective

Implementation complete, final publication pending. Automatic media handoff, daily
preview outcomes, additional video ordering, product batches, editable categories
and format-matched comparisons are fixture-tested. Coverage is a target, not a
promise that a provider can return every preview. Seven failed days requires seven distinct recorded retry
days, not elapsed time or a missing configuration. Tests remain fixtures only.

## Context and orientation

`server/ad-media/` owns exact-ID provider jobs, local media and coverage.
`server/infrastructure/jobs.ts` completes official collection runs; runtime runs
the worker. SQLite brand JSON owns editable settings; Postgres owns durable jobs
and official observations. `shared/creative-research.ts` and screen components
compute/render comparisons. The read endpoint merges extra metadata into the
existing browser shape without modifying official observations.

## Plan of work

1. Extend media outcomes and select new/missing previews before video upgrades;
   schedule collection-run handoffs and daily retries idempotently.
2. Verify current batch contracts/model pricing in official documentation. Add
   bounded text-only jobs, conservative pre-dispatch reservations, safe polling,
   output validation, source hashes and model provenance.
3. Add editable primary categories and shared pure cohort selection. Wire all
   requested screens, filters, similar ads, coverage and preview failure labels.
4. Test fixture boundaries, sample isolation and unchanged official fields;
   run check, test, build and secrets scan, then publish reviewable changes.

## Concrete steps

Work in `/workspace/Exter-coverage-fix`, using the existing dependency installation.
Use disposable fixture Postgres only. Run targeted unit/integration tests and
browser previews with external/provider transport blocked. Finish with
`npm run check`, `npm test`, `npm run build`, `npm run secrets:check`.

## Validation and acceptance

New collection ads are queued automatically; missing images retry daily with a
controlled reason. No preview rejection label before seven failed days. Existing
files/history survive retries and full videos remain bounded to 80% disk. Batches
are fenced and reserve budget before paid starts. Categories/format filters and
evidence links select the same rows across every requested comparison. Unknown
and unrelated categories/formats are excluded by default. Detail ranking prefers
same angle/offer after exact category and format matching. Sample stays read-only.
Fixture checks compare official reach/dates before and after enrichment.

Validation evidence: `npm run check`, `npm test` (522 cases), `npm run build`,
and `npm run secrets:check` pass. The existing 11 media integration cases
(including 1,200 ads across batches and another watchlist) and 11 new integration
cases pass against isolated disposable schemas. The 192 MiB large-library fixture
remains in the unit suite. No live or paid calls were made.

`tests/ui_public_media_browser.py` verifies ten changed screens at 1280, 1440 and
1920px and four at 390px, with all external requests blocked. It checks exact
format samples, category changes, hidden groups, chart switching, private metric
preservation, seven-day labels, matching source URLs and category editing.
`tests/ui_sample_browser.py` verifies all fifteen fictional screens at 1280, 1440
and 1920px, plus five mobile screens, sample isolation and read-only actions.
Screenshots and reference pairs are under `output/playwright/public-media-comparisons/`
and `output/playwright/public-media-sample/`.

Visual review found enriched card fields creating implicit grid columns and
miniature proof cards inheriting full-card subgrids. Consolidated format/tag rows,
kept one body column, restored compact proof thumbnails and inline metric labels.
Reference differences retained: authorised comparison controls/groups and tagging
status; a white copy preview when media is missing; real-like missing analyses and
public Working Score gaps instead of the reference's illustrative values. Sample
non-comparison content and private metrics retain their rich read models.

## Idempotence and recovery

Migrations are additive and rerunnable. Keep every existing row/file. Job leases,
source hashes and daily retry dates prevent duplicate dispatch. Ambiguous paid
starts keep their hold and need explicit recovery; no automatic double spend.
Rollback UI/worker code without deleting enrichment history or official data.

## Interfaces and dependencies

Reuse APIFY_TOKEN, GEMINI_API_KEY, existing GBP pricing/budget configuration,
media switch and disk broker. Add no dependency or plan/cap changes. Real provider
access, available budget and deploy-time configuration determine actual coverage;
fixture results do not close existing live gates. Render rollout must migrate
before updated web/worker/scheduler readers use the new tables.
