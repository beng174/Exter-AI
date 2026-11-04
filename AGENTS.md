# Exter development

Current priority: creative analytics in research/CREATIVE-ANALYTICS-SPEC.md,
Phase 0 then Phase 1 (CA-01, CA-02). Latest user instructions take precedence.
Keep the hosted app available.

Low-cost kernel work is paused until Phase 2. Preserve its code, tests,
research/PRODUCT-SPEC.md and research/STATE.md. Do not pick kernel tasks or run
`npm run kernel:next` unless the user asks. Record evidence and blockers in
research/STATE.md. For kernel service/rollout decisions use
research/KERNEL-REBUILD-PLAN.md.

Never log, print or commit credentials. Keep Gemini calls in Render. Missing
credentials mean disconnected API status; fixtures are not live verification.
No browsers or local ML models on web startup. Preserve retained media and
immutable paid analyses. Unknown data stays unknown.

Use existing budget, auth, request-guard and model-accounting code. Test changed
contracts; run required checks before pushing. After each push give exact Render
steps. Workers cannot read the web service's private disk automatically.

For kernel tasks use .agents/skills/exter-kernel-task/SKILL.md. For provider
docs/CI/security/deployment, read research/codex-skills/README.md and load only
the matching archived skill.

## Creative analytics module

- Build only what a CA-xx ID describes in the spec; cite it in commits.
- Never name another company's product in code, comments, prompts, fixtures or
  commits.
- Never use screenshots or descriptions of other products' screens. Exter's
  own layout follows docs/BRANDING.md.
- Metric names and formulas come only from the spec's "Metric definitions".
- Follow build phases in order; live-account gates must pass before advancing.
