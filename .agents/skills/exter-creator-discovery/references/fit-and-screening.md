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
UK cohorts. The later owner instruction makes implausible engagement a shortlist
exclusion. It remains a warning signal, never proof of fraud.

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
medium >=0.5, low below0.5. High also requires at least two independent UK signal families. An explicit foreign
base fails a UK brief; uncertain UK location fails qualification.
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
A known hard failure excludes the account from Results. Missing checks require
review. These signals never establish a fake-follower percentage or fraud finding.
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
Good-fit prediction for validation requires every strict rule passed, UK high (when applicable),
public or verified 12-post metrics, at least 80 assessed points and score >=70. This is not
client-ready until all three owner-labelled precision gates pass. Do not predict sales.

## Strict shortlist rules (owner update, 10 November 2026)

Every hard rule must pass. A fail means Rejected; missing hard checks mean Rejected.
Results, saves, exports and segment counts share this gate. Cards show passed
rules and remaining reasons. Never substitute a high fit score for a missing rule.

Identity requires two distinct personal signals: creator category or personal
account, personal name, first-person bio, a person described in recent posts,
or public collaboration signs. Exclude business categories, commercial name/bio
wording, shop links, shop addresses/hours, majority product-only feeds, agencies,
management, brands and repost/meme/quote/fan/aggregator/feature pages. Preserve
only coarse address/hour flags, never an address. A genuine personal creator
who also owns a shop needs human review. Unknown link destinations or insufficient
recent post descriptions fail qualification; do not add a crawl or image-model call.

Public or verified followers must be within the inclusive brief bounds. UK briefs require
High and two independent signals. Niche requires at least three
of the latest twelve posts. At least one selected content style must match.
The account must be public, outside exclusions, have at least twelve observed or verified
posts and a post within thirty days. Missing data does not count as a pass.

Provisional plausible median engagement bands (fractions of followers): nano
0.3–20%, micro 0.2–15%, mid 0.15–10%, macro 0.1–8%. These are explicit screening
assumptions, **not cited industry estimates**, and need owner-labelled validation.
Outside the band fails with possible low-quality audience/coordinated activity
wording. Do not state that an account bought followers or used a pod.

Follower history needs two same-source public or official checks 7–35 days apart, latest within 35 days.
An absolute change of at least 50% fails as a sudden-change signal. Comment checks
need at least ten comments across three of the latest twelve posts, checked within
35 days. At least half generic, emoji-only or repeated comments fails. Keep only
aggregate fractions and post IDs, not commenters or their text. The latest Results rule requires plausible engagement on twelve posts. Missing
follower history or comment audits remain Not assessed; never claim those checks
passed. Reject suspicious growth or comments whenever the observations exist.
Missing required post descriptions still rejects as incomplete checks.

Product/shop words in the name or handle reject as a
business, including fragrance, candles, home, interiors, shop, store, boutique,
co, ltd, official, studio, brand and gifts. Business categories and own-shop links
also reject. A genuine personal founder with a person in posts is a mixed case
for review. Results require at least two distinct personal signals and all nine
rules passed. Known followers outside the brief always reject, never review.

Final qualification rule: at least three of the latest twelve posts must match
the niche; the bio supplies context but cannot pass alone. Missing required inputs
reject as incomplete checks. Only genuine mixed creator-founders passing the other
requirements stay Needs review. Product/shop words include clothing, fashion,
wear, apparel and collection as well as the home-product terms above.
