# Workspace loading comparison

Fictional 7,800-ad responses use the real screen/API shapes. Every external request
and provider action is blocked. Both builds use 600 ms library and 150 ms context
fixture delays. This is not live verification or a production latency guarantee.

- Parent revision: 0ee47f6, already including the web memory repair.
- `before-timings.json` and `after-timings.json`: matched navigation flow.
- `compression.json`: identical fixture JSON compressed offline at gzip level 1.
  The HTTP regression also verifies real negotiated compression and exact parity.
- Home, Creatives and Creative detail before/after images are pixel-identical.
- Winners adds pagination only for tables over 50 rows; all 7,800 rows remain
  accessible, totals and sorting use the full set. See `after-Winners-1440.png`.
- The browser script checks all 15 views in both workspace modes at 1280, 1440
  and 1920px (90 cases), plus sample Data sources and real Creatives table at
  390px. It checks history, evidence links, date scope and pagination/sorting.

Reproduce from the repository root after building the parent and changed revisions:

```sh
# Serve each build's dist directory in its own terminal.
python -m http.server 3136 --bind 127.0.0.1 --directory /path/to/parent/dist
python -m http.server 3137 --bind 127.0.0.1 --directory dist
python tests/ui_workspace_loading_browser.py before http://127.0.0.1:3136
python tests/ui_workspace_loading_browser.py after http://127.0.0.1:3137
```

Requires the existing Node dependencies, Python Playwright and local Chromium.
The script generates its fictional data from `tests/fixtures/workspace-loading-data.ts`.
