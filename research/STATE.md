# Current handoff

Priority: stable low-cost kernel. Use npm run kernel:next and one listed task.

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
