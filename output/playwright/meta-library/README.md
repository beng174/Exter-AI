# Meta library activation: fixture review

These screenshots use fictional response fixtures, never live verification.
No fixture is written to the production database. The app screenshot is on the
left and the approved reference is on the right in each comparison image.

- Main, Competitors, Creatives, CreativeDetail, Audience and DataSources: 1440px
  app/reference comparisons. The six affected screens also pass at 1280px,
  1920px and 390px, including both Page ID editing entry points, Escape and a
  metadata-only save. External browser requests are blocked.
- Watchlist: desktop and mobile dialog images. Metadata edits do not collect ads.
- alignment-audit.json: all 90 existing real/sample screen and width cases pass,
  with no overflow or alignment failures. Provider transports are disabled in
  the preview. The prior alignment baseline images remain unchanged.

Reproduce the affected-view check from the repository root:

1. npm run build
2. node --import tsx tests/fixtures/m1-server.ts
3. In another terminal: python3 tests/ui_meta_library_browser.py

Kept differences from the sample reference:

- Fictional fixture names, three brands, three creatives and actual fixture
  coverage replace the reference's illustrative values. Missing media, owned
  outcomes, customer evidence and scores keep their existing truthful gates.
- Reach-based share of voice is labelled Estimated. It sums published lifetime
  UK reach from saved observations and does not imply weekly impressions or sales.
- Audience keeps the brand-by-age table. It shows published reach counts rather
  than percentages with an unknown complete demographic denominator. Only
  published age bands and female reach appear; targeting is not inferred.
- The existing Meta source row opens a Page ID dialog. No additional page section
  is added. The source health, date and time shown here are fixtures.
- Public reach is shown on cards and in Performance as Observed. Snapshot media
  is not downloaded by the API; existing retained media stays attached.

Validation: npm run check, npm test (430 passed), npm run build and the five
Postgres infrastructure/activation integration fixtures pass. npm run secrets:check
also passes after staging every new file.
