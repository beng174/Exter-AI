# Background index browser fixtures

1440px Chromium screenshots from real-workspace API shapes, captured from the
20,000-ad disposable Postgres fixture. All names are fictional. No source calls,
paid analysis, production data or database writes run in the browser check.

`results.json` lists the eleven screens, partial-index state, controlled timeout
state, browser errors, external requests and writes. `partial-Creatives-1440.png`
shows ads remaining usable at 500 of 20,000 indexed. `controlled-error-1440.png`
shows the sanitised database timeout reason.

Reproduce: run the infrastructure suite with INDEX_FIXTURE_OUTPUT pointing to a
local JSON file, build and serve a local Vite preview on port 3137, then run
`python3 tests/ui_background_index_browser.py`. The script intercepts every API
read with the captured fixture and rejects all writes and external requests.

Layout and missing-source gates are unchanged. The one intentional addition to
the references is the temporary indexing status line requested for recovery.
