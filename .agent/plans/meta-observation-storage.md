# Meta change history and database storage health

## Purpose and big picture
Reduce daily collection growth without deleting historical observations, source evidence, media or analyses. New snapshots represent stored field changes; repeated identical responses advance the latest row's confirmation time. Show actual Postgres size and measured daily growth in Data sources. Base: exter-test-drive 175ac77; branch feat/meta-observation-storage.

## Progress
- [x] 2026-11-05 UTC: Read AGENTS, product spec, reference rules and current collector, readers and health route. Created this plan before implementation.
- [x] 2026-11-05 UTC: Added repeatable non-destructive migration, semantic fingerprints, scoped confirmations, direct payload references and hydrated confirmation-aware readers.
- [x] 2026-11-05 UTC: Existing status checks retain hourly physical size samples. Source health shows size and interval-averaged daily growth, with honest first-day/failure states and isolated sample copy.
- [x] 2026-11-05 UTC: All 450 unit tests and 11 disposable Postgres integration cases pass, including migrations, thirty checks, changes, concurrent runs, replay/crash recovery, scopes and hydration. Five browser screen/width cases plus Refresh, zero, first-day and failure states pass without external requests or mutations.
- [x] 2026-11-05 UTC: Documented all three measured monthly cases and reader-first deployment. Type check, 450 unit tests, build, tracked-file secret scan and affected UI checks pass.
- [x] 2026-11-05 UTC: Published PR #17 against exter-test-drive: https://github.com/beng174/Exter-AI/pull/17, with desktop/mobile screenshots, reference comparison and measured storage cases.

## Surprises and discoveries
Observations currently contain status, reach and a full payload on every ad/run. Delivery metadata also lives in public_ads. The current reader uses observation time as its current source endpoint, so unchanged checks must advance that endpoint through last_confirmed_at. Reader joins include watchlist revision; deduplication must preserve that identity boundary. The health route reports connectivity but has no persisted size history. Postgres MVCC confirmation updates still consume reusable page space: fixture allocated size is larger than live row bytes, so docs must disclose both rather than imply unchanged checks have zero physical cost.

## Decision log
2026-11-05: The user's change-history request supersedes the older product-spec wording requiring a new row per check. Retain all old rows and payloads. Use stable semantic JSON fingerprints, scoped to workspace/ad/watchlist revision, and a direct reference to a prior payload when a normalised-field change does not change raw JSON. Keep original observation/run timestamps immutable.
2026-11-05: Sample database size through the existing infrastructure status checks, at most one retained measurement per UTC hour. Growth is the measured byte difference per elapsed day against the closest sample at least 24 hours old, with its actual interval disclosed. Missing history or failed measurements stay Unavailable. No new provider calls or polling service.

## Outcomes and retrospective
Implemented and fixture-validated. A 10%-changing 1,000-ad fixture keeps 3,900 observations over 30 checks (4.86 MiB live rows; 25.0 MiB allocated observation relation), versus 30,000 daily snapshots. The all-changing case still keeps all 30,000 states. Detailed assumptions and reader-first rollout are in docs/DEPLOY.md; outputs and five passing UI cases are in output/playwright/storage/. All four required checks pass. Published in PR #17 against exter-test-drive. Deploy web before worker and scheduler; the automatic migration preserves historical rows and payloads. No live verification, deletion or deployment changes are authorised by this work. Existing owner collection settings and own-account live gates remain unchanged.

## Context and orientation
server/connectors/meta-library.ts commits each collected page with its checkpoint. server/infrastructure/schema.sql is migrated idempotently on service startup. meta-evidence.ts projects Postgres into existing screen API shapes. api.ts owns /api/infrastructure/status. DataSourcesPage and ActionReadModels share source presentation; sample routes are isolated in server/sample.ts.

## Plan of work
1. Add nullable confirmation/fingerprint/payload-reference columns and lookup indexes; do not backfill or remove old evidence. Serialize per-ad writes with existing public_ads row locks. Record only changes and keep payloads first-or-changed. Resolve sparse payloads in both public readers.
2. Add minimal hourly database-size history and safe storage-health projection. Keep connectivity failures separate from size/permission failures. Use the existing source-health frame for the database size row.
3. Add semantic fixtures and Postgres integration cases for change/revert, raw-only and normalized-only changes, existing rows, pagination/restart, concurrent scans, isolation, and daily growth with unavailable baselines. Compare real/sample Data sources at desktop/mobile widths.
4. Measure fixture row/index storage per 1,000 ads over 30 checks; document assumptions, autovacuum/MVCC limits, rollout order and rollback compatibility. Run check/test/build/secrets and publish.

## Concrete steps
From /workspace/Exter-AI run npm run check, npm test, npm run build and npm run secrets:check. Integration tests require only a dedicated disposable pgvector/Postgres database in a task-owned local Docker container, never production. Inject all Graph responses; browser checks block external requests. Follow the cloud runtime skill for local Docker.

## Validation and acceptance
Thirty unchanged daily scans keep one new observation per ad and move last_confirmed_at. Every changed stored field creates another row; key order alone does not. Legacy rows/payloads stay intact. Sparse payloads read as their complete source values. Latest check/days running stay current. Workspace/watchlist revision boundaries, page transactions and lease/idempotence guarantees remain intact. Health reports physical Postgres size with an explicit measurement time, and no daily growth until a valid day baseline exists. All required checks pass; fixtures are not live verification.

## Idempotence and recovery
Migrations are repeatable and non-destructive. Roll out web/readers and migration before the writer. Old writers still insert full payloads safely. Rolling back readers after sparse payloads exist requires retaining the hydration-compatible reader; do not delete sparse rows or old source payloads. A failed page rolls back both observation changes and its cursor. Preserve Render disk, secrets, budgets and flags.

## Interfaces and dependencies
No dependencies or new environment values. Extend existing infrastructure status with nullable storage measurements. Existing record/source APIs retain full resolved payloads and add confirmation metadata. Keep sample records isolated, tokens and paging URLs excluded, scoring unchanged and kernel paused.
