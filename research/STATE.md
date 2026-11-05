# Product renewal and M1 handoff

Current source of truth: research/PRODUCT-SPEC.md, uploaded 4 November 2026.
research/CREATIVE-ANALYTICS-SPEC.md is its own-account module. The current priority
remains creative analytics Phase 0 then Phase 1 (CA-01, CA-02). Kernel work stays
paused until Phase 2; do not run kernel:next without a request.

This PR retains M1's public creative evidence and original Exter screens. M1's
M2 to M5 remain planned, not started here. The separately authorised CA-01/CA-02
fixture-only implementation now comes from PR #4 in exter-test-drive. This
reconciliation preserves its status and rules alongside M1; it adds no new
owned-sync implementation.

- Phase 0 live gate: OPEN, awaiting Meta identity verification and user confirmation
  on Exter Media's own ad account.
- Phase 1 live gate: OPEN, awaiting the user's own-account reporting parity check.
- The user's explicit authorisation permits Phase 1 fixture work while Phase 0
  remains open. Fixtures are not live verification; keep live dispatch disabled.

M1 reuses the retained-record projection, immutable analyses and media routes.
58 genuine captured ad records are available locally; production media and the
14 paid analyses are not included in this checkout. Do not invent them or claim
that screenshots verify production data. Internal fixture tests cover populated
analysis and playback separately. No live provider calls, production writes,
Gemini method changes, Render settings changes or budget changes were made.
See .agent/plans/weeks-1-2.md for validation, screenshots and remaining gates.

## PR #3 update after PR #4 (2026-11-04 02:49 UTC)

- Merged exter-test-drive at 5edb13b, which includes PR #4. Preserved both M1 and
  Phase 1 status, the main PRODUCT-SPEC references and creative analytics rules.
- Manual merge resolution changed only AGENTS.md and this handoff. Owned sync
  stays default off (EXTER_OWNED_SYNC_ENABLED absent/false); both live gates stay
  OPEN. No live provider calls or runtime setting changes were made.
- Validation: npm run check, npm test (352 passed), npm run build and
  npm run secrets:check passed on the combined branch.

## PR #3 branch reconciliation (2026-11-04 01:53 UTC)

- Merged exter-test-drive at 4636ddc. Preserved M1 and Phase 0 handoff evidence,
  the creative analytics priority and module rules, and all M1 working guidance.
- PRODUCT-SPEC.md remains the main product spec; CREATIVE-ANALYTICS-SPEC.md is
  its own-account module. Added the four requested environment-variable names.
- The connector config tests, default version and INSIGHTS.md are identical to
  the target branch and no longer appear as duplicate changes in this PR.
- Validation: npm run check, npm test (341 passed), npm run build and
  npm run secrets:check passed. No UI changes or live provider calls were made.


## Phase 0 and earlier handoff (retained notes)

### Creative analytics priority

Priority: creative analytics module in research/CREATIVE-ANALYTICS-SPEC.md,
Phase 0 then Phase 1 (CA-01 and CA-02).

The low-cost kernel work is paused until Phase 2. Its code, tests,
research/PRODUCT-SPEC.md and this handoff remain in place. Do not pick kernel
tasks or run npm run kernel:next unless the user asks. Existing kernel evidence
and blockers below remain unchanged.

## Creative analytics set-up (Phase 0; CA-01, CA-02)

- Added module scope, commit ID, original-layout and metric-source rules to
  AGENTS.md; removed external screen references from docs/INSIGHTS.md.
- Default owned-account Meta Graph version is v25.0; explicit version overrides
  remain supported. UI and kernel implementation are unchanged.
- No live provider calls were made. The Phase 0 gate (system user reading Exter
  Media's own ad account) remains open, awaiting Meta identity verification.
  The user explicitly authorised Phase 1 fixture-only development on 4 November.
  The earlier instruction to wait on Phase 1 is superseded only for fixture
  development; both live gates remain open.

- Validation: npm test passed all 336 tests; npm run check and
  npm run secrets:check passed. Fixtures do not verify live-account gates.

## Phase 1 fixture-only work (CA-01, CA-02)

- Phase 0 live gate: OPEN, awaiting Meta identity verification and user confirmation
  that the system user reads Exter Media's own ad account.
- Phase 1 live gate: OPEN, awaiting user confirmation that spend and impressions
  match within 1% for 10 ads on Exter Media's own account.
- Attention-field availability on Graph v25+ and the TikTok purchase-value field
  remain unverified. Fixtures are not live verification. No provider calls here.
- The latest user instruction authorises CA-01/CA-02 despite the open Phase 0 gate.
  Kernel and later CA features remain paused. Live dispatch stays off by default.
- Added owned account metadata/status, attribution-scoped daily rows, durable daily
  scheduler/worker jobs, 90-day backfill and seven-day restatement. Lease fencing
  and atomic page commits preserve history on errors or worker loss.
- Added shared/owned-metrics.ts: ratios of sums, cohort benchmarks, missing-value
  exclusion and minimum-sample status. Frequency/watch time remain as reported;
  multiple daily values do not establish a period metric. TikTok ROAS remains
  unavailable until its purchase-value field is confirmed.
- Synthetic-only validation: 347 Node tests, two disposable Postgres integration
  tests, TypeScript check, production build and secret scan passed. Browser checks
  verified the account panel at 1024px and 390px with no source requests.
- Rollout: docs/OWNED-SYNC.md. Keep EXTER_OWNED_SYNC_ENABLED absent/false. Existing
  tokens stay in Render secrets; no credentials or raw errors enter the database.

## Retained kernel handoff

- Baseline before K05: 5fba1bd. K04 CI passed all jobs after an install timeout retry.
- K04 audio code is implemented behind EXTER_KERNEL_AUDIO_ENABLED, default off.
  CPU int8 faster-whisper and local YAMNet SavedModel adapters require a verified
  offline pack; no weights/providers are downloaded/called at startup or by reads.
- Speech, music-lyric candidates and ambiguous words stay separate. Licensing is
  null; no audio-only claim of on-camera vs voiceover. Thresholds are uncalibrated.
- Fixtures test policy/PCM plumbing only, not actual model accuracy. K04 remains
  blocked until a reviewed model pack, labelled audio evaluation and real worker
  peak-memory benchmark pass. Do not mark those gates complete from fixtures.
- K05 visual code is implemented, default off. Real RapidOCR generated-text smoke
  passes; full face/product model pack and annotated quality/capacity tests remain
  blocked. See worker/VISUAL-MODELS.md. K06 still depends on K04/K05 validation.
- Full model requirements and provenance contract: worker/AUDIO-MODELS.md.
- K01-LIVE/K02-LIVE/K03-LIVE remain blocked; API keys, live broker configuration,
  worker image/capacity and combined source/feature cache checks remain pending.
- Keep scene/audio/full-label stages disabled for normal Render deployment.
  No new paid inference or hosted model run took place for this change.
- Full revised product document/genuine Meta recordings were not supplied.
- Paused scoring/export draft remains local wip/winning-workflow-before-kernel.

## Readable intelligence UI

- Added a shared ranked-list/treemap view, compact bars and source-ad drill-down.
  Historical descriptions populate explicitly marked text-theme groups without
  rewriting paid analyses or silently converting them into fixed model labels.
  Missing evidence stays in each chart's full-sample denominator.
- Imported Audience & voice now reads retained creative evidence; competitor
  comparison preserves per-brand samples and unavailable collections.
- Added an authenticated, read-only intelligence projection and an owned-results
  panel. Import identity/reporting-day metadata is preserved; comparisons separate
  platform/date/currency/event and deduplicate native-ad snapshots. No live
  collections, paid generations or production database changes were performed.
- Rollout and data definitions: docs/INSIGHTS.md. Existing kernel validation gates
  above are unchanged; this work does not complete them.
- Validation: all 331 Node tests passed; TypeScript/Vite production build passed;
  secret scan passed; isolated browser checks passed for chart population,
  supporting-ad drill-down, audience/voice, competitor samples, owned results,
  client report and 1024px/390px overflow at 1.25 device scale.
- The UI is prepared for review. Render publication and actual production-data
  verification remain rollout steps, not completed by the fixture tests.

## Call-readiness update

- Added five-check subscore population charts and per-ad explanations: earned
  points, excluded unknowns, exact score formula, reasons, quotes and timestamps.
- Removed feature-maturity pills from workspace/report; read-only saved evidence
  refreshes every minute while preserving filters. No live-feed claim is added.
- Verified 58 distinct retained Valentte Meta IDs from 30 October. Fresh all/active
  browser captures were attempted on 3 November but failed without new output.
- Production build, 331 existing tests, seven scoring tests and browser regression
  passed, including five visible subscores and absence of Beta labels.

## UI-A shell and shared components (UI-00, UI-01)

- Added grouped navigation with existing-screen ready flags, canonical view IDs,
  legacy aliases, native back/forward and URLs for the existing creative modal.
  Individual screen bodies and metric calculations are retained.
- Added all UI-01 presentation components with individual CSS and approved tokens.
  Missing values render Unavailable; observed zero remains zero.
- Validation: check, 359 tests, build and secrets:check passed. Browser acceptance
  covered all ready pages and desktop/mobile navigation. Real-record screenshots
  at 1440px and 390px are in output/playwright/ui-a-*.png.
- No sample data, dependencies, schemas or provider calls were added. Both live
  gates remain open and owned sync remains default off.


## UI-B Creatives and Creative detail (UI-02, UI-03)

- Replaced the canonical library and creative modal with the approved grid/table
  and full-page ?view=creative&id= detail. URL filters, aliases, filtered previous/
  next, reload and browser back/forward work. Both views are ready.
- Added an authenticated, read-only saved-creative projection. Only the selected
  workspace and its configured public competitors are included. Owned outcomes
  reuse CA-02 formulas and minimum samples, separate account/platform/currency/
  attribution/event/date scopes, and replace restated pulls rather than adding them.
  Benchmarks include all ads in the same account scope and dates. No partial totals
  appear after a read failure; private competitor rows are excluded.
- Detail uses retained media, timestamp seeking, source history, existing estimated
  checklist scores and Modelled analysis fields. Similar public creatives are
  computed from known angle/format labels. Missing scenes, source CTA, Working
  Score and unsupported evidence stay Unavailable; no scene cuts or diagnoses are
  inferred from processing coverage. Competitor retention is never shown.
- Fixed sidebar viewport height and fixed positioning, unknown brand-role copy,
  empty competitor copy, Help and the EXTER AI wordmark. Other screens are retained.
- Validation: npm run check, npm test (371 passed), npm run build,
  npm run secrets:check and git diff --check passed; final focused UI tests passed
  (19). UI-A and UI-B browser acceptance passed, including nested table links,
  filtered detail/history, synthetic byte-range video seeking and private-data
  guards. No external requests were permitted in browser checks.
- Four screenshots in output/playwright/ui-b-*.png cover both pages at 1440px and
  390px using genuine retained public captures. Production media and paid analyses
  are not present locally and are not fabricated. Populated states use separate
  synthetic test fixtures. Fixtures are not live verification.
- Built on UI-A PR #5, which remained open at the final base check; the UI-B PR
  targets exter-test-drive and must state that dependency. No dependencies,
  migrations, source collection, provider calls or environment changes were added.
  Both live gates remain open, owned sync stays default off and kernel work remains
  paused. After merge, Render > exter-ai > Manual Deploy > Deploy latest commit;
  keep existing secrets, budgets, disk and EXTER_OWNED_SYNC_ENABLED absent/false.

- UI-B review: https://github.com/beng174/Exter-AI/pull/6 on feat/ui-b-creatives,
  targeting exter-test-drive. Merge UI-A #5 first. No merge or deployment was run.


## UI-B presentation polish (UI-02, UI-03)

- The user requested less repetitive missing-data copy. Rule 2 in UI-SPEC now
  specifies one page/section explanation, short repeated tooltip labels, compact
  empty sections, no incomplete metadata and links to the actual fix.
- Creatives explains missing owned metrics once above grid/table. Repeated items
  show only Unavailable or Not synced; read failures use Unavailable and Retry.
  Detail collapses empty sections and retains real source facts. Data sources is
  used for a connection gap, analysis gaps link to existing operator controls,
  media gaps link to the original ad and collection gaps to collection controls.
- UK dates use Europe/London, including daylight saving. Source enums are plain
  words; active capture status without a stop date reads Still running. Complete
  metadata uses 1 ad; unknown metadata is hidden rather than filled with text.
- Template titles fall back to the first retained copy line, then the source ad
  ID. Show more reveals every retained copy character at whole-word boundaries;
  source-truncated excerpts are labelled and link to the original ad. No missing
  source text or historical evidence is reconstructed or overwritten.
- Sidebar and Creatives use one deduplicated configured competitor set, including
  uncollected competitors. A lightweight authenticated endpoint reads only that
  set; it does not read gallery/owned rows or start collection.
- PR #6 was already merged into exter-test-drive as eaeb8a2. Polish stays on
  feat/ui-b-creatives and requires a follow-up PR; no merge/deployment is run.
- Validation: check, npm test (378 passed), build, secrets:check and diff checks
  pass. UI-A/UI-B browser checks and all four refreshed real-capture screenshots
  pass review; separate synthetic fixtures check populated states. The follow-up
  review link is recorded in the plan.
  No dependency, schema, provider, scoring or environment changes. Both live gates
  stay open, owned sync remains default off and kernel work remains paused.

- Polish review: https://github.com/beng174/Exter-AI/pull/7 on the same
  feat/ui-b-creatives branch, against exter-test-drive. Merged PR #6 links to it.
  All four checks and browser acceptance pass; no merge or deployment was run.


## UI-C and UI-D research screens (UI-04 to UI-10)

- Built on exter-test-drive after merged PR #7 (8518ecb), on
  feat/ui-cd-research. One PR combines the seven authorised screens. Home is
  titled This week; breadcrumbs use sidebar groups/labels. Patterns and Winners
  are ready. Replaced old screen bodies without duplicate in-page navigation.
- Pure shared/creative-research.ts functions calculate saved active/event counts,
  median running days, full-sample shares, competitor averages, usage gaps and
  explicit launch-share changes in equal windows. URL predicates are shared with
  Creatives, including classifications, claim groups and longest-running subsets.
  Counts, bars, chart cells, rows and sample footers open their supporting ads.
- Latest source status cannot reconstruct historical active snapshots. Those
  remain Unavailable; event counts require explicit start/stop dates. The default
  public window ends at the latest saved capture and is labelled. Uncollected
  competitors and incomplete comparison coverage never become invented zeroes.
  Public evidence remains usable after matching owned outcomes, while private-only
  rows stay out of public comparisons. Existing CA-02 benchmarks retain separate
  account/platform/currency/attribution/event/date scopes; no new CA logic is added.
- Brand research reads saved website facts, source quotes, positioning, profiles,
  credits and the existing watchlist. Existing explicit brand/research/watchlist
  actions are reused; loading the screens never dispatches collection or inference.
  Audience quotes come from source-linked website research, not seeded review rows.
  No review themes, tone, demographics, scores, Priority or action are inferred.
- Home and Winners show Longest running, labelled Observed, while Working Score
  is absent. Unsupported sections collapse per PR #7 rule 2. Tables retain short
  tooltip gaps and complete metadata only. Creative cards use one copy/analysis/
  brand title rule, secondary ID fallback, m:ss duration, no empty/None tags or
  unknown-format line, an inline Modelled chip and no per-card meta line.
- Validation: npm run check, npm test (391 passed), npm run build,
  npm run secrets:check and diff checks pass. Existing bundle-size advisory remains.
  UI-A/UI-B browser regressions and UI-C/UI-D browser acceptance pass, covering
  all routes/breadcrumbs, mobile overflow, back, exact chart/count/row drill-downs,
  fixture account/currency separation and creative card presentation. Browser
  verification blocks external requests and mutations. No provider calls were made.
- Nine output/playwright/ui-cd-*.png screenshots cover every screen at 1440px and
  Home/Competitors at 390px. They use genuine retained public captures and saved
  website research. Production media, paid creative analyses and live owned sync
  are absent locally and stay visibly unavailable. Populated fixtures are checked
  separately. Fixtures are not live verification.
- No dependencies, schemas, scoring models, provider/model methods, budgets or
  environment settings change. Both Phase 0 and Phase 1 live gates remain open,
  EXTER_OWNED_SYNC_ENABLED stays absent/false and kernel work remains paused.
  After merge: Render > exter-ai > Manual Deploy > Deploy latest commit. Keep
  existing secrets, budgets and disk; no migration or worker change is needed.
  No merge or deployment is run by this task.

- UI-C/UI-D review: https://github.com/beng174/Exter-AI/pull/8 on
  feat/ui-cd-research, targeting exter-test-drive. All section classifications
  and requested desktop/mobile screenshots are attached in the description.


## UI-E/UI-F and full reference fidelity (UI-00 to UI-16)

- Built feat/ui-ef-workspace from exter-test-drive at 82f2aa1, after merged
  PR #8 and the uploaded reference renders. The user expanded this work to a
  fidelity pass on all fifteen reference screens and the sidebar in the same PR.
  Read design/reference/README.md before building; static HTML measurements and
  PNG comparisons control layout. AGENTS.md now points to that workflow.
- All six remaining screens are ready: Opportunities and briefs, Creators,
  Scores, Ask Exter, Reports and Data sources. Ask is a page opened by the header
  control. Budgets move into Data sources; old settings#monthly-budgets URLs
  redirect and scroll to the new location. Tests and preparation stays because
  website/collection/analysis tools still live there; Labelling stays in Settings.
- Reused existing saved-data/action APIs. Creator search/fit/shortlist and report
  generation/download keep their existing guards. No new source or model method,
  schema, dependency, account token storage, budget limit or environment setting.
  Draft upload, approval/delivery, PDF, weekly packs, client links, invitations,
  scores and calculations without existing support stay disabled/unavailable.
- Reference frame uses the measured header pattern, local Inter, section order,
  widths, 12px cards, 24px padding, paired share bars, competitor mix bars, icons
  and copy. Extra desktop topbar/research filter cards are removed. Caveats move
  behind About this data. Missing sections keep their frames with one explanation;
  tables hide universally unknown columns and use Basis labels. Cards retain one
  small evidence chip per basis instead of labels after every metric.
- PR #8 review fixes: Winners shows Longest running, thumbnails, shared titles and
  native IDs, with no empty score/label/confidence/four-signal columns. Competitor
  headers say Not collected once for uncollected brands. Visible copy has no
  internal item IDs, and the footer says Exter AI. Creatives starts with eight
  cards and Show more; browser back from detail retains the expanded list.
- Deleted 22 unreachable legacy UI components/styles and old App page/drawer
  branches. Kept UI still used by operator controls and the client demo, alongside
  all services, stored media, analyses and historical evidence.
- Pure shared/workspace-screens.ts selectors cover creator filters/known-view
  medians, source-safe links, public-only counts and saved score order, with
  synthetic fixture tests. Existing account calculations stay in their original
  shared module; account/currency/attribution/event/date scopes remain separate.
- Validation: npm run check, npm test (403 passed), npm run build and diff checks
  pass. The existing bundle-size advisory remains. UI-A/UI-B/UI-C-D browser
  regressions pass with updated expectations. Full fidelity browser acceptance
  covers all routes, header layout, missing frames, aliases/history, expanded
  library return, budget bookmarks, no internal IDs and mobile overflow.
  Separate intercepted fixtures verify Ask sources/history, shortlist/export,
  saved scores, disabled uploads, reports, safe account metadata and budget edits.
- output/playwright/fidelity-*.png contains 35 artifacts: every screen/sidebar
  at 1440px, Data sources/Briefs at 390px, a sidebar component capture and sixteen
  full-resolution side-by-side comparisons with approved references. App images
  use genuine retained captures and website research; synthetic populated cases
  are tested separately. Production media, paid analyses and live owned sync are
  absent locally and are not fabricated. Fixtures are not live verification.
- Kept differences are documented for review: actual/missing source content;
  longevity fallback; qualitative fit; overlapping claim shares; 44px interactive
  targets; full-page 260px sidebar versus standalone 240px export; required extra
  Settings/Ask/Help/footer controls; answer-level citation granularity; and the real
  saved winner row count. No paid/source requests were made during verification.
- Both live gates remain open, EXTER_OWNED_SYNC_ENABLED stays absent/false and
  kernel work stays paused. After merge: Render > exter-ai > Manual Deploy >
  Deploy latest commit. Keep existing secrets, budgets and disk. No migration or
  worker change is needed. No merge or deployment is run by this task.

- Final staged validation also passed npm run secrets:check; no known secret
  patterns were found. All four required checks pass on the completed change.

- Review: https://github.com/beng174/Exter-AI/pull/9 on feat/ui-ef-workspace,
  against exter-test-drive. The description includes every section classification,
  all app/reference pairs, mobile captures and intentional differences.


## Final filter and Basis polish after PR #9 (UI-01, UI-02, UI-04, UI-06, UI-07, UI-09)

- 2026-11-04: Based fix/creative-filters-basis on exter-test-drive at abe2de6,
  after the PR #9 merge. Read the approved reference README, PNGs and static HTML.
- Creatives uses named compact filter pills, a date disclosure, extra Platform /
  Status at capture / reset controls under Add filter, visible Sort by and an
  accurate Showing X of Y line. Existing selection URLs, back navigation,
  show-more and grid/table behaviour remain intact.
- Shared Basis columns reserve 100px, keep chips on one line and remain visible
  when a wide table scrolls. Home no longer forces a 540px table into its narrow
  scorecard frame. Unsupported scorecard/production measures and missing saved
  language show Unavailable in Basis. Genuine zero stays Observed; supported
  saved analysis retains Modelled. No formulas or stored data changed.
- npm run check, npm test (405 passed), npm run build, npm run secrets:check and
  diff checks pass. The existing bundle-size advisory remains. Browser acceptance
  covers all ten Basis tables at 1440px and 1280px (30 retained/synthetic table
  cases), filter names/selections/URLs/history, displayed counts and 390px
  popovers/overflow. Populated table captures were visually reviewed separately.
- output/playwright/polish-*.png contains 18 images: genuine retained-record
  before/after captures of Creatives, Home and Competitors at both widths plus
  six side-by-side comparisons. No synthetic fixtures enter these screenshots.
  No external requests or mutations occurred. Fixtures are not live verification.
- Both live gates remain open; EXTER_OWNED_SYNC_ENABLED stays absent/false and
  kernel work remains paused. After merge: Render > exter-ai > Manual Deploy >
  Deploy latest commit. No migration or worker change is needed.

- Review: https://github.com/beng174/Exter-AI/pull/10 on
  fix/creative-filters-basis, against exter-test-drive. The description includes
  before/after screenshots for all three requested screens at both widths,
  the ten-table audit, data classifications and kept reference differences.


## Complete read-only sample workspace (UI-00 to UI-16)

- 2026-11-04: feat/sample-workspace starts from exter-test-drive at abe2de6,
  after PR #9. The fictional Northwick Candle Co. workspace is available only
  with ?demo=1. Its switcher says Sample, and every page shows Sample data.
- shared/sample holds the approved renderVals and static reference content,
  fictional brands and advertiser records, 260 illustrative creatives (46 yours,
  214 competitors), six creator profiles, seven briefs, canned answers and four
  weekly packs. Sources use reserved .example domains and inline SVG posters.
  scripts/generate-sample-fixtures.mjs regenerates the design values. There is
  no database seed, schema change or new dependency.
- Existing API paths and typed record shapes serve the fixtures. Optional section
  read models populate illustrative Working Scores, priorities, review themes,
  retention and report sections in the existing screens and shared components.
  This does not implement or validate their live calculations. Predictive scoring
  remains gated. Sample competitor views never show private account outcomes.
- The flag gates the API and UI. Sample IDs without it and mixed real/sample
  scopes fail. The server rejects sample mutations before operational handlers,
  including bypass attempts; provider, analysis, sync, collection, budget and
  write controls are disabled. Ask is a read-only canned lookup with sample
  source IDs. Internal links/new tabs and history retain the flag; sample brand
  selection does not overwrite the saved real-workspace preference.
- All fifteen requested screens have their reference sections populated. The
  legacy demo link opens the full sample report; Settings and Labelling remain
  explicitly read-only. Browser acceptance covers populated section order,
  visible charts, labels, disabled controls, canned answers/sources, scene and
  creative navigation, private-outcome restrictions and mobile overflow.
- Validation passes: npm run check, npm test (405 tests), npm run build and diff
  checks. The existing bundle-size advisory remains. The ordinary-workspace
  fidelity regression passes, and its fifteen screen captures plus sidebar are
  pixel-identical to the existing committed captures (16 identical, 0 changed).
- output/playwright/sample-*.png contains 32 artifacts: all fifteen sample screens
  and sidebar at 1440px, each beside its approved reference. Kept differences
  include the requested Sample switcher label, disabled operational controls,
  .example links, existing shell utilities/footer, 44px targets, visible evidence
  metadata and the unvalidated predictive-score gate.
- No external requests or live provider calls occurred during verification.
  Fixtures are not live verification. Both live gates remain open,
  EXTER_OWNED_SYNC_ENABLED stays absent/false and kernel work stays paused.
  After merge: Render > exter-ai > Manual Deploy > Deploy latest commit.
  No migration or worker change is needed; keep existing secrets, budgets and disk.

- Final staged secret scan also passes with no known secret patterns found.
  All four required checks pass on the completed implementation.

- Review: https://github.com/beng174/Exter-AI/pull/11 on feat/sample-workspace,
  against exter-test-drive. The description includes every app/reference pair,
  the read-only boundary, validation and intentional fidelity differences.

- PR #10 merged during publication. Updated the sample branch from the current
  exter-test-drive at 60d5f5f, retaining its filter pills, Basis widths and
  unavailable-row rules alongside the sample workspace. Kept both sets of
  research notes. The combined type check, production build and 407 tests pass;
  real-workspace screenshots are rechecked against a clean build of that base.

- Post-merge validation: all four required checks pass with 407 tests. Sample
  browser acceptance, ordinary-workspace fidelity regression and PR #10's
  filter/Basis acceptance pass. All sixteen real captures are pixel-identical
  to the clean 60d5f5f base build; sample/reference pairs have been refreshed.


## Alignment, brand identity and score transparency (UI-00 to UI-16)

- Built from exter-test-drive at 9029e4e, which includes PR #11. Added reference
  rule 7 and shared centred content (1280px maximum), subgrid card/metric rows,
  tabular figures, aligned numeric/chip columns and consistent actions/spacing.
- Added shared brand marks across the switcher, headers, creatives, tables,
  proof, sources and reports. Uploaded logos take precedence over own-site icons,
  then monograms. Own-site retrieval reuses bounded public DNS-pinned HTTPS,
  rejects SVG and files of 200 KB or more, retains 64px PNGs in existing media
  storage and caches automatic checks monthly. Upload/reset use existing auth
  and mutation guards. Configured, uncollected competitors have logo identities.
  Sample brands use monograms only; their writes and network retrieval stay off.
- Creative score now shows coverage and Provisional, every check's result and
  points, plain reasons, linked evidence, the exact assessed-points total and
  How this score works. The existing server/demo/scores.ts rules and 20-point
  weights are unchanged. Shared display arithmetic reuses explainScore. The
  sample's older illustrative six-check scores were replaced with five-check
  fixtures verified against that scorer. Predictive scoring remains gated.
- Removed wholly missing measure rows and columns, including uncollected
  competitor metric columns. Explanations sit in About this data; empty section
  frames collapse and cards show one missing-metric label instead of three.
- All 90 screen/mode/width checks pass at 1280, 1440 and 1920, as do existing
  sample, real fidelity and filter/Basis browser acceptance. The 419 unit tests
  include all 243 result combinations plus logo fallback, size/type, accessibility
  and isolation checks. Type check and production build pass. Staged secret scan
  passes. No external requests or live provider calls occurred in verification.
- Before/after sample screenshots for Home, Winners, Creative detail, Competitors
  and Briefs, plus Scores and score-section screenshots, are in
  output/playwright/alignment/. Ordinary-route score screenshots are labelled
  fixtures because the retained real preview has no completed scores. Fixtures
  are not live verification. No stored real data or historical evidence changed.
- Both live gates remain open, EXTER_OWNED_SYNC_ENABLED remains absent/false and
  kernel work remains paused. No dependencies, schema, budgets, provider settings
  or worker changes. After merge: Render > exter-ai > Manual Deploy > Deploy latest
  commit. Keep existing secrets, budgets and disk; no migration is needed.

- Review: https://github.com/beng174/Exter-AI/pull/12 on feat/alignment-brand-logos,
  against exter-test-drive. The description includes five before/after pairs,
  sample and explicitly synthetic score screenshots, the 90-case audit,
  retained differences and deployment steps. All checks pass with 419 tests.
