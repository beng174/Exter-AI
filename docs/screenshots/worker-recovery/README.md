# Worker diagnostics: browser fixtures

These screenshots use a fictional local workspace with injected failure records.
They are not production logs or evidence of live recovery. Provider requests are
blocked. The safe SQLSTATEs and stack locations shown are fixture values.

| View | Screenshot |
| --- | --- |
| Three paused jobs at 1440px | [Desktop](worker-jobs-1440.png) |
| Failure details at 390px | [Mobile](worker-jobs-390.png) |
| The same saved step retried at 1440px | [After retry](worker-retry-1440.png) |

The browser verified the paused reasons, expanded diagnostics, authenticated retry
response, three rows becoming two, and no page errors or mobile overflow. Mobile
rows show labelled fields, readable copy and compact status chips. Desktop keeps
the shared table style. The new Worker jobs section is the requested addition to
Data sources; existing reference sections remain in place.

To reproduce, use a disposable local TEST_DATABASE_URL, run npm run build, then
node --import tsx tests/fixtures/worker-health-browser.ts. Open
http://127.0.0.1:5188/?view=data&brandId=workspace with fixture / fixture-only.
Stop the fixture with SIGTERM to remove its isolated database schema.
