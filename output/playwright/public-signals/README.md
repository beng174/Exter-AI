# Public Performance evidence

All browser data is fictional. Tests block external requests and every write.
Fixtures are not live verification. No ad provider or actor run was called.

Performance-1440.png and Performance-390.png show every available requested
public signal with the existing reference tile shape and a compact scrollable
age/gender chart. CreativeDetail images show the surrounding screen. Missing
fields produce no tiles; actual zero remains visible. The fixture tests also
cover a workspace brand's public ad, missing data, zero-day denominators and
sample mode. Public outcomes never include private account metrics.

Reach/day's tooltip shows the real arithmetic and geography. Versions count
unique saved public ad IDs for the same brand by exact full wording or verified
creative content hash; no similar-copy or truncated-prefix matching is used.
Chosen targeting is distinct from reached audience measurements.

The reference CreativeDetail.png has fewer populated values. This authorised
extension preserves its section frame and tile/bar components while adding the
newly requested public fields. Longer targeting/platform text uses the reference
text scale rather than oversized numeric typography. The chart keeps all source
buckets accessible in a compact scrolling frame.

Reproduce with npm run build and the provider-disabled local preview:

```sh
node --import tsx tests/fixtures/m1-server.ts
```

In another terminal run python3 tests/ui_public_signals_browser.py. Existing
Chromium/Python Playwright tooling is used; no project dependency was added.
Unit fixtures are in tests/public-signals.test.ts and the existing detail-render
suite. Official raw-source projection is checked without fetching a provider.
