# Creator-first discovery and public profile counts

## Purpose and big picture
Find individual creators through relevant posts, rather than category-name account
searches. Show editable brief suggestions before any paid run. Use dated public
counts for strict follower filters and tiers, with official verification separate.
Recheck saved candidates for every workspace, including the reported brand, without
another paid scrape. Preserve budgets, privacy, saved research and accuracy gates.

## Progress
- [x] 2026-11-10 UTC: clean branch from exter-test-drive 807a0ab; read AGENTS, creator skill, discovery/parser/screening code.
- [x] Implement people-first source plans and editable onboarding-based suggestions.
- [x] Preserve observed public counts/provenance and enforce strict identity/follower rules.
- [x] Recheck existing stored results without paid/provider calls; show rejection summaries.
- [x] Run fixture/browser checks and all four project checks.
- [x] Commit, push and open PR #35 against exter-test-drive.

## Surprises and discoveries
The default source plan explicitly falls back to category as an account search.
The profile parser sets all public follower/media/post engagement counts to null,
and the UI hides non-official counts. Existing rescreening on snapshot reads can
reapply a versioned rule change without new scraping. Old public counts cannot be
recovered from null fields: paid provider datasets were deleted after projection.
Do not invent those missing historical numbers or renew check dates during recheck.
No production database or provider credentials are attached. The original workspace
contains unrelated WIP and is left unchanged.

## Decision log
2026-11-10: the owner's new instructions override the skill/spec's older official-
only filtering rule. Public profile numbers are Observed, with original source/check
dates; only official checks can say Verified. Strict screening and all 85% validation
gates remain. Missing history/comment checks still require review. Source suggestions
are editable query suggestions, not confirmed social identities; never fabricate
seed creators or pad a short saved competitor set with made-up companies/handles.

## Outcomes and retrospective
Implemented source-quality plans, strict public counts, per-source provenance,
versioned no-cost saved-profile rechecks and durable stop/partial-result billing.
Affected PG fixtures pass, full infrastructure suite passes 80 tests, browser
checks pass at all four widths with zero external requests. All four requested checks pass: check, 627 unit tests, build and secrets scan.
The final creator-specific Postgres rerun also passes after the qualification update. Fixtures are not live validation or a production
rescreen claim. PR: https://github.com/beng174/Exter-AI/pull/35.

## Context and orientation
shared/creator-discovery.ts owns metrics/filters; creator-screening.ts owns strict
rules. server/creators/discovery-store.ts builds plans and versioned projections;
discovery-provider.ts sanitises provider rows. CreatorDiscoveryPage uses the existing
Creators page. The worker and existing Apify client own budgeted paid dispatch.

## Plan of work
Plan hashtag top/recent, competitor-tagged/mentioned and niche sponsored posts,
without account-name searches. Add source-aware count/post parsing and
screening, sparse-post enrichment, strong business rejection and latest version
rescreening. Build onboarding/competitor suggestions into a read-only API and the
editable brief; require the usual explicit cost estimate/run. Use the shared Results
gate for saves, exports and segments; keep uncertain genuine people in review.

## Concrete steps
Work in /tmp/Exter-creator-first on fix/creator-first-discovery. Use installed shared
dependencies, fictional provider responses and isolated local Postgres schemas.
Run npm run check, npm test, npm run build, npm run secrets:check and affected PG
fixtures. Capture Creators at 1440px and 390px with external traffic blocked.

## Validation and acceptance
Brand/shop/product handles and categories reject; real mixed founder/creator stays
review. Public low/high followers reject inclusively outside brief range; public
counts give correct tiers/median rate without claiming Verified. Genuine creators
need two person signals and all nine hard rules. Unknown counts/history reject as incomplete checks; only genuine mixed
creator-founders passing the other requirements need review. Test post-author extraction, no account-name plans, disclosed competitor sources,
suggestion editing, no provider calls during recheck, original count dates and
invalidation of stale segments/validation. Preserve official numbers and failed
refresh timestamps. Results/rejected views and counts agree.

## Idempotence and recovery
Reuse existing leases, suppression and budget/accounting. Never restart or duplicate
a paid run for rescreening. New rule versions cancel incompatible undispatched work
and clear stale validation; preserve paid holds and earlier analyses. Stored-profile
rechecks are transactional, bounded and repeatable. Keep old rejected diagnostics.

## Interfaces and dependencies
No new dependencies, paid model calls, environment keys, live switches or budget
changes. One additive stop_requested database column supports explicit stop requests. No private data, outreach, guessed follower counts or fake client readiness.

## Latest owner clarifications
Keywords only check niche; no account-name searches, including person terms.
Sources run in quality order: disclosed competitor posts, local collected-ad
identities, seed lookalikes, reused ordinary mentions, then top/recent hashtags.
Three posts among the latest twelve must match the niche; bio alone cannot pass.
Product/shop identities reject. Only genuine mixed founders passing the remaining
requirements need review. Explicit Stop search aborts that provider run, projects
partial data and settles final real usage. Temporary abort/check failures reuse
the same run; unknown charges never release a hold. Queued stops make no calls.

Browser verification found an existing brief collapse on state updates. The brief
now has explicit open state so suggested sources remain editable through quoting.
Added fixture-only 390/1280/1440/1920 checks and a reference comparison.

Latest qualification decision: use the owner's final explicit Results list.
Plausible twelve-post engagement is required. Missing historical follower/comment
observations remain unassessed in fit/risk, rather than making first-search
qualification impossible. Observed suspicious comments or jumps still reject.
This is covered by a genuine public creator with no fabricated history fixture.
