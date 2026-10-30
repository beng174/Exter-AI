# Test Exter AI — v0.4

**[Download the test-drive ZIP](https://github.com/beng174/Exter-AI/raw/refs/heads/exter-test-drive/test-drive/Exter-AI-Test-Drive.zip)**

1. Download the ZIP on your computer. Sign in to GitHub if prompted.
2. Extract it (Windows: **Extract All**; Mac: double-click the ZIP).
3. Open the extracted **index.html** in Chrome or Edge.

No terminal, Node.js installation, hosting account or login to the app is needed.

If the download button is blocked, open [the ZIP file page](https://github.com/beng174/Exter-AI/blob/exter-test-drive/test-drive/Exter-AI-Test-Drive.zip) and choose **Download raw file** (the download arrow).

## Things to try

- Switch between sample brands and categories.
- Filter the ad library by platform and date, search creatives, and inspect an ad.
- Compare competitors, explore audience/review themes, and shortlist creators.
- Generate and download reports; ask the research assistant a question.
- Create a workspace named **Demo Brand**, then import the fictional `sample-import.json` included in the ZIP from **Data sources**.
- Use **Reset demo** to clear only this browser's test changes and restore the sample workspaces.

This is an offline interactive test drive. Valentte opens with real website research and 58 source-linked Meta ad-library records captured on 30 October 2026. The four other brand workspaces use fictional demonstration data. Collection and model execution require the full application. Changes stay in this browser and are separate from its server database.

Organisation-managed browsers may block local HTML; use an ordinary desktop browser or an approved local HTTP server if required by your administrator. Direct file navigation could not be tested in the managed development browser; the standalone artifact passed browser tests served as a single static HTML file, with no API or external requests.


The full platform now has its own local text/vision engine; Claude is an optional downstream reader. See [architecture and current coverage limits](../docs/ARCHITECTURE.md). This HTML test drive demonstrates the interface and stored-data comparisons; it does not run the server models or public collectors.

## Real brand test: Valentte (v0.4)

**[Download the dedicated Valentte test](https://github.com/beng174/Exter-AI/raw/refs/heads/exter-test-drive/test-drive/Valentte-Real-Brand-Test.zip)**. Extract it and open `index.html`; the real Valentte research workspace is selected on first use. The archive includes a readable research report. This is a dated public-research snapshot, not live ad-performance data.

[Read the real test findings and limitations](../research/VALENTTE-TEST.md). The 58 ads are a bounded public-library sample, including 30 labelled active at capture. Engagement counts and a denominator were not supplied, so engagement rates remain unavailable. No fake performance metrics were inserted.

For Claude Desktop on Mac, use the [full application setup](../docs/CLAUDE.md#mac-quick-start); the standalone HTML cannot provide the local MCP server.
