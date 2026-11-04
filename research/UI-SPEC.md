# Exter AI: UI spec

Approved 4 Nov 2026. This spec turns the screen designs in `design/screens/` into
build items UI-00 to UI-16. It covers layout and presentation only. What a number
means and how it is calculated stays in `research/PRODUCT-SPEC.md` and
`research/CREATIVE-ANALYTICS-SPEC.md`.

**Which file wins.** PRODUCT-SPEC and CREATIVE-ANALYTICS-SPEC win on definitions,
data and honesty rules. The designs win on layout, order of sections, hierarchy
and copy tone. If the two disagree, follow the spec and note it in the PR.

## Rules for every screen

1. **No sample data.** Every name, number, date and quote in the designs is a
   placeholder. Real values come from the API. Sample data only appears behind
   the existing explicit demo flag, labelled "Sample data", never mixed with real
   records.
2. **Unavailable is a state, not a zero.** Explain a missing value once per page
   or section. Inside repeated cards, table cells and list rows, show only a short
   "Unavailable" or "Not synced" label, with the reason in a tooltip. On Creatives,
   explain missing owned metrics once above the grid or table. Collapse an empty
   section to one line with the reason and one useful action. Hide its meta line
   if the sample size, either date or check time is unknown; never print
   "n = Unavailable ads" or "Unavailable to Unavailable". Link to Data sources only
   when a connection is the fix. Missing analysis links to the existing analysis
   controls; missing media links to the original ad. If no user action can supply
   a value yet, explain that honestly rather than offering a false fix. Never show
   0, a dash or an empty chart for a missing value. An ad active at capture with
   no stop date shows "Still running", qualified by the saved capture date.
3. **Every number carries a data label:** Observed, Estimated, Modelled or
   Unavailable (PRODUCT-SPEC, Data honesty rules).
4. **Every chart and table shows sample size, date range and last successful
   check** in a small footer line.
5. **Every number opens its ads.** Clicking a count, a bar, a table row or a
   finding opens Creatives filtered to the ads behind it.
6. **Competitors:** never show competitor spend, sales, conversions or ROAS.
   Spend ranges appear only as Estimated, and only once the Meta Ad Library API
   is live.
7. **Scores:** the Working Score, labels (Proven winner, Rising, Steady,
   Switched off fast) and confidence appear only from the real calculation.
   Until it exists, those columns show Unavailable. The predictive score stays
   hidden until it passes validation.
8. **Copy:** British English, short plain sentences, no em or en dashes. Use the
   headings and helper text from the designs. Exter branding only. Never name
   another company's product anywhere.
9. **Accessibility:** 44px minimum targets, visible focus, `aria-current` on the
   active nav item, text on every status chip (colour is never the only signal),
   AA contrast, every chart has a text or table equivalent.
10. **Responsive:** designs are 1440px wide. Below 960px the sidebar becomes the
    existing drawer. Below 720px tables scroll sideways inside their card or turn
    into stacked rows. Nothing overflows the page.
11. **Stack:** React components and per-component CSS files, as the repo does
    today. Icons from `lucide-react`. Colours, type and spacing from
    `src/tokens.css` (add the tokens listed in `design/README.md`). No new UI
    framework, CSS framework or router library.
12. **Scope:** UI PRs may add read-only endpoints that count and group stored ads
    for metrics PRODUCT-SPEC already defines (marked "compute now" below). Put the
    maths in `shared/` as pure functions with fixture tests. UI PRs must not add
    data collection, scoring models, paid API calls or schema changes. Anything
    else is listed in the PR as "needs a spec item".

## UI-00 App shell and navigation

Design: `Sidebar.dc.html` and the page frame in every screen.

- Sidebar top: Exter wordmark, then the brand switcher (brand name, "Client" or
  "Prospect", number of competitors). Uses the existing brand switcher.
- Grouped navigation, in this order:

| Group | Label | View id | Old id kept as alias |
| --- | --- | --- | --- |
| Overview | Home | `overview` | |
| Research | Brand research | `brands` | `brand` |
| Research | Competitors | `competitors` | |
| Research | Creatives | `creatives` | `ads` |
| Research | Formats | `formats` | |
| Research | Patterns | `patterns` | |
| Research | Audience and voice | `audience` | `audiences` |
| Act | Winners | `winners` | |
| Act | Opportunities and briefs | `briefs` | |
| Act | Creators | `creators` | |
| Act | Scores | `scores` | |
| Share | Reports | `reports` | |
| Share | Ask Exter | `ask` | |
| Share | Brand demo (only when the demo flag is on) | `demo` | |
| Settings | Data sources | `data` | `sources` |
| Settings | Budgets and tests | `settings` | |
| Settings | Labelling | `labelling` | |

- Data sources shows an amber dot when any source has an error or is waiting.
- Bottom of sidebar: Help and getting started, user block. Keep what exists.
- Keep the `?view=` URL parameter and `brandId`. Old ids redirect to new ids.
  Use `history.pushState` so the browser back button works. Creative detail is
  `?view=creative&id=<adId>`.
- Navigation lives in one config file (`src/navigation.ts`). Each item has a
  `ready` flag. Items for screens not rebuilt yet stay hidden, so nobody lands on
  a half-built page.
- Page frame: sidebar 240px, main area padding 32px 40px 48px, 24px between
  sections, background `--surface-subtle`.

## UI-01 Shared components and tokens

Build once, use everywhere. Each in `src/components/ui/` with its own CSS.

| Component | What it does |
| --- | --- |
| `PageHeader` | Title, one line subtitle, right side actions, optional filter row |
| `FilterBar` | Platform, date range, brand or competitors, search. Wraps the existing global filters |
| `SectionCard` | White card, 12px radius, title, optional help text, footer meta line |
| `MetaLine` | "n = 214 ads · 4 Oct to 2 Nov · checked 3h ago" footer |
| `DataLabel` | Observed, Estimated, Modelled, Unavailable chip |
| `StatusChip` | Proven winner, Rising, Steady, Switched off fast; Test now, Scale, Fix, Reduce, Watch, In line; Live, Beta, Preview; source states Connected, Waiting, Error, Not connected |
| `Confidence` | High, Medium, Low, as text plus a small bar |
| `MetricTile` | Big number, label, DataLabel, change against the previous period |
| `Unavailable` | Reason, what unlocks it, optional link. Replaces every missing value or section |
| `EmptyState` | For real but empty results, such as "No ads match these filters" |
| `CreativeCard` | Thumbnail with duration, source (You or brand), format, 2 to 3 tags, metric row |
| `DataTable` | Sortable table, sticky header, row click, keyboard support, stacked rows on small screens |
| `BarList` | Horizontal bars with value labels, each bar clickable |
| `Heatmap` | Cells with value text, light fill scale, dark text |
| `Sparkline` | Small trend line with an accessible summary |

Status colours are in `design/README.md`. Add them to `src/tokens.css`.

## Screens

Each screen lists its sections in design order. "Data" says where the values
come from. "Compute now" means a count or share PRODUCT-SPEC defines that stored
ads already support. "Unavailable until" names what unlocks it.

### UI-02 Creatives

Design: `Creatives.dc.html`. View `creatives`. Replaces the Creative library page.

- Header with total count, layout toggle (grid or table), Show (all, yours,
  competitors).
- Filter rail: brand, platform, format, hook, angle, offer, UGC, status, date
  range; search across ad copy, transcript and on-screen text. Data: `/api/ads`
  and existing filters.
- Grid of `CreativeCard`s and a table view with the same fields. Metric row:
  days running (Observed) for competitor ads; spend, ROAS and hook rate for your
  own ads from owned sync when connected, otherwise Unavailable.
- Every other screen links here with filters applied in the URL.

### UI-03 Creative detail

Design: `CreativeDetail.dc.html`. View `creative`. Replaces the ad modal.

- Header: ad title, brand, previous and next within the current filtered list,
  open in the ad library.
- Player with scene strip. Clicking a scene jumps the video. Data: stored media
  and video analysis scenes.
- Source and running history: first seen, last seen, days running, platforms,
  ad copy, CTA (Observed).
- Performance: your own ads only, from owned metrics. Competitor ads show public
  signals only. Unavailable when no owned account is connected.
- Creative score checklist: from existing analysis fields.
- Viewer retention: your own ads only (owned metrics, CA-09 points). Never shown
  for competitor ads.
- What is said and shown: transcript, on-screen text, tags with timestamps.
- How Exter reads it: hook, angle, offer, claim type, with evidence timestamps.
- In the market: similar competitor ads by angle and format (compute now).

### UI-04 Home

Design: `Main.dc.html`. View `overview`. Replaces the Overview page.

- Banner only when a source is not live, such as "Meta Ad Library is not
  connected yet", with what switches on when it is.
- What to work on: top 3 priorities. Unavailable until the Priority calculation
  is built (PRODUCT-SPEC, Brand vs competitors).
- You against the market: active ads, new this week, stopped this week, median
  days running, share of active ads, against the competitor average (compute
  now). Share of voice by impressions is Unavailable until the Meta API.
- Your account: spend, ROAS, CPA, hook rate from owned metrics. Shows a
  "Connect your ad account" state until an owned account has synced.
- Top working ads: by Working Score once it exists. Until then show "Longest
  running" sorted by days active, labelled Observed, with a one line note that
  the Working Score is coming.
- What changed: ads launched and stopped this week (compute now). New concepts
  and offer shifts Unavailable until grouping exists.
- Needs attention: source errors, stale checks, budgets near their limit. Data:
  `/api/connections`, `/api/infrastructure/status`, `/api/budgets`.

### UI-05 Brand research

Design: `Brands.dc.html`. View `brands`. Replaces the Brands page.

- Brand header: website, category, country, client or prospect, watchlist and
  category keywords. Data: `/api/brands`, `/api/public/meta/watchlists`.
- What the public sources say, and positioning signals. Data:
  `/api/brand-research`.
- Competitor set with active ads per brand and last checked (compute now).
- Profiles, creators and limits, plus the fixed "What this research cannot
  show" box from the design.
- Actions: add a brand, add competitors, edit keywords (existing endpoints).

### UI-06 Competitors

Design: `Competitors.dc.html`. View `competitors`. Replaces the Competitors page.

- Scorecard per brand: active ads, new and stopped this week, median days
  running, share of active ads (compute now). Proven winner share Unavailable
  until the Working Score. Estimated spend Unavailable until the Meta API.
- Creative mix by brand, switchable by format, hook, angle, offer, claim type
  (compute now from analysis fields; shares of each brand's ads).
- What each competitor leans on: top values per brand with 3 example ads each.

### UI-07 Formats

Design: `Formats.dc.html`. View `formats`. Replaces the Formats page.

- Format league table: ads yours and competitors, share, median days running,
  trend against the previous period (compute now; data `/api/formats`). Win rate
  Unavailable until the Working Score.
- How winning ads are built: structure of the top ads per format (hook length,
  duration, captions, people on screen) from analysis fields. Uses longest
  running ads until the Working Score exists, and says so.

### UI-08 Patterns

Design: `Patterns.dc.html`. View `patterns`. New screen.

- Group by hook, angle, offer, format or claim type.
- You against the category table: your share, competitor share, usage gap in
  points (compute now). Category win rate and the action chip Unavailable until
  the Working Score and Priority exist.
- What each action means: the fixed explainer from the design.
- Each row opens Creatives filtered to that value.

### UI-09 Audience and voice

Design: `Audience.dc.html`. View `audience`. Replaces the Audiences page.

- Customer voice: review themes by type (need, objection, outcome, desire) with
  counts and real quotes. Show stored reviews now; themes Unavailable until the
  customer voice item is built.
- Words customers use: Unavailable until review themes exist.
- Who the ads reach: age, gender and country from the ad library. Unavailable
  until the Meta Ad Library API is live. Never inferred.
- How each brand talks: tone, claim types and offers per brand from analysis
  fields (compute now where the fields exist).

### UI-10 Winners

Design: `Winners.dc.html`. View `winners`. New screen.

- Working Score table: rank, ad, brand, format, label, score, confidence, the
  four signals, days running. Unavailable until the Working Score is built; show
  the "Longest running" list meanwhile, labelled as such.
- Your account winners: the CA-06 winners board (goal metric, minimum spend,
  20% margin). Unavailable until CA-06 is built and an owned account has synced.

### UI-11 Opportunities and briefs

Design: `Briefs.dc.html`. View `briefs`. New screen.

- Ranked opportunity list with action chip and the three numbers. Unavailable
  until Priority is built. In demo mode, use the existing demo briefs, labelled
  "Sample data".
- Selected opportunity: proof from the category (example ads), what customers
  say (review quotes), and the brief: hooks, format, script beats, proof points,
  creator profile, variants. Briefs use existing brief generation where it runs
  on real data.
- Actions: edit, approve, export, send to a creator. Only the actions the API
  supports today are shown.

### UI-12 Creators

Design: `Creators.dc.html`. View `creators`. Replaces the Creators page.

- Filters, then shortlist cards: profile, platform, followers, country, fit
  components, example posts, ads they already appear in. Data:
  `/api/creator-research` and its search, fit and shortlist endpoints.
- Compare and export where the API supports it.

### UI-13 Scores

Design: `Scores.dc.html`. View `scores`. New screen.

- Score a draft: upload a file and get the creative score checklist. Only if
  the existing analysis pipeline accepts uploads; otherwise Unavailable.
- Selected result: checklist items met and missed.
- Recent scores table.
- Predictive score: hidden behind a "Not validated yet" notice until it passes
  the gate in PRODUCT-SPEC.

### UI-14 Ask Exter

Design: `Ask.dc.html`. View `ask`. The existing ask drawer becomes a page; the
header button opens it.

- Question box, answer with numbered citations, sources panel listing cited ads
  and records, "Not checked" note on what the answer could not use, earlier
  questions. Data: `/api/ask`.
- Save an answer to a report only if the API supports it.

### UI-15 Reports

Design: `Reports.dc.html`. View `reports`. Replaces the Reports page.

- Weekly packs list and client link panel. Packs Unavailable until CA-12 and the
  weekly report are built; client links Unavailable until CA-11.
- Report preview with the 8 sections from PRODUCT-SPEC. Each section carries a
  Live, Beta or Preview badge and shows Unavailable where its data does not
  exist yet.
- Existing report generation and download (`/api/reports`) stay available.

### UI-16 Data sources

Design: `DataSources.dc.html`. View `data`. Replaces Data sources; absorbs the
budgets part of Budgets and tests.

- Source health table: source, what it gives, status, last success, records,
  note, action. Data: `/api/connections`, `/api/infrastructure/status`,
  `/api/public/meta/watchlists`.
- Your ad accounts: owned accounts with status, latest data date and last error
  (`/api/owned/accounts`). Sync stays switched off unless
  `EXTER_OWNED_SYNC_ENABLED` is true.
- Ad naming convention: Unavailable until CA-04.
- Budgets and schedule: `/api/budgets`.
- Users and client access: show what auth supports today; the rest Unavailable.

## Build order

One PR per step, each against `exter-test-drive`, each citing its UI ids.

| PR | Items | Done when |
| --- | --- | --- |
| UI-A | UI-00, UI-01 | New shell and grouped sidebar live; every existing page still works inside it; old view ids redirect; components exist with tests |
| UI-B | UI-02, UI-03 | Creatives and Creative detail match the design with real data |
| UI-C | UI-04, UI-05, UI-06, UI-08 | Home, Brand research, Competitors, Patterns rebuilt |
| UI-D | UI-07, UI-09, UI-10 | Formats, Audience and voice, Winners rebuilt |
| UI-E | UI-11, UI-12, UI-13 | Briefs, Creators, Scores rebuilt |
| UI-F | UI-14, UI-15, UI-16 | Ask Exter, Reports, Data sources rebuilt; Budgets and tests folded in |

**Every PR:** run `npm run check`, `npm test`, `npm run build`,
`npm run secrets:check`. Add tests for new `shared/` functions with fixtures,
for the navigation config (every id has a screen, aliases redirect) and for
the rule that missing values render Unavailable, never 0. In the PR description
list each section as Real data, Compute now or Unavailable, and attach
screenshots at 1440px and 390px if the environment can run the app.

## Out of scope for UI work

Working Score, Priority, review themes, weekly pack, client links, CA-03 to
CA-12 logic, new connectors and any schema change. Those ship under their own
spec items; the screens pick them up when they land.
