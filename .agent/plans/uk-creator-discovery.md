# UK creator discovery

## Purpose and big picture
Build UK creator research inside Creators, separating public discovery from
officially verified numbers. Deliver one docs-only skill PR, then a feature PR,
both against exter-test-drive. No outreach, live tests or changed ad calculations.

## Progress
- [x] 2026-11-10 UTC: inventoried and read all uploaded sources and scraper references.
- [x] 2026-11-10 UTC: consolidated skill, conflict decisions, draft brief and empty label CSV.
- [x] 2026-11-10 UTC: docs checks passed: TypeScript, 549 tests, production build and secret scan.
- [ ] Implement guarded discovery, verification, calculations, persistence, refresh and privacy.
- [ ] Build Find creators, Results, Segments and Accuracy measurements.
- [ ] Fixture/browser verification, four checks and feature PR.

## Surprises and discoveries
Uploaded source directories use different case and flattened filenames; requested
scraper trend-research is absent. Existing Creators supports a narrower legacy
flow, a fixed >40k threshold and a different engagement calculation. Preserve
paid records and add the newly authorised workflow without relabelling old counts.

## Decision log
2026-11-10: Use owner's tiers and median-of-12 formula. Heuristic fit is provisional
with coverage, never a conversion forecast. Leave draft handles explicitly
unverified. Preserve uploaded source paths and document the case difference.

## Outcomes and retrospective
Docs-only delivery passed all four checks (549 tests). Fixtures cannot confirm provider access, pricing, legal readiness or
client precision; real owner labels are required before client use.

## Context and orientation
server/creators has the existing guarded provider, research service and API.
src/components/workspace/CreatorsPage.tsx hosts the UI. shared contains pure
creator calculations. Accuracy already exists. Postgres budget reservations are
the accounting authority. Workers cannot access the web service's SQLite disk.

## Plan of work
1. Docs-only skill/references/briefs and full provenance. Open PR after four checks.
2. Inspect provider schemas and existing scheduling/storage; add bounded server
   discovery and official verification with injectable transports and fixture tests.
3. Persist minimal workspace-scoped creator records/segments and monthly refresh.
4. Reuse page/table/card components, expose costs, provenance and validation gates.

## Concrete steps
From each isolated worktree run npm run check, npm test, npm run build,
npm run secrets:check. Use local HTTP/DB fixtures only. Never supply tokens in
commands or fixtures. Push branches and target exter-test-drive.

## Validation and acceptance
Test normalisation, deduplication, formula edge cases, exclusions, cost/budget
stops, provider errors, privacy, monthly refresh, deletion and precision. Inspect
Creators and Accuracy in a local browser at 1440px and narrow width. Record actual
results and screenshot paths before final delivery.

## Idempotence and recovery
Handle-based upserts are workspace-scoped. Preserve earlier successful data on
failed refresh. Keep paid reservations on ambiguous results. Deletion suppresses
recollection. New tables are additive; rollback code without deleting history.

## Interfaces and dependencies
Use current auth, same-origin mutation guard, server-side provider and cost records.
Official verification needs a linked professional account and reviewed permissions;
secrets stay in Render. Public scrape metadata does not become verified metrics.
PR 2 depends on the skill/brief policy in PR 1 and never releases a fixture gate.
