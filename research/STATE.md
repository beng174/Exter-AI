# Current handoff

Priority: stable low-cost kernel. UI and scoring expansion remain deferred.
Read one ready item with `npm run kernel:next`.

- Baseline before this slice: `7da3071`, pushed with green CI. Hosted deployment
  of this new slice has not been verified.
- K00/K01 protocol foundation and K02 durable jobs/artifact transport are done.
  Next code task: K03 dedupe, normalisation and scene extraction.
- K02 uses a scoped authenticated web broker and a separate worker cache. It
  transfers retained original files; no ffmpeg, browser or ML runs on web reads.
- Staging is opt-in (`EXTER_KERNEL_WORKER_ENABLED=true` only on worker). Normal
  deployment requires no new resources or secrets and starts no new jobs.
- Local end-to-end HTTP/PG/worker staging passes. K02-LIVE remains blocked until
  secure Render broker settings and transfer/restart verification are completed.
- Permission/budget failures pause both queues; transient attempts are bounded.
  Uncertain paid dispatches retain their hold and require review, with no replay.
- The full extraction candidate remains disabled. K03 must bound worker cache
  quota/headroom/retention before production. Later ML weights/capacity and paired
  labelled-set evaluation are still pending.
- User chose Gemini 3.1 Flash-Lite with minimal thinking and thought-token accounting.
- API live sign-off K01-LIVE is blocked. TikTok keys and genuine recorded Meta
  responses are absent; fixtures are not live verification. Full product document
  was not attached; PRODUCT-SPEC.md records only supplied requirements.
- Paused scoring/export draft: local `wip/winning-workflow-before-kernel` at
  `fa9c8ed`; not deployed or part of the kernel.

Validation: 324 unit/regression tests, 20 disposable PostgreSQL tests and production
build pass. No live provider or new paid inference was run. Keep this handoff short.
