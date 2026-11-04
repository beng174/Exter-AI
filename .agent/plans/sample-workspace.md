# Complete read-only sample workspace

## Purpose and big picture
Populate every approved screen with the fictional Northwick Candle Co. workspace, available only with ?demo=1. Keep real workspaces and records unchanged. Use the same API contracts, routes, React screens and shared components, with explicit richer read models for sections real sources cannot yet support.

## Progress
- [x] 2026-11-04 UTC: Read AGENTS, UI rule 1, product honesty rules and reference fidelity rules. Fetched exter-test-drive; PR #9 is the latest merged base. Extracted reference renderVals for all fifteen screens.
- [x] 2026-11-04 UTC: Added shared/sample fixtures, complete typed API records, explicit flag/ID scoping and a server mutation guard.
- [x] 2026-11-04 UTC: Populated all fifteen screens through their existing routes and components. Shared optional read models supply illustrative unbuilt sections; normal responses keep existing fallbacks.
- [x] 2026-11-04 UTC: Unit/API tests and browser acceptance pass for isolation, no operational fall-through, complete screen sections, canned answers, private-outcome restrictions, visible bars and desktop/mobile navigation. Reviewed all app/reference comparisons.
- [x] 2026-11-04 UTC: Type check, 407 tests, production build and browser regressions pass; sixteen app/reference pairs include all fifteen screens and sidebar.
- [x] 2026-11-04 UTC: Staged secret scan passes; all four required checks pass on the completed implementation.
- [x] 2026-11-04 UTC: Published https://github.com/beng174/Exter-AI/pull/11 against exter-test-drive, with all sixteen app/reference pairs and kept differences.

- [x] 2026-11-04 UTC: Merged the newly landed PR #10 (60d5f5f), preserving its filters, Basis rules and research notes; the combined type check, build and 407 tests pass.
- [x] 2026-11-04 UTC: Sample acceptance, real-workspace fidelity regression and PR #10 filter/Basis acceptance all pass after the merge. Pixel comparison against a clean 60d5f5f build is 16 identical, 0 changed; refreshed all sixteen sample/reference pairs.

## Surprises and discoveries
The current demo flag only filters existing database brands. Several sections deliberately have no implemented calculation yet. The authorised sample requires presentation read models for those sections; these must never imply live calculations or enable production gates. PR #10 merged while this PR was being published. The branch now includes the latest exter-test-drive at 60d5f5f; conflicts in the creative browser, shared table and research notes were resolved by preserving both features. Visual review caught missing mix-bar height and incorrect detail scene/checklist/readings grids; these were fixed, and browser acceptance now asserts visible mix bars. The reference retention points were copied from its SVG, not invented or inferred from a provider.

## Decision log
2026-11-04: Keep fixtures in shared/sample and intercept only explicit sample requests before database/provider routes. Do not seed SQLite/Postgres. Scope browser API requests with the existing demo flag, isolate brand selection/storage, preserve the flag on links, and reject all sample mutations at the server even if clients bypass disabled buttons. Allow canned Ask responses as local read-only fixture lookup. Rich section data is optional on the existing response contract; normal responses retain existing rendering and unavailable states.

## Outcomes and retrospective
All fifteen screens are populated and labelled. The same API paths return isolated fixtures without a database seed, and mutations cannot reach production handlers. All fifteen ordinary workspace screen captures and the sidebar remain pixel-identical to a clean latest-base build. Samples are illustrative, never live verification. Predictive score remains gated.

## Context and orientation
src/App.tsx owns ?demo=1, brands and PageHeader's Sample data pill. src/lib/api.ts performs API requests. server/app.ts installs authenticated routes. shared/creative-browser.ts is the saved-evidence contract used by research, creative and action pages. design/screens renderVals and design/reference HTML/PNGs provide fictional content and geometry.

## Plan of work
1. Define typed sample records and richer section read models from approved values, using fictional .example source links and stable sample IDs.
2. Add a flag-gated API adapter and mutation guard, including direct-ID access without the flag and real/sample cross-scope attempts.
3. Fill existing screen sections with optional API data, using shared UI components and read-only controls.
4. Validate every route, internal drilldown and canned answer; compare all fifteen screenshots with references; publish evidence and kept differences.

## Concrete steps
Run npm run check, npm test, npm run build, npm run secrets:check. Serve the isolated preview with node --import tsx tests/fixtures/m1-server.ts and capture Chromium at 1440px. All external requests must be blocked during browser verification. Do not call providers or run migrations.

## Validation and acceptance
Without ?demo=1, no sample brands/records are returned or rendered, including direct sample IDs and a previously selected sample. With the flag, every page has Sample data, fictional content fills each designed section, and the predictive-score gate remains. Mutation attempts cannot reach databases, providers, analysis, sync, collection or budget spending. Canned Ask sources link to sample evidence. Screenshots use samples only and are labelled accordingly. Actual results: npm run check, npm test (407 passed), npm run build and diff checks pass. tests/ui_sample_browser.py passes all fifteen screens plus sidebar and the legacy read-only routes; output/playwright/sample-*.png contains sixteen app originals and sixteen full-resolution comparisons. The existing fidelity browser regression passes; pixel comparison with a clean build of the latest base reports 16 identical, 0 changed. The staged secret scan also passes; PR publication remains below until complete.

## Idempotence and recovery
Fixtures are stateless and read-only; restart or reload safely. Revert branch commits to remove the feature. Real records, analyses, media and existing paid-call configuration remain untouched.

## Interfaces and dependencies
No new dependency or schema. Existing API shapes gain optional section presentation data, consumed in existing screens. Owned sync remains off by default, both live gates remain open, and kernel work stays paused. No sample score or result constitutes implementation or validation of live scoring.
