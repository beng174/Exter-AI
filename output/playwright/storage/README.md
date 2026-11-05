# Meta storage and health evidence

All provider responses, browser data and database records are fictional fixtures.
Fixtures are not live verification. No live provider calls were made.

- DataSources-1280.png, DataSources-1440.png and DataSources-390.png show a
  measured physical database size and daily average within the existing Source
  health table. Refresh, an actual zero, a missing baseline and measurement
  failure are checked without browser mutations or external network requests.
- DataSources-sample-1440.png and DataSources-sample-390.png show the sample
  workspace's explicit fixture-only database row. No real storage values appear.
- first-day.png shows the Unavailable daily rate until a 24-hour baseline exists.
- audit.json records the five tested screen/mode/width combinations.
- storage-benchmarks.json records 1,000 fictional ads across 30 simulated daily
  scans for unchanged, 10%-changed and all-changed cases. docs/DEPLOY.md explains
  the source JSON size, compression, live row bytes, physical allocation,
  autovacuum and excluded metadata. It is not a production capacity guarantee.

Compared with design/reference/png/DataSources.png and its static HTML, the
section order and frames stay in place. The requested database row is added;
provider marks and the four source-health columns from the prior approved UI
remain. Real evidence gaps keep their existing honest states. The sample row
states that fixtures use no collection database instead of copying real bytes.

Reproduce the UI with npm run build, then in one terminal run
node --import tsx tests/fixtures/m1-server.ts. In a second terminal run
python3 tests/ui_storage_browser.py. This uses the existing Python Playwright,
Chromium and Pillow tooling, not new project dependencies. The preview disables
website-logo network transport and the test blocks external browser requests.

For Postgres regressions, use a dedicated disposable pgvector/Postgres database
through TEST_DATABASE_URL and run:

```sh
npx tsx --test --test-concurrency=1 tests/infrastructure.integration.ts tests/meta-activation.integration.ts tests/meta-observation-storage.integration.ts
```

The tests truncate only that explicitly provided disposable fixture database;
never point them at production. The same new integration file is included in
the existing CI infrastructure script. Check tests cover repeated migration,
legacy retention, all stored fields, reverts, 30 unchanged scans, raw payload
references and hydration, workspace/revision boundaries, simultaneous scans in
opposite provider order, page replay/conflict rollback, worker crash recovery,
hourly measurement uniqueness, daily baselines and safe health failure paths.
