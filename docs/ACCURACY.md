# Accuracy operations

Settings > Accuracy reads stored checks only. **Check saved data** compares up to
1,000 latest official records with their saved Meta payloads, runs independent
formula fixtures and compares blind human labels with matching video files. No
source requests, model downloads, collection or paid analysis happen here.
Source facts without original payloads cannot be checked. Date/status/identity,
reach and a hash of all original fields (including copy) are checked separately.
This is storage integrity, not an independent audit of Meta's published numbers.

The web's SQLite database gets additive `accuracy_records` and
`likelihood_estimates` tables on startup. Measurement, settings, experiment and
result records are append-only. Repeated identical writes are idempotent. No
Postgres migration, secret, worker/scheduler change or Render switch is required.
The web reads existing scoped `owned_accounts` and `owned_ad_days` through
DATABASE_URL. Failures preserve all earlier checks. Back up the existing web
database as usual; workers do not read its disk.

## Record a recommendation test

Connect and sync the **owned** account first. In Accuracy > Test settings choose
account, category, product/price tier and format. Confirm each variant/control ID
belongs to that group, then lock the primary metric and dates before launch.
Confirmation is the owner's product/format annotation, not an automatic discovery
of what a product costs. Public competitor IDs are rejected unless they also
exist as actual ads in that exact owned account. Source ID links the recorded
experiment to the saved brief or recommendation; recording does not launch ads.

The previous 90 days determine median CPA, typical daily volume and normal
metric swing only where enough comparable, annotated ads exist. Twenty eligible
ads and thirty observed days are required. Otherwise the displayed defaults
apply in the account currency. High-priced products need a longer purchase cycle
set in the scoped brand overrides. **Save thresholds** affects future tests only.
An empty override resets future tests to automatic. A changed category/product
mapping cannot silently produce a mixed comparison; results fail closed.

**Read saved results** reads existing owned days and appends a result snapshot.
All three metrics remain visible. Latest restatements supersede previous results
in win rate, without deleting them. Wait until the end date plus the frozen
attribution lag. Each ad needs the frozen spend/sample/duration requirements.
The paired-day bootstrap uses 500 deterministic resamples; its confidence is
descriptive, not evidence that the test was randomised. CPA guardrail is separate
from the primary metric's win. No competitor test results are accepted.

## Offline model evaluation

The new model is a transparent, weak-theory Beta evidence pool. Existing Creative
score and Working Score weights do not change. Public Working Score labels must
exist and be mature before they can be used; duration alone is not a winner
label. Owned labels must come from a frozen account benchmark comparison. There
is currently no connected resolved training set, so no model is declared live.

Prepare JSON with `workspaceId`, `dataSource`, `reference`, `market`, `holdout`,
`referenceEnd`, `holdoutStart`, `holdoutEnd`, `checkedAt`, `trainingPrevalence`.
`dataSource` defaults to `fixtures` in the offline evaluator and cannot release
a real model. Only audited real outcomes may use `public-observations` or
`owned-outcomes`.

Reference entries are `{features,outcome,resolvedAt}`; holdout entries add
`baseline` (the predeclared simple baseline's probability). `outcome` is 0 or 1,
not a reach-derived sales claim. `features` follows `LikelihoodFeatures` in
shared/likelihood.ts and the strict schema in server/accuracy/schemas.ts. Use
ISO UTC timestamps and one target/category/format/owned cohort per file.
Owned `accountCohort` is JSON text containing exactly `[platform, accountId,
currency, attribution, conversionEvent, productOrPriceTier]`. Confirm the owned
ad group first; saved owned IDs use `owned:<workspace>:<platform>:<account>:<ad>`.
Public features use a null owned cohort. Unknown product groups cannot validate. All
reference outcomes resolve before the untouched holdout starts. Group creative
families before splitting; holdout families must not occur in reference data.

Feature fields: ad/family/advertiser IDs, category, media format, snapshot time,
target, owned account cohort (or null), hook/angle/offer/claim types/CTA,
UGC/face-to-camera, hook/product seconds, captions, duration, the seven review
checks and version-matched text/visual embeddings. Use null for unknowns.
Do not fabricate an embedding, proof check, caption judgment or product time
from the presence of ad copy. Checks carry `{met,reason,seconds?}`. The reason
uses Exter's own short wording. Market entries carry ad ID, category, format,
angle, hook and first-seen time. Only earlier observations enter momentum.

Run locally, with no provider credentials:

```sh
node --import tsx scripts/evaluate-likelihood.ts /path/input.json /path/validation.json
```

The evaluator uses the same function as draft/ad scoring, computes predictions
offline, checks temporal boundaries and writes an artefact with an input hash.
Import it under Accuracy > Offline model checks. The authenticated import API
computes AUC/calibration from the per-ad cases, never accepts a passed flag, and
verifies reference membership/boundaries. The owner must audit outcome provenance
and a predeclared baseline before importing real data; an arbitrary JSON file
cannot establish genuine empirical accuracy. Keep fixture artefacts outside real
workspaces. Do not tune thresholds on the holdout.

For saved ads, POST `/api/accuracy/score-ads` with workspaceId and at most 20
prepared feature snapshots per batch. Ads must exist in that workspace. Store
embeddings/feature preparation offline; no provider action is added. Predictions
then appear in Creative detail and can be sorted in Creatives/Winners. The
automatic conservative preview uses only checks supported by current analyses;
without embeddings it is always experimental, even if another full-feature run
passed. Missing category/format/analysis produces no probability.

Scores > Score a draft accepts one analysed feature JSON and calls the identical
function through `/api/accuracy/estimate`. Raw video/image upload analysis remains
in the existing analysis flow. Drafts are not inserted into the ad database.
Reports have no estimate feed; future report integrations must call the central
`predictionForReport` admission function. Sample mode is read-only and cannot
import, score, launch or validate anything in a real workspace.

Fixtures are not live verification. No AUC, calibration or recommendation lift
claim is made by the test suite.
