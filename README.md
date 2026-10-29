# Exter AI

**Public-first, platform-owned intelligence.** Exter researches public paid and organic content before client access is available, runs its own local text/vision inference, stores structured findings, and computes creative-format comparisons. Client-account reporting is optional after winning an account. Claude is an optional read-only consumer of Exter's results. See the [implemented architecture and exact coverage limits](docs/ARCHITECTURE.md).

The updated **Creative formats** page and assistant compare UGC, influencer, static, before-and-after, live-photo, reviews and native formats separately by platform. Ad details expose general information, observed concepts, inferred audience and attention-map availability. All sample data and uncertain/missing inferences remain labelled.

A working local MVP for competitive creative research, based on the supplied Defy decks and the Exter brief. Browse ad landscapes, compare creative angles, explore audience and review themes, shortlist illustrative creators, ask grounded questions, and download intelligence briefs.

**Broad live public monitoring is not connected.** A submitted public X URL was collected and analysed end-to-end without client credentials. Other embed endpoints can withhold source content or deny access. Comprehensive Instagram/Facebook/LinkedIn/category/ad-library collection needs approved public-data service access for Exter, not a client's advertising account. The app opens with a clearly labelled fictional dataset. Public engagement does not reveal competitors’ conversions.

## No-install test drive

The separate **Exter AI Test Drive** is a self-contained HTML version of the same interface, with all images and sample data embedded. Extract the supplied test-drive ZIP and open `index.html` in a desktop browser. It uses browser-local storage instead of the server database; no Node installation, hosting account, or API credentials are needed. **Reset demo** removes only test-drive data in that browser.

To rebuild it from source:

```sh
npm run build:preview
```

The output is `.preview/Exter-AI-Test-Drive.html`. See [test-drive instructions](docs/TEST-DRIVE.md). The test drive shares the full app's analytics calculations but uses a local API adapter, not live services. Its imports, reports, and shortlists are separate from the server database.

## Run

Requires Node.js 24+ and npm. No API keys or external database are needed for the local MVP.

```sh
cd /workspace/Exter-AI
npm ci
npm run dev
```

The Express API and Vite app share port **3000**. For a production build served locally:

```sh
npm run build
npm start
```

`PORT` overrides the port. `EXTER_DB_PATH` overrides the SQLite path (default `.data/exter.db`). Live processes must restart in a new environment session. Use the existing checkout; cloud tasks are isolated and do not require a Git worktree.

## What works

- Four sample workspaces: beauty, fashion, wellness, and food & beverage; 2,400 fictional ads total, with 7/30/90-day and Meta/TikTok/Google filters.
- Searchable, paginated ad library, creative details and browser-local saved ads.
- Weighted engagement rankings, brand comparison, audience tags, sample brand voices and review themes.
- Illustrative creator matches with reasons, profile briefs and SQLite-persisted shortlists.
- Markdown research reports with explicit sample/import provenance and download support.
- Data-grounded format/performance answers, a local text/vision inference engine, and a read-only MCP server for optional Claude Desktop setup. No user's Claude client or external LLM API is connected.
- New brand workspaces, validated JSON imports of up to 10,000 records per request, persistent SQLite storage.

## Import your data

Create a brand with the workspace selector, open **Data sources**, and download the template. Paste a JSON array or upload a JSON file. Required fields are `brand`, `platform`, `title`, `angle`, `audience`, `impressions`, `engagements`, and `publishedAt` (ISO date). Supported platforms are `Meta`, `TikTok`, and `Google`.

```json
[
  {
    "brand": "Your brand",
    "platform": "Meta",
    "title": "Product education",
    "angle": "Ingredient spotlight",
    "audience": "Ingredient-conscious shoppers",
    "impressions": 10000,
    "engagements": 450,
    "publishedAt": "2026-10-29T12:00:00Z",
    "owned": true,
    "conversions": 10,
    "spend": 100,
    "revenue": 350
  }
]
```

Use actual observation dates; records outside the selected date window are excluded. Optional fields include `copy`, `format`, and an HTTP(S) `sourceUrl`. Owned metrics require `owned: true` and the advertiser must match the workspace brand. Competitor spend, revenue and conversion values are rejected. Supplied metrics and source URLs are not independently verified. Imports append records; importing an export twice creates duplicates. The frontend limit is 8 MB; the API limit is 20 MB.

The first import switches the workspace to import mode: all sample ads, reviews, creators and shortlists are excluded from its analysis. Previously generated reports retain their historical contents and provenance. A new brand’s competitors, reviews and creators are not fetched automatically. Imported creator/review ingestion is not implemented yet.

## Reading the metrics

- Engagement rate = engagements / impressions × 100. It ranks attention, not sales.
- Share of ads describes the current dataset, not market share or spend share.
- The chart groups **observed engagements by ad publication date**; it is not an event-time feed. The competitor line averages across distinct competitor brands in the filtered dataset.
- Imported ads have no image. The UI shows a neutral record placeholder rather than an invented creative.
- Sample photographs, brand associations, creator names, audience metrics, scores and reviews are illustrative; no endorsements or verified partnerships are implied.
- Reports cover the latest 30 days across all platforms, independently of dashboard filters. The assistant defaults to that scope and states it in each answer.

## Verification

```sh
npm test
npm run build
python3 tests/browser_smoke.py
```

Browser verification requires Python Playwright and system Chromium (`CHROMIUM_PATH` override supported). It starts an isolated server and temporary database, then cleans up. API tests validate filtering, atomic imports, ownership restrictions, sample isolation, pagination, report downloads, persistent shortlists, research answers and trend calculations.

## Before deployment

This is a **trusted local, single-workspace application** with no authentication or tenant isolation. Do not expose it as a public service. Production requires accounts, workspace access controls, request protections, provider OAuth, encrypted credentials, ingestion queues, source retention policies, observability and approved provider access. No code contacts creators, sends messages, spends budgets or publishes campaigns.

See [architecture and coverage](docs/ARCHITECTURE.md), [Claude setup](docs/CLAUDE.md), [product scope](docs/PRODUCT.md), and [sample image sources](docs/ASSETS.md). Broad public collection, verified attribution, campaign execution and a hosted multi-user Claude connector remain unfinished.

## Download the browser test version

The ready-to-open package and instructions are in [test-drive/README.md](test-drive/README.md). This branch includes both the full application source and the standalone test drive. The repository's main branch is unchanged.

## Real brand case: Valentte

The updated browser test drive opens directly to **Valentte → Brand research**, using public website evidence and actual local-model inference. It does not substitute fictional ad results for missing real data. Read [the test findings and limitations](research/VALENTTE-TEST.md).

With the full app running, `npm run research:valentte` reproduces the website/creator-source collection and model analysis. Comprehensive live ad-format benchmarking remains blocked by source coverage; client-account permission is not the prerequisite for that public research.
