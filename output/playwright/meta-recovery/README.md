# Collection recovery evidence

Fictional fixtures only. No live provider calls or paid actor runs were made.
These checks do not diagnose the old live failure's missing Graph code and are
not live verification of recovery.

DataSources-1440.png and DataSources-390.png show per-brand run status, 7,752
retained ad snapshots, 78 committed pages, stopping time, controlled failure and
numeric Graph code/subcode/HTTP status. The editor screenshots show the same
information beside saved Page IDs through both entry points. No run/cursor or
provider URL, token, trace or provider message appears.

The browser test performs six explicit scoped collection POSTs, including both
entry points at 1440px and 390px. It never saves an edited Page ID. It also checks
unsaved Page/budget/sample guards, active progress polling and retained details
when progress refresh fails. External requests are blocked.

The existing approved Source health frame and four columns remain; the requested
per-brand progress table is placed inside that frame. The editor uses the same
shared status and retry components. Compare with design/reference/png/DataSources.png
and Competitors.png for the unchanged surrounding screen geometry.

Reproduce with npm run build, start the provider-disabled preview using
node --import tsx tests/fixtures/m1-server.ts, then run
python3 tests/ui_meta_recovery_browser.py. It uses existing Chromium, Python
Playwright and Pillow tooling; no project dependencies were added.

Postgres tests require only a dedicated disposable TEST_DATABASE_URL:

```sh
npx tsx --test --test-concurrency=1 tests/infrastructure.integration.ts tests/meta-activation.integration.ts tests/meta-observation-storage.integration.ts tests/meta-recovery.integration.ts
```

They preserve 7,752 fixture observations while resuming the original cursor,
exercise every fallback size and numeric error path, enforce bounded attempts,
independent brand sizes and access/budget/lease/pacing guards, and retain all
change-only storage, hydration, replay and crash recovery checks. The tests
truncate their disposable fixture database; never point them at a real database.
