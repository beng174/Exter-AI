# Exter Media visual system

The authenticated app and `/demo/:brandId` share one self-hosted Inter font. The
original logo and icon remain separate artwork; no substitute logo is presented
as supplied artwork. Save the exact SVGs as `public/brand/exter-logo-mark.svg` and
`public/brand/exter-app-icon.svg` when supplied. The branding endpoint detects
those files after deployment.

## Surfaces and colour

Pages and cards are white. Cards use a 1px `#E5E7EB` border, 12px radius and at
most a subtle shadow. There are no coloured top bars or heavy panel outlines.
Body text is `#1F2937`, secondary text `#6B7280`. Navy `#0C1F96` is reserved for
page titles, section headings and important numbers. Paragraphs remain near-black
or secondary grey.

Teal `#00C0CB` identifies the primary action, selected navigation, link accents and
chart series. Mint `#00DFB8` is limited to small status indicators and chart
highlights. KPI values are dark text on white, never large coloured blocks.
Exact teal text on white has insufficient contrast, so link text remains dark or
uses a readable dark teal, with the exact accent available as an underline.

Live, Beta and Preview pills are 12-13px with 2px 8px padding and dark text. Their
backgrounds are subtle teal, mint and grey tints respectively.

## Type and layout

`public/brand/fonts/Inter-variable.ttf` is distributed under the adjacent
`Inter-OFL.txt` SIL Open Font License. The app does not contact a font service.
The scale is 28px bold page titles, 20px semibold section headings, 15px semibold
card titles, 15-16px body copy and 13-14px labels. Body line height is 1.5 and
readable text is bounded to 72ch where practical.

The spacing system uses an 8px base with 24px card padding. Workspace KPI rows
contain four equal cards, and larger panels use a 12-column grid. The sidebar is
240px wide with single-line labels and workspace name. Data definitions and
connection notes sit behind the compact About this data disclosure.

Long dashes are normalized at display and report-export boundaries. Stored source
text, source identifiers, URLs, media and analysis history are preserved.

## Validation and deployment

Browser validation includes a 1024px CSS viewport at 1.25 device scale, equivalent
to a 1280px screen share at 125 percent, as well as a narrow mobile viewport. The
report's functional browser checks cover gallery filtering and ad exploration.

Deploy the latest `exter-test-drive` commit on the Render web service. Font files
are served locally with the app; no environment variable or font-hosting change
is needed. Keep the existing persistent disk and secrets. See [DEMO.md](DEMO.md)
for data collection and report preparation.
