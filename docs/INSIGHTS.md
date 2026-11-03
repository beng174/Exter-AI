# Reading the creative evidence

The Overview is arranged as sample counts, a creative landscape, owned conversion
results and creative tests. The Content library contains the brand's saved ads;
Competitors contains a side-by-side comparison; Audience & voice uses the same
retained native analyses. The client report shares these views.

The layout takes its ranked list and treemap pairing from the public
[Defy Monitor example](https://www.defygroup.ai/assets/img/shot-monitor.jpg).
The evidence-to-brief workflow follows the public
[Somin brand reference](https://somin.ai/somin-for-brands/). These are design and
workflow references, not independently verified performance claims. Exter keeps
its own visual system.

## Counts and charts

- Hooks, angles, offers and formats have a treemap/bar toggle. Every segment
  shows its observed ad count and its share of the full analysed sample.
- Current fixed labels stay unchanged. Earlier free-text analyses are grouped
  into explicitly identified description themes for navigation, using the
  deterministic rules in `shared/creative-insights.ts`. This projection does not
  create a new model label, spend budget or rewrite an original paid analysis.
- `Not recorded` remains part of the denominator. Two recorded offers in a
  14-ad sample appear as two described ads and twelve unknown ads, not 100%
  coverage or an assertion that the other twelve contain no offer.
- Original descriptions and citations are available in a disclosure. Selecting
  a known chart segment opens its supporting ads. Null source links cannot
  match unrelated ads.
- Audience needs and messaging styles are text-based reading aids over saved
  supported model fields. Each ad enters one group per chart, using the first
  matching rule. These counts describe ads, not measured people, demographic
  populations, targeting or reach. Supplied audience labels can overlap and
  therefore use bars rather than a population treemap.
- Competitor columns retain their own sample denominators. Uncollected or
  unavailable competitors stay unavailable. The existing authorised collection
  campaign remains specific to Valentte; this change does not authorise a new
  collection campaign for arbitrary brands.

## Owned conversion results

The read-only, authenticated `/api/brands/:brandId/demo/intelligence` endpoint
reads saved workspace records, voice and audience labels. It never starts a
collector, downloads media, calls a model or writes data.

Only non-sample records marked owned, from import or live sources, with available
conversion counts enter the performance panel. Public library records and
competitor records cannot establish conversions. Zero conversions are retained.

Use Data sources > Download template to prepare authorised owned-account rows.
Supply the actual `providerAdId`, `metricDate` (YYYY-MM-DD), `currency`,
`conversionEvent`, `conversions` and `spend`; add `revenue` for ROAS. Template
figures are illustrative and must be replaced. Existing imports without reporting
metadata remain visible but are not presented as a comparable cost ranking.

Comparisons are separated by platform, reporting day, currency and conversion
event. For repeated observations of one native ad on the same day, only the latest
saved snapshot is counted. CPA pairs spend and conversions from the same records;
zero conversions have no finite CPA. ROAS requires positive spend and recorded
revenue. The source attribution settings must also match before making budget
decisions. These are reported outcomes, not statistical proof of incremental lift.

## Validation

`npm test`, `npm run build`, and `npm run secrets:check` cover the changed data
contracts and existing application. `python tests/insights_browser_smoke.py`
checks 14 earlier analyses, 12 unknown offers, chart switching and source-ad
navigation, audience routing and supplied voice, comparison samples and missing
competitors, conversion CPA/ROAS, the client report, 1024px and 390px layouts.
Its in-memory records are fictional test fixtures, not production observations.
No live-provider or actual Render-database verification is implied by these tests.

## Render rollout

Merge the reviewed change into `exter-test-drive`, the branch configured in
`render.yaml`. In Render, open the existing `exter-ai` web service and select
**Manual Deploy > Deploy latest commit** (or verify its automatic deployment).
Keep its existing persistent disk, database, secrets and disabled kernel stages.
This UI/reporting change needs no worker redeployment, model run, new paid
analysis, new environment variable or destructive data migration.

After deployment, select the brand and check Overview, Audience & voice,
Competitors and Content library. Refresh the page to load the new assets. The
charts use the retained production analyses; absent performance data requires an
authorised account import. Deploying the UI cannot manufacture private results.
