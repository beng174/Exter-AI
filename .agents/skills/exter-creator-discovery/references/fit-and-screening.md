# Screening and fit

## Engagement context by follower tier

The uploaded sources supply a rough 1–3% engagement range and say smaller accounts
usually have higher rates. They do not establish UK, niche-specific medians under
our median-of-12 formula. The following are explicit Exter **starting assumptions**,
not measured industry facts or validated thresholds. A brand brief overrides them.

| Tier | Starting comparison rate |
| --- | --- |
| Nano | 3% |
| Micro | 2% |
| Mid | 1.5% |
| Macro | 1% |

Compare like platform, tier, niche, post type and dates. Recalibrate from labelled
UK cohorts. Low engagement alone is neither an exclusion nor proof of fraud.

## UK location

Estimate the creator's likely base, never the nationality or location of followers.
Show which signals contributed. Explicit UK-based bio wording is stronger than
travel captions; UK places need repeated dated posts. A .co.uk website and British
spelling are weak hints. They cannot establish UK residence alone. Conflicting
explicit countries lower confidence and trigger review. Never infer location from
name, appearance, ethnicity, religion or accent.

Initial deterministic rule: explicit UK base = 0.8; add 0.1 for repeated UK places,
0.05 for a .co.uk link and 0.05 for UK spelling, capped at 1. Without explicit base,
repeated UK places = 0.5, domain/spelling add 0.1 each, capped at 0.7. No signal
means unknown, not zero confidence. Explicit foreign base with UK travel means
conflict/low confidence; do not let weak UK signals override it. High >=0.8,
medium >=0.5, low below0.5. Default UK shortlist requires high; others await review.
These confidence numbers are heuristics, not calibrated probabilities.

## Niche, style and authenticity

Match declared category/keyword terms against public bio and recent captions;
show matched terms. Classify public content as UGC, talking to camera, tutorial,
aesthetic or lifestyle only when a caption, transcript or analysis supports it.
A face in an image does not prove talking to camera. Missing analysis is Unknown.
Text-only classification is Estimated; do not imply visual inspection occurred.

Possible risk signals: abrupt follower changes across dated snapshots; repeated
near-identical short comments from the same group across several posts; extreme
like/comment imbalance; copied content; repeated irrelevant promotional comments.
One signal is a review flag, not fake-follower percentage or a fraud finding.
Comment-pod checks require cross-post comment samples; growth checks require at
least two dated snapshots. If these are absent, say authenticity is not assessed.
Do not penalise language, age, identity, camera cost or editing polish.

## Six-part fit checklist

The owner requested a visible 0–100 checklist. Initial weights below are Exter
implementation assumptions needing validation, not borrowed performance guarantees.

| Component | Maximum | Deterministic contribution |
| --- | --- | --- |
| Niche | 30 | Fraction of configured category/keyword terms matched, capped at 1 |
| Engagement | 20 | Median engagement / the tier comparison rate, capped at 1; full 12-post sample required |
| UK | 20 | Location heuristic above; not assessed outside a UK brief |
| Style | 10 | Fraction of requested styles supported by available content text |
| Authenticity | 10 | Assessed risk screen: no flagged pattern =10; a flagged pattern =0; absent audit data =not assessed |
| Seed similarity | 10 | Best Jaccard overlap of public niche/style word sets with a fetched seed profile; no fetched seed =not assessed |

Show earned points, assessed maximum and coverage. Normalise only assessed points
for the displayed score and always say Provisional below full coverage. Never give
missing authenticity or an unfetched seed free points. Exclusions override the score.
Good-fit prediction for validation requires non-excluded, UK high (when applicable),
verified 12-post metrics, at least 80 assessed points and score >=70. This is not
client-ready until both owner-labelled precision gates pass. Do not predict sales.
