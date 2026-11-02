# Exter Media branding

The client report is available at `/demo/:brandId`, with the same authentication
as the rest of the app. It has no debugging controls or paid actions. The two
requested workspaces are Ion8 (`ion8.co.uk`) and Valentte (`valentte.com`). Existing
workspaces and source analyses are preserved. A new Ion8 workspace contains no
invented ads, creator profiles, metrics or model outputs. Its initial website
evidence consists of dated publisher headings, with their source URL.

The shared palette is dark blue `#0C1F96`, teal `#00C0CB`, mint `#00DFB8`, white and
secondary grey `#6B7280`. Teal and mint are fills with dark-blue text, rather than
text colours on white. Live badges use teal, Beta uses mint, and Preview uses
light grey. Primary navigation, headings and text use dark blue.

Manrope is self-hosted in `public/brand/fonts` with its SIL Open Font License.
Body text is at least 16px, tables and labels at least 14px, with approximately
1.5 line height. The final browser checks include the client report at 1280px
physical width with an effective 125% scale, and a narrow mobile viewport.

Long dashes are normalized only at display and report-export boundaries. Saved
source text, identifiers, source URLs, media and historical analysis records are
not rewritten as part of branding.

The original logo and favicon must be supplied as SVG files. Save them unchanged
as `public/brand/exter-logo-mark.svg` and `public/brand/exter-app-icon.svg`. The app
detects those files through its authenticated branding endpoint; no secret or
environment variable is needed. Until the original assets are provided, the app
uses a text wordmark and a recoloured generic icon rather than claiming to show
the supplied artwork.

Deploy the latest `exter-test-drive` commit to the Render web service. No manual
SQL migration or font-hosting setup is required. Keep the existing persistent
disk and secrets. See [DEMO.md](DEMO.md) for optional Apify creator configuration
and explicit preparation actions.
