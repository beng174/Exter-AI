# UI-C and UI-D (UI-04 through UI-10)

## Purpose and big picture

Replace five legacy screens and add Patterns/Winners in one PR against
exter-test-drive. Follow the seven approved designs, PR #7 gap presentation and
shared components. Fix Creatives card titles, duration, tags/chips and metadata.

## Progress

- [x] 2026-11-04 UTC: Read rules, product/UI specs, all seven designs and existing APIs.
- [x] 2026-11-04 UTC: Start feat/ui-cd-research from merged PR #7, 8518ecb.
- [x] 2026-11-04 UTC: Implement pure counts, shares, chronology, comparisons and exact URL drill-downs.
- [x] 2026-11-04 UTC: Build seven screens and shell navigation/breadcrumbs without duplicate page tabs.
- [x] 2026-11-04 UTC: Fix the shared creative card presentation everywhere.
- [x] 2026-11-04 UTC: Fixture/API/render/browser regression; all four checks; nine real-data screenshots.
- [ ] Push and open one PR against exter-test-drive, with all section classifications.

## Surprises and discoveries

Only public captures are present locally; production paid media/analysis is absent.
Current gallery rows contain latest status, not a full historical status timeline.
Never reconstruct last week's active counts from today's flag. New/stopped events
use explicit source delivery dates; unknown dates are excluded and disclosed.
Configured but uncollected competitors are not zero-valued measurements.
The reviews table was seeded with sample data and lacks explicit provenance. Use
source-linked customer quotes from saved website research, never seeded themes.

## Decision log

2026-11-04 UTC: Keep business calculations in shared pure functions and reuse
CA-02 account benchmarks rather than averaging creative ROAS/rates. No new CA logic.
2026-11-04 UTC: Default the public window to the latest saved capture and label it.
Past active snapshots remain unavailable; launch-share trend uses explicit starts
in two equal windows and is labelled accordingly. No continuous-feed claim.
2026-11-04 UTC: All ad count/bar/row drill-downs use URL predicates shared with
Creatives so reload/back and supporting sets match. Cards open their saved detail.
2026-11-04 UTC: Keep unsupported scores/demand/actions/demographics compact and
Unavailable. Use actual research/connection/collection controls for gaps.

## Outcomes and retrospective

All seven screens and card fixes are implemented. UI-A, UI-B and UI-C/UI-D browser
acceptance pass on the isolated saved-capture preview, without external requests
or mutations. npm run check, npm test (391 passed), npm run build,
npm run secrets:check and git diff --check pass. The build retains its existing
bundle-size advisory. Review publication is the remaining step.

## Context and orientation

server/demo/creative-browser.ts supplies scoped public and existing owned evidence.
shared/creative-research.ts holds pure public metrics and drill-down predicates.
Saved brand research, watchlists, source status and budgets have existing APIs.
src/components/research/ renders the new screens with shared UI components.

## Plan of work

Build pure selectors/statistics and tests; add exact URL predicates to Creatives.
Build the saved-data hook and common research frame. Implement sections in design
order, all seven navigation mappings and the common card contract. Validate both
populated fixtures and real missing states without fetching sources or models.

## Concrete steps

Run npm run check, npm test, npm run build, npm run secrets:check and diff checks.
Use the isolated retained-capture preview for nine PNGs: seven desktop screens at
1440px, Home and Competitors at 390px. Keep synthetic fixtures out of screenshots.

## Validation and acceptance

Test counts/denominators, missing/zero, known dates, equal windows, snapshots,
unknown labels, currencies/accounts, source errors, exact drill-down round-trips,
ready/alias/history routes, compact gaps, safe card titles/duration/tags and no
per-card metadata. Every chart/table has complete evidence metadata or hides it.
All checks pass, including UI-A/UI-B and tests/ui_cd_browser_smoke.py. The latter
blocks external requests and mutations; separate intercepted fixtures verify
account scopes, populated charts, keyboard rows and exact drill-downs. Nine
output/playwright/ui-cd-*.png images use retained public records and saved website
research: seven at 1440px, Home/Competitors at 390px. Updated ui-b screenshots
also record the card presentation change. Fixtures are not live verification.

## Idempotence and recovery

No schema/dependency/provider/settings change. All initial loads are reads.
Supported existing actions remain explicit user actions, not startup dispatch.
Revert this branch to restore UI-B. Keep live gates open and owned sync off.

## Interfaces and dependencies

React/CSS/lucide and existing APIs only. No scoring, review-theme grouping, reach
inference, CA-03 through CA-12 logic, source calls or local model startup.
