# Media coverage and Pacific-safe public collection

## Purpose and big picture
Diagnose small media batches, show per-brand coverage and precise run counts, and keep bounded exact-ID batches progressing for every watchlist brand. Fix 03:00 UK Graph failures by omitting the upper delivery date. Show only the two explicitly authorised, sanitised Meta user-error fields. Preserve existing data, budget caps, enabled switches, collection fields and schedule. No paid/live ad-provider calls during implementation.

## Progress
- [x] 2026-11-06 UTC: Read current specs, reference rules, actor/input, job/checkpoint/accounting, diagnostics and source UI. Created fix/media-coverage-and-meta-dates from exter-test-drive 1875a10; earlier presentation work remains untouched in another worktree.
- [x] 2026-11-06 03:41 UTC: Fix public collection date bound and sanitised user diagnostics, with GMT/BST fixtures.
- [x] 2026-11-06 03:41 UTC: Add durable per-ad request/outcome accounting and per-brand coverage, exact-ID initial/continuation batches and restart-safe fair queue refill.
- [x] 2026-11-06 03:41 UTC: Record safe actor-input diagnostics and actor-provided summary counts without raw payloads/messages/URLs.
- [x] 2026-11-06 03:45 UTC: Verify 1,200-ad, multi-brand partial batches, failures, budget/lease safety, migration and UI fixtures; run all four checks and prepare the PR against exter-test-drive.

## Surprises and discoveries
Initial media runs currently search a Page and set their cap from the then-collected corpus, which can be small while official collection is still growing. Subsequent exact-ID runs depend on a worker post-completion enqueue; a crash in that gap leaves no queued continuation until scheduling/manual action. target_ids on queued runs are treated as attempted even before paid dispatch. Run results count all dataset items, including status/summary rows, while matched counts and per-ID outcomes are absent. These code findings are not a claim to have inspected production run records. Public actor documentation confirms a run-summary item with per-query totals, delivered counts and stop reasons; unrecognised counts must remain unknown.

## Decision log
2026-11-06: Use known official archive IDs for new initial and continuation batches (up to 500). Persist actual dispatch IDs/time, not the whole Page-search target snapshot. Prefer never-requested IDs before daily retries. Refill all eligible watchlists when the worker is idle or a run completes, including after restarts; uncertain paid starts remain blocked. Existing per-run maximum USD and GBP guards remain unchanged. Omit ad_delivery_date_max for all official collection paths, including old run configs. Retain end dates in metadata only. Any provider that still requires a bound uses the current America/Los_Angeles date ceiling. Latest user authorises bounded error_user_title/error_user_msg only; the generic provider message, trace and URLs remain prohibited.

## Outcomes and retrospective
Implemented exact-ID batching, per-brand coverage and safe Graph date/error handling. The full unit suite passes 492 tests. Multi-brand Postgres fixtures exercise 1,200 IDs with full and partial actor responses; browser fixtures check Data sources and Edit watchlist at 1280/1440/1920/390. No production token, provider run or actual account data has been accessed. Fixtures cannot verify the actor's real coverage or repair already-discarded diagnostics. Final checks and publishing are recorded below.

## Context and orientation
server/ad-media/jobs.ts owns batches and web-side leased steps; api.ts owns worker transport and status; apify.ts owns pinned actor input and safe normalisation; storage.ts owns bounded retention. Existing ad_media_runs and ad_media_creatives preserve history. New additive request/outcome metadata will distinguish not-requested, not-returned, expired, unsupported, wrong-Page and budget states. server/connectors/meta-library.ts builds Graph requests. infrastructure/jobs.ts persists failures; meta-runs.ts and MetaRunStatus render them in Data sources and Edit watchlist.

## Plan of work
1. Remove the upper Graph request date universally. Test actual London 00:30/03:00/09:00 in winter/summer and saved backfill/daily configs. Add a Pacific date helper for other required end-date paths.
2. Sanitize only Meta error_user_title/error_user_msg: remove exact tokens, credential patterns, URLs and controls; cap each at 300 characters; render as plain text. Keep numeric codes and controlled error messages alongside them.
3. Track actual dispatch IDs and outcomes idempotently, including unmatched and failed downloads. Project distinct official-ad coverage per current Page/revision, union historical retained assets, and show reasons without double-counting or treating unknown legacy requests as confirmed.
4. Queue exact missing IDs in 500-result/cost-capped batches, favouring never-requested ads across every brand. Add idle/restart refill and fair continuation. Keep existing token, enable, budget, pacing and disk guards.
5. Surface Page/country/window/status/maxAds, local requested/returned/matched and recognised actor summary counts in Details. Store allowlisted numeric/categorical diagnostics only. Update DEPLOY/STATE and screenshot the changed source panels with fictional fixtures.

## Concrete steps
Run npm run check, npm test, npm run build and npm run secrets:check. Use a disposable Postgres/pgvector database with isolated schemas for integration fixtures. Existing node_modules may be linked from the main workspace; never commit the link. Use provider-disabled local preview and browser-intercepted fixtures for UI checks.

## Validation and acceptance
All six GMT/BST date/time combinations send only the minimum official delivery date. Sanitised Graph user fields retain useful text without token/URL leakage and never exceed 300 characters. A brand with 1,200 official ads is requested in several <=500 batches even when responses are small; another brand also progresses. Coverage distinguishes actual dispatch, returned, matched and retained outcomes and assigns missing reasons. The cost cap is unchanged; every billed result remains guarded, including discarded output. Restarts, completion acknowledgements and summary rows cannot strand continuation or create duplicate paid starts. All four checks and relevant Postgres/browser fixtures pass; no live provider calls. Actual results: npm run check passed; npm test 492/492; npm run build passed with the existing large-chunk notice; npm run secrets:check found no known secret patterns. Disposable Postgres: 17 media/recovery cases and 8 activation/storage regression cases passed, including migration replay, full and partial 1,200-ID batches, queued-versus-dispatched counts, wrong Page, budgets, excess output, safe user errors and legacy date configs. The final media suite was repeated after moving optional actor INPUT reads to terminal turns so they cannot extend a download turn. Browser: tests/ui_media_coverage_browser.py passed at 1280/1440/1920/390 with no external traffic or page errors. Selected captures and the DataSources side-by-side reference are committed under output/playwright/media-coverage/. The authorised coverage/diagnostics extend the existing Budgets and schedule panel; no other screen layout was rebuilt.

## Idempotence and recovery
Add tables/columns without deleting historical rows, media or analyses. Do not infer actual dispatch from legacy Page target arrays or queued plans. Do not backfill legacy Page-search targets as requests. Legacy matched files establish confirmed lower bounds; label unknown counts honestly. Preserve existing leases/uncertain holds and owner-enabled flags. Deploy web migrations/readers before worker/scheduler; operators explicitly resume blocked runs through current guards.

## Interfaces and dependencies
No new dependencies or services. Preserve actor build, per-result/start rates, <=500 result cap, provider maximum charge, budget threshold, 720p/disk policy, Graph fields and 03:00 UK schedule. All new UI follows existing Data sources frames and reference rules. Public documentation research is read-only; no actor starts or live Graph calls.
