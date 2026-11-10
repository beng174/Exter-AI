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


## Comparison columns and Meta Page logos (UI-05, UI-06)

- PR #12 was merged before the follow-up arrived. Started the focused follow-up
  from exter-test-drive at bffe27a on feat/brand-columns-meta-logos.
- Shared tables now use one alignment for a column's header and every value.
  Text such as a format or offer stays right-aligned in numeric comparison
  columns. Data values and metric calculations are unchanged.
- Automatic logos now prefer a saved Meta Page's public Facebook profile picture
  before the website icon. Uploaded logos still win. Page pictures use the same
  bounded, public-DNS-pinned HTTPS transport, raster limits, 64px local copy,
  monthly cache and fallback. Requests are anonymous; no reporting token is sent,
  forwarded, stored or logged. Changing a Page ID invalidates the old automatic
  lookup. Sample brands remain monograms and make no source requests.
- Page identity comes from an explicit saved brand ID or one unambiguous saved
  advertiser ID in its ads/ad-library evidence, including verified workspace
  aliases. Creator Page IDs and ambiguous advertiser sets are not substituted.
- Reference rule 7 records uniform column alignment and rule 8 records the new
  logo precedence. Fixture tests cover Page priority, upload override, cache and
  identity refresh, fallback, blocked redirects/private DNS and raster limits.
- Type check, all 424 unit tests and production build pass. Live gates stay open,
  owned sync stays absent/false and kernel work remains paused. No schema,
  dependencies, provider permissions, budgets or scoring rules changed.

- Final follow-up validation: all four required checks pass with 424 tests.
  All 90 screen/mode/width cases confirm uniform header and cell alignment,
  with no page overflow. Updated Competitors screenshots at 1280px, 1440px
  and 1920px plus the audit are in output/playwright/brand-columns/.
  Fixtures are not live verification; no provider calls were made.

- Follow-up review: https://github.com/beng174/Exter-AI/pull/13 against
  exter-test-drive, with all three width screenshots and the 90-case audit.
  After merge: Render > exter-ai > Manual Deploy > Deploy latest commit.
  No migration or worker deployment is needed; keep existing secrets and disk.

## Meta Ad Library activation, 5 Nov 2026

- Meta Ad Library API access confirmed **4 Nov 2026** by the owner: Graph API
  Explorer v26.0, GB, ad_type=ALL, ad_active_status=ALL returned UK commercial
  ads with total_reach_by_location. Live collection remains pending the switch.
- Default-off EXTER_META_LIBRARY_ENABLED is required on worker and scheduler;
  web also gates manual collection. META_ACCESS_TOKEN belongs in Render secrets
  on exter-ai and exter-worker, not the scheduler. See docs/DEPLOY.md.
- Public reach stays Observed; reach-based share of voice is an Estimated
  watchlist proxy. No commercial spend or impressions are created. Page ID
  watchlists, resumable 12-month runs and 03:00 Europe/London slots use Postgres.
- Fixture tests are not live verification. Phase 0 and Phase 1 own-account live
  gates remain open until confirmed on Exter Media's own account. Owned sync
  stays default off, and low-cost kernel work remains paused.

- Validation: all four required checks pass (430 unit tests), plus five disposable
  Postgres integration cases. All 90 existing real/sample screen/width alignment
  cases pass, and 24 affected-view/width checks pass with both Page ID editing
  entry points and metadata-only saves. No live provider calls were made.
  Reproducible fixtures and app/reference comparisons are in
  output/playwright/meta-library/. Fixtures are not live verification.

- Review: https://github.com/beng174/Exter-AI/pull/14 against exter-test-drive.
  Live collection has not been enabled. Render activation and rollback steps are
  in docs/DEPLOY.md; the existing web disk and Postgres must be retained.

## Workspace readability and provider marks, 5 Nov 2026

- The earlier automatic Page lookup task is complete in PR #15:
  https://github.com/beng174/Exter-AI/pull/15. Page IDs require explicit Confirm
  or manual save. Its fixture verification is recorded on that branch.
- This independent UI follow-up starts at exter-test-drive 84131ee. It preserves
  the owner's enabled EXTER_META_LIBRARY_ENABLED values in render.yaml. No
  provider calls, deployment changes or live-account verification were made.
- Creative detail uses a concise first-sentence heading without logos injected
  into ad copy. Full source copy remains in Show more; card title rules and
  original records are unchanged. Performance tiles form a compact left-aligned
  grid with shared label/value rows. Home source statuses stay in one grid.
- Workspace selection tolerates a missing optional website domain. A genuine
  brand-list failure has a compact Retry notice, which clears on recovery.
  Known current-page and sidebar brand identities remain usable independently.
  The fixture reproduces the client exception; authenticated production HTTP
  failures have not been inspected.
- Real and sample Data sources use bundled Meta, TikTok, Google, Instagram and
  YouTube marks, with review/website icons for generic sources. Source health
  keeps the four reference columns. Known successful checks and observed record
  links move into Detail; unknown metadata is omitted rather than repeated.
- Validation: type check, all 434 unit tests and production build pass. All 90
  real/sample screen/mode/width cases pass at 1280px, 1440px and 1920px, with no
  overflow or alignment failures. Six affected-page viewport captures plus
  brand-list failure/recovery and sample Data sources at 1440px/390px pass.
  The tracked-file secret scan passes. All four required checks pass.
- Before/after comparisons, fictional fixture screenshots and audit JSON are in
  output/playwright/readability/. Fixtures are not live verification. No schema,
  dependencies, scoring rules, budgets, owned-sync defaults or kernel work changed.

- Review: https://github.com/beng174/Exter-AI/pull/16 against exter-test-drive.
  After merge: Render > exter-ai > Manual Deploy > Deploy latest commit.
  This UI follow-up needs no migration, worker deployment or new settings.
  Keep the existing disk, secrets and collection flags. PR #15 separately needs
  its shared rate-gate code deployed to exter-worker.
=======
## Confirmed Page discovery follow-up, 5 Nov 2026
- The Page-discovery follow-up suggests IDs for missing watchlist brands and competitors.
  Searches use the saved name, GB, ALL ad type and ALL activity statuses.
  Candidate order uses website-caption matches, name match and distinct ads.
- Suggestions never write a Page ID or collected-ad observation. Explicit
  Confirm or manual save is required. Competitors and Data sources share the
  same editor, showing Page pictures, ad counts and an example Ad Library link.
- Lookup requires META_ACCESS_TOKEN on web and shares the collection gate and
  budget guard. The collection switch remains default off. Search suggestions
  are cached for 30 minutes; initial coverage is ten pages, with explicit extra
  batches up to 10,000 ads. Partial coverage is labelled. Preview pictures use
  bounded local raster storage with hashed cache identities and monthly refresh.
- No live provider calls were made. Fixture validation does not close either
  own-account live gate. Owned sync stays off and low-cost kernel work is paused.

- Follow-up validation: check, 441 unit tests and build pass, with six disposable
  Postgres cases and 28 browser screen/width checks. Candidate screenshots from
  both entry points at 1440px and 390px are in output/playwright/meta-library/.
  Fixtures are not live verification. The prior 90-case alignment audit belongs
  to the earlier PR #14 validation; the new UI is confined to the shared editor.

- Page-discovery follow-up: all four required checks pass, including the staged
  secrets scan. PR #14 merged during implementation, so this is a separate
  follow-up from exter-test-drive at 84131ee; the readability/source-icon
  request is a separate implementation step. The owner enabled public collection
  in render.yaml on the latest base; that setting is preserved. No live provider
  calls or deployment-setting changes were made by this follow-up.

- Completed Page discovery review: https://github.com/beng174/Exter-AI/pull/15,
  based on the latest exter-test-drive. Readability and provider-icon work follows
  separately so that this completed feature remains reviewable.

## Meta observation storage and size health, 5 Nov 2026

- Authorised change from per-check snapshots to change history. Stored-field
  fingerprints include all sanitised source fields plus normalised status/reach.
  Identical scans only advance the latest scoped row's last_confirmed_at. New
  states append; no old observations or payloads are deleted or consolidated.
- Raw JSON is retained first and when changed. Normalised-only changes reference
  the earlier payload directly, with both readers resolving it. Original change
  timestamps stay intact; latest confirmation drives current check/endpoint time.
  Workspace, watchlist/revision, lease, cursor and page transaction boundaries
  remain. Opposite-order concurrent scans lock ads in a stable order.
- Existing infrastructure status checks retain one physical Postgres size sample
  per UTC hour. Data sources adds a Collection database row with measured size
  and daily growth over the disclosed measured interval. The first 24-hour
  baseline, failed measurements and missing configuration stay Unavailable.
  A storage-only permission failure does not mark working collection disconnected.
  Sample mode shows only its fixture explanation, never real database bytes.
- Storage estimates for 1,000 ads and 30 checks are documented in docs/DEPLOY.md.
  A 10%-changing fixture retained 3,900 observations instead of 30,000; measured
  live rows were 4.86 MiB, while allocated observation storage including indexes
  was 25.0 MiB. MVCC update space and compression are disclosed; if every ad
  changes daily, all 30,000 observations are still kept. Figures are illustrative.
- Type check, 450 unit tests and production build pass. Eleven disposable
  Postgres integration cases pass; five real/sample browser width cases plus
  Refresh, zero, first-day and failure states pass. The tracked-file secret scan
  passes. All four required checks pass. Artifacts: output/playwright/storage/.
- Fixtures are not live verification. Public collection flags, provider pacing,
  budgets and secrets are unchanged. Owned-sync live gates stay open and its
  default remains off; kernel work remains paused. No new dependencies or services.
- Rollout: deploy exter-ai first to migrate and hydrate sparse payloads, then
  exter-worker and exter-scheduler from exter-test-drive. Preserve disks, settings
  and historical data. Once sparse rows exist, rollback must keep a compatible
  reader. No new environment values or manual data rewrite is needed.

- Review: https://github.com/beng174/Exter-AI/pull/17 against exter-test-drive.
  After merge: Render > exter-ai > Manual Deploy > Deploy latest commit; wait
  for the migration and healthy compatible reader, then repeat for exter-worker
  and exter-scheduler. Storage history begins with the first health measurement;
  daily growth remains Unavailable until the 24-hour baseline exists.


## Meta collection diagnostics and recovery, 5 Nov 2026

- Extends the open storage review with per-brand latest run status, ads saved,
  committed pages, stopping time and safe failure details in Data sources and
  Edit watchlist. The reported 7,752-ad live failure has no retrospective Graph
  code in the earlier generic message; its exact cause is not established here.
- Every new failure records only controlled kind, timestamp, request size,
  numeric Graph code/subcode/HTTP status and timeout flag. No provider message,
  request/paging URL, trace or token is persisted or logged. Legacy stopping
  times are retained on explicit resume without inventing error codes.
- Code 1, HTTP 500 and timeout recovery retries the same cursor through sizes
  100, 50, 25 and 10 in separate paced worker claims. Reductions do not consume
  failed-page attempts until size 10 fails. A successful size is retained per
  brand; other brands retain their own size. Whole requests use 90-second
  deadlines and remain within the existing lease. Permission/rate-limit guards
  retain priority, and all dispatches retain the budget and request gate.
- Retry collection explicitly resumes saved progress. It enforces real workspace
  ownership, the live switch, token, provider budget, cooldown and live lease.
  Unsaved Page changes cannot redirect a retry. Active status refresh uses thin
  requests every five seconds, stops when inactive, and retains details on failure.
- Change-only observations, direct raw payload references, existing history,
  hourly database size/growth and monthly estimates remain intact. No collected
  fields, rolling 12-month window, 03:00 UK schedule or live settings changed.
- Validation: all four checks pass, with 458 unit tests and 16 disposable
  Postgres integration cases. Four entry-point/width browser cases and six
  explicit scoped retries pass, including active polling and refresh failure
  retention. Screenshots and reproduction: output/playwright/meta-recovery/.
  Fixtures are not live verification; no production collection or paid provider
  run was started.
- Following authorised work remains separate: full public Performance signals,
  then default-off Apify media retention with cost/disk guards. See the next
  task plan; these are not claimed implemented by the recovery changes.

- Recovery review: https://github.com/beng174/Exter-AI/pull/17, updated with
  commit 8d43b57, shared diagnostics/retry screenshots and all required checks.
  After merge, deploy exter-ai first, then exter-worker and exter-scheduler.
  Use Retry collection per stopped brand after deployment; this implementation
  has not resumed the live run or established its original Graph failure code.


## Public Creative detail Performance, 5 Nov 2026

- Uses available official public fields for UK/EU/country reach, selected
  targeting ages/gender/locations, platforms, languages and reached demographics.
  Reach is Observed; reach/day is an Estimated saved-period average with actual
  numerator/divisor/result in its tooltip. Missing fields create no tiles.
- Versions count unique same-brand public ad identities matching exact retained
  full-creative hashes or complete captured copy. Similar wording and truncated
  prefixes do not count. These are collected-sample counts, not full-market claims.
- The shared reference tile/bar components are reused in real and sample views.
  Public ads for the workspace's own brand stay in Public signals only until
  actual owned reporting exists. No public spend, impressions, clicks, conversions
  or private retention section is rendered. Stored ads/media/analyses are unchanged.
- Type check, all 464 unit tests, production build and the secret scan pass.
  Browser fixtures cover 1440px and 390px, missing signals, zero values, sample
  mode and public ads for the workspace brand. Fixtures are not live verification.
  Media ingestion is separate following work; no actor run has been started.


## Optional public-ad media, 5 Nov 2026

- Public Performance and media follow collection recovery PR #17 in PR #18, against
  exter-test-drive. The public tile/chart projection is fixture-validated for UK,
  EU and country reach, reach/day arithmetic, demographics, targeting, exact
  sampled versions, platforms and languages. Missing public tiles are hidden;
  private account outcomes stay out of public ads.
- Media uses the maintained automation_craft/facebook-ads-library-scraper actor,
  pinned build 1.3.12, $0.50 per 1,000 ad results plus its $0.00005 start event.
  First UK Page/window batches and later exact missing-ID batches have a 500-ad
  cap and a provider-side USD ceiling, held first by the existing data provider
  budget guard. A configured conservative GBP-per-USD ceiling is required; no
  rate is invented. Unknown/repriced billing and ambiguous starts keep their hold.
- Only media and format are accepted. Archive and Page IDs must match official
  workspace/watchlist evidence. No actor text, dates, reach or private metrics
  replace official observations or paid analyses. No token, returned URL or
  provider message enters run metadata or logs.
- The diskless worker claims Postgres checkpoints and authenticates a bounded
  step on the disk-owning web service. Existing bounded downloads and immutable
  content storage retain images/posters and only priority videos, re-encoded to
  720p H.264. Missing posters can be derived from retained priority videos. Files
  deduplicate across ads in a workspace, and old snapshots/files are preserved.
- Data sources shows measured disk used/remaining and per-run estimated/held
  costs in Budgets and schedule. Video downloads stop before 80% disk usage,
  including worst-case headroom. Cards/detail use local media or ad-copy preview.
- EXTER_AD_MEDIA_ENABLED is false on web, worker and scheduler in render.yaml.
  APIFY_TOKEN belongs in web Render secrets; a dedicated broker secret is shared
  by web/worker, with a fixed HTTPS worker origin. DEPLOY documents the actor,
  prices, limits, recovery and exact rollout. No service, dependency, Render plan,
  existing public-collection flag, 03:00 schedule, budget or model was changed.
- Type check, 478 unit tests, build and browser fixtures at 1440/390 pass; the
  affected Postgres suites pass 24 cases, including eight media cases. The staged
  secret scan passes. Media UI also fits the 1280px and 1920px desktop columns. No live or paid actor run was made. Fixtures
  are not live verification; actual actor access and hosted encoding capacity
  remain unverified. Phase 0/Phase 1 owned-account live gates stay open.

## Media coverage and Pacific-safe collection (6 Nov 2026)

- Code diagnosis: initial media runs searched a Page with a cap taken from the
  then-known corpus. Continuation depended on a post-completion enqueue, and
  queued targets counted as attempts before dispatch. Production actor runs were
  not accessed; the reported 20/4-result cause is not claimed as live-verified.
- New batches use exact official IDs from the start, at most 500 per run. Durable
  per-ad requests/outcomes distinguish submitted, returned, matched and retained
  files. Never-requested IDs take priority over retries. Completion and idle-worker
  refill cover every enabled watchlist brand and recover missed acknowledgements.
  Paused/uncertain paid starts retain their existing holds and explicit guards.
- Data sources shows coverage and missing reasons per brand, safe actor input,
  actor-owned INPUT/summary counts and controlled stop reasons in run Details.
  Earlier Page searches are explicitly incomplete; unknown counts are not zero.
- Official Graph requests omit ad_delivery_date_max for daily, backfill and legacy
  saved configs. Any required actor end date is capped to America/Los_Angeles.
  The 03:00 Europe/London schedule, collected fields and reach formulas are unchanged.
- Only Meta error_user_title/error_user_msg are newly permitted: sanitised before
  storage and display, token/URLs removed, control characters stripped, each at
  most 300 Unicode characters and rendered as plain text. Generic messages,
  traces, paging URLs and tokens remain excluded. Data sources and Edit watchlist
  use the same failure component. Historical text cannot be recovered retrospectively.
- Validation: npm run check, npm test (492 passed), npm run build and
  npm run secrets:check; disposable Postgres and browser fixture results are in
  .agent/plans/media-coverage-and-meta-dates.md. Fictional screenshots and the
  Data sources reference comparison are under output/playwright/media-coverage/.
  No live Graph, paid actor or production database calls. Fixtures are not live
  verification; both owned-account live gates remain OPEN.
- Rollout: deploy exter-ai first, wait for additive migrations and health, then
  deploy exter-worker and exter-scheduler from the same commit. Preserve the
  owner's current enabled flags, actor build/prices, USD cap and provider budget.
  Use Retry collection for failed Graph checkpoints; Collect missing media can
  resume safe pauses. Reconcile an Uncertain paid start before retrying it.

## Current collection status versus failure history (8 Nov 2026)

- The owner reported running/completed collections still showing 6 November
  date failures alongside a current queued HTTP 500 retry. Confirmed PR #20 is
  merged into exter-test-drive; no production deployment or database was accessed.
- Found the reporting defect: MetaRunDetails always promoted failures[0], even
  after resume or successful pages had cleared the current run error. Completed
  and resumed runs now keep those entries under Failure history only. A new
  failure after successful progress becomes current again; nothing is deleted.
- Queued transient failures show automatic retry, the smaller upcoming page size
  and the earliest retry time from the queue/shared rate gate. Active controls
  say Queued or Collecting and remain disabled. Failed/paused controls retain the
  existing access, saved-Page, budget and lease guards. The known 100/2334030 code
  now has a controlled end-date explanation instead of a generic schema message.
- Reverified the same-cursor 100/50/25/10 path with fixtures. The collection worker,
  fields, retry limits, pacing, daily 03:00 schedule and enabled flags are unchanged.
  No schema migration, provider call, paid run or production write was made.
- Validation: npm run check, npm test (495 passed), npm run build and
  npm run secrets:check passed. Ten disposable Postgres recovery/activation
  cases and browser fixtures at 1280/1440/1920/390 passed with no external calls.
  Details and screenshots are recorded in
  .agent/plans/meta-collection-current-status.md and
  output/playwright/meta-current-status/. Fixtures are not live verification.
  Both own-account live gates remain OPEN; kernel work remains paused.
- Rollout: after merge, manually deploy the latest exter-test-drive commit on
  exter-ai and wait for health. Ensure exter-worker already includes PR #20 if
  it has not been deployed since the date fix merged. Leave the scheduler,
  schedules, credentials, switches and budgets unchanged. Historical date errors
  do not require interrupting queued/running work.

## Workspace page-loading repair (9 Nov 2026)

- Follow-up to the merged web heap repair. Research screens downloaded the whole
  library twice for different date windows, then waited for contextual reads.
  Action screens also waited for unrelated reports, briefs and creator data.
  Some evidence/report links reloaded the app. Large tables rendered every ad
  and repeated full-dataset alignment scans for each cell.
- Resolve the existing research window before owned metrics in one response.
  Share short-lived, bounded client reads by URL/date/sample scope; cancel
  abandoned reads and invalidate after writes/manual refresh. Start independent
  reads together, request only relevant action data and keep internal navigation
  inside the app. Preserve API defaults and every metric/cohort calculation.
- Stream gzip without a full JSON buffer. Keep the bounded server read gate and
  backpressure. Paginate shared tables at 50 rows, preserving full sorting,
  availability decisions and totals; infer alignment once per column.
- Fictional 7,800-ad browser flow: 14 to two full-library requests, four to one
  document loads, Winners 24.6 seconds to about 0.3 seconds. The fixture JSON
  compresses from 10,021,710 to 185,369 bytes. These are local fixture results,
  not live Render timings. All 15 screens passed in both workspace modes at
  1280, 1440 and 1920px, plus mobile source/table checks. No external calls.
- Final validation: check, 511 unit tests, build and secrets scan pass.
  PR #23 targets exter-test-drive; deployment is pending. Fixtures
  cover date/cohort parity, cache isolation, expiry, mutation invalidation,
  cancellation, pagination, compression and the existing 192 MiB memory guard.
- No database/collection, schedule, provider, budget, dependency or Render
  configuration changes. Kernel pause and both owned-account live gates remain.
  Merge against exter-test-drive, deploy exter-ai only, hard-refresh a tab and
  verify live speed/heap. Exact rollout is in docs/DEPLOY.md.

## Web JavaScript heap abort (8 Nov 2026, 20:49 GMT)

- Owner supplied the fatal Node heap-limit error and confirmed exter-ai (web),
  instance 6k9vd. Render's private log link requires sign-in here; the exact live
  allocation frame and post-deploy recovery remain unverified.
- A clean aa7330f checkout aborts under a fixed 192 MiB production-mode fixture
  heap when reading 7,800 ads with large stored-only raw fields. The repair
  returns three overlapping full responses with matching counts and hashes under
  the same limit. This is a synthetic load comparison, not production profiling.
- Stream public observations into their existing creative projection and group
  retained media history as rows arrive. Preserve SQL scope, latest selection,
  missing/zero values, public/private cohorts and every stored row/file. Encode
  the response incrementally, retain backpressure and queue overlapping heavy
  library builds with a bounded busy response. No response data is truncated.
- Collection workers, schedules, provider fields, budgets, Gemini settings,
  render.yaml and production heap limits are unchanged. No schema migration,
  paid calls or production data access. Kernel work and both owned-account live
  gates retain their prior status.
- Validation: npm run check, npm test (504 passed), npm run build and
  npm run secrets:check passed. Seventeen disposable Postgres integration cases
  passed. Fixture measurements and limitations are recorded in
  .agent/plans/bounded-public-library-memory.md and docs/DEPLOY.md. After merge,
  deploy exter-ai only, wait for health and verify library counts and memory.
  Existing collection/media checkpoints continue without a fresh backfill.


## Public previews and comparable categories (9 Nov 2026)

- Owner authorised complete preview targets, daily missing-media retries and
  text-only product classification, followed by same-category/media comparisons.
  Added credits do not authorise higher budgets or per-run caps; those remain.
- Media handoff runs after official collection, then the existing refill visits
  every watchlist. Missing previews retry by UK day with controlled reasons.
  Seven actual failed days are required for “No preview from Meta”. Posters can
  be extracted from bounded video input; optional 720p videos follow priority,
  then newest-first ordering under the existing 80% disk limit.
- Media format is Observed and separate from Modelled creative style. Product
  categories use asynchronous gemini-2.5-flash-lite batches, bounded text inputs,
  pre-dispatch inference holds, exact keyed output checks and source hashes.
  Keys stay on web; the diskless worker uses the existing authenticated broker.
- Brand research edits primary categories. Comparisons default to My categories
  and Same format: one table with format groups, own-count ordering, hidden only
  if both sides have fewer than 10 ads, one hidden-groups line and a chart switch.
  Detail matches its own format/category before angle/offer ranking. Private
  account cohorts, official reach/dates, paid analyses and stored history remain.
- Fixture validation and screenshots are recorded in
  .agent/plans/public-media-comparisons.md. No real provider calls were made;
  100% live coverage is a target and remains unverified. PR #24 targets
  exter-test-drive; deployment is pending.
  Kernel work stays paused; Phase 0 and Phase 1 owned-account live gates stay open.
  See docs/DEPLOY.md for the additive migration and web, worker, scheduler order.

## Accuracy framework and experimental likelihood (10 Nov 2026)

- Owner authorised AC-01..05 measurement, followed by AC-06 experimental model
  work. ACCURACY-SPEC.md supersedes the old 85% tag and 0.65 AUC gates with 90%
  per field and AUC 0.70, calibration and 3,000 resolved time-holdout ads. Public
  outcomes are advertiser-backing winner signals, never competitor sales.
- Added Settings Accuracy, source-integrity/formula/human-label checks, temporal
  AUC/calibration evaluation, immutable measurement/test/result snapshots and
  account/product/category/format threshold overrides. Test metric and thresholds
  lock before launch. Owned results show ROAS, CPA, hook rate, uncertainty and
  the 20% CPA guardrail; restatements preserve earlier snapshots.
- Thresholds use comparable account history from the preceding 90 days. Missing
  history uses labelled defaults. Longer purchase cycles require a scoped brand
  override. Product/price-tier membership is confirmed by the owner against IDs
  actually present in that owned account, not inferred from competitor data.
- The experimental model pools weak theory, earlier resolved multimodal
  neighbours and historical category momentum. Prior weight falls with samples.
  The seven proposed review weights do not change the current five-check
  Creative score or Working Score. Features/embeddings and outcome labels must
  be prepared offline; no provider/model calls or downloads were added.
- No connected resolved model dataset is claimed. Missing category, format,
  analysis, embeddings or mature labels stays missing. Conservative theory-only
  previews are always unvalidated. Offline fixtures cannot release a model.
  Internal estimates show their uncertainty and validation; reports exclude
  unpassed estimates. Draft scoring uses the identical function on analysed JSON.
- Collection, official reach/dates, budgets, tokens, Render switches and provider
  methods are unchanged. Kernel remains paused. Both owned-account live gates
  remain open. Fixtures are not live verification. See docs/ACCURACY.md and
  .agent/plans/accuracy-framework.md for validation evidence and limitations.

- Final accuracy validation: npm run check, npm test (541 passed), npm run build
  and npm run secrets:check passed on latest exter-test-drive plus this feature.
  Fixture browser checks passed at four widths. PR #26 targets exter-test-drive:
  https://github.com/beng174/Exter-AI/pull/26. No real model is validated.

## Deployment startup repair (10 Nov 2026)

- Supplied build logs for 6db19f5 show successful check/build followed by no open
  port, then deployment timeout/SIGTERM. The first possible wait after the last
  log was Postgres initialisation, which had no connection/lock/query deadline.
  The logs cannot distinguish a connection stall from lock contention or later
  local initialisation; new trusted phase logs identify each step.
- Added bounded connection attempts and a total migration deadline, controlled
  failure codes, safe connection disposal/rollback and atomic schema receipts.
  Unchanged web/worker/scheduler starts skip locking DDL. Explicit migrations
  retain safe backfill/repair semantics. All original rows and media stay intact.
- Reproduced the actual entrypoint against a stalled local database handshake
  and used disposable local Postgres for lock/cache/rollback tests. No live
  database access, provider calls, plan/switch/budget changes or new dependencies.
  A public unauthenticated health probe returned 401, confirming a listener/auth
  response only. No authenticated live health or database state was verified.
- Kernel work remains paused; both owned-account live gates remain open. Accuracy
  and prediction gates retain PR #26's status. Deployment and operator diagnostics
  are documented in docs/DEPLOY.md and the bounded-startup ExecPlan.

- Validation for the startup repair: npm run check, npm test (549 passed),
  npm run build and the disposable Postgres integration passed. The build keeps
  its existing bundle-size warning; no UI or dependency changes were needed.

- Secret scan passed after staging every repair file. PR #27 targets
  exter-test-drive: https://github.com/beng174/Exter-AI/pull/27. The PR preserves
  the current port/auth gate and records exact web/worker/scheduler rollout steps.

## UK creator discovery, 10 November 2026

Two-PR delivery: consolidated internal skill and owner-check briefs first; creator
feature second. The feature uses the existing Creators view, budget guard and
worker/scheduler, with separate public discovery and official metric verification.
Saved segments, internal CSVs, monthly refresh, deletion/suppression and per-field
Accuracy checks are included. No ad reach, dates, formulas or collection schedule
changed. Creator precision gates remain open pending independent owner labels and
85% precision for both good fit and UK. No live provider access or client readiness
was established by fixtures. Existing owned-account live gates remain open.


## Strict creator results, 10 November 2026

Results require every individual-creator and brief rule to pass. Uncertain
accounts go to Needs review; known failures go to Rejected with per-rule reasons
and counts. Genuine shop-owning creators need review. Fit cannot override gates.
Official count, activity, niche/style, UK, comment and follower-history checks
share the same gate for Results, saves, exports and segments. No new paid calls
or collection changes. New rejection diagnostics are minimal and expire in 90 days;
existing profiles are preserved. Recheck old rules without calling providers.
Individual-creator precision joins good fit and UK at 85%, with known business
and repost negatives required. Real owner labels are still needed. Fixtures are
not live verification; no client gate is claimed. Owned live gates remain open
and kernel work stays paused. Local Postgres/API fixtures and responsive browser checks pass. Screenshots are
in docs/review/strict-creators/. npm run check, npm test (574 passed), npm run build and npm run secrets:check
pass, plus the isolated Postgres/API fixture. Client gates remain closed.

## Creator run recovery, 10 November 2026

Instagram actor timeout is 15 minutes; status polling backs off from 5 to 15
seconds, with a 20-minute wait window. Temporary status/dataset reads retry five
times; no paid start is retried or aborted after a failed check. Per-step provider
IDs, dataset IDs, reservations and progress are durable, with worker lease renewal.
Terminal partial results use the existing strict screening and continue the search.
Final real USD usage settles the original hold, using its saved GBP exchange rate.
Reconcile runs in the worker and starts no actor. Earlier untracked holds require
an owner-confirmed run-to-hold mapping, checked against actor/input/timing; unknown
charges stay reserved. No real reconciliation, live collection or client validation
is claimed. Accuracy gates stay closed, owned gates open and kernel work paused.
Validation: npm run check, npm test (588 passed), npm run build and
npm run secrets:check pass, plus both isolated Postgres/API fixtures. Browser
checks pass at 1280/1440/1920/390px; fixture screenshots are in
docs/review/creator-run-recovery/. No live billing reconciliation was performed.

### 10 Nov 2026: missing-media diagnostics and Winners recovery

Controlled per-ad reasons and disk-aware coverage are available in Data sources.
Exact-ID requests include historical ads; transient downloads retry three times
without paid restarts. Copy tiles fill posters and source links follow metrics.
Source formats work without downloads. Winners retains a clearly labelled
longest-running fallback and reports category, format and media coverage.
Text-only tagging has a quoted action and runs independently of media collection.
The owner cancelled production tracing of the three historical Valentte ads;
no live cause is claimed. The owner will check their displayed reasons after deploy.
Verification uses fictional fixtures, never live provider calls.

### 10 Nov 2026: automatic UK brand onboarding (BO-01 to BO-07)

PR #32's finish was rechecked with a clean full run: 596 tests passed.
Automatic onboarding now accepts a name and website, crawls bounded public
sources and runs budgeted text understanding. It saves specific My categories,
source-backed claims/prices and discovery keywords, and fills Brand research.
Domain-backed Page matches can auto-confirm under the owner's new instruction;
ambiguous matches still require one click. Multiple Pages have separate watchlists,
cursors and media jobs. Competitors need UK ads, matching products and domain
proof; retailers/resellers without a relevant own range do not qualify.
Competitor sites share one cheap model batch. Existing collection, media and
category jobs drive live counts and coverage. Manual overrides and removals win;
monthly checks suggest changes. Past website research and paid analyses are kept.
No switches, budgets, model settings or prediction gates were changed. The own-
account Phase 0/Phase 1 live gates remain open. Verification is fixture-only;
production tracing of the three historical ads remains deferred by the owner.

Checks: all 605 unit tests and 40 isolated Postgres fixture tests passed, including
12 onboarding cases. TypeScript, production build and tracked-file secrets scan
passed. Browser fixtures passed at 390/1280/1440/1920px with zero external requests.
See docs/review/automatic-onboarding/README.md for screenshots and reference pairs.
PR #32 is still open; this branch builds on its verified fixes. Merge it first.
PR #33: https://github.com/beng174/Exter-AI/pull/33 (feat/automatic-brand-onboarding,
base exter-test-drive). Deploy only after merging PR #32 then PR #33 and migrating.
The CI integration command now includes onboarding, ad-media and public-media
fixtures. Its full clean local run passed all 74 infrastructure tests (including
the 40 targeted source/media/onboarding cases); no live providers were called.
