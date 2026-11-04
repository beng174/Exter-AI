# Weeks 1 and 2: public creative intelligence

## Purpose and big picture

Make retained Valentte ads usable for Exter strategists, then plan economical
analysis, survival/scaling scores and evidence-backed creative decisions.
research/PRODUCT-SPEC.md (uploaded 4 November 2026) is the source of truth.
Only M1 is authorised for implementation. M2 to M5 below are plans, not releases.
The dated weeks in the spec are 3 to 9 and 10 to 16 November 2026; dates are
sequencing targets, not evidence that provider approvals or human labels exist.

## Progress

- [x] 2026-11-04: Read uploaded product spec and inspect the existing implementation.
- [x] 2026-11-04: Replace the older stub and establish specification precedence.
- [x] 2026-11-04: Add working instructions, plan format and this execution plan.
- [x] 2026-11-04 01:25 UTC: M1 implementation and local validation complete; production media/paid-output verification remains external.
- [ ] M2: Low-cost video pipeline, gated by human evaluation. Not started.
- [ ] M3: Working Score and Winners. Not started.
- [ ] M4: Scorecard, gaps and What to work on. Not started.
- [ ] M5: Recorded-response connectors. Not started.

## Surprises and discoveries

The previous PRODUCT-SPEC.md was a kernel-only stub. The uploaded document
reverses that priority and defers owned-account expansion. Existing gallery and
real-workspace components already project retained browser captures and immutable
Gemini outputs; rebuilding those stores would risk losing evidence. The existing
336-test baseline includes a legacy 1,800-character AGENTS guard; the current user
requires under 120 lines, so preserve that test with the new line-based limit.
Current taxonomy v2 and the old labelling guide differ from the uploaded table.
Production media/paid results are not bundled with the captured records. Screenshots
therefore show their actual absence; synthetic playback fixtures are tested separately.
Visual review exposed detail overlay containment after scroll. Render the modal through
a document-root portal and test its bounds to prevent it opening below the viewport.

## Decision log

2026-11-04: Follow the uploaded public-first spec rather than the creative-analytics
spec and kernel priorities. Preserve those files and implementations. No CA-only
scope restriction applies to this newly authorised M1.
2026-11-04: Reuse the authenticated SQLite gallery projection and existing public
Postgres observations. No new collection, migration, inference or model changes.
2026-11-04: Publish the exact new vocabulary first in the labelling guide and keep
an explicitly historical schema appendix. Do not silently remap immutable paid
labels or change the analysis method; schema migration/evaluation belongs to M2.
2026-11-04: The earlier Phase 0 PR remains unmerged. Carry forward its v25 default,
three offline config tests and removal of external layout references; this preserves
the previously requested setup without starting connector implementation.
2026-11-04: Report active status at the last capture, never claim current delivery.
Weekly changes require dated source starts/stops, not inference from missing ads.
Missing history remains unavailable. Separate modelled interpretation from observation.

## Outcomes and retrospective

M1 implementation is complete locally. The retained 58 real capture records are
shown without sample substitution. The gallery uses immutable media and analyses
when present, supports category/media filters, transcript/OCR search, evidence
navigation and detail playback. Shared tokens include 16px body text and readable
text/accent contrast. No M2 to M5 implementation was started.

Validation: npm run check, npm test (341 passing, including all 336 baseline tests),
npm run build and npm run secrets:check pass. tests/m1_browser_smoke.py checks
58 genuine records, summary drill-down, filters/search, empty state, navigation,
detail positioning and 1024px/390px overflow. Its separate synthetic video validates
playback/timestamp seek. The existing insights_browser_smoke.py passes populated
14-analysis charts, supporting-ad drill-down and competitor/owned-result boundaries.

Screenshots: output/playwright/m1-overview.png, m1-library.png and m1-ad-detail.png.
These show genuine retained captures and honest unavailable media/analysis states.
The production disk and its 14 paid analyses were not available locally. Rendering
those actual production outputs still needs verification after merge; no substitute
outputs or media were created for the screenshots. No field accuracy is asserted.
M1 must not claim the 200-ad client gate. No live provider calls were made.
Record final checks, screenshots and unresolved limits here before opening the PR.

## Context and orientation

Run commands from the repository root. server/db.ts stores legacy ads, brands and
reviews in SQLite (production /var/data/exter.db). server/demo/reconcile.ts links
58 retained source IDs to historical aliases and 14 saved analyses. gallery.ts
verifies media hashes and exposes authenticated media paths. src/App.tsx selects
a brand and routes to RealWorkspaceViews.tsx for imported workspaces. CreativeGallery
already plays retained media, seeks timestamps and supports previous/next navigation.
Postgres infrastructure holds public_ads, ad_observations, queue and budget records;
this milestone preserves that boundary. No worker access to the web disk is assumed.

## Plan of work

M1, demo retained evidence: touch AGENTS.md, .agent/, research precedence and guide,
shared/creative-gallery.ts, a shared evidence summary module, server/demo/gallery.ts,
src/App.tsx, RealWorkspaceViews.tsx, CreativeGallery.tsx, shared design tokens and tests.
Show source counts, active-at-capture, analysed ads, format/hook/angle mix and weekly
changes. Every aggregate opens its supporting ads. Gallery filters and transcript/OCR
search retain unknowns. Detail labels interpretation and missing fields, preserves media
and timestamps. No samples by default. Demo Overview, library and detail on real retained
captures and save screenshots. Accept with check/test/build/secrets and browser tests.

M2, demo candidate extraction: reuse server/kernel/, worker/, server/video/ and
scripts/evaluate-video.ts; extend tests/kernel-*.test.ts and labelled fixtures.
Deduplicate file/context hashes; ffmpeg and PySceneDetect select scenes; faster-whisper,
YAMNet and RapidOCR extract timed speech/audio/text; face/product adapters retain source
limits. Flash-Lite classifies compact evidence and escalation uses Gemini Flash behind
budget guards. Benchmark the same 200 human labels against the current method with
npm run video:evaluate. Every field must be at least 85% and within 2 percentage points;
measure total cost, worker memory and recovery. Do not enable until every gate passes.
No model names, prices or worker plan in the document establish live availability.

M3, demo Winners: add shared/working-score.ts, server score service and additive
ad_score_snapshots migration, Winners component and unit/API tests. Percentile survival
and scaling within each brand; drop reach and organic weights and rescale available
weights. Preserve unfinished active runs. Medium confidence with survival/scaling,
Low under 7 days. Insufficient inputs remain unavailable. Immutable dated snapshots
must reproduce manual calculations; npm test and npm run check before demo.

M4, demo decisions: add shared competitor-scorecard/opportunity modules, an authenticated
projection and What to work on component. Usage gap is percentage-point difference;
category win rate requires 10+ ads. Priority = win rate × gap × (1 + customer demand).
Missing reviews do not become zero demand. Link each recommendation and brief to examples;
never infer conversions. Fixture tests reproduce totals, missing inputs and boundaries.
Run npm test, npm run check, npm run build and browser smoke before demo.

M5, demo connection health: extend server/connectors/meta-library.ts and
tiktok-commercial.ts, infrastructure public collection integration and sanitised recorded
fixtures/provenance. Keep not_connected until keys exist; test pagination, failures,
missing reach, exact native IDs and expiring media. npm test plus disposable-database
npm run test:infrastructure. Fixture success is not provider approval. No live calls
without a separate request and approved credentials. M5 does not grant account access.

## Concrete steps

1. npm ci. Use the existing lockfile and Node 24 or later.
2. Implement M1 only. Keep all persistent source/analysis writes unchanged.
3. npm run check; npm test; npm run build; npm run secrets:check.
4. Start `node --import tsx tests/fixtures/m1-server.ts`, then run
   `python3 tests/m1_browser_smoke.py` against its isolated retained-capture database.
   Never point test code at /var/data/exter.db. Record desktop and mobile results.
5. Commit a reviewable branch based on exter-test-drive, push it, and open one PR
   targeting exter-test-drive. Attach screenshots and list evidence labels/limitations.

## Validation and acceptance

Preserve all baseline tests. Add summary/filter and empty/error state tests. Check
unknown active/history data, source endpoints, sample exclusion, transcript/OCR search,
filter intersection, evidence links and detail navigation. Reject long dashes in UI
source strings. Browser checks cover 1024px and 390px, playback controls, timestamp seek,
previous/next, filter/search, empty state and console errors. Screenshots use only
Exter's own screens with retained evidence, never another product's screens.

## Idempotence and recovery

Projection reads do not collect or infer. Existing reconciliation is idempotent and
retains aliases, originals and paid outputs. Run tests on disposable stores. Do not
change budgets, Render plans or secrets. Rollback by reverting the M1 commit; no data
migration requires reversal. Preserve the prior product stub in git history.

## Interfaces and dependencies

Reuse CreativeGalleryResponse and DemoGalleryCreative; add source-status evidence
without changing stored analysis schemas. Existing authenticated media routes serve
retained images/videos. Reuse budgets for all later paid calls. Human labels, reviewed
model packs and live API approval remain external inputs. Client-visible analysis is
still gated; internal previews must disclose unvalidated model interpretations.
