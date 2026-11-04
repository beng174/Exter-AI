# Exter AI screen designs

These files are the approved layout for the Exter AI web app (approved 4 Nov 2026).
They are reference markup, not production code. Build the real screens in React
inside `src/`, following `research/UI-SPEC.md`.

Live canvas with every screen side by side:
https://claude.ai/artifact/Rc2P3t6tFq64UtQJJ9GntT

## Files

| File | Screen | View id in the app |
| --- | --- | --- |
| `screens/Sidebar.dc.html` | Shared sidebar, grouped navigation | (shell) |
| `screens/Main.dc.html` | Home | `overview` |
| `screens/Brands.dc.html` | Brand research | `brands` |
| `screens/Competitors.dc.html` | Competitors | `competitors` |
| `screens/Creatives.dc.html` | Creatives (library) | `creatives` |
| `screens/CreativeDetail.dc.html` | Creative detail | `creative` |
| `screens/Formats.dc.html` | Formats | `formats` |
| `screens/Patterns.dc.html` | Patterns | `patterns` |
| `screens/Audience.dc.html` | Audience and voice | `audience` |
| `screens/Winners.dc.html` | Winners | `winners` |
| `screens/Briefs.dc.html` | Opportunities and briefs | `briefs` |
| `screens/Creators.dc.html` | Creators | `creators` |
| `screens/Scores.dc.html` | Scores | `scores` |
| `screens/Ask.dc.html` | Ask Exter | `ask` |
| `screens/Reports.dc.html` | Reports and weekly pack | `reports` |
| `screens/DataSources.dc.html` | Data sources and settings | `data` |

## How to read the markup

The files use a small template format. Read them like this:

- `<x-dc>` wraps the page. `<helmet>` holds fonts and page styles.
- `{{name}}` is a value filled in from `renderVals()` in the script at the bottom.
- `<sc-for list="{{items}}" as="item">` repeats its children for each item.
- `<sc-if value="{{flag}}">` shows its children only when the value is true.
- `<dc-import name="Sidebar" active="home">` places the shared sidebar.
- `data-props` in the script tag lists the editable props, such as `active` on the sidebar.
- `support.js` is the canvas runtime. It is not in the repo and is not needed for the build.

Inline styles carry the exact spacing, sizes and colours. Move them into the
component CSS files and tokens; do not copy inline styles into React.

## What is sample data

Every brand name, ad title, creator, quote, number and date in these files is
fictional placeholder content (for example Northwick Candle Co., Halvane, Ama,
Cleo). None of it may ship in the product, in fixtures used by the app, or in
seed data. The real values come from the API. Where the API has no value yet,
the screen shows the Unavailable state described in `research/UI-SPEC.md`.

## Design tokens used

| Use | Hex | Token in `src/tokens.css` |
| --- | --- | --- |
| Primary text | #1F2937 | `--text` |
| Secondary text | #515B6B | `--muted` |
| Brand blue, links, active nav text | #0C1F96 | `--exter-blue` |
| Accent | #00C0CB | `--exter-teal` |
| Strong border | #D6DBE3 | `--line` |
| Card border | #E5E7EB | add `--line-soft` |
| Page background | #F8FAFC | `--surface-subtle` |
| Muted fill | #F3F4F6 | add `--surface-muted` |
| Active nav background, info chip | #E6F9FA / #075E66 | add `--chip-teal-bg` / `--chip-teal-fg` |
| Good chip (Proven winner, Scale) | #E7F6EC / #14532D | add `--chip-green-bg` / `--chip-green-fg` |
| Warning chip (Fix, Estimated) | #FEF3C7 / #78350F | add `--chip-amber-bg` / `--chip-amber-fg` |
| Neutral info chip (Rising, Watch) | #EEF2FF / #1E3A8A | add `--chip-blue-bg` / `--chip-blue-fg` |
| Bad chip (Switched off fast, Reduce) | #FDE8E8 / #8B1D1D | add `--chip-red-bg` / `--chip-red-fg` |
| Neutral chip (Steady, In line) | #F3F4F6 / #374151 | add `--chip-grey-bg` / `--chip-grey-fg` |

Type: Inter, 28px page titles, 20px section titles, 16px body, 14px table text,
12px meta text. Cards: 12px radius, 1px border, no heavy shadows. Minimum touch
target 44px.
