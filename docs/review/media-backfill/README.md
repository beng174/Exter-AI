# Preview coverage and Winners review

The supplied production figures identify a coverage problem. This environment has
no production database, provider credentials or saved production datasets. All
verification is fixture-only; no live lookup, scrape or backfill was run here.

## Confirmed code causes and fixes

- Fresh/newest ordering put long-running ads behind newer ones. First batches now
  include the longest-running 50, then high UK reach and active ads, followed by
  days running. A 15,000-ad database fixture drains 30 batches without waiting a
  day. Its longest-running 50 are all in the first batch.
- The retry-day loop constructed a UK formatter per ad. Reuse one formatter; the
  same 15,000-ad test fell from 76 seconds to about 15 seconds locally. This is
  a fixture timing, not a production speed guarantee.
- The base already refilled after worker completion and used exact IDs without
  date limits. A one-batch/day policy was not present in the current base. New
  continuation also lives in the terminal media step, covering every caller and
  restarts. Daily limits apply to failed retries. Legacy unpaid plans are retained
  and reordered before dispatch; charged or uncertain runs remain untouched.
- Scraping previously disabled detailed ad fields. Request those details for
  catalogue/carousel products. Unreturned ads get a single-ID detail fallback
  across countries, without date filters. Every retained result must match the
  saved official UK ad, workspace and Page. No Page ID was guessed or replaced.
- Only JPEG/PNG/WebP were accepted. WebP was already supported; production WebP
  failures cannot be assumed. New synthetic WebP, AVIF and HEIC files all produce
  verified JPEG previews. HEIC needs the new small system decoder packages.
  Catalogue/product and carousel image fields are retained. An existing MP4
  fixture verifies poster extraction without retaining an optional full video.
- `mediaAvailable=true` previously prevented a newly saved poster being merged
  into an ad that had no thumbnail. New previews fill missing roles while existing
  videos, analyses, official copy, dates and reach remain.
- Actor summary rows were included in the minimum billed-result calculation.
  This could keep an otherwise complete run's maximum hold unresolved. Pricing now
  uses returned ad rows and final actor charge counters; unmatched and duplicate
  ad rows still count. Unknown or over-cap charges keep their holds.
- The global alignment stylesheet disabled title clamping. Restore two-line titles,
  fixed 64×80 previews and row alignment. Catalogue templates use stored product
  titles, otherwise “Catalogue ad · product details loading”. No duplicate full
  copy appears in list cards. Full copy stays in Creative detail.
- Row logo markup now uses the shared saved-logo component directly, scoped image
  styles preserve its dimensions, and cached load events cannot be reset to a
  monogram. Uploaded logo, Page picture, website icon and initials retain their
  existing source order.

## Missing reasons and the equal 366 counts

Missing counts are distinct `(brand, ad)` identities with one reason each. Tests
cover 732 different missing ads split 366/366, and 366 ads with two historical
errors that must still count only 366. Equal production totals do not establish
that the same ads were counted twice. Inspect the new per-ad details after deploy.

File details expose the observed MIME/category and controlled HTTP/timeout/size/
host/decoder codes. They never expose signed URLs, credentials or provider text.
Old failed results can be re-read from the paid dataset for free. Expired datasets
or links use guarded exact-ID lookup; transient downloads retry with backoff.

## Reported brands and expected coverage

| Brand | Supplied figure | After-fix expectation |
| --- | --- | --- |
| Valentte | 5.2%; 14,561 ads; 13,012 never requested | Initial backlog no longer needs about 30 daily scans. If every never-requested ad returns, rounded figures imply about 94.6%; roughly 64 more failed previews must recover to reach 95%. This is arithmetic from rounded supplied counts, not measured recovery. |
| The White Company | 64.3%; 761 not found; 145 unsupported | Exact-ID worldwide detail fallback and conversion target the gaps. Reaching 95% requires recovering about 86% of current missing previews. No forecast is justified without real results. |
| Aery Living | 26.8%; 91 unsupported | Conversion/reprocessing targets the unsupported set, plus any initial backlog. Reaching 95% requires recovering about 93% of missing previews. Total ad count was not supplied. |
| NEOM | 98.1% | Already exceeds the target; preserve existing files and retry the remaining gaps. |

The six supplied archive IDs are regression fixtures for catalogue/media
presentation: 4202123139999399, 1654480715998688, 794644396558199,
748549117960441, 2040543976838113 and 1885631332089043. Their production Page IDs,
request histories, returned file types and actual failure causes were not queried.
Use the new Ad ID filter after deployment to verify each one. The browser uses
fictional copy, synthetic product pictures and a synthetic saved-logo image.

## Browser evidence

| Evidence | Link |
| --- | --- |
| Before / after Winners, 1440px | [Side by side](Winners-before-after-1440.png) |
| Before / after Winners, 390px | [Side by side](Winners-before-after-390.png) |
| App / approved Winners reference | [Side by side](Winners-reference-comparison.png) |
| Missing-preview toggle off | [390px](after-Winners-with-loading-390.png) |
| Creatives with catalogue images | [1440px](after-Creatives-1440.png) |
| Browser checks / external requests | [Audit](audit.json) |

Browser checks cover 1280px, 1440px, 1920px and 390px, two-line titles, shared saved
logos, no page overflow, the default preview filter and its loading-state toggle.
Reproduce: serve the previous build on port 3141 and this build on 3142, then run
`python tests/ui_media_backfill_browser.py`. External traffic is blocked.

Intentional reference differences: the requested preview-only control; real-data
fallback for Working Score; explicit comparison/tagging gaps; supplied brand names
with clearly fictional fixture content. No sample outcomes, scores or predictions
were invented. Preview availability does not establish creative performance.

## Validation

`npm run check`, `npm test` (614 passed), `npm run build`,
`npm run secrets:check` and `npm run test:infrastructure` (79 passed).
No failures or skips. The existing production bundle-size advisory remains.
