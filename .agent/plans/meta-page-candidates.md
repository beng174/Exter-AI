# Confirmed Meta Page discovery

## Purpose and big picture
Extend PR #14 with automatic suggestions for watchlist brands without a Page ID. Search UK commercial ads by saved brand name, rank Pages by website links, name and ad count, and require an explicit Confirm or manual save. Keep live collection off. No live provider calls are made while implementing or testing.

## Progress
- [x] 2026-11-05 UTC: Read current instructions, activation plan, product and reference rules; PR #14 is open against exter-test-drive.
- [x] 2026-11-05 UTC: Ranking, pagination, scoped cache, credential guards and shared pacing pass fixtures; six disposable Postgres cases include explicit confirmation and worker/lookup gate contention.
- [x] 2026-11-05 UTC: Both editor entry points show candidates, profile previews and explicit Confirm; browser fixtures pass at desktop/mobile widths with no automatic writes.
- [x] 2026-11-05 UTC: All four required checks pass, with 441 unit tests, six Postgres cases and 28 browser cases. Documentation and screenshots are complete for the PR #14 follow-up.

## Surprises and discoveries
Collection already has an app-wide Postgres request gate. The editor is shared by Competitors, Data sources and Brand research. Existing logo storage validates bounded raster images and caches monthly. Candidate identities must stay separate from confirmed brands and collected-ad observations.

## Decision log
2026-11-05: The latest request authorises name searches for Page suggestions even while live collection is off, only when META_ACCESS_TOKEN is configured. This is an explicit exception to category-only keyword collection; unconfirmed search results never enter watchlists or collected creative records.
2026-11-05: Use a short-lived bounded web-process suggestion cache rather than another durable collection queue. Searches run one provider page at a time through the same Postgres gate, resume opaque cursors in that cache and restart safely after expiry/redeploy. Search up to ten pages (1,000 ads) automatically, allow explicit additional batches up to 10,000 ads, and label incomplete coverage. Show the top three Pages. Profile images use the existing bounded raster store with the same request gate and cooldowns.

## Outcomes and retrospective
Ranking, guarded lookups, local profile previews, confirmation and manual fallback work through the existing shared editor. All 441 unit tests and six disposable Postgres cases pass. The browser check passes 24 existing screen/width cases plus four candidate entry/width cases with no external requests. Fixtures do not verify live access or close either owned-account live gate.

## Context and orientation
server/connectors/meta-library.ts supplies sanitised public pages. server/infrastructure/jobs.ts owns the shared Meta rate gate and worker dispatch. server/infrastructure/api.ts exposes authenticated, request-guarded watchlist writes. server/brand-logos.ts owns local square raster storage. src/components/research/MetaWatchlistEditor.tsx is the single editor for both requested entry points.

## Plan of work
1. Extract the existing request gate for use by collection and suggestions. Add pure candidate ranking with distinct-ad and exact-domain tests.
2. Add scoped POST lookup and scoped picture routes. Resolve names/domains from saved brands, never caller-supplied search text. Do not write Page IDs or public observations. Cache only safe candidate fields and opaque cursors, with TTL, bounded entries and pagination cycle checks.
3. Automatically search missing brands when the editor opens with a configured token. Show counts, domain evidence, one example ad, local profile pictures and Confirm. Preserve manual entry and disable all sample actions.
4. Run fixture unit/integration/browser checks, four required commands, update STATE/deployment notes and push to PR #14.

## Concrete steps
From /workspace/Exter-AI run npm run check, npm test, npm run build and npm run secrets:check. Use disposable TEST_DATABASE_URL for the Postgres gate/confirmation fixtures. Start node --import tsx tests/fixtures/m1-server.ts and run python3 tests/ui_meta_library_browser.py with all external requests blocked.

## Validation and acceptance
Actual results: npm run check and npm run build pass; npm test passes 441 cases. The two Postgres integration files pass six cases. python3 tests/ui_meta_library_browser.py passes all 28 screen/width cases and explicit-save assertions. Screenshots are in output/playwright/meta-library/page-suggestions-*.png. The staged-file secrets scan passes. The completed follow-up is being pushed to PR #14 before starting the newly requested readability work.

Fixtures cover UK/ALL requests, pagination, duplicate ads, domain versus name/count ordering, deceptive domains, missing websites, revoked tokens, cached results, bounded coverage, shared worker/lookup cooldowns, workspace scoping and no writes before confirmation. Test both editor entry points and manual fallback at 1440px and 390px. Token values, paging URLs and raw errors must never reach the browser, storage or logs.

## Idempotence and recovery
Opening/reopening the editor reuses suggestions within the cache TTL. Concurrent requests for the same lookup do not fetch the same cursor twice. Cache expiry or a web restart discards suggestions only. Confirm uses the existing transactional watchlist write, including duplicate-Page protection. Failed lookups and image retrieval leave existing watchlists, logos, media and observations intact.

## Interfaces and dependencies
META_ACCESS_TOKEN on web is the only lookup credential; lookup does not enable EXTER_META_LIBRARY_ENABLED. Worker and scheduler collection gates remain unchanged. No new dependencies or database tables. Candidate picture IDs are preview cache identities, never confirmed brand identities. Fixtures inject all provider and image transports.
