# Alignment and brand identity

## Purpose and big picture
Apply the requested alignment rules to every real and explicit sample screen, and make brands recognisable with local logos or monograms. Preserve data honesty, sample isolation and provider gates. Target exter-test-drive.

## Progress
- [x] 2026-11-04 UTC: Read project/spec/reference rules and start from latest exter-test-drive (9029e4e, merged sample PR).
- [x] 2026-11-04 UTC: Captured the five before screens; inspected all 90 screen/mode/width combinations.
- [x] 2026-11-04 UTC: Added rule 7 and shared subgrid/table/metric/action alignment; 90-case audit passed.
- [x] 2026-11-04 UTC: Added local raster logos, bounded own-site retrieval, monthly cache, uploaded precedence and upload/reset.
- [x] 2026-11-04 UTC: Added shared brand identity, configured competitor registry, alt/limit/isolation fixtures; initial four checks passed with 416 tests.
- [x] 2026-11-05 UTC: Added the shared five-check score table, coverage, Provisional, totals, plain reasons and source moments; omitted wholly missing table data and collapsed missing sections.
- [x] 2026-11-05 00:10 UTC: All 90 layout cases, sample/real/filter regressions and score interactions pass; all four required checks pass with 419 tests. Requested screenshot pairs and score captures are complete.
- [ ] Publish the reviewed changes against exter-test-drive.

## Surprises and discoveries
- The retained real preview has no completed creative scores. Kept its compact honest gap; labelled ordinary-route test screenshots as fixtures.
- Static sample scores used six design checks and did not match the service. Replaced only these illustrative score values with five-check fixtures, verified against server/demo/scores.ts. That scorer's rules and weights are unchanged.
- Wholly uncollected competitor columns had been forced visible. The follow-up request now omits them, leaves one collection action and keeps the competitor set in Brand research.
The website evidence fetcher already pins public DNS and bounds redirects and response size. Image tooling already uses ffmpeg/ffprobe and local media storage. Reuse these instead of adding an external logo service or dependency.

## Decision log
2026-11-04: User added score transparency and missing-data cleanup during implementation. Keep all prior alignment/logo work. Use server/demo/scores.ts without changing rules or weights. Replace the older six-check illustrative score values with five-check fixtures validated against the existing scorer; preserve Working Score fixtures and predictive gate.
2026-11-04: User scope authorises logo retrieval and uploads alongside presentation work. Sample brands always use monograms and never retrieve icons. Store logo manifests and immutable square PNGs under the existing media root, leaving schemas and paid/provider settings alone.

## Outcomes and retrospective
Implemented shared alignment and local brand identity across all requested pages. The 90-case audit passes at all three widths in both modes. Existing sample, real fidelity and filter/Basis browser suites pass. Score browser acceptance covers an explicitly synthetic ordinary-route payload and the sample workspace because the retained real preview has no completed scores; no real score was invented. All 419 unit tests pass, including 243 check-result combinations. Type check, production build and staged secret scan pass; only the existing bundle-size advisory remains. Final evidence-link navigation verification and publication are recorded below. Fixtures never establish live verification.

## Context and orientation
src/reference.css and per-component styles control rebuilt screens. ReadModel renders optional sample API section data. server/demo/website.ts owns bounded public HTTPS, server/image/media.ts owns image verification. shared/types.ts defines Brand. server/sample.ts intercepts demo requests before operational routes.

## Plan of work
1. Record baseline screenshots and add alignment rule.
2. Share grid/subgrid rows, aligned tiles/actions/tables and centred page frame.
3. Add local raster logo service and shared BrandIdentity components/context, then upload/reset in research.
4. Test fallback/security/accessibility with injected fixture transport, inspect all screens at three widths, publish evidence.

## Concrete steps
From repo root: npm run build; run tests/fixtures/m1-server.ts for fixture preview. Browser tests use localhost only. Run npm run check, npm test, npm run build, npm run secrets:check. Commit screenshots and code, push topic branch, open PR against exter-test-drive.

## Validation and acceptance
All 15 screens in both data modes at all requested widths must have no page overflow and consistent page edges. Sibling proof/action rows and tiles align without text clamping. Numeric headers/cells align right; fixed chip columns centre. Raster logos are bounded below 200 KB, no SVG/hotlinks, uploaded first then own-site icon then monogram. Alt is empty beside name and brand name for standalone image. Tests use local fixture bytes and transport only. Requested Home/Winners/CreativeDetail/Competitors/Briefs before/after images attached.

## Idempotence and recovery
No existing evidence or database rows are deleted. Immutable image objects plus atomically replaced manifests permit safe retry. Reset changes logo preference only. Cached failures retry monthly; concurrent requests share one fetch. Rollback source commit without touching retained media.

## Interfaces and dependencies
Existing authentication/mutation guards and media root remain. No new packages, schema or provider calls. Both live gates stay open; owned sync remains off; kernel work stays paused. Deployment is a web-service redeploy after merge, no worker change.
