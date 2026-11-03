# Kernel rebuild plan

Updated 3 November 2026. Product requirements: [PRODUCT-SPEC.md](PRODUCT-SPEC.md).
Executable task index: [KERNEL-BACKLOG.json](KERNEL-BACKLOG.json).

## Working method

Use one authoritative backlog and one bounded Codex task at a time. The user sets
the objective and constraints. Codex implements the next ready vertical slice,
tests it, records evidence and proposes the next step. Repeatedly copying large
prompts, or asking one model to rewrite prompts for another on every iteration,
adds coordination and context cost without improving the acceptance criteria.

Start with `npm run kernel:next`; use `npm run kernel:task -- K02` to load one
task. Read only its listed files and the relevant skill/reference. Save durable
progress in the backlog and STATE.md, not a growing conversation transcript.
No autonomous paid agent loop or additional OpenAI API subscription is required.

## Sequence and gates

| Phase | Deliverable | Gate before moving on |
| --- | --- | --- |
| K00 | Updated spec, compact task router, pinned skills and backlog | Requirements and unknowns are explicit; no service behaviour changes |
| K01 | Meta/TikTok adapters and truthful connection states | Sanitised protocol fixtures pass; no credentials means no network |
| K02 | Shared artifact transport, durable worker jobs and ownership | Worker can retrieve only authorised media; lease/restart tests; no raw local paths across services |
| K03 | Dedupe, ffmpeg, scene selection | Same media/config reuses features; bounded frame/audio artifacts and timestamps |
| K04 | faster-whisper and YAMNet | Speech/music regressions pass; failed audio is unknown, not silent |
| K05 | RapidOCR, face and product presence | Timed evidence, pinned weights/licences, no identity or product-brand guesses |
| K06 | Compact Flash-Lite labels | Fixed taxonomy, minimal thinking, bounded JSON, source references and complete usage accounting |
| K07 | Quality gates and full-video escalation | Budgeted, capped and idempotent; no raw-confidence-only trigger |
| K08 | Paired labelled-set benchmark | Accuracy, total GBP cost, escalation rate, latency and peak RSS satisfy declared thresholds |
| K09 | Controlled Render worker rollout | Crash recovery, memory and credential checks pass; reference remains available |
| K10 | Resume UI and reporting roadmap | APIs provide measured data; missing values stay explicit |

## Service boundaries

The web service authenticates operators, queues jobs and serves retained evidence.
It never imports or loads Python ML models. The PostgreSQL job kernel owns leases,
idempotency keys, stage progress, budgets and cancellation. A separate Render
worker owns local extraction; only the final labels/escalations call Gemini.

Artifact transport uses a scoped authenticated broker over the existing web
disk, with a separate verified worker cache. The disk itself is not shared.
Only an explicit admin staging request registers an immutable reference and
queues work; status reads never enqueue. A dedicated service token plus workspace
allowlist protects the exact download route and grants no access to other APIs.
Original files are streamed without web-side normalisation or ML. Object storage
can implement the same portable reference interface later if measured load
warrants it. Do not assume identical absolute paths on two services.

Stage caches are keyed by tenant scope, media hash, stage/model revision and
configuration. Label caches add ad-copy/context, prompt, schema and served-model
settings. Raw extraction can be reused safely; different ad contexts need distinct
label evidence. Cache hits must not create another paid reservation.

Use a canonical key `(workspace, platform, native ad ID)` at the queue boundary.
Preserve aliases for the existing SQLite ad IDs and paid-run references. New
worker jobs, features, label results and cost ledgers belong in PostgreSQL;
the web read adapter can serve legacy SQLite results alongside them. Do not
introduce an unguarded cross-database write or destructively migrate old records.

Render environment variables are scoped per service. The existing worker does
not automatically receive the web service's Gemini key or media mount. Worker
rollout needs its own secure model/storage settings and a persistent model-cache
decision. The current web-only deployment needs none of those changes yet.
K02 staging is opt-in and performs no paid inference. Its `media-ready` result is
a stage result, not a completed creative analysis or proof that an ephemeral
cache still exists. The extraction candidate remains disabled. See docs/DEPLOY.md
for optional staging setup and restart verification.

## Prompt and context discipline

- Keep the stable task/schema guidance ahead of dynamic evidence. Never pad a
  short prompt merely to qualify for caching.
- Send only selected scenes, timed speech/OCR and detector summaries. Do not send
  full prior reports, skill bundles or the whole repository to the label model.
- Request labels and evidence references as bounded JSON. No narrative report,
  transcript repetition or requested chain-of-thought.
- Version prompts and schema together; run fixed fixtures and human-label
  evaluations when either changes.
- Record cached input tokens and thought tokens only when the provider reports
  them. Provider-specific cache parameters must not be copied across APIs.
- Keep one short AGENTS.md router. Upstream skill bundles are archived outside
  `.agents/skills` and loaded only when their workflow is relevant.

## Model decision

The requested candidate is `gemini-3.1-flash-lite`. The user chose `minimal`
thinking after the documented limitation was explained. This is not an off
guarantee. The reference full-video model remains separately configured; candidate
prices must not inherit Flash reference rates accidentally.

## Benchmark

Use the exact same labelled ads/media hashes for reference and candidate.
Compare categorical macro F1, per-field confusion matrices, speech-vs-music
errors, claims/CTA/OCR coverage and timestamp errors. Split threshold calibration
from final held-out evaluation; record versions and sample size. Report per-ad and
batch token estimates, reservations, unavailable billing, extraction time,
worker-resource cost, storage cost and escalation percentage. Do not extrapolate
from 14 ads into a guaranteed production saving.

## Current state and paused work

The deployed demo/creator work remains on `exter-test-drive`. The unfinished
Working Score/weekly-export draft is preserved on local branch
`wip/winning-workflow-before-kernel`, commit `fa9c8ed`. It is a draft, not a tested
or deployed kernel component. Do not merge it as part of this refactor by default.

## Sources checked

- [OpenAI skill and prompt guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
- [OpenAI prompting](https://developers.openai.com/api/docs/guides/prompting)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [Official public skills](https://github.com/openai/skills)
- [Gemini 3 configuration](https://ai.google.dev/gemini-api/docs/gemini-3)
- [TikTok commercial ad query](https://developers.tiktok.com/docs/en/commercial-content-api-query-ads)
- [TikTok client credentials](https://developers.tiktok.com/docs/en/client-access-token-management)

These sources support general prompting/connector design. They are not a claim
that Exter uses OpenAI's private internal development stack.
