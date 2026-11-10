# Accuracy and conversion likelihood

## Purpose and big picture
Add measurable accuracy gates, account/category-specific recommendation tests and
an experimental conversion-likelihood model. The owner's later model request
extends the original measurement-only scope. Public targets are public winner
signals, never competitor sales. Estimates remain outside client reports until
validated on newer outcomes. No live model calls, training on web startup or new
dependencies.

## Progress
- [x] 2026-11-10 UTC: inspected specs, labelling, owned formulas and screen routes.
- [x] 2026-11-10 UTC: isolated latest exter-test-drive in feat/accuracy-framework.
- [x] 2026-11-10 UTC: specification, pure measurement/model contracts and fixtures passed.
- [x] 2026-11-10 UTC: additive history, scoped APIs and five UI surfaces verified.
- [x] 2026-11-10 UTC: check, 540 tests, build and secret scan passed before base refresh.
- [x] 2026-11-10 UTC: five screens verified at 1280/1440/1920/390; sample isolation passed.
- [ ] Merge latest base uploads, repeat required checks and open PR against exter-test-drive.

## Surprises and discoveries
The main spec still says 85% tag agreement and AUC 0.65. The owner's new 90%
and 0.70 gates supersede them. No trained prediction or complete public Working
Score exists. Current prediction preview has null probability. Human reviews
have seven fields, but person-on-camera and CTA intent do not match machine
fields exactly. Missing fields cannot become invented agreements. The reviewed
seven-check weights are research proposals, not calibrated effects.

## Decision log
2026-11-10: use append-only web SQLite measurement/test records, with existing
Postgres owned days read through scoped queries. Keep historical rows and paid
analyses. Freeze thresholds at launch. Primary metric is locked before launch,
ROAS default, CPA or hook rate optional, per owner's confirmed answer. Calibrate
thresholds within account/category/format/product; default values are labelled.
Latest base discovery: two owner upload commits (2ac4d36, 0a34daf) add reference
documents only; preserve them verbatim. The later request permits internal experimental outputs labelled Estimated, not
yet validated. Only passed models may appear in client reports. Sample results
never pass real gates. Never invent a public outcome where Working Score is absent.

## Outcomes and retrospective
Implemented measurement and the subsequently authorised experimental model.
540 fixture tests passed before the final base refresh. Browser assertions passed
for Accuracy, Scores, Creative detail, Creatives and Winners at four widths.
No external request was attempted. No real model has been validated. Drafts
require analysed feature JSON, and multimodal neighbours require saved,
version-matched embeddings and mature outcome labels. Automatic previews are
conservative and always experimental without those inputs. No provider calls,
model downloads, training on startup, budget/switch changes or live verification.

## Context and orientation
shared/owned-metrics.ts owns ratios and minimum formula samples. Human labels and
native analyses live in server/labelling and server/video or server/image tables.
server/demo/creative-browser.ts reads real public and owned data. UI uses grouped
src/navigation.ts and shared ui components. The new Accuracy screen has no
approved reference image; follow Data sources' shared header/table geometry.

## Plan of work
1. Specify AC-01 facts, AC-02 calculations, AC-03 tag agreement, AC-04 temporal
   prediction gates, AC-05 recommendation outcomes and AC-06 experimental model.
2. Pure evaluators, uncertainty, time-safe neighbour inference and threshold snapshots.
3. Add bounded, authenticated measurement/test APIs and append-only storage.
4. Build Accuracy settings, results form and experimental prediction surfaces.
5. Fixture/API/render tests, all required checks and screenshots.

## Concrete steps
From /workspace/Exter-accuracy use npm run check, npm test, npm run build and
npm run secrets:check. Use local SQLite and injected Postgres fixtures only.
Capture Settings Accuracy, Scores and Creative detail using an isolated fixture
server; never configure provider secrets or dispatch paid requests.

## Validation and acceptance
Test AUC ties, calibration, temporal/family leakage, sample minimums, per-field
agreement, missing facts, every owned cohort boundary, frozen thresholds,
CPA guardrail, pending results, neighbour leakage, decaying prior, uncertainty,
draft parity, client-report exclusion and sample isolation. Show current score,
sample size, date and status without turning missing measurements into zero.

## Idempotence and recovery
Schema creation is additive. Tests/results are append-only; latest results
supersede earlier snapshots without deleting them. No provider/sync writes.
Rollback code leaves history intact. Request/version hashes prevent accidental
duplicate measurement writes. Invalid or incomplete model artefacts fail closed.

## Interfaces and dependencies
No new dependencies, tokens, Render switches or budget changes. New shared
contracts own accuracy/prediction/test maths. Existing owned metrics and creative
checklist remain unchanged. Experimental model accepts saved features/embeddings
only; absent visual embeddings or unresolved outcomes stay missing. Validation
is per model version, target, category/format and owned-account cohort.
