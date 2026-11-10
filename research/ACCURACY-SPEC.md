# Accuracy and validation

Owner-approved gates, 10 November 2026. This specification extends PRODUCT-SPEC.
It supersedes its older 85% tag-agreement and 0.65 AUC thresholds. Measurement
is not validation: fixtures never establish live accuracy. No competitor gets
spend, ROAS, CPA, purchases or a recommendation-test result.

## AC-01 Facts
Compare stored public facts with the original Meta response, field by field:
identity, copy, dates, status, placements and published country/EU/demographic
reach. Missing stays missing. Target is 100% exact agreement after documented
normalisation. Retain checked counts, mismatches, excluded rows, source hashes,
collector version and check time. No fresh API call is needed. Never persist
tokens, paging URLs or provider messages in a measurement record. A source
comparison is Live only when every checked fact matches; no sample means Not
enough data. It does not prove Meta's facts are true or collection is complete.

## AC-02 Calculations
Test formulas against independent expected fixtures, including nulls, restated
days and mixed cohorts. Use shared/owned-metrics.ts, never average per-ad rates.
Persist check counts, calculation version and time. A fixture pass is labelled
Fixture-tested, not live verification. A failing calculation stays In validation.

## AC-03 Tags
Report exact agreement per field and exact model/prompt/settings/taxonomy version.
Use blind human labels tied to the same creative file. One adjudicated label per
ad, excluding uncertain human labels; missing machine values count as mistakes.
Go live at 90% agreement on at least 200 independently labelled ads per field.
Show exclusions and coverage. Never pool versions, formats or incompatible field
meanings to manufacture agreement. Person talking to camera is not person on
camera. CTA words are not CTA intent. Those fields wait for comparable labels.
Existing research tags remain Modelled, not validated predictions.

## AC-04 Prediction validation and publication
Targets stay separate: a resolved public proven winner (Working Score definition
in PRODUCT-SPEC), or beating a connected account's benchmark. Public success is
an advertiser-backing signal, not conversion probability or verified sales.
Owned targets remain within account, currency, attribution, event, product/category
and format. No sales labels can be inferred from competitor reach or longevity.

Freeze the model version, features, prior and neighbour/momentum settings before
evaluation. Train/reference ads precede the test period; their outcomes must be
resolved before it begins. Freeze features at prediction time. Test outcomes must
resolve later. Hold out complete creative families, not merely ad IDs. Test ads
cannot be their own neighbours. Require 3,000 distinct resolved test ads with
both outcomes, at least 30 advertisers for a public model, ROC-AUC >= 0.70 and
better AUC than a predeclared simple baseline. Report ties correctly and never
select the holdout after viewing its results.

Calibration: ten fixed probability bins, expected calibration error <= 0.05 and
Brier score better than the training-prevalence baseline. These are explicit
initial acceptance criteria, not measured achievements. Show bin counts and
observed rates, Brier, AUC, baseline AUC, dates, target and model version. Assess
each supported category/format/account separately; an unsupported cohort cannot
borrow another cohort's gate. Calibration and discrimination can both fail.

Internal Creative detail, Scores and sorting may show an experimental estimate
labelled **Estimated, not yet validated**. This later owner instruction permits
internal previews before the gate; client reports never include them. Every
shown estimate includes a 95% uncertainty range, similar-ad count, model version
and its validation AUC/sample (or Not enough data). No bare probability without
that context. Zero resolved neighbours still means a weak theory estimate, never
invented evidence or a validated conversion forecast. Prediction/report admission
is centralised and fails closed. Fixture/sample validation cannot release a model.

## AC-05 Recommendation test results
Record launched briefs/recommendations, not launch ads: source, account, product
or price-tier identifier, category, format, disjoint variant/control ad IDs,
inclusive dates and a primary metric locked before launch. ROAS is the default;
CPA and hook rate are alternatives. Read results only from saved owned days.
Both arms must belong to that same account/product/category/format. Unknown
membership blocks a result, including public ads. Show all three metrics.

Derive thresholds from the account's preceding 90 days within the same product,
category and format. Median per-ad CPA uses eligible ads with at least 10
purchases. Minimum spend per arm is three times median CPA; minimum purchases
10 (hook tests instead need 1,000 impressions). Run at least seven days or the
brand's longer configured purchase cycle. Show typical daily impressions and
purchases. Need at least 20 eligible comparable ads and 30 observed days to
estimate a normal swing: median absolute relative difference between comparable
ad metrics. The margin is that swing, and a bootstrap interval on the difference
between daily arm rates supplies displayed uncertainty. Observational confidence
does not establish random assignment or causation.

With too little history use spend 150 in account currency (GBP means £150),
10 purchases, 1,000 hook impressions, 10% margin and seven days; label **Default
thresholds**. Never convert mixed currencies silently. Brand Settings overrides
are scoped by account/product/category/format. Freeze the derived values, history
window, source, settings version, margin and purchase cycle on the test before
launch. Later edits cannot rewrite historical tests. Each arm must satisfy its
sample/spend/duration gate. Wait for the reporting window and attribution lag
before resolving; absent days/metrics remain pending. Restated outcomes append a
new result snapshot, preserving old results.

Improvement must exceed the frozen relative margin (lower is better for CPA).
Ties and smaller changes are resolved non-wins; unfinished or insufficient tests
are excluded. Win rate = wins / resolved tests, with denominator and Wilson 95%
interval. When ROAS is primary, flag CPA more than 20% worse than control, even
when ROAS wins. Keep the flag visible; do not hide it by changing the primary
metric. This rate measures recorded tests, not predicted conversion accuracy.

## AC-06 Experimental conversion-likelihood model
Use fixed transparent Beta evidence pooling, versioned as likelihood-v1. The
review's proposed checklist weights are 20/15/15/10/15/15/10: opening, product,
sound-independent message, offer, proof, CTA and placement. Unknown checks are
omitted with coverage. These weights do not replace the existing five-check
Creative score or the Working Score. With none assessed use a neutral 0.5 prior.
Map the assessed fraction to a deliberately weak prior of two pseudo-observations,
with probability capped to [0.1,0.9]. It is a hypothesis needing validation.

Feature snapshot: category, media format, hook, angle, offer, claim types, CTA,
UGC/face to camera, opening/product timing, captions, length, seven review checks,
and 30-day category momentum. Use stored text and visual embeddings with their
encoder version; never download models or call providers on web startup. Missing
visual/text embeddings exclude an ad from the full multimodal neighbour pool;
show the reason rather than fabricating an embedding from copy.

Find up to 50 earlier resolved neighbours in the same category and format, and
the same owned cohort when relevant. Average matching-tag similarity, text cosine
and visual cosine; use neighbours >= 0.5, weighted by similarity. Each contributes
that weight as success/failure evidence. Exclude identical creative families,
future features/outcomes and duplicate IDs. Report count, weighted winning share
and weight. The prior's fraction automatically falls as neighbours accumulate.

Momentum compares angle, hook and format shares within the same category in the
last 30 days versus the preceding 30, using only observations before prediction.
Require ten ads in each window. Mean change in share is capped at +/-0.25 and
becomes one weak pseudo-observation at probability 0.5 + change. Never treat a
growing angle as confirmed sales. Combine the three components additively in the
Beta posterior; report its mean and equal-tailed 95% interval. This is a transparent
pseudo-Bayesian evidence pool, not proof that correlated signals are independent.

Top three positive and negative drivers come from the actual assessed checks,
neighbour share and momentum; include recorded moments where available. No
fabricated positive/negative fillers. Draft scoring accepts the same saved
feature/check/embedding snapshot and calls the same function. Draft features need
analysis first; no live generation is added. Client reports use the central gate.

## Measurement records and screens
Settings > Accuracy shows each layer/field/version, current score, eligible
sample, last checked and Live / In validation / Not enough data. Empty values say
Not checked. Checks are explicit bounded requests, never expensive startup work.
Record computation versions and immutable snapshots, not a caller-supplied pass
flag or summary AUC. Import offline prediction cases, then calculate metrics on
the server. Sample mode is read-only and cannot release real gates. Preserve
existing data, collection, official reach/dates, budgets, tokens and live gates.

## Creator discovery validation

The owner-authorised UK creator workflow has two separate checks: good-fit
precision and UK precision. Both use TP / (TP + FP) against independent owner
labels in research/creator-briefs/test-set.csv. Target >=85% each, at least 20
predicted positives per field, all labels matched to current workspace results,
and the same frozen brief/rule version. Report TP/FP/FN, coverage gaps, sample,
check time and Wilson 95% intervals. Twenty positives is an initial measurement
safeguard, not proof of broad accuracy. Missing predictions do not count as correct.
Fixtures never open a client gate; refresh, deletion or a changed brief invalidates
validation. These creator gates do not lower the ad-tag or prediction gates above.

Good fit is a six-part Estimated research checklist, not a sales prediction.
Initial component maxima are niche 30, engagement 20, UK 20, style 10,
authenticity 10 and seed similarity 10. Show earned points, assessed points,
coverage and Provisional when incomplete. The skill reference defines the initial
rules and provisional tier guides. Official numbers require Business Discovery;
unsupported accounts remain Unverified. UK signals describe the creator's likely
base, never the followers' location. The labelled UK prediction is High confidence;
the labelled good-fit prediction requires no exclusions/review gaps, 12 officially
counted posts, >=80 assessed points and >=70 normalised fit. This initial classifier
needs validation; it makes no claim about commercial outcomes or fraud.
