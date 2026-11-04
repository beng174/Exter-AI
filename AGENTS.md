# Exter development

Current priority: creative analytics in research/CREATIVE-ANALYTICS-SPEC.md,
Phase 0 then Phase 1 (CA-01, CA-02). Latest user instructions take precedence.
Keep the hosted app available.

Read research/PRODUCT-SPEC.md before product work. It is the main product spec.
Treat research/CREATIVE-ANALYTICS-SPEC.md as its own-account module, not a
replacement product spec. The current module priority above remains in force.
For complex features or significant refactors, follow an ExecPlan in .agent/PLANS.md
from design through implementation. Keep it current.
Work from exter-test-drive. Target every PR at exter-test-drive, never main.
Implement only the authorised milestone. Do not run kernel:next without a request.
Preserve stored media, paid analyses and historical evidence. Avoid unrelated refactors.

## Commands

Install: `npm ci`

| Command | Exact package.json script |
| --- | --- |
| dev | `NODE_USE_ENV_PROXY=1 node --env-file-if-exists=.env --import tsx --watch server/index.ts` |
| build | `tsc --noEmit && vite build` |
| start | `NODE_USE_ENV_PROXY=1 NODE_ENV=production node --env-file-if-exists=.env --import tsx server/index.ts` |
| test | `tsx --test tests/*.test.ts` |
| check | `tsc --noEmit` |
| worker | `NODE_USE_ENV_PROXY=1 node --env-file-if-exists=.env --import tsx server/infrastructure/runtime.ts worker` |
| scheduler | `NODE_USE_ENV_PROXY=1 node --env-file-if-exists=.env --import tsx server/infrastructure/runtime.ts scheduler` |
| db:migrate | `node --env-file-if-exists=.env --import tsx server/infrastructure/runtime.ts migrate` |
| secrets:check | `node scripts/check-secrets.mjs` |
| video:analyse | `NODE_USE_ENV_PROXY=1 node --import tsx scripts/analyse-video.ts` |
| video:evaluate | `node --import tsx scripts/evaluate-video.ts` |

Before finishing run npm run check, npm test, npm run build, npm run secrets:check.

## Boundaries

Read keys only from environment variables: EXTER_ADMIN_USER, EXTER_ADMIN_PASSWORD,
GEMINI_API_KEY, META_ACCESS_TOKEN, EXTER_META_GRAPH_VERSION, TIKTOK_CLIENT_KEY,
TIKTOK_CLIENT_SECRET, EXTER_META_ACCESS_TOKEN, EXTER_META_AD_ACCOUNT_ID,
EXTER_TIKTOK_ACCESS_TOKEN, EXTER_OWNED_SYNC_ENABLED. Never log, print, commit
or put keys in fixtures.
Test with recorded fixtures; never call live or paid APIs in tests.
Route every paid call through the existing budget guard and write a cost record.
Keep Meta and TikTok not connected until their keys exist. Show source failures
with their reason. Do not turn failures into empty results.
Label numbers observed, estimated, modelled or unavailable. Show sample size,
date range and last successful check. Never claim competitor sales, conversions
or ROAS. Never show unavailable as zero. Separate samples from real records.
Keep sample data off by default, behind an explicit demo flag and clearly labelled.
Write British English, short plain sentences, no em or en dashes in user-facing copy.
Use Exter's own layout. Never use another product's screen as a reference.
Keep Gemini methods, Render plans, environment settings and budget limits unchanged
unless the user authorises that work. Never run local ML on web startup.
After pushing give exact Render steps. Workers cannot read the web service disk.

Low-cost kernel work remains paused until Phase 2. Preserve its code, tests,
research/PRODUCT-SPEC.md and research/STATE.md. Use research/KERNEL-REBUILD-PLAN.md
for kernel service/rollout decisions when requested. Record evidence and blockers
in research/STATE.md. Use existing auth, request-guard and model-accounting code.
For kernel tasks use .agents/skills/exter-kernel-task/SKILL.md; for provider docs,
CI, security or deployment use research/codex-skills/README.md and only its matching
archived skill.

## Creative analytics module

- Build only what a CA-xx ID describes in the spec; cite it in commits.
- Never name another company's product in code, comments, prompts, fixtures or
  commits.
- Never use screenshots or descriptions of other products' screens. Exter's
  own layout follows docs/BRANDING.md.
- Metric names and formulas come only from the spec's "Metric definitions".
- Follow build phases in order. The user authorised Phase 1 fixtures while the
  Phase 0 gate awaits Meta identity verification. Keep both live gates open until
  the user confirms them on Exter Media's own account. Fixtures are not live verification.
