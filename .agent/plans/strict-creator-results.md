# Strict creator results

## Purpose and big picture
Only individual creators who pass every brief rule enter Results. Keep uncertain
accounts in Needs review and clear failures in Rejected, with reasons and counts.
Add the individual-creator precision check without relaxing existing client gates.

## Progress
- [x] 2026-11-10 UTC: read repository rules, the discovery skill and current pipeline.
- [x] 2026-11-10 UTC: implement pure strict rules and privacy-safe public screening inputs.
- [x] 2026-11-10 UTC: enforce dispositions across storage, results, segments, exports and accuracy.
- [x] 2026-11-10 UTC: add review/rejection views and rule explanations; update skill/spec guidance.
- [x] 2026-11-10 UTC: fixture/database/browser verification and all four checks pass.
- [ ] Publish the reviewed changes as a PR against exter-test-drive.

## Surprises and discoveries
PRs #28 and #29 are merged into exter-test-drive at 6649ea0. Existing Results
filters only remove explicit exclusions; a missing rule or high fit can still pass.
New rejected observations are discarded, so counts/negative-label validation need
minimal rejection records. Existing paid/public history must remain intact.
Postgres JSONB changes object key order; the brief digest now hashes explicit
fields so a valid new search is not mistaken for an obsolete rule version.

## Decision log
2026-11-10: later owner rules override the initial skill. A shop-owning individual
with two personal signals is Needs review, even with commercial signals. Clear
business/repost pages fail. Missing official metrics, comment quality or growth
history cannot pass. No new image/model requests or shop crawling are introduced.
UK high requires two independent signal families. Niche passes on a matching bio
or three of the latest 12 posts. Tier plausibility bands are explicit provisional
screening assumptions, not measured fraud probabilities. Agency/management pages
cannot use the shop-owner exception; that requires a personal name, a person in
posts and explicit shop ownership. A newer rejection cannot be replaced by an
older retained profile during completion, partial rediscovery or daily rechecking.
Minimal rejection records keep official follower checkpoints for future growth
checks without replacing earlier profile history. No feature score can
compensate for a failed or unknown hard rule.

## Outcomes and retrospective
Pure screening, exclusive lists, API saves/exports/segments and the local
Postgres fixture pass targeted checks. Browser views pass at 1280, 1440, 1920 and 390px, with no page overflow or
uncertain account in Results. Screenshots are in docs/review/strict-creators/.
npm test passes 574 tests. npm run check, npm run build and npm run
secrets:check pass. The separate Postgres integration passes, including the
actual Accuracy endpoint and newer rejection/older profile regression.
Final publication verification is repeated after staging.
Fixture success never establishes live precision or proves authenticity.

## Context and orientation
shared/creator-discovery.ts owns metrics and fit; a new shared strict-screening
module will own rule decisions. server/creators owns public projection, official
verification, Postgres storage and jobs. CreatorDiscoveryPage hosts cards/tables.
Accuracy already reads creator precision; test-set.csv currently has four columns.

## Plan of work
1. Version screening and add per-rule pass/fail/review, personal signals and reject groups.
2. Capture category, coarse commercial flags, alt text and aggregate comment quality.
3. Rescreen saved data without provider calls; retain minimal new rejection records.
4. Make result, review and rejected views exclusive; restrict saving/export/segments.
5. Extend labels and gates to three precision checks, requiring business/repost negatives.

## Concrete steps
Use an isolated worktree from exter-test-drive. Run npm run check, npm test,
npm run build and npm run secrets:check. Run the existing local Postgres fixture
against its own random schema. Use no live providers or real labels.

## Validation and acceptance
Fixture coverage includes businesses, all repost types, creator/shop ambiguity,
genuine creators, every hard failure, unknown inputs and tier/UK/niche boundaries.
Check API filtering, stored legacy results, rejection counts, CSV/segments and
negative-label gate. Inspect Creators at desktop/mobile using fictional fixtures.

## Idempotence and recovery
Versioned rescreening runs under the workspace lock, invalidates old validation
and never calls a provider. Preserve existing profile/paid history; new rejections
keep only minimal diagnostic fields. Deletion removes rejection records too.

## Interfaces and dependencies
No new dependency, budget increase, live calls or model. Existing public actor and
Graph clients retain their guards. Extra public fields are optional; absence means
review. Legacy CSVs remain readable but cannot release the new individual gate.
