# Current handoff

Priority: stable low-cost kernel; UI/scoring deferred. Use npm run kernel:next.

- Baseline before K03: a343af1 (K02 jobs and scoped media broker).
- K03 implements worker-only ffmpeg normalisation, PySceneDetect, up to eight
  timestamped frames and optional 16kHz mono audio. Exact scope/media/config/tool
  hashes control reuse. Paid labels and ML extraction remain disabled.
- Features have lock-based serialisation, verified cache files, seven-day
  retention, quota/headroom checks, output limits and subprocess timeouts.
- Next implementation: K04 faster-whisper/YAMNet. Select weights/licences and
  measure memory before rollout. Minimal-thinking Flash-Lite remains the plan.
- K01-LIVE, K02-LIVE and K03-LIVE remain blocked by approved API credentials,
  broker configuration and Render worker capacity/restart checks. No live source
  API, Gemini or new paid inference ran for K03.
- New optional Dockerfile.worker carries scene dependencies. Default web image
  and default worker behavior do not enable Python extraction. Keep scene flag off.
- Validate combined source/feature cache disk retention and peak RSS on Render;
  local fixture success is not deployment verification.
- Full revised product document and genuine Meta recordings remain absent.
- Paused scoring/export draft remains local branch wip/winning-workflow-before-kernel.

Local validation evidence is recorded in KERNEL-BACKLOG.json and CI.
