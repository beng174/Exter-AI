Superseded by research/PRODUCT-SPEC.md where they disagree.

# Exter AI: Winning Ads, Weekly Data and Competitor Gaps

**For:** Codex. Save as `research/WINNING-ADS-SPEC.md` in `beng174/Exter-AI` (branch `exter-test-drive`) and implement in the order below.
**Goal:** Exter estimates, every day and from public data only, which ads are working best for a brand and its competitors. It produces a clean weekly data pack that Exter Media turns into its own client report. It also compares the brand with its competitors and outputs a ranked list of what to work on.

**Rules that apply throughout:**
- Every number is labelled `observed`, `estimated`, `modelled` or `unavailable`, and estimates are stored as low / mid / high.
- Every score shows its components and a confidence level.
- Every finding links to the ads behind it.
- No long dashes in any UI text or export.

---

## 1. Data the computations need

Collect for the brand and every competitor in its watchlist:
- **Meta:** daily. Use the official API when `META_ACCESS_TOKEN` is set; otherwise use the browser collector. Each run stores one `ad_observations` row per ad: active, start date, stop date, platforms, UK and EU reach (API only), and the media hash.
- **Media:** saved and hashed at collection, with a thumbnail extracted.
- **Analysis:** Gemini analysis using the fixed taxonomy (format, hook type, angle, offer type, claim types, audio, people, pacing, CTA, creator evidence).
- **Organic posts** where available (Instagram Business Discovery, YouTube): views, likes, comments, followers, as dated snapshots.
- **Concept clusters:** group each brand's creatives by embedding similarity of transcript, hook, on-screen text and visual description. A concept is one idea with its variants.

If reach is unavailable, every reach-based metric is `unavailable` and confidence drops. Never fill gaps with guesses.

---

## 2. Working Score (which ads are working)

The definitions below match the "Which ads are working: the Working Score" section of the Exter AI product spec doc.

A 0 to 100 score per ad, recomputed after every collection run and stored as a daily snapshot (`ad_score_snapshots`). It ranks ads by how much their advertiser is backing them.

### 2.1 Signals (each a 0 to 100 percentile against the same brand's other ads, so a small brand is not punished for spending less)

| Signal | Calculation | Weight |
|---|---|---|
| Survival (S) | Days active / the brand's median days active; still-running ads treated as censored, not short (Kaplan-Meier) | 35% |
| Scaling (C) | Duplicates (the same media hash in several ad IDs) plus new versions of the same concept within 45 days | 25% |
| Reach velocity (R) | UK and EU reach / days active, and reach growth between snapshots (Meta API only) | 25% |
| Organic response (O) | Engagements / views vs the brand median, for ads matched to an organic post | 15% |

### 2.2 Composite
- `Working Score = (0.35 S + 0.25 C + 0.25 R + 0.15 O) / sum of weights of available signals`. Weights live in a versioned config table.
- When a signal is missing, drop its weight and rescale the rest.
- **Confidence:**
  - **High:** reach is available and the ad has been observed for 21+ days.
  - **Medium:** survival and scaling only.
  - **Low:** under 7 days of history.
- Show the components and confidence next to every score.

### 2.3 Labels (badges)
- **Proven winner:** score 75 or more, and running 30+ days.
- **Rising:** under 14 days old, and in the top third of the brand for reach velocity, or already duplicated.
- **Steady:** score 40 to 74.
- **Switched off fast:** stopped within 7 days of launch, so likely a losing test.
- Keep a daily label history per ad, so "was a winner, now fading" is visible in the trend.

### 2.4 Exclusions and noise controls
- Exclude catalogue / dynamic product ads from winner rankings, since no creative decision was made.
- Flag ads with dated offers ("ends Sunday", "Black Friday"). Do not count their stop as failure.
- Brands that never stop ads (none stopped in 60 days) get confidence capped at Low.
- Minimum of 5 analysed ads per brand before brand-level rankings are shown.

### 2.5 Estimated spend and share of voice (Meta API only)
- `impressions = reach × frequency` (low / mid / high from the config table).
- `spend = impressions / 1000 × CPM` (low / mid / high by country, platform and month).
- `share_of_voice = brand estimated impressions / watchlist total`, per week, as a range.
- Always shown as ranges, labelled estimated, with the assumptions version.

### 2.6 Calibration hook (later)
When a client's ad account is connected, store the actual spend and ROAS for their own ads beside the score, and report the correlation, so the weights can be tuned. Never required.

---

## 3. Weekly data pack (Exter Media builds the report from this)

The week runs Monday 00:00 to Sunday 23:59, Europe/London. A job runs every Monday at 06:00 and freezes a `weekly_snapshot` per brand and per watchlist. Results must be reproducible: a past week never changes after it's frozen.

### 3.1 Contents, per brand and per competitor, each with this week, last week and the change
- Active ads, new ads launched, ads stopped.
- Estimated impressions and spend ranges, and share of voice (if reach is available).
- Top 10 ads by Working Score: thumbnail, Ad Library link (`https://www.facebook.com/ads/library/?id={adId}`), label, score, components, confidence, days running, format, hook, angle, offer.
- New Proven winners this week, Rising ads, ads Switched off fast, and former winners whose score dropped 15+ points.
- Last week's tests: how the brand's newly launched ads are doing on the Working Score.
- Mix changes: format, hook type, angle and offer type shares, this week vs last week.
- First-seen patterns: hooks, angles, offers or claims a brand used for the first time.
- Competitor launches: new concepts with 3 or more variants launched this week.
- Data quality: sample sizes, last successful collection per source, any failures.

### 3.2 Exports
- `Weekly data pack` button on each brand, plus an authenticated endpoint `GET /api/brands/:id/weekly/:isoWeek`.
- Formats:
  - **XLSX:** one tab per section, with a definitions tab.
  - **CSV:** a zip of the same tables.
  - **JSON.**
  - **PNG charts**, ready for slides (mix shifts, share of voice, top ads grid), in the Exter brand style.
- Every table includes the definitions, labels and sample sizes, so the report can be written straight from it.

---

## 4. Brand vs competitors: what's missing and what to work on

### 4.1 Comparison matrix (brand vs each competitor and the category total)
Format mix, hook types, angles, offer types, claim types, UGC/creator share (evidence-based), talking-to-camera share, average length, new ads per week (cadence), variants per concept (testing velocity), median days running, Proven-winner rate (share of ads that are Proven winners), share of voice.

Show each share with its count and sample size, and a 95% Wilson interval. Hide comparisons with fewer than 5 ads on either side.

### 4.2 Three numbers behind every recommendation
These match the "Brand vs competitors" section of the product spec doc. Calculate them for each value of each field (e.g. angle = gifting, hook type = demo, format = UGC):
- **Usage gap:** competitors' share of ads using it minus the brand's share, in percentage points.
- **Category win rate:** Proven winners using it / all category ads using it. Only computed when 10+ ads use it; shown with a 95% Wilson interval and the counts.
- **Customer demand:** share of the brand's reviews mentioning the matching need or objection (0 when there are no reviews yet).

`Priority = category win rate × usage gap × (1 + customer demand)`. Show each component.

### 4.3 Actions
| Action | When | What Exter outputs |
|---|---|---|
| Test now | High category win rate; the brand uses it 15+ points less than competitors | A brief with 3 variants, linked to the competitor ads that prove it |
| Scale | The brand's own winners sit in an angle competitors barely use | More versions of the winning concept, new creator suggestions |
| Fix | The brand uses it a lot but wins less than the category | New hooks or formats for the same angle |
| Reduce | Low win rate everywhere, and the brand overuses it | Move effort to Test now items |
| Watch | A competitor angle that is new or rising this week | Flag it; test if still rising next week |

### 4.4 "What to work on" list
Each recommendation includes:
- the action, the three numbers and the priority
- 3 to 5 example competitor ads (thumbnails and Ad Library links)
- the brand's current use
- a suggested test (hooks, format, script beats, creator type), generated by Gemini from the evidence and citing ad IDs
- labels Beta and estimated

The top 3 priorities each week go on the brand Overview and into the weekly data pack.

---

## 5. Screens

1. **Winners** (per brand, and a category view): leaderboard of ads with thumbnail, label, score, components, trend sparkline (daily score), filters (brand, label, format, week). Click opens Ad detail.
2. **Ad detail:** add a score panel with components, label history and confidence, plus the reasons in plain English, e.g. "Running 46 days, duplicated into 4 ad sets, 3 new variants in 30 days".
3. **Competitors:** the comparison matrix, with the category win rate per pattern (with intervals) and usage gaps.
4. **What to work on:** the ranked recommendations from 4.4.
5. **Weekly report:** pick a week to see that week's frozen snapshot and download the data pack.

---

## 6. Data model additions
`ad_score_snapshots` (ad, date, score, components JSON, label, confidence, weights_version), `concepts` (brand, centroid, members), `weekly_snapshots` (brand, iso_week, frozen_at, payload JSON), `pattern_stats` (scope, attribute, value, counts, usage gap, win rate, interval, period), `recommendations` (brand, period, pattern, components, priority, evidence ad IDs, suggested test, status).

---

## 7. Acceptance
- With the current Valentte data (no reach): every analysed ad has a score with confidence Medium or Low, and the components are visible.
- Two consecutive daily runs produce two score snapshots per ad and an updated label where signals changed.
- After the Monday job: a frozen weekly snapshot exists; the XLSX opens with definitions; re-running doesn't change a frozen week.
- The competitor matrix and winning patterns show counts and intervals, and hide anything under the minimum sample.
- Every recommendation cites at least 3 real ads and shows its priority components.
- Unit tests cover:
  - survival with censoring
  - renormalised weights
  - label rules
  - Wilson intervals
  - usage gap and win-rate thresholds (10+ ads)
  - week boundaries in Europe/London, including the clock change
