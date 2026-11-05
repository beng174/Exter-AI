# Workspace readability evidence

Fictional fixtures, not live verification. No provider calls are made by these
checks. Before and after use identical saved evidence, including a long copy
paragraph, an alias URL and a brand with an absent optional website field.

- Home: stored brand context and a compact, aligned source-status row.
- Creative detail: a short first-sentence heading, no logo inserted into prose,
  the full expandable source copy and compact left-aligned performance values.
- Data sources: locally bundled provider marks and the four reference columns.
  Known last-check and record links remain in Detail. Missing metadata does not
  create empty columns. Sample Data sources uses the same components.
- A genuine fixture HTTP failure keeps the page readable, shows Retry and clears
  the notice after a successful reload. This does not establish the cause of
  every production HTTP or network failure.

`*-comparison-1440.png` and `*-comparison-390.png` put before on the left and
after on the right. The individual screenshots and before/after audit JSON are
also included. alignment-audit.json records all 90 passing real/sample desktop
screen/width combinations. The type check, 434 unit tests, production build and
tracked-file secret scan pass. Full copy is expanded in the detail after screenshot to show that
it remains accessible. References remain in design/reference/png/ and the static
HTML alongside them. Layout changes are limited to the requested readability
fixes, source identities and grouping metadata within the source Detail cell.

Reproduce from the repository root with installed project dependencies,
Chromium, Playwright's Python package and Pillow (existing preview tooling):

```sh
npm run build
node --import tsx tests/fixtures/m1-server.ts
```

In a second terminal:

```sh
python3 tests/ui_readability_browser.py after
```

The preview disables automatic-logo network transport, the browser blocks all
external requests, and the regression route serves fictional API responses.
Run the script on the base version with `before` to recreate before captures.
Do not use production secrets or start the worker/scheduler for this preview.
