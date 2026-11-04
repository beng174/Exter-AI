# UI-A: app shell and shared components (UI-00, UI-01)

## Purpose and big picture

Replace the flat navigation with Exter's approved grouped sidebar, canonical
view URLs and reusable presentation components. Keep existing pages and data
contracts. No individual screen rebuild, schema, dependency or provider change.

## Progress

- [x] 2026-11-04: Read AGENTS, UI-SPEC, design README, Sidebar and Main references.
- [x] 2026-11-04: Inspect current screen routing, components and source-health API.
- [x] 2026-11-04 03:08 UTC: Navigation, aliases and back/forward verified.
- [x] 2026-11-04 03:08 UTC: Shared components, tokens and missing-value render tests pass.
- [x] 2026-11-04 03:08 UTC: check, 359 tests, build, secrets:check and browser acceptance passed.
- [x] 2026-11-04 03:08 UTC: Captured 1440px and 390px screenshots from real retained records.
- [ ] Push UI-A and open one PR against exter-test-drive.

## Surprises and discoveries

Visual review caught a screenshot taken mid-transition; browser validation now
waits for the drawer's settled position before capture. Component render tests
create their scratch directory so they also work on clean checkouts.
The existing Page type and screen switch use legacy IDs. Keep those internal
component keys and map canonical navigation IDs to them, avoiding screen rewrites.
Ask Exter exists as a drawer, not a page; the future page stays unready while its
existing action remains usable. Brand client/prospect type is not in the current
API contract, so it must be shown as unavailable rather than invented.

## Decision log

2026-11-04: Only existing screen components are ready. Patterns, Winners, Briefs,
Scores and the full Ask page remain hidden; creative detail uses the existing
modal with a canonical URL until UI-B rebuilds it. Keep demo behind demo=1.
2026-11-04: Use native pushState/replaceState/popstate; no router dependency.
2026-11-04: Missing values use Unavailable. Observed zero stays zero. Components
accept explicit values and labels, never design placeholder data or new formulas.

## Outcomes and retrospective

UI-A is implemented with the existing screen components, one navigation config,
canonical alias/history support, all 15 UI-01 components and approved tokens.
All four required checks pass; npm test reports 359 passing tests. The browser
check covers every ready page, aliases, back/forward, detail navigation, demo
hiding and 959px/390px drawer/overflow behaviour, with no external requests.
Screenshots: output/playwright/ui-a-1440.png, ui-a-390.png and
ui-a-390-navigation.png. All show genuine retained captures, with production media
and analyses unavailable locally. No sample data, schema or dependency was added.
Future screens stay unready; this PR does not implement their metrics or layouts.

## Context and orientation

src/App.tsx owns the shell and legacy Page switch. RealWorkspaceViews renders
saved evidence; CreativeGallery contains detail playback. src/navigation.ts will
own canonical IDs, aliases, ready flags and URL/history helpers. Shared components
live in src/components/ui with their own CSS. Global tokens remain src/tokens.css.

## Plan of work

Build config/helpers and tests first. Replace only shell navigation/header/filter
wrappers; keep screen bodies intact. Add responsive sidebar CSS at 960px. Implement
all UI-01 primitives with accessible text and missing-value behaviour. Integrate
canonical creative-detail links with the existing modal and preserve back/forward.

## Concrete steps

From repository root: npm run check; npm test; npm run build; npm run secrets:check.
For browser acceptance, use the existing isolated M1 server with retained captures:
node --import tsx tests/fixtures/m1-server.ts. No production database or external
provider is used. Capture 1440px and 390px in output/playwright/.

## Validation and acceptance

Config tests cover unique IDs, existing component mappings, ready visibility,
alias canonicalisation and query preservation. Shared-component render tests
cover missing values, observed zero, sortable/clickable data and accessibility.
Browser checks cover grouped navigation, aliases, back/forward, brand preservation,
creative detail URLs, unready URLs, demo hiding, mobile drawer and page overflow.
The four required commands must pass before push. Screenshots contain real retained
records only; unavailable production media and analyses stay unavailable.

## Idempotence and recovery

Read-only presentation changes. No migrations, collection, inference or settings
writes. Revert the UI-A commit to restore the prior shell. Retained data is untouched.

## Interfaces and dependencies

Use existing React, lucide-react, native history and esbuild for component render
tests (already installed). Keep legacy Page callbacks compatible through mappings.
Source status comes only from existing read-only connections/infrastructure APIs.
No new dependency, sample data, metric formula or schema is introduced. Keep owned
sync default off and both live gates open.
