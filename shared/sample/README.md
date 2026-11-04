# Sample workspace

Northwick Candle Co. and the five competitors are fictional fixtures. They are
never inserted into SQLite or Postgres. All identifiers use the `sample-` prefix,
source links use reserved `.example` domains, and thumbnails are inline SVGs.

Open `/?demo=1&brandId=sample-northwick&view=overview`. The existing API helper
carries `demo=1` to API requests; the server boundary serves only sample records
for that flag and rejects sample IDs without it. The sample brand list contains
no real workspace. Selection does not overwrite the real workspace preference.

`values.json` comes from the approved `design/screens/*.dc.html` renderVals and
the static sections of `design/reference/*.html`. Regenerate it with
`node scripts/generate-sample-fixtures.mjs`. `workspace.ts` supplies the existing
creative, account, research, report and answer shapes. Optional section read
models fill features whose real calculations are still unavailable; they do not
implement or validate those calculations. There is no sample database seed.

Every sample screen uses the existing page routes and shared React components.
Read-only fixture values are labelled Sample data throughout. Mutation controls
are disabled; the server rejects writes even if a client bypasses the controls.
Ask is a read-only lookup of canned fixture answers, with sample source IDs.
The predictive score remains gated. No provider, model, sync or collection runs.

Fixtures are not live verification. Both live gates remain open and
EXTER_OWNED_SYNC_ENABLED stays absent or false by default.
