# Creator performance intelligence

## Purpose and big picture
Add creator-to-ad research, an explainable Estimated Sales Signal, optional owned
outcomes and validated history import to the existing Creators screen. Train only
after 50 distinct creators have outcomes. Publication also requires the existing
accuracy gates; public ad reach never becomes sales or ROAS.

## Progress
- [x] 2026-11-20 UTC: read product, accuracy, UI and creator discovery rules.
- [x] 2026-11-20 UTC: write and commit the product contract before product code.
- [x] 2026-11-20 UTC: implement bounded evidence linking, outcomes and shared signal calculations.
- [x] 2026-11-20 UTC: add discovery controls, brief handoff, import and forecast/accuracy interfaces.
- [x] 2026-11-20 UTC: validate focused fixtures, responsive browser layouts and database integration.
- [x] 2026-11-20 UTC: all four local checks pass; 650 unit tests, build and secret scan.
- CI results are tracked on the PR.
- [x] 2026-11-20 UTC: open PR #42 against exter-test-drive with screenshots and rollout.
- [ ] Recheck the merged target revision and confirm final CI.

## Surprises and discoveries
Working Score remains unavailable in real ad read models. Use it only when a
real score exists; longevity is separately assessed. Archive IDs and owned ad IDs
are different identities: never join them by assuming they are equal. Existing
creator profile projections keep only three recent posts for page reads, so sales
calculations must use the bounded full twelve-post profile on the server.

## Decision log
2026-11-20: GitHub confirmed target commit 077ea4b includes PR #41 while the
checkout remote advertisement remained at ba71c5f. Fetch the exact commit SHA and
merge it, preserving both dated documentation sections and the preview recovery.
2026-11-20: separate public association proof from explicit owned-ad identity.
Build evidence in the existing committed 500-ad background index chunks. New
public page reads must not scan/decompress every raw payload. Formula assumptions
are versioned and documented before implementation. Fifty creator outcomes permit
training, not a weaker replacement for the accuracy publication gates.

## Outcomes and retrospective
Core implementation and focused calculation, API and database fixtures pass.
Browser checks found and fixed a narrow-screen expanded-table overflow.
1280/1440/1920/390px checks pass, without external requests or page errors.
The full 105-test database suite passed, including existing large workspaces.
All four local checks pass. Focused reruns also cover owned sync, creator refresh,
expiry and direct-ad identity. CI results are tracked on the PR. Fixtures cannot establish live gates.

## Context and orientation
Creators uses server/creators/discovery-api.ts and CreatorDiscoveryPage.tsx.
Postgres stores discovery, public observations and owned days. The background
creative index projects at most 500 ads in each short transaction. Existing
shared/owned-metrics.ts owns all account metric formulas and minimum samples.

## Plan of work
1. Document CP-01..06 in research/PRODUCT-SPEC.md and commit docs first.
2. Add pure signal/evidence/search/import/forecast contracts and fixture tests.
3. Persist minimal scoped links and append-only imports/models; hook indexing.
4. Reuse the existing Creators and Accuracy sections, strict Results gate and
   budgeted search flow. Add plain-English filter review and brief handoff.
5. Exercise source honesty, missing data, cohort separation, authorisation,
   deletion, idempotency, time holdouts, and responsive layouts.

## Concrete steps
Use feat/creator-performance-intelligence from origin/exter-test-drive. Run npm ci,
npm run check, npm test, npm run build and npm run secrets:check. Use disposable
Postgres for fixture integration. Never use production data or live provider calls.

## Validation and acceptance
Proof links open source ads; every Sales Signal exposes parts and missing coverage.
Public records have no private outcomes. CSV validation is atomic and rejects
foreign brands, invalid numbers and dates. Forecasts fail closed before both the
50-creator training threshold and the prediction publication gates. Fixtures never
release a real gate. All existing creator screening remains authoritative.

## Idempotence and recovery
Additive migrations only. Index writes and creator association writes commit
together. Deduplicate imported campaigns by scoped content hash; retain history.
Delete-creator removes the new profile links/outcomes/models containing their data
under the existing privacy action. No provider configuration or paid budgets change.

## Interfaces and dependencies
Reuse React/shared UI, zod, Postgres, existing account metric and accuracy code.
No new dependency, secret, service plan or live dispatch. No ML on web startup.
Forecast training is an explicit bounded action on stored outcomes only.
