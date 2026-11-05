# Bounded media UI evidence

Fictional API and locally drawn raster fixtures only. No provider calls, hotlinks
or paid actor runs. Fixtures are not live verification. audit.json records all four
widths (1280, 1440, 1920 and 390), sample/default-off controls, scoped collect requests and zero external
traffic/page errors. Full-video retention is separately tested with a locally
generated 1080p clip re-encoded and probed as 1280 x 720 H.264, including generated
poster fallback, content deduplication and a store restart.

DataSources-1280/1440/1920/390.png show the existing Source health and
Budgets and schedule frames, measured disk bytes and guarded per-run media costs.
MediaCosts images isolate the compact table. It fits the desktop reference column;
mobile tables keep the app's existing horizontal scrolling convention.
CreativeDetail images show a stored local poster without a full video. The same
fixture test then removes media and verifies the ad-copy preview, without an
Unavailable tile. Sample Data sources remains unchanged and cannot start media.

Compare with design/reference/png/DataSources.png, CreativeDetail.png and their
static HTML. Kept differences: the requested disk-used/remaining row and media
cost/control subsection are additional content; public Performance omits private
account metrics and includes only available fields. No new page section replaces
a designed frame. Missing accounts, analysis and budget values remain honest gaps.
Existing owner-requested provider icons, logos, page layout and source-run status
are retained. No fictional screenshot data is seeded into real workspaces.

Reproduce after npm run build with the existing provider-disabled preview:
node --import tsx tests/fixtures/m1-server.ts, then
python3 tests/ui_ad_media_browser.py. Run python3 tests/ui_public_signals_browser.py
for the Performance extension. Both use existing Chromium/Python tooling and block
external requests. The collect button is mocked; no actual job is queued.

npm test includes tests/ad-media.test.ts and ad-media-http.test.ts. The eight
Postgres cases use only isolated schemas in a disposable TEST_DATABASE_URL:
npx tsx --test --test-concurrency=1 tests/ad-media.integration.ts.
Do not supply a real database or provider credentials.
