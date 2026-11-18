# Media preview handoff recovery

## Purpose and big picture
Restore automatic preview collection for newly collected brands. Diagnose the
"Never requested" state without production access or live provider calls. Keep
existing provider budgets, per-run caps, files, official dates and reach unchanged.

## Progress
- [x] 2026-11-18 UTC: trace collection-to-media handoff and worker refill.
- [x] Reproduce missing handoff during a multi-page collection and a busy worker.
- [x] Fix automatic queueing while preserving paid-call guards and checkpoints.
- [x] Make missing-preview text honest and actionable; verify retained images render.
- [ ] Run all four checks and integration fixtures; open PR and verify CI.

## Surprises and discoveries
Collection hands ads to media only when the entire collection run completes.
Media worker refill occurs only when no job exists or a run terminates. A new
watchlist can therefore remain unqueued while an older paid run stays active.
The preview tile promises "During this backfill" even for an ad never queued.
Creatives stops polling when the index finishes even if previews are still pending.

## Decision log
2026-11-18: enqueue media after a successfully committed collection page, and
check for new work periodically even while other brands have active runs. Reuse
the existing 500-ad selector and budget/disk guards; no read-time paid dispatch.

## Outcomes and retrospective
Handoff and busy-worker fixtures passed. Four retained PNGs decoded in a browser,
with one automatic refresh after 30 seconds and no external requests. The PR records final command and CI results. Browser screenshots cover 1440px
and 390px; mobile captures scroll to the cards. The screenshot's precise production cause is not
verified; report proven code paths and keep configuration failures diagnosable.

## Context and orientation
server/infrastructure/jobs.ts advances one official collection page. Media queue
selection and disk/provider budget guards are in server/ad-media/jobs.ts. The
diskless worker calls the authenticated web step through ad-media/api.ts.
AdPreview and media diagnostics display controlled per-ad states.

## Plan of work
1. Add fixtures for saved pages before collection completion and a new brand
   appearing while a previous media run is still active.
2. Repair handoff/refill and preserve failure isolation and retry constraints.
3. Show a useful copy tile and a real collection action instead of implying that
   unqueued previews are loading. Verify images after fixture worker completion.

## Concrete steps
Use fix/media-backfill-handoff from exter-test-drive. Install pinned dependencies,
use a disposable Postgres fixture, and run npm run check, npm test, npm run build,
npm run secrets:check and npm run test:infrastructure. Never call live providers.

## Validation and acceptance
A committed partial collection page queues its ads. A busy media worker discovers
new brands without waiting for the current paid run to finish. Paused/uncertain
paid starts never dispatch twice; retry/day, cap and budget tests remain intact.
Previously retained previews render in the same cards. No fake coverage claims.

## Idempotence and recovery
Queueing is idempotent per watchlist. Commit official history before enrichment;
a failed enrichment handoff never repeats an official request. Existing worker
failure diagnostics/backoff remain authoritative. No evidence is deleted.

## Interfaces and dependencies
No new provider, secret, price or per-run cap. Keep Render switches unchanged.
Production rollout details and actual test results will be recorded on the PR.
