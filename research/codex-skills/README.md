# Pinned public Codex skills

Downloaded 3 November 2026 from the official public openai/skills repository,
revision `49f948faa9258a0c61caceaf225e179651397431`. The manifest records every
downloaded file's SHA-256 and upstream path. Upstream licences remain in each
bundle. No downloaded script has been installed globally or scheduled.

| Skill | Load when |
| --- | --- |
| openai-docs | Checking current OpenAI/Codex documentation or prompting guidance |
| skill-creator | Creating or changing a project skill |
| skill-installer | Explicitly installing an additional skill |
| define-goal | Turning a new objective into bounded acceptance criteria |
| gh-fix-ci | A GitHub Actions job fails |
| gh-address-comments | Addressing actual pull-request feedback |
| render-deploy | Preparing or diagnosing a Render deployment |
| security-best-practices | Reviewing credential, input or storage boundaries |
| security-threat-model | A service trust boundary changes |
| playwright | Browser verification after API/data readiness |

Bundles live under `vendor/`, outside automatically discovered `.agents/skills`.
Read the selected SKILL.md and only the references it needs. Do not attach the
archive, manifest or all skill descriptions to every Codex prompt.

The one active project skill is `exter-kernel-task`; it routes to an individual
backlog item. Public bundles are reference resources, not evidence of OpenAI's
private internal processes. Update by explicitly reviewing a new upstream revision,
diffing relevant bundles and regenerating the manifest. Do not auto-pull mutable
`main` during builds or paid analysis.
