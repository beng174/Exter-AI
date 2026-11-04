# UI-E and UI-F (UI-11 through UI-16)

## Purpose and big picture

Build the six authorised Act/Share/Settings screens and a fidelity pass on all
fifteen reference screens plus the sidebar in one PR against
exter-test-drive, following design/reference/README.md and the approved PNG/HTML
renders. Include Winners/Competitors review fixes, plain interface copy, Exter AI
footer and removal of unreachable old UI. No new models, schemas or dependencies.

## Progress

- [x] 2026-11-04 UTC: Read fidelity rules before building; start feat/ui-ef-workspace
  from latest exter-test-drive, 82f2aa1.
- [x] 2026-11-04 UTC: Read all fifteen static reference structures and PNGs plus
  the sidebar; audit existing action/data contracts.
- [x] 2026-11-04 UTC: Incorporate user expansion to fidelity across every screen.
- [x] 2026-11-04 UTC: Build shared reference page frame and six screens; wire ready navigation.
- [x] 2026-11-04 UTC: Fold budgets into Data sources while preserving operator tests/Labelling.
- [x] 2026-11-04 UTC: Fix Winners, Competitors, internal copy and footer; remove 22 unreachable UI modules/styles and old App page branches.
- [x] 2026-11-04 UTC: Fixture/browser checks, all four required checks, 403 tests, browser checks and screenshot comparisons.
- [x] 2026-11-04 UTC: Push PR #9 against exter-test-drive with all section classifications, paired reference images and retained differences.

## Surprises and discoveries

Existing creator fits are qualitative, not numeric percentages. Draft-file scoring,
approval/delivery, weekly packs, PDF and client access have no existing APIs.
Keep those controls disabled without inventing data or adding service logic. Reference
placeholders must never enter production data or screenshot fixtures. Missing
sections retain their designed frame and location, with one muted line/action.

## Decision log

2026-11-04 UTC: New reference fidelity rules decide layout, placement and copy.
Measured static HTML frame geometry with the local Inter font: main padding
32px/40px, title 28px, cards 24px/12px radius, brief rail 334px, score
upload column 370px, brand profile 390px and report preview 32px/36px padding.
Product definitions/honesty and user's explicit review fixes retain precedence.
Unavailable features keep disabled controls, with plain prerequisite tooltips.
Existing paid actions remain explicit and budget guarded; tests make no live calls.
2026-11-04 UTC: Keep 44px interactive targets where static bars/buttons are
smaller. Retain Tests and preparation, Labelling and the header Ask control as
explicitly requested, even though reference exports omit those extra controls.
2026-11-04 UTC: Keep the page frame at 260px sidebar width, matching the full-page
PNGs; the standalone Sidebar export is 240px. Source names/records replace
placeholder values. Unknown scores, fit percentages, training progress and users
are never fabricated to fill the design.

## Outcomes and retrospective

All six new screens and the fifteen-screen fidelity pass are implemented.
UI-A/UI-B/UI-C-D regressions pass, alongside populated UI-E/F fixtures.
Typecheck, 403 tests, build and diff checks pass. Every requested desktop/mobile
capture and all sixteen side-by-side comparisons are complete and visually
reviewed. Secret scan passes on the staged files. Review: https://github.com/beng174/Exter-AI/pull/9, on feat/ui-ef-workspace
against exter-test-drive. No merge or deployment was run.

## Context and orientation

src/App.tsx owns the existing shell and legacy/drawer pages. src/navigation.ts
owns routes and readiness. Shared UI lives in src/components/ui/. Existing APIs
cover creator research, saved checklist scores, Ask, reports, connections, owned
accounts, public watchlists and budgets. Approved renders are design/reference/.

## Plan of work

Audit saved data and existing actions first. Extract a reusable reference frame;
implement the six screens with supported data and honest gaps. Fold budget controls
without removing operator tests. Update review screens and shell, then remove only
UI no longer imported by any route. Verify no stored evidence or service logic changes.

## Concrete steps

Run npm run check, npm test, npm run build, npm run secrets:check and diff checks.
Use the isolated retained-capture preview for 1440px screenshots of the six new
screens and Winners/Competitors, plus 390px Data sources/Briefs. Compare every
desktop screenshot beside its approved reference and record justified differences.

## Validation and acceptance

Check ready/alias/history navigation, Ask header routing, auth/scope, saved-data
versus sample guards, empty/error states, disabled prerequisites, exact evidence
links and currency separation. Fixture tests verify pure counts and UI contracts;
browser checks block external requests and distinguish synthetic populated tests
from screenshots. No live verification is claimed.

Actual results: 403 tests pass; typecheck and build pass (existing chunk-size
advisory). UI-A/UI-B/UI-C-D browser regressions pass. The new fidelity acceptance
and separate UI-E/F fixture browser pass without external requests or unintended
mutations. output/playwright/fidelity-*.png holds 35 images, including every
1440px app capture, Data sources/Briefs at 390px, a sidebar component capture
and sixteen original-pixel comparisons. Local app images use genuine retained
captures/website research; absent media/analyses/live sync stay unavailable.

## Idempotence and recovery

No schema/dependency/environment/budget changes. Keep both live gates open, owned
sync absent/false, kernel paused. Revert this branch to restore the previous UI.
Do not overwrite stored media, analyses or historical evidence. No deployment here.

## Interfaces and dependencies

Use existing React/CSS/lucide and APIs. Scores depend on the existing retained-ad
checklist, not new draft upload or predictive scoring. Priority, weekly packs,
client access and other unbuilt calculations remain unavailable. Report all
unsupported actions honestly and retain existing operator flows.
