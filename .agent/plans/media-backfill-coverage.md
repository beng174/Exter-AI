# Public ad preview coverage and Winners

## Purpose and big picture
Make initial preview backfills continuous and prioritise visible winners. Add safe
file conversions, paid-dataset reuse and exact-ad fallback within existing budgets.
Keep Winners readable, with catalogue product text and consistent saved logos.
Target 95% per brand without claiming unverified live coverage.

## Progress
- [x] 2026-11-10 UTC: isolated branch from latest exter-test-drive 09f2e5d; read rules and trace queue/storage/UI.
- [x] 2026-11-10 UTC: Implemented and fixture-tested priority, terminal continuation, free reuse and guarded fallback.
- [x] 2026-11-10 UTC: WebP/AVIF/HEIC fixtures decode to JPEG; controlled MIME/HTTP/host diagnostics retained.
- [x] 2026-11-10 UTC: Added catalogue product presentation, shared logos, two-line titles and preview-only Winners; browser fixtures pass.
- [x] 2026-11-10 UTC: All four checks passed: 614 unit tests, 79 infrastructure tests; browser fixtures at four widths and before/after captures.
- [ ] Push one PR against exter-test-drive with causes, limitations and deployment steps.

## Surprises and discoveries
The latest base already refills the queue after terminal worker steps and requests
exact archive IDs without date filters. The reported one-batch/day behaviour cannot
be established from code alone. Fresh/newest priority does push older winners back.
JPEG/PNG/WebP are accepted; AVIF/HEIC are rejected. Poster extraction already exists,
but runs only after a source video passes bounded download/verification.
No production database or provider credentials are attached. No live checks or paid
runs are authorised for verification. Supplied IDs are fixture regression targets,
not proof of each production failure. The original workspace has unrelated WIP.

## Decision log
2026-11-10: latest instructions replace copy-heavy missing-media posters with compact
Preview loading tiles and a default preview-only Winners toggle. Reuse existing actor
datasets rather than persisting temporary signed media URLs or starting paid runs.
Keep exact Page/archive/workspace guards, 500-result run cap, budget reservations,
80% video disk guard, all official facts/history and live switches unchanged.
Do not promise measured 95% until the owner deploys and checks real counts.

## Outcomes and retrospective
A 15,000-ad fixture completes 30 consecutive 500-ad batches, with its oldest 50
in batch one. Removing per-row formatter construction reduced that fixture from
76s to about 15s. The media merge no longer drops posters behind a legacy media
flag. Final accounting counts ad rows, not summary records. Saved datasets repair
previews without new paid starts; missing/expired datasets fall back safely.

Validation passed: npm run check, npm test (614), npm run build, npm run
secrets:check and npm run test:infrastructure (79). Browser fixtures passed at
390/1280/1440/1920px with zero external/provider requests. Before/after and reference
comparisons are in docs/review/media-backfill. PR publication remains pending. Real six-ad failure histories and 95%
coverage are not claimed: no production credentials are attached and verification
is fixture-only. docs/review/media-backfill/README.md records code findings and
arithmetic from supplied counts without pretending they are live measurements.

## Context and orientation
server/ad-media jobs/api own paid actor checkpoints and web-disk retention.
coverage/read project controlled reasons and media. LocalImageMediaStore supplies
bounded public fetches. shared/creative-presentation and UI CreativeRow/Card/AdPreview
render titles and thumbnails; ResearchScreens holds Winners. BrandIdentity supplies
one shared saved-logo path. Data sources shows AdMediaRuns.

## Plan of work
Add pure priority rules, small additive queue metadata and terminal continuation.
Separate never-requested targets from daily retries. Re-read known paid dataset offsets
for failed files before buying a new scrape. Fall back to single-ID worldwide detail
lookup for UK-official ads not returned. Convert bounded accepted raster containers,
extract video posters, and retain per-file controlled type/failure diagnostics.
Expose disjoint reason counts, progress and conservative remaining cost. Use product
card metadata only for catalogue presentation, never to replace official source copy.

## Concrete steps
Work in /tmp/Exter-media-backfill on fix/media-backfill-coverage. Use shared installed
dependencies, disposable local Postgres schemas and blocked-network browser fixtures.
Run npm run check, npm test, npm run build, npm run secrets:check and affected PG tests.
Capture before/after Winners at 1440px and mobile, plus reference comparison.

## Validation and acceptance
15,000 official ads: top 50 longest-running appear in batch one, every initial ad is
requested across back-to-back batches, daily failed retries do not starve new targets.
Test budget/disk/lease/Page guards, WebP/AVIF/HEIC, video without poster, catalogue and
carousel, expired/timeouts/host/size failures, free reuse and not-found fallback.
Reasons must sum to missing ads with no overlap. Catalogue placeholders never appear;
logo dimensions remain fixed; preview-only filtering and source links work on mobile.

## Idempotence and recovery
Fenced steps and advisory locks; persist reservations before paid starts and retain
uncertain holds. Retain all existing rows/files. Reprocessing never starts an actor.
Only scoped official IDs can use fallback; every paid fallback reserves separately.
Safe schema replay and worker restarts must not duplicate a dispatch or download.

## Interfaces and dependencies
No new dependencies, model/budget/plan/switch changes or production calls. Existing
media secret stays in Render. Fixture data never releases live validation gates.
