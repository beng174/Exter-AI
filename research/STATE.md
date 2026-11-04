# Current handoff

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
  Media's own ad account) remains unverified; do not start Phase 1 until it passes.

- Validation: npm test passed all 336 tests; npm run check and
  npm run secrets:check passed. Fixtures do not verify live-account gates.

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
