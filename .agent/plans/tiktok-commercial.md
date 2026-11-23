# TikTok public collection

## Purpose and big picture
Wire the approved public TikTok source alongside Meta, using confirmed business
identities, durable collection, retained files and platform-separated research.
The owner reports keys on the web and worker. No live calls before deployment.

## Progress
- [x] 2026-11-23 UTC: verify target branch and inspect source, jobs, media and design.
- [x] 2026-11-23 UTC: verify official query, advertiser and detail contracts.
- [x] Build advertiser discovery and manual overrides with fixture tests.
- [x] Build resumable daily collection, media and analysis handoff.
- [x] Expose platform-separated research, reach, Working Score and source health.
- [x] Run all four checks, database fixtures and responsive browser verification.
- [x] Prepare one PR against exter-test-drive with rollout and smoke-test instructions.
- [x] Prepare branch publication and CI handoff against the verified target.
  CI status is reported on the pull request; live smoke remains a deployment gate.

## Surprises and discoveries
The official query has no business-ID filter and returns at most ten ads. Search
by saved business name and accept only confirmed business IDs. Full details supply
caption, landing URL, targeting and country reach. Rounded values need explicit
Estimated labels. Current Working Score is absent in real screens; implement the
published missing-weight formula without inventing organic or concept signals.
Workers cannot read the web disk. Use the existing leased, authenticated web media
broker pattern, never assume a shared disk or add paid media scraping.

## Decision log
2026-11-23: extend watchlists with a platform discriminator; existing page_ids is
the internal advertiser-ID array, exposed as business IDs for TikTok. Preserve Meta
identities and keep platform in every source/media/analysis key. Reuse collection
runs/jobs and their failure supervisor, with one bounded step per claim. Scheduler
needs no provider secrets. Country defaults are GB and IE, editable for relevant EU
markets; a refusal is shown, never silently changed into another country's data.

2026-11-23: scope retained media, category labels and numeric IDs by platform. A
second confirmed business ID must resolve its files as well as the first. Use
Estimated for rounded source reach and calculated Working Scores. Complete paid
analysis is reused only for matching inputs; uncertain starts remain blocked.

## Outcomes and retrospective
Implemented discovery, durable public collection, direct retained media, existing
analysis handoff and platform-scoped research. Targeted source/media/SQL fixtures
pass, including an explicit ten-ad smoke cap and changed-input analysis recovery.
Full regression results and CI are recorded below before handoff. Fixtures cannot
confirm live approval, coverage or prediction accuracy.

## Context and orientation
server/connectors/tiktok-commercial.ts handles client credentials and ten-ad
queries. server/infrastructure/jobs.ts, creative-index.ts and creative-pages.ts
own durable jobs and bounded research reads. Media lives on the authenticated web
broker using AdMediaStorage. Existing video/image services own profiling and cost
accounting. Product/design references remain authoritative.

## Plan of work
Document TK-01..07; add connector detail/search methods and sanitised diagnostics;
add job state, identity review, immediate media retention and analysis handoff;
project TikTok through the bounded index; separate default comparison platforms;
add tests and review screenshots. Never weaken existing source or privacy tests.

## Concrete steps
Use feat/tiktok-commercial from verified exter-test-drive commit 077ea4b. Reuse
pinned dependencies. Run npm run check, npm test, npm run build and npm run
secrets:check. Use disposable Postgres for test:infrastructure and new fixtures.

## Validation and acceptance
Cover domain identity matching, ambiguous/manual IDs, countries, DST schedule,
resumable search_id, wrong advertiser, duplicate/change-only storage, rounded and
missing reach, safe error text, expired media, disk limits, analysis and platform
isolation. CI makes no live provider calls. A post-deploy explicit ION8 smoke job
is capped at ten matching UK ads and uses the normal collection/media path.

## Idempotence and recovery
Additive schema; existing history/files/paid outputs remain. Persist each page and
cursor, fence leases and identity revisions. Retry transient failures with bounded
backoff, pause after three. Never replay an uncertain paid analysis automatically.
Manual choices override automatic discovery. Reads never start providers.

## Interfaces and dependencies
No new dependency, secret, provider price, Render plan or Meta switch. Use existing
TikTok client keys, media broker credentials and inference/provider budget guards.
Live ION8 verification waits for deployment and is not represented by fixtures.

## Final validation (23 November 2026)

- TypeScript and production build pass. The existing large-bundle warning remains.
- All 650 unit tests pass with the installed media tools on PATH. One earlier
  environment run lacked heif-convert; correcting PATH restored that fixture.
- All 116 disposable Postgres integration tests pass, including 12 new TikTok
  cases. The 50,000-ad fixture peaks at 114,519,872 heap bytes, below 200 MB.
- Secrets scan passes over all staged text. No provider keys or URLs enter source
  snapshots; fixture error strings use only explicit dummy credentials.
- All 24 browser width/screen checks pass; screenshots compare six changed screens
  with approved references and include two mobile views. A final navigation-link
  assertion checks the exact TikTok analysis identity.
- Latest target verified at 077ea4b. Live ION8 smoke, deployment and own-account
  verification remain pending; no fixture clears those gates.
