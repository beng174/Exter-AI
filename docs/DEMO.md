# Brand demo

The authenticated **Brand demo** tab and `/demo/:brandId` present a read-only report from saved brand evidence. The standalone view hides preparation controls. Opening either view makes no paid provider requests and starts no collection or Gemini work. It uses the same administrator authentication as the application; it is not a public sharing link.

## What the report means

Every section identifies its maturity as **Live**, **Beta** or **Preview**. These labels describe availability, not proof of marketing effectiveness.

| Section | Evidence and limits |
| --- | --- |
| Saved sources and analysed sample - Live | Uses real public/imported ads with saved creative analyses. Counts identify videos, still images and carousels. Unanalysed records and fictional sample ads do not become analysed evidence. Source links, capture dates and available quotes/timestamps remain visible. |
| Creative patterns - Beta | Counts supported format, hook, angle and offer categories from the analysed sample. Each category shows its actual denominator; missing or historical free-text classifications do not become categorical votes. A bounded sample is not the whole advertising market. |
| Opportunities and briefs - Beta | Draft recommendations cite saved ad/website evidence. A gap means an angle was absent or uncommon in this analysed sample, not that competitors never use it. Review recommendations and claim substantiation before production. |
| Best-practice score - Beta | **Best-practice score, not a performance prediction.** A visible rubric explains known/unknown evidence and coverage. Missing evidence stays unknown rather than losing points automatically. No spend, conversion or performance outcome is inferred. |
| Creator research - Beta | Public search results, saved posts, source dates, evidence-grounded fit checks and an explicit shortlist. Search country/category are criteria; they do not prove creator audience geography, demographics or performance. Meta partnership attribution can provide a seed without proving every other profile attribute. |
| Future proven-ad likelihood - Preview | **Trains as collection history builds.** There is no trained model or numerical success probability. Repeated observations show observed history, not continuous delivery or proven performance. |

The report reads saved results. Existing Valentte results remain available without rerunning the successful Gemini batch. Trust the report's current sample counts rather than assuming a fixed total. Earlier analyses keep their original prompt/version and are not rewritten by deployment. Empty sections explain which saved evidence is missing; deployment does not fabricate a filled demo.

The requested brands are **ION8**, `ion8.co.uk`, and **Valentte**, `valentte.com`,
as separate workspaces. Startup imports the verified 58-ad Valentte browser
capture and deduplicates by the verified Meta advertiser and native ad ID. It
links original workspace scopes to existing successful analyses and immutable
media manifests without moving files or rewriting paid results. Library views
use all saved observations, so an older delivery start does not hide an ad from
the current collection. Ion8 initially has only dated publisher
homepage headings, observed on 2 November 2026. It has no claimed ad capture,
creator measurements or creative analyses until those actions actually succeed.
Use the workspace's **Open read-only client view** link to get its exact URL.

## Prepare evidence in the app

1. Open **Settings**. **Prepare the brand demo** is the first panel, above Monthly budgets and Gemini smoke test. Choose **Valentte** or **ION8** in its **Demo brand** dropdown. The **Website evidence & client demo** shortcut jumps directly to this panel.
2. Click **Refresh website evidence** to save a bounded public homepage excerpt for that brand. This is a source request, with no model inference. A failed refresh preserves earlier evidence.
3. Use the existing authenticated media/Gemini preparation controls when more creative analyses are needed. They run on Render, reuse stored media and respect the inference budget. Opening the demo itself does not start them.
4. Configure the public creator provider as below, then explicitly click **Run budgeted creator search**. This uses the `data_providers` budget. Inspect the saved profile/post sources before choosing candidates.
5. Explicitly click **Run Gemini fit check** for a saved candidate with actual post evidence. This uses the `inference` budget. Missing source material stays unavailable. Use **Shortlist** to record the operator's selection; a model assessment does not select a creator automatically.
6. Open **Brand demo** or **Open read-only client view**. Review sources, sample counts, unknowns and draft recommendations before presenting the report.

These actions persist their results. Reloading the report or changing tabs does not repeat provider work. Budget pauses and provider failures remain visible and preserve successful earlier results. Never put `GEMINI_API_KEY`, `APIFY_TOKEN` or any other credential in a prompt, capture file, shell command, Git commit or browser URL.

## Render steps after deploying

1. Deploy the latest `exter-test-drive` commit to the existing **web service**. Keep its `/var/data` disk mounted, `EXTER_DB_PATH=/var/data/exter.db`, `MEDIA_STORAGE_TYPE=disk` and `MEDIA_STORAGE_PATH=/var/data/media`. Existing database/media must remain on that disk.
2. Keep the existing administrator variables, `DATABASE_URL`, Gemini key, model and matching model-pricing settings. The demo adds no requirement to copy a secret into Codex. Existing Gemini pricing rules still apply to requested versus served models; see [DEPLOY.md](DEPLOY.md).
3. No manual SQL migration is needed. New SQLite tables and the source reconciliation are created at startup. Startup serves saved evidence without launching browsers or model cold starts. In **Brand research**, click **Refresh website research** to refresh public source facts without loading local ONNX models on Render. In **Settings > Competitor collection**, explicitly start or continue Aery Living, The White Company and NEOM, up to 25 usable creatives each. Native analysis uses the existing inference budget and Static mode. Existing competitor runs are never automatically replayed by deployments.
4. For public creator searches, configure `APIFY_TOKEN` in the **Render web-service environment only**, plus the approved `APIFY_INSTAGRAM_ACTOR_ID` and/or `APIFY_TIKTOK_ACTOR_ID` and a positive `APIFY_REQUEST_RESERVE_GBP`. An unconfigured platform remains unavailable. Actor selection, supported input/output and actual provider prices must be checked before running a paid search; no paid subscription or credit purchase is performed by the app.
5. In **Budgets**, set a positive `data_providers` cap if creator search is wanted and retain the chosen positive `inference` cap for Gemini fit checks. The budget reservation guard applies before paid dispatch. A provider reservation is not an invoice.
6. Redeploy after environment changes. Open **Settings > Competitor collection** for actual progress, failures or budget pauses. **Continue unfinished work** is explicit and preserves completed results; uncertain interrupted paid requests are not silently replayed.
7. Download **Page counts** from that panel, or open `/api/demo-readiness?brandId=valentte&download=1`, for actual saved counts and media verified on the hosted disk. Then check the six workspace pages and `/demo/valentte` in the browser. A successful local fixture test does not establish hosted data availability.

## Explore the report

The client report has sticky navigation for Overview, Creatives, Patterns,
Competitors, Opportunities & briefs, Creators and Scores. The gallery retains
all collected ads, including honest missing-media states. Available videos get
a cached poster extracted near one second; retained images use the actual image.
Filter by media/creative format, hook, angle, offer and UGC evidence, or search
the transcript and on-screen text. Pattern bars apply their filter to the gallery.

Click a card to open the retained video, image or carousel next to its analysis.
Transcript and on-screen-text timestamps seek the video. Previous/Next buttons
and the left/right arrow keys move through ads. **View in Meta Ad Library** uses
the native ad ID. Retained files are served through authenticated scoped routes
with HTTP range support; media paths and provider response bodies are not sent
to the client. Source-listed running days stop at the recorded source endpoint,
not today's date, and do not assert continuous delivery or effectiveness.

Creator actors must support the built-in public-search inputs below; there are no additional JSON input-template environment variables. Actor IDs accept `user/actor` or `user~actor`. Common documented candidates are `apify/instagram-scraper` and `clockworks/tiktok-scraper`, but confirm your account's access, actor version, input schema and output before configuring them. These names are examples, not a claim that access has been tested or purchased.

| Platform | Built-in input |
| --- | --- |
| Instagram | `{"resultsType":"details","resultsLimit":5,"addParentData":true,"search":"<category/query> <country>","searchType":"user","searchLimit":5}` |
| TikTok | `{"searchQueries":["<category/query> <country>"],"resultsPerPage":60,"shouldDownloadVideos":false,"shouldDownloadCovers":false,"shouldDownloadSubtitles":false}` |

When the backend receives explicitly verified seed handles, Instagram uses `directUrls` with their public profile URLs instead of search text; TikTok uses `profiles` instead of `searchQueries`. Meta attribution seeds are evidence to inspect, not guessed identities or proof of audience fit. The actor's configured output must expose actual public profile/post evidence; missing output stays missing.

## A second brand: real browser capture

The second brand must be explicitly identified by its public name, website, country and Meta Ad Library advertiser page link. No second-brand collection is claimed until that identity has been supplied and an actual public capture succeeds. The existing Valentte importer remains scoped to Valentte; use the generic command below for another verified brand.

The current requested second brand is Ion8. UK (`GB`) is the intended collection
filter; the Meta advertiser ID must still be verified from a public page, rather
than guessed. In a proxied environment, Chromium must trust the environment's
configured CA. A certificate validation failure stops the browser; do not disable
TLS checks, bypass the proxy or treat that failure as an empty ad library.

`scripts/collect-brand-demo.ts` runs the existing ordinary Chromium collector for the initial **active** and **all-status** results (up to 30 rows per query), or imports retained raw captures. It needs Python Playwright and Chromium; `CHROMIUM_PATH` can select the installed executable. It uses no paid API, client-account credentials or model API key. An access challenge or missing verified records stops collection; it does not bypass a challenge or assert that the brand has no ads.

Replace every `REPLACE_…` value with the supplied identity. The numeric ID comes from the actual page link's `view_all_page_id`; do not guess it from a brand name. If Meta's public advertiser name differs from the brand name, supply its exact observed label with `--advertiser-name`.

```sh
node --import tsx scripts/collect-brand-demo.ts \
  --name 'REPLACE_BRAND_NAME' \
  --website 'https://REPLACE_OFFICIAL_WEBSITE/' \
  --category 'REPLACE_EXISTING_CATEGORY' \
  --country 'GB' \
  --meta-url 'https://www.facebook.com/ads/library/?view_all_page_id=REPLACE_NUMERIC_PAGE_ID' \
  --collect --capture-dir /tmp/exter-second-brand-captures \
  --db .data/exter.db --output .data/second-brand-evidence.json
```

Use one of the application's existing category values: `Beauty & skincare`, `Fashion`, `Wellness`, `Food & beverage`, or `Home fragrance & gifting`. The country is the requested public-library filter, not proof of audience location.

Raw captures can contain expiring media links and must stay **outside the repository**. The command validates capture country, source URL, numeric advertiser/ad IDs, exact advertiser names and explicit partnership relationships. It imports real ads as `source: public` into a separate `mode: imported` workspace and records source provenance. It does not import fictional sample data or independently claim to verify website ownership. Media links and raw page bodies are excluded from the normalized evidence file; media can be prepared separately in the hosted application.

To review an existing raw capture without creating a database or output file, replace `--collect --capture-dir …` with `--input /tmp/exter-second-brand-captures/ACTUAL_CAPTURE.json --dry-run`. Multiple `--input` flags combine successful captures. Dry-run does not collect network data. A failed capture leaves successful raw files available for inspection and starts no database import. Repeated imports deduplicate by native ad ID and preserve existing creative analysis/media references and the first observation date.

The local CLI imports into the database named by `--db`; it does not silently modify Render's disk. Moving reviewed source evidence to the hosted workspace must use the intended deployment/import process. A successful bounded capture is not complete monitoring, and public delivery dates are not original social-post publication dates. Engagement, spend and conversions remain unavailable unless separately observed from an appropriate source.

## Authenticated endpoints

| Action | Route | Paid work |
| --- | --- | --- |
| Read saved brand report | `GET /api/brands/:brandId/demo` | None |
| Read creative gallery | `GET /api/brands/:brandId/demo/creatives` | None |
| Play retained video or view poster/image | `GET /api/brands/:brandId/demo/creatives/:adId/video`, `/poster`, `/images/:index` | None |
| Read actual page counts | `GET /api/demo-readiness?brandId=…` (`&download=1` for Markdown) | None |
| Read competitor progress | `GET /api/demo-collection?brandId=…` | None |
| Continue authorized competitor collection | `POST /api/demo-collection/start` | Inference budget for usable unanalysed creatives |
| Refresh homepage evidence | `POST /api/brands/:brandId/demo/website` | None |
| Read saved creator research | `GET /api/creator-research?brandId=…` | None |
| Explicit public creator search | `POST /api/creator-research/search` | `data_providers` budget |
| Explicit Gemini creator fit check | `POST /api/creator-research/fit` | `inference` budget |
| Update operator shortlist | `POST /api/creator-research/shortlist` | None |

Source-grounded observations, draft recommendations and unknowns remain distinct throughout the report. Nothing in this demo establishes causal ad effectiveness or an audience's purchasing response.
