# Exter development

Current priority: the low-cost backend kernel in research/PRODUCT-SPEC.md.
Latest user instructions take precedence. Keep the working hosted app available.

Use `npm run kernel:next` for one ready task. Read its listed files, not the
entire backlog or all skills. Update research/STATE.md with evidence and blockers.
Use research/KERNEL-REBUILD-PLAN.md for service-boundary or rollout decisions.

Never log, print or commit credentials. Keep Gemini calls in Render. API statuses
must stay disconnected when required credentials are absent; fixture tests are
not live-provider verification. No browsers or local ML models on web startup.
Preserve retained media and immutable paid analyses. Unknown data stays unknown.

Use existing budget, auth, request-guard and model-accounting code. Test the changed
contracts; run required checks before pushing. After each push, give the user exact
Render steps. A worker cannot read the web service's private disk automatically.

For a bounded backend task use .agents/skills/exter-kernel-task/SKILL.md.
For provider docs/CI/security/deployment, consult the short catalogue at
research/codex-skills/README.md and load only the matching archived skill.
