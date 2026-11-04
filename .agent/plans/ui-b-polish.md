# UI-B presentation polish (UI-02, UI-03)

## Purpose and big picture

Reduce repeated missing-data explanations, collapse empty sections, link each gap
correctly, format source facts, preserve full saved copy and align the sidebar
with the configured competitor set. Update UI spec rule 2. Keep all data rules.

## Progress

- [x] 2026-11-04 UTC: Read repository/spec rules, UI-B and existing operator controls.
- [x] 2026-11-04 UTC: Confirm PR #6 merged and fast-forward the same branch to eaeb8a2.
- [x] 2026-11-04 UTC: Implement compact gaps, complete metadata, formatting/copy and competitor parity.
- [x] 2026-11-04 UTC: Fixture/render/browser regressions and all four required checks pass.
- [ ] Refresh four real-capture screenshots and push the same feature branch.
- [ ] Open a follow-up PR against exter-test-drive because merged PR #6 cannot change.

## Surprises and discoveries

GitHub records PR #6 merged at 15:05 UTC. The user requested pre-merge polish of
that PR, which cannot receive a new diff. Preserve feat/ui-b-creatives and make
the polish reviewable in a follow-up PR; do not merge or deploy it.
The existing one-ad analysis operator lives in Settings, with budgeted dispatch
only after an explicit button. Linking to it must never start analysis.
Some saved source copy is already truncated. Display all retained text and link
the original ad for the missing remainder; never reconstruct unavailable copy.

## Decision log

2026-11-04 UTC: Prefer one section/page explanation and tooltip labels in repeated
items. Empty sections render a short reason and a useful action, never invented
metadata. UK time is Europe/London, including daylight-saving boundaries.
2026-11-04 UTC: Reuse one read-only competitor resolver for the list and sidebar.
Count configured but uncollected competitors, deduplicate aliases and exclude self.
2026-11-04 UTC: Preserve stored title/copy/history; title fallback is a presentation
projection. Use the first retained copy line, then the source ad ID.

## Outcomes and retrospective

Implemented the eight presentation requests. Full npm test: 378 passed. Typecheck
and production build pass; the existing bundle-size advisory remains. Focused
presentation/render/API tests pass. UI-A browser regression passes. UI-B
acceptance and staged secret scan pass. Both real-capture screens were visually
reviewed at desktop/mobile sizes. Updated snapshots show compact gaps and 3
configured competitors, with no placeholder titles or invented media.
Screenshots remain output/playwright/ui-b-{creatives,creative-detail}-{1440,390}.png.
The isolated preview uses genuine saved public captures; populated states use
separate synthetic fixtures. Fixtures are not live verification.

## Context and orientation

src/components/ui owns shared gaps, sections, cards, tables and evidence footers.
src/components/creatives owns UI-02/UI-03. server/demo/creative-browser.ts combines
saved public creatives and scoped CA-02 metrics; its competitor selection currently
differs from Sidebar's Brand.competitors array. GeminiSmokeTest is the existing
explicit, budgeted one-ad analysis entry point. No methods or settings change.

## Plan of work

Implement presentation helpers and compact missing states, then update both screens.
Share configured competitor selection through a lightweight authenticated read.
Update tests for empty/partial/populated states, DST, title/copy fallbacks and links.

## Concrete steps

Run npm run check, npm test, npm run build, npm run secrets:check and git diff --check.
Use the isolated retained-capture server for browser checks and screenshots at
1440px and 390px. Synthetic populated fixtures stay separate from screenshots.

## Validation and acceptance

No repeated explanatory paragraphs in cards/cells, no incomplete metadata lines,
no raw enum/date/template titles, active-without-stop reads Still running, copy
expands without losing stored text, sidebar count equals the page competitor set.
Gaps navigate to analysis, the original ad, collection or a real connection fix.
No provider calls are made by these checks or by following an analysis link.

## Idempotence and recovery

No schema, provider or environment changes. Preserve all stored evidence. Revert
this polish commit to restore UI-B. Leave both live gates open and owned sync off.

## Interfaces and dependencies

Existing React/CSS/lucide stack only. New helpers and read-only DTOs may be added;
no new dependencies, collection, paid dispatch, scoring formulas or CA logic.
