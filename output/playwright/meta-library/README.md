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

## Page suggestions follow-up

The four page-suggestions-{competitors,data}-{1440,390}.png images show the shared
editor with fictional candidate responses and local fixture pictures. They are
not live verification. Candidate website matches outrank a higher-ad-count exact
name match. The browser check verifies a shared-rate wait, pictures, three
suggestions, both entry points, no watchlist write before Confirm, a single
selected-brand write on Confirm, and manual entry as a separate save.

Current follow-up validation: 441 unit tests, six disposable Postgres cases, and
24 affected screen/width checks plus four candidate entry/width checks pass.
The prior 90-case alignment audit remains the earlier PR #14 validation; the
follow-up changes the editor only. No external requests were allowed.

Suggestions have explicit partial coverage and a Search more ads action. They
never enter collected-ad records. Profile previews have monogram fallback and
use the existing bounded local raster store. Page ID assignment still requires
Confirm or manual save; live collection remains default off.
