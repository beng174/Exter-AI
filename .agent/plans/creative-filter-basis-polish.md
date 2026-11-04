# Creative filters and Basis column polish

## Purpose and big picture
Bring the Creatives filter controls into line with Exter's approved reference and keep evidence labels readable and honest in every table. This is the user's final polish after PR #9, based on exter-test-drive.

## Progress
- [x] 2026-11-04 UTC: Read AGENTS.md, product data rules and reference fidelity rules; fetched the merged PR #9 base; captured before images at 1440px and 1280px.
- [x] 2026-11-04 UTC: Implemented labelled filter pills, right-aligned sort, showing counts and row-aware Basis labels; focused regressions pass.
- [x] 2026-11-04 UTC: All ten Basis tables pass at 1440px and 1280px (30 retained/synthetic table checks); visually reviewed populated table captures. Six before/after pairs captured.
- [x] 2026-11-04 UTC: npm run check, npm test (405 passed), npm run build and npm run secrets:check pass.
- [ ] Publish a PR against exter-test-drive.

## Surprises and discoveries
The reference stylesheet sets select labels to font-size zero. Home's 488px table viewport contains a table with a forced 540px minimum width, clipping the final evidence chip; at 1280px the viewport is only 408px. DataTable originally assigned its table-level basis to every row, including Share of voice with no supported measurements. The browser pass also exposed an extra-filter popover positioned under the sidebar when its trigger wrapped; it now anchors within the filter row, verified on desktop and mobile.

## Decision log
2026-11-04: Retain all existing URL filter semantics and native history. Move date inputs and extra platform/status controls into labelled pill disclosures. Keep unsupported saved views and score filters absent rather than inventing evidence. Reserve a shared non-wrapping Basis column, and let callers describe the basis of their actual measurements independently of row labels.

## Outcomes and retrospective
Compact named filters preserve URL/history behaviour and show exact rendered/matched counts. All ten Basis tables fit at both widths, including genuine zero, missing values and mixed modelled/observed rows. Browser checks and 405 unit/integration tests pass; the existing bundle-size advisory remains. Eighteen PNGs provide six before/after pairs plus originals. Retained local captures and synthetic fixtures are not live verification.

## Context and orientation
src/components/creatives/CreativeBrowserPage.tsx owns URL selection and saved creative evidence. DataTable.tsx and its CSS are shared across research and scores. src/reference.css applies the approved reference geometry. HomeScreen.tsx and ResearchScreens.tsx supply measure-based tables. The isolated tests/fixtures/m1-server.ts serves retained records on port 3118 without provider calls.

## Plan of work
1. Replace the old filter row with compact named pills, a right-aligned sort and an accurate showing count.
2. Make the shared Basis cells fit and handle unavailable row measurements without changing formulas.
3. Add focused regressions, exercise every rendered table using retained records and separate populated fixtures, capture before/after evidence and publish.

## Concrete steps
From /workspace/Exter-AI: npm run build; node --import tsx tests/fixtures/m1-server.ts. Capture with local Chromium at 1440px and 1280px, blocking external requests. Run npm run check, npm test, npm run build, npm run secrets:check. Commit to fix/creative-filters-basis, push and open the PR against exter-test-drive.

## Validation and acceptance
Every filter has a visible name and changes the matching URL parameter; browser back restores it. Showing counts reflect the rendered subset of matching saved rows. Basis chips fit without wrapping at both widths. Rows without measurements use Unavailable, while genuine zero stays Observed and known modelled evidence keeps its label. Before and after screenshots live in output/playwright/polish-*.png. Actual results: all four required checks and diff checks pass, 405 tests pass, and tests/ui_polish_browser.py passes all 30 table/width/data-mode cases, filter selection/history/counts, 390px popovers/overflow, and screenshot generation. All ten tables were also visually reviewed using a contact sheet of separate synthetic captures. No external requests or mutations occurred. The app screenshots contain genuine retained records; fixture captures are local verification only.

## Idempotence and recovery
Rebuild and recapture safely against the isolated in-memory preview. Revert this branch's commits to undo the presentation change. Preserve retained source records, paid analyses, database schemas, environment settings, and all historical research notes.

## Interfaces and dependencies
No new dependencies, metric formulas, schema or provider calls. Existing filter URL parameters and route history remain the contract. Owned sync stays disabled by default; both live gates remain open, and kernel work remains paused. No live gate approval is claimed.
