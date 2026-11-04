# UI-B: Creatives and Creative detail (UI-02, UI-03)

## Purpose and big picture

Replace the old library and ad modal for canonical creatives/creative views with
the approved designs and UI-A shared components. Fix sidebar height, brand-switcher
copy, Help and EXTER AI branding. Preserve all source history and provider gates.

## Progress

- [x] 2026-11-04: Read UI-B requirements, design references and current contracts.
- [x] 2026-11-04: Confirm runtime is available again; branch uses UI-A as prerequisite.
- [x] 2026-11-04 UTC: Build read-only library projection, scoped owned metrics and pure filters.
- [x] 2026-11-04 UTC: Build grid/table library and full-page detail with existing evidence.
- [x] 2026-11-04 UTC: Fix shell and add navigation/data-honesty/browser regressions.
- [x] 2026-11-04 UTC: Run check, test, build and secrets:check; capture both screens at both sizes.
- [ ] Open one PR against exter-test-drive and record dependency/remaining gates.

## Surprises and discoveries

UI-A is initially still PR #5, not in exter-test-drive. UI-B starts from the target
and fast-forwards to that prerequisite; recheck before opening its PR. The checkout
contains genuine public captures but not the production media or paid analyses.
The existing analysis contract has no guaranteed scenes. Coverage processing
segments are not scene cuts and must never be presented as such.
A legacy .creative-grid rule overrode mobile columns; UI-B now uses its own
class and a browser assertion that a card fills the 390px grid width.

## Decision log

2026-11-04: Add read-only projections only. Use the existing owned-metrics module
and existing creative score checklist; no new score, CA logic or schema.
2026-11-04: Only explicit owned reporting rows unlock private outcomes. Public
competitor records never receive spend, conversions, sales or ROAS, even if IDs
collide. Account/currency/attribution/event/date cohorts stay separate.
2026-11-04: AI transcript/tag outputs are Modelled, despite Observed labels in the
illustration. Missing scenes, source CTA, Working Score and unvalidated features
show Unavailable. No placeholder values or scene boundaries are inferred.
2026-11-04: Keep current route IDs for old components but dispatch UI-B separately
for canonical creatives and creative. Links preserve filters and filtered order.

## Outcomes and retrospective

Implemented and locally verified. Full npm test: 371 passed. Final focused tests:
19 passed. npm run check, npm run build, npm run secrets:check and git diff --check
passed. UI-A and UI-B browser acceptance passed with all external requests blocked.
Four UI-B PNGs in output/playwright/ show both screens at 1440px and 390px using
genuine retained captures. Populated playback, scene seeking and outcomes were
checked separately with synthetic fixtures, never used in screenshots.

PR #5 (UI-A) is still open and exter-test-drive remains c04a4db at the final base
check. This branch includes its prerequisite commits. Target the UI-B PR at
exter-test-drive and identify the dependency; do not merge either PR automatically.
Working Score, stored scene cuts, observed CTA buttons and production media are
unavailable locally. Existing score criteria are reused; new design weights and
CA-09 diagnosis/annotations are not implemented. Both live gates stay open and
EXTER_OWNED_SYNC_ENABLED stays absent/false. Fixtures are not live verification.

## Context and orientation

server/demo/gallery.ts verifies retained media and links immutable analyses.
server/demo/reconcile.ts scopes aliases and source records. Existing Postgres
owned_accounts/owned_ad_days supply authorised reporting. UI-B's read endpoint
combines only the selected workspace and its configured public competitors.
shared/creative-browser.ts owns pure filtering/sorting/similarity; shared/owned-metrics.ts
already owns formulas. src/components/creatives/ contains both React screens.

## Plan of work

Build a typed library response with explicit ownership, source/platform metadata,
coverage and separate metric cohorts. Add bounded read-only API routes. Reuse
PageHeader, FilterBar, CreativeCard, DataTable, SectionCard, MetaLine, MetricTile,
DataLabel, RetentionChart and Unavailable. Detail uses retained media, timestamp seek,
source history, existing checklist and model evidence. Similar public ads use
known angle/format only. Never equate two unknown labels.

## Concrete steps

Run npm run check, npm test, npm run build, npm run secrets:check from repository
root. Browser tests use the isolated retained-capture server with no seeding or
external requests; separate synthetic fixtures exercise populated media and metrics.
Save real-record screenshots under output/playwright/ at 1440px and 390px.

## Validation and acceptance

Test intersecting filters, URL round-trips, date/status/search, unknown handling,
cohort isolation, no competitor outcomes, bounded reads, auth and no writes/calls.
Browser-test grid/table parity, detail as a page, filtered previous/next, reload,
back/forward, timestamp seek, unavailable data, responsive layout and fixed sidebar.

## Idempotence and recovery

All reads are side-effect-free. No migration or source collection. Revert this PR
to restore the previous UI. Keep owned sync off and both live gates open.

## Interfaces and dependencies

Reuse UI-A and the existing React/lucide/esbuild stack. No new package or schema.
Existing media URLs remain authenticated; never expose storage paths, raw provider
responses or credentials. Real account verification and missing production media
are external limitations, not a reason to invent data or run provider calls.
