# Meta Ad Library activation

## Purpose and big picture
Make the existing public Meta connector ready for confirmed UK commercial-ad access, behind a default-off switch. Operators can save each watchlist brand's Page ID, collect public reach, and see it in the existing screens. No provider calls are authorised by this implementation task. The target branch is exter-test-drive.

## Progress
- [x] 2026-11-05 UTC: Read repository instructions, product activation rules, reference fidelity rules, connector and queue.
- [x] 2026-11-05 UTC: Version, ALL requests, typed public reach and secret-safe responses pass connector fixtures.
- [x] 2026-11-05 UTC: Per-brand watchlists, cursor recovery, gates, UK clock changes and shared rate delays pass disposable Postgres fixtures.
- [x] 2026-11-05 UTC: Stored observations feed the creative read model, requested reach sections, watchlist editor and Page-logo lookup. Type check passes; browser verification remains.
- [x] 2026-11-05 UTC: Operator documentation updated. check, all 430 unit tests, build and staged-file secrets scan pass; five Postgres cases and 114 browser screen/width cases pass.
- [x] 2026-11-05T01:26Z: Reviewed, committed and pushed feat/meta-library-activation; PR #14 targets the latest exter-test-drive (03e3d1f).

## Surprises and discoveries
The public collector already retains observations and cursor history in Postgres, but the UI reads the SQLite creative gallery. Watchlists currently have a unique workspace index, so they cannot represent separately editable brands. The existing scheduler has neither a public-collection switch nor UK wall-clock scheduling. Logo storage already supports Meta Page pictures, but does not read Page IDs from Postgres watchlists.

## Decision log
2026-11-05: Individual published reach is Observed. The user explicitly requests share of voice by reach; this is an Estimated watchlist proxy, with its denominator and non-deduplicated coverage explained in About this data. No commercial impressions or spend are derived. This resolves the product spec's older impression-based proxy wording without inventing private metrics.
2026-11-05: The public API documents total_reach_by_location as a list of key/value entries with UK, EU and BR locations (https://www.facebook.com/ads/library/api/). Fixtures cover that shape and the older country/reach shape. UK maps to GB for one common-country denominator, never to EU.
2026-11-05: Preserve the existing queues, observations, cursors, SQLite media and analysis. Add per-brand watchlist identity and immutable backfill windows rather than replace the collection pipeline. Category discovery remains a separate keyword purpose.

## Outcomes and retrospective
Connector and disposable Postgres fixture checks pass. All 430 unit tests, five disposable Postgres integration cases, 24 affected-view/width checks and 90 existing real/sample alignment cases pass. Screenshot comparisons are under output/playwright/meta-library/. Fixture validation is not live verification. Own-account Phase 0 and Phase 1 live gates remain open.

## Context and orientation
server/connectors/meta-library.ts requests public ads and persists pages transactionally. server/infrastructure/{schema.sql,jobs.ts,api.ts,runtime.ts} owns Postgres scheduling and API access. server/demo/creative-browser.ts serves the screen read model from saved SQLite creatives plus Postgres evidence. shared/ holds pure metric contracts. src/components/research/ and the creative screens consume that read model. Existing logo code stores bounded raster copies locally and refreshes monthly.

## Plan of work
1. Normalise public reach and demographics, always request ad_type=ALL and default to Graph v26.0. Test missing/zero/invalid data and secret-safe failures.
2. Add brand/discovery watchlist identity, 12-month window snapshots, saved-cursor continuation, default-off worker/scheduler gates and 03:00 Europe/London slots. Test fixtures against temporary Postgres.
3. Overlay latest public observations into creatives, expose health, add one shared Page ID editor, and populate only the requested reach sections. Resolve Page IDs into the existing logo fallback.
4. Record activation and exact Render setup. Validate UI with fixture-only previews, run check/test/build/secrets, inspect the diff and publish a PR.

## Concrete steps
From /workspace/Exter-AI: npm run check; npm test; npm run build; npm run secrets:check. Use the repository's disposable Postgres integration harness for queue coverage. Preview screens with tests/fixtures/m1-server.ts, then run python3 tests/ui_meta_library_browser.py. All provider responses are fictional fixtures. Never print credentials, enable the live flag or make live Graph requests.

## Validation and acceptance
Actual results: npm run check, npm test (430 passed), npm run build and npm run secrets:check pass. Disposable Postgres: tests/infrastructure.integration.ts and tests/meta-activation.integration.ts pass all five cases. tests/ui_meta_library_browser.py passes 24 affected screen/width cases and both watchlist entry points. The existing alignment audit passes all 90 real/sample cases; its optional before/after packaging initially needed baseline images copied into the isolated output directory, then completed without repeating the checks. Artifacts and retained visual differences are documented in output/playwright/meta-library/README.md.

Requests include ad_type=ALL and respect META_API_VERSION. Absent reach stays null, genuine published zero stays observed, and commercial spend/impressions are absent. Fixtures cover pagination, cursor recovery, switch-off, rate limiting, UTC/BST scheduling, separate brands, Page ID editing, read-path isolation and logo source order. All four required checks must pass. Record actual results here before publishing.

## Idempotence and recovery
Schema changes are additive and rerunnable. Preserve old watchlists, runs and cursor histories. Observation writes retain their existing idempotent key. Disabled collection retains queued jobs and cursors for later continuation. Keep stored evidence and additive columns. Before rolling back to a worker that predates the switch, stop its worker and scheduler and remove META_ACCESS_TOKEN; an old binary does not honour the new flag. Failed provider calls retain earlier successful pages and use sanitised reasons only.

## Interfaces and dependencies
META_ACCESS_TOKEN is a Render secret on exter-ai and exter-worker. EXTER_META_LIBRARY_ENABLED defaults off and must be set consistently on web, worker and scheduler to activate collection. META_API_VERSION is optional configuration, default v26.0. Scheduler requires Postgres and the switch, not the token. No new dependencies. User confirmation of API access is dated 4 Nov 2026; actual production collection remains pending the switch, and fixtures do not close live gates.
