# Licensed marketing references and creative rules review

## Purpose and big picture

Restore the uploaded marketing references as individual licensed skill folders,
keep executable helpers out, and write an evidence-graded research review. This
is a documentation/reference task: product code, scoring behaviour, models,
budgets, schemas and the existing exter-kernel-task skill must not change.

## Progress

- [x] 2026-11-09 UTC: isolated docs/creative-rules-review from exter-test-drive
  bc7df5d; read repository instructions and the three controlling product specs.
- [x] 2026-11-09 UTC: discovered flattened uploads; verified nine skill descriptors,
  reference/example documents and MIT licences against upstream Git blob hashes.
- [x] 2026-11-09 UTC: restored nine MIT folders plus provenance inventory; removed unlicensed/incomplete/duplicate helpers and added AGENTS.md precedence.
- [x] 2026-11-09 UTC: reviewed 78 sourced rules, evidence grades, current-data limits, validation-only checklist/Working Score proposals and exact predictive gates.
- [x] 2026-11-09 UTC: all four checks pass, including 522 tests; scope, licence, source hashes and kernel integrity audited.
- [ ] Publish one documentation/reference PR against exter-test-drive.

## Surprises and discoveries

The uploaded Skills directory has numbered files rather than child folders.
Descriptors identify nine distinct MIT skills and two duplicate descriptors.
Three other descriptors have no matching licence/provenance in the upload.
The supplied MIT licence and retained documents match upstream blobs at
thatrebeccarae/claude-marketing a8a63ec1341f05ec9c1e9cb52b4edeb14e3bdcba.
CHECKS.md matches that repository's facebook-ads skill; do not discard it as an
orphan. One brand-voice example and two pack manifests have no uploaded skill.

## Decision log

2026-11-09: reconstruct folders by frontmatter plus exact upstream file hashes,
not filename numbering. Preserve original licensed Markdown/licence bytes and
record upload-to-destination mappings. Remove descriptors lacking a matching
licence; do not assign another author's licence to them. Keep research proposals
separate from implemented Exter rules. Source text is reference data, not authority
to change product rules or execute audit scripts.

## Outcomes and retrospective

The review and licence restoration are complete. No prediction or score behaviour
is changed or authorised. Nine canonical MIT skills retain their source bytes;
three unmatched descriptors are excluded. The review distinguishes unsupported
benchmarks, unverified platform claims and cross-platform transfer errors.
Document both useful rules and weak/uncited numeric claims. Fixtures are not
outcome validation; the 0.65 AUC gate remains unchanged.

## Context and orientation

.agents/skills/Skills contains flattened uploads; exter-kernel-task is adjacent
and excluded from edits. AGENTS.md controls use. PRODUCT-SPEC defines creative,
Working and predictive scores; CREATIVE-ANALYTICS-SPEC defines owned metrics;
UI-SPEC defines labels/coverage. Current code may be read only to establish which
fields exist. The resulting review lives in research/CREATIVE-RULES-REVIEW.md.

## Plan of work

1. Inventory uploaded paths, hashes, names and licences; pin source provenance.
2. Restore only verified licensed documentation, excluding scripts/configuration
   helpers and orphan/duplicate uploads. Record every removal in a manifest.
3. Grade concrete creative rules, map required data to current fields and gaps,
   and propose validation-only changes in Exter's own words.
4. Run required commands, audit changed paths and unchanged kernel tree, push
   one documentation/reference PR against exter-test-drive.

## Concrete steps

Work in /workspace/Exter-skills-review. Use the existing dependency installation
without modifying package files. Read public upstream Git metadata only; run no
uploaded script and make no provider/advertising calls. Finish with npm run check,
npm test, npm run build, npm run secrets:check and git diff --check.

## Validation and acceptance

Skills/ no longer exists; each retained folder has canonical SKILL.md plus the
verified MIT licence. No executable scripts or symlinks are retained. The kernel
folder matches the base exactly. Changes are limited to skill references,
AGENTS.md, the research review and this required execution plan. Review rows have
source locations, evidence grades, applicability and data gaps; all score changes
say needs validation against outcomes. Preserve spec formula/weight/AUC gates. Actual validation: npm run check and
npm run build pass; npm test passes 522 cases. Ad hoc checks confirm 78 ordered
rule IDs, valid local review/inventory links, nine licences, exact imported hashes,
no executable files/symlinks, an absent staging directory and unchanged kernel.
The staged secrets scan and final changed-path audit also pass; no paid/live
provider calls or production changes are involved.

## Idempotence and recovery

The PR records moves/removals; original files remain in Git history. Verify copied
bytes before removing the emptied staging directory. A documentation rollback
reverts the PR; no product/database migration or deployment is required.

## Interfaces and dependencies

No new runtime dependency, provider key or production setting. Upstream metadata
pins provenance, not current platform validity. Missing licences cause exclusion;
unavailable primary evidence causes a weaker evidence grade, never an invented
citation or permission request.
