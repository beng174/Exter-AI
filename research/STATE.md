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
