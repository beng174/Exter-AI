---
name: exter-kernel-task
description: Complete one Exter backend backlog item with tests and concise progress evidence. Use for kernel refactoring, not UI design or general product questions.
---

# Exter kernel task

Run `npm run kernel:next`. Read the returned task and only its listed files.
Use `research/PRODUCT-SPEC.md` for requirement ambiguity and
`research/KERNEL-REBUILD-PLAN.md` for service-boundary decisions.

Implement one reviewable slice. Preserve the reference pipeline and paid history.
Do not run live providers without the task's existing authorization and runtime
credentials. Missing credentials stay disconnected; missing ML stages stay unavailable.

Run the task's named checks, then update its status/evidence in
`research/KERNEL-BACKLOG.json` and the short handoff in `research/STATE.md`.
Do not mark a fixture-only adapter as live-verified. Stop only the dependent work
when a real blocker appears, and continue independent ready work.

Before push, run the relevant tests, type check/build and secret scan. Report the
commit, validation, remaining blockers and exact Render steps. Do not reload all
specs, archives, reports or skills for every small change.
