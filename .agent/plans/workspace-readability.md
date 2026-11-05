# Workspace readability and source identities

## Purpose and big picture
After completing Page discovery in PR #15, fix the supplied Creative detail and Home presentation problems and add company marks beside Data sources. Keep the real data, formulas, source history, live gates and reference frame intact. Work from exter-test-drive at 84131ee in fix/workspace-readability.

## Progress
- [x] 2026-11-05 UTC: Completed and published Page discovery separately in PR #15. Read instructions and reference rules.
- [x] 2026-11-05 UTC: Reproduced the optional-domain exception and long heading with fictional fixtures; captured Home, Creative detail and Data sources before images at 1440px and 390px.
- [x] 2026-11-05 UTC: Added concise detail headings, compact aligned metric grids, metadata Retry, stored brand context and local provider marks. Affected-page browser checks and four new unit tests pass.
- [x] 2026-11-05 UTC: Type check, 434 unit tests, build and tracked-file secret scan pass. All 90 real/sample width cases pass; affected 1440px/390px screenshots and metadata recovery pass.
- [ ] Publish the reviewed changes as a separate PR against exter-test-drive.

## Surprises and discoveries
PageHeader automatically decorates brand mentions inside ad-copy headings. Creative detail uses the entire first copy line, which can be a long paragraph. The global metric-tile subgrid rule also applies to standalone tiles outside grids. Workspace loading calls item.domain.replace without checking optional legacy metadata, and its error has no retry or clear-on-success path. The screenshots alone do not establish the deployed HTTP failure; fixture tests must distinguish transport failure from malformed optional metadata.

## Decision log
2026-11-05: Keep the existing card title rule. Creative detail uses a concise first-sentence heading from the same source copy; full copy remains in its existing expandable section. Avoid inserting logos into prose headings when the brand is already identified in the header context.
2026-11-05: Provider marks are small local assets/components with decorative alt semantics beside names, not runtime third-party logo requests. Generic reviews and websites use appropriate source icons; combined organic sources show both platform marks.
2026-11-05: Source health retains four reference columns. Known check times and record links move into Detail; missing metadata is omitted. This keeps the data accessible without empty columns squeezing names.
2026-11-05: Preserve the owner's enabled public-collection flags in render.yaml. This presentation task makes no provider calls or deployment-setting changes.

## Outcomes and retrospective
Implemented the presentation fixes independently of PR #15. The four new regression tests pass with the complete 434-test unit suite, type check, build and tracked-file secret scan. Six affected-page viewport cases plus real metadata failure/recovery and sample Data sources pass without external browser requests or mutations. All 90 final screen/mode/width combinations pass with no overflow or alignment failures. Before/after screenshots, sample source-table screenshots and both audits are in output/playwright/readability/. Publication is pending. Fixtures remain distinct from live verification; no authenticated production request was inspected.

## Context and orientation
src/App.tsx loads workspace brands and supplies global context. shared/creative-presentation.ts contains identity and excerpt helpers. PageHeader, MetricTile and BrandIdentity are shared UI components. Real Creative detail and Data sources live in src/components/creatives and src/components/workspace; sample variants use read models. src/alignment.css owns shared geometry and design/reference/README.md owns the visual rules.

## Plan of work
1. Capture Home, a long-copy Creative detail and Data sources before changes at 1440px and 390px; reproduce brand-list recovery and optional-domain handling locally.
2. Add bounded display headings without altering source copy or card titles. Confine subgrid to actual metric grids, align standalone values and group public metrics. Keep section order and readable type sizes.
3. Add a recoverable compact brand-list notice and robust read projection; use actual page evidence for the current workspace context. Add local Meta, TikTok, Google, Instagram and YouTube marks, plus generic review/website icons.
4. Validate all real/sample screens at 1280px, 1440px and 1920px and the affected mobile screens; run check/test/build/secrets and publish separately.

## Concrete steps
From /workspace/Exter-AI run npm run check, npm test, npm run build, npm run secrets:check. Preview with tests/fixtures/m1-server.ts, which disables provider transports. Use the existing Playwright fixture harness and block external browser requests. No screenshots or layouts from other products are used; the supplied images are Exter's own app.

## Validation and acceptance
Long copy does not dominate the header; full source text remains accessible. Metric label, value and basis read together, with no stretched standalone tiles or centred numeric links. Brand metadata gaps cannot throw, failures expose Retry and clear after recovery, and active-page context uses known stored data. Every Data sources source row has a local decorative mark in both modes. No overflow or clipped chips at the required widths. Record actual check counts and images before publishing.

## Idempotence and recovery
No data migration, dependency or provider setting changes. Source text and brand records remain unchanged; only read projections and presentation change. Retry only reloads metadata. Rollback the UI commit independently of the completed Page discovery PR.

## Interfaces and dependencies
Keep existing API shapes, authentication, shared components and saved evidence. Provider assets are shipped locally. No logo service, scraping or live provider lookup is needed for this task. The remaining live-account verification gates are unchanged.
