# Native video implementation verification — 30 October 2026

The Gemini adapter is implemented against the documented native Files/Interactions APIs. Provider request/response tests use fixtures; no Gemini credential is configured and no live model accuracy is claimed.

## Real source-media check

- Source: [Valentte Meta library ad 1019959660919738](https://www.facebook.com/ads/library/?id=1019959660919738).
- Retained an actual exposed MP4 file from the browser capture before any inference.
- Verified duration with `ffprobe`: **10.330023 seconds**; file size **1,314,319 bytes**.
- Stored at **2026-10-30T01:16:03.268Z** under Exter's ignored local media root.
- SHA-256: `de5c1548f53208aec7561852cad47bc4b5b3147faf0811beb791ba1788f3f17f`.
- A separate CLI process reused the same verified file, ID, hash and original storage time **without a remote URL or source request**.
- This checks a single captured video asset, not every variant or the entire public ad library. The video is not committed to the repository.

## Automated checks

The full suite passed **100 tests**, including provider transport, a real FFmpeg/ffprobe fixture, download retention, scoped media access, per-field timestamps and confidence, creator evidence, capability-specific fallback, versioned history, cache invalidation, CSV accuracy/timing evaluation and same-media comparison checks. The result panel passed separate desktop/mobile browser checks using labelled test fixtures, not fabricated real-ad output.

## Still required for real performance evidence

Configure `GEMINI_API_KEY` through server secret settings and run native inference on retained real ads. Independently human-label the same exact video files using the CSV template, then evaluate saved predictions. TwelveLabs Pegasus remains an explicit stub and receives no accuracy score.
