# Preserve public ads and creator intelligence when updating PR 43

## Purpose and big picture
Merge the latest exter-test-drive into feat/tiktok-commercial. Preserve background
chunked indexing and bounded read fallback, creator performance intelligence and
TikTok public collection. Do not deploy, call providers or change product scope.

## Progress
- [x] 2026-11-23 UTC: verify PR head cd4e479 and target 6585cfe (merged PR 42).
- [x] 2026-11-23 UTC: merge target and compose all seven conflicts.
- [x] 2026-11-23 UTC: 19 focused fixtures pass, including merged index and upgrade recovery.
- [x] 2026-11-23 UTC: all four checks pass, with 661 unit and 123 integration tests.
- [x] 2026-11-23 UTC: prepare final merge commit for the existing PR 43 branch.
  Publication and final-revision CI are recorded on PR 43 before handoff.

## Surprises and discoveries
PR 43 already includes PRs 39 to 41 through 077ea4b. The new target adds creator
performance intelligence from PR 42, including creator attribution in index rows.
The public browser stores a structured Working Score; creator evidence needs its
numeric value. Meta version lookups must also include platform after TikTok joins
the index, and an imported Meta row cannot become a TikTok projection by numeric ID.

## Decision log
2026-11-23: use a merge commit, preserving both histories. Combine schema suffixes
rather than selecting one side. Keep background index jobs and page-read fallback;
request paths must never refresh or rebuild the index. Preserve the public score
breakdown and adapt only the numeric creator evidence boundary. Scope creator
versions and imported-row matching by platform, with collision fixtures.

## Outcomes and retrospective
All seven conflicts are resolved and the focused suite passes. A pinned PR 42
schema fixture verifies a two-pass upgrade of populated tables. Both source and
creator evidence survive the bounded index, with platform-scoped versions. All four checks, 661 unit tests and 123 Postgres integration tests pass. The
20,000-ad cold/partial-read and timeout recovery gate and 50,000-ad memory test
remain intact. CI status is recorded on PR 43 for the final merge revision.
Fixtures cannot confirm deployment or live access.

## Context and orientation
server/infrastructure/creative-index.ts builds chunks; creative-index-read.ts and
creative-pages.ts serve partial/fallback reads. server/creators/performance-* owns
creator intelligence, while server/tiktok owns official public source jobs. Both
use shared creative shapes and the additive Postgres schema.

## Plan of work
Compose each conflict, then inspect non-conflicting interactions for platform
isolation and preserved creator attribution. Add a meaningful integration case if
the combined behaviour has no existing coverage. Preserve model validation gates.

## Concrete steps
In /tmp/Exter-tiktok-commercial, merge verified target 6585cfe. Use pinned existing
dependencies. Run npm run check, npm test, npm run build, npm run secrets:check and
npm run test:infrastructure against the disposable local Postgres fixture database.

## Validation and acceptance
No conflict markers; all tests retained. Migrate an existing schema twice without
losing data. Both TikTok and creator performance APIs remain mounted and tested.
Background chunks and timeout recovery survive; page reads keep bounded fallback.
GitHub CI must pass on the pushed head before handoff.

## Idempotence and recovery
Do not modify the dirty main checkout. During resolution, a merge abort restores
the PR head if required. Keep all retained rows, files and paid analyses. No
production database connection or live provider call is used for verification.

## Interfaces and dependencies
No dependency, secret, Render plan, provider price, budget or schedule change.
Existing broker and authentication boundaries stay in force. The live ION8 smoke
and own-account validation gates remain open until the owner verifies them.
