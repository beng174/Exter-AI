# Exter AI test drive

The general test-drive ZIP contains `index.html`, `START-HERE.txt`, the Valentte research report and a fictional `sample-import.json` for import testing. The dedicated Valentte ZIP contains the HTML, instructions and report without the fictional import example.

1. Download and extract the ZIP on a computer.
2. Open `index.html` in a desktop browser such as Chrome or Edge. No installation, terminal, account, or server is needed.
3. Switch among the four sample brand workspaces. Try the platform/date filters, ad search, creative detail, competitor comparison, audience themes, creator shortlist, reports and research assistant.
4. To try imports, create a workspace named **Demo Brand** and choose a category. Open **Data sources** and import the included `sample-import.json` file. New brand workspaces start empty; they do not automatically research a real brand.
5. Use **Reset demo** to clear the test-drive workspaces, imports, shortlists and reports stored in that browser and restore the sample dataset. A confirmation appears before anything is removed.

The imported example is fictional. All live services are disconnected. Engagement rankings are separate from supplied, owned-account conversion evidence. The research assistant uses data-grounded rules, not a connected language model. Your browser's storage capacity limits the amount of data you can import, and private browsing or clearing browser data can remove saved changes. The test drive is separate from the full app's SQLite database.

All styles, code, sample data and images are embedded in the HTML file. It makes no automatic external network or API requests. Source links supplied by a user can still open external websites if clicked.

## Build and verify

From the repository root after `npm ci`:

```sh
npm run build:preview
python3 tests/preview_smoke.py .preview/Exter-AI-Test-Drive.html
```

The browser smoke test uses Python Playwright and Chromium. In the managed cloud browser used for this project, administrator policy blocks `file://` navigation. That policy was left intact; the artifact was instead tested with:

```sh
python3 tests/preview_smoke.py --http .preview/Exter-AI-Test-Drive.html
```

HTTP mode serves only the one embedded HTML file. Tests fail if the page requests external assets or backend APIs. Direct `file://` execution was not verified in the managed browser. Browsers managed by an organisation may need an approved local HTTP server instead of opening downloaded HTML files directly.

## Real Valentte case: 30 October update

On first open, the test drive selects **Valentte → Brand research**. It shows real website evidence, local-model provenance and **58 source-checked Meta Ad Library records** captured on 30 October 2026. Thirty were marked active by the source at capture. This is a bounded sample from two searches, not all Valentte ads and not a live feed. The four other brand workspaces remain fictional samples.

Ad-library cards preserve delivery dates and source links. Delivery start is not the organic post publication date. The source did not provide per-ad engagement counts or a usable denominator, so engagement rates and a winning format remain unavailable. Source media types do not prove UGC or influencer origin. See [the corrected findings](../research/VALENTTE-TEST.md).

The ZIP includes `Valentte-Research-Report.md`. Client-account access and Claude were not required for collection. Refreshing sources, running the platform's models and exposing data to Claude require the full server application. A hosted service with scheduled collection is the route to ongoing monitoring; opening this HTML cannot start one.
