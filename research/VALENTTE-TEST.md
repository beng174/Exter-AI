# Valentte real-brand test — updated 30 October 2026

**Result: real Meta Ad Library records are accessible through an ordinary browser. We collected 58 unique records; engagement-rate performance remains unmeasured.**

The previous test stopped at an HTTP-only 403 response and incorrectly treated that as sufficient evidence that the library was inaccessible. A normal Chromium browser rendered actual ad records without bypassing an access challenge. The correction concerns our collection method, not whether Valentte advertises publicly.

## Real ad-library evidence

- **Advertiser:** Valentte, Meta page ID `172851066181411`, linked to the brand's [official Facebook page](https://www.facebook.com/ValentteLondon/).
- **Capture:** 30 October 2026 at 00:37:27 UTC, also 00:37:27 in London.
- **Coverage:** the first 30 rendered records from a GB active-only search and the first 30 from a GB all-status search, yielding **58 unique ad IDs** after deduplication. This is a bounded sample, not a complete advertiser or category crawl.
- **Source activity:** 30 sampled records were marked active at capture. Activity is a source snapshot, not a guarantee that delivery continues now.
- **Source media labels:** 11 `VIDEO`, 8 `IMAGE` and 39 `DCO`. `DCO` identifies dynamic creative in the returned data; it does not establish UGC, influencer origin, carousel structure or a particular creative angle.
- **Dates:** records contain ad-delivery start/end dates. These must not be presented as original social-post publication dates or replaced with the collection date.
- **Example:** [library record 1019959660919738](https://www.facebook.com/ads/library/?id=1019959660919738), a video marked active at capture with a delivery start of 2 July 2026.
- **Access:** the active-only navigation returned HTTP 200. The all-status navigation initially reported HTTP 403 but still rendered actual records. Ordinary browser rendering was used; no access challenge was bypassed.

The library did **not** supply usable per-ad reactions/comments/shares, views, impressions or reach for these records. Engagement rate is therefore unavailable, not zero. A page's follower count is not an ad's impressions. Longevity, variant count and active status can inform research but cannot establish an engagement winner.

The app stores the records as public evidence with native IDs, source links, exact advertiser identity, capture times and delivery-date provenance. Reimporting the same native IDs updates those records instead of creating duplicates. The research panel shows this sample independently of the dashboard's recent-date filters, which can exclude older delivery starts.

## Website and creator findings

The website research was collected on 29 October 2026 without client-account access. Exter's local text and visual models processed website text and a publicly featured gift-set image.

- **Category:** home fragrance, reed diffusers, candles and gifting, with skincare also in the range.
- **Positioning:** UK/Cheshire manufacture and affordable-luxury messaging are brand-owned claims, not independently verified product results.
- **Creative direction:** the brand explicitly recruits UGC and TikTok creators. This supports a creator-led test hypothesis, not a measured claim that UGC performs best.
- **Featured creators:** four Instagram profiles appear in the brand's “Real homes” section. Their audience fit and commercial terms were not independently assessed.
- **Candidate competitors:** Wax Lyrical, NEOM Wellbeing and Rituals form a source-backed, analyst-selected candidate set. Automatic or exhaustive competitor discovery was not established.

## Remaining gaps

- The source sample does not establish the highest-engagement format for Valentte or its category. We need actual public post metrics, consistent denominators and comparable competitor coverage.
- Continuous refresh, broader pagination and cross-platform coverage remain unfinished. The downloadable HTML is a dated snapshot.
- Instagram supplied rounded profile metadata, without individual post counts or performance records in the website test.
- The local visual model described the gift-set packaging as cosmetics. That unvalidated interpretation remains flagged as a classification gap. Source context takes precedence over an unverified model label.
- Audience labels are model inferences, not measured audience demographics. The source media labels do not establish creator identity or UGC provenance.

## Source links

- [Valentte active Meta Ad Library search](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=GB&view_all_page_id=172851066181411&search_type=page&media_type=all)
- [Valentte all-status Meta Ad Library search](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=GB&view_all_page_id=172851066181411&search_type=page&media_type=all)
- [Valentte homepage](https://valentte.com/)
- [TikTok creator programme](https://valentte.com/tiktok-creators/)
- [Ambassador / UGC programme](https://valentte.com/ambassadors/)
- [Official Instagram profile](https://www.instagram.com/valentte_london/)
- [Wax Lyrical](https://www.waxlyrical.com/)
- [NEOM Wellbeing](https://neomwellbeing.com/)
- [Rituals home fragrance](https://www.rituals.com/en-gb/home-fragrance)

## Reproduce in the full app

Start `npm run dev`, then run `npm run research:valentte` for the website/creator-source collection and local model analysis. Collect public library records separately with Python Playwright and Chromium installed:

```sh
python3 scripts/collect-meta-library.py --page-id 172851066181411 --country GB --status active --output /tmp/valentte-active.json
python3 scripts/collect-meta-library.py --page-id 172851066181411 --country GB --status all --output /tmp/valentte-all.json
node --import tsx scripts/import-meta-library.ts --input /tmp/valentte-active.json --input /tmp/valentte-all.json --dry-run
node --import tsx scripts/import-meta-library.ts --input /tmp/valentte-active.json --input /tmp/valentte-all.json
```

The browser script collects a bounded result set on request. Access, content and counts can change. Raw captures can contain expiring public media URLs and are kept outside the committed snapshot; exported evidence uses bounded copy excerpts and stable source links. No Claude connection or client advertising account is required.

The downloadable HTML contains this evidence plus four separate fictional sample workspaces. Refreshing collection and executing the models require the full server application. See [the completion plan](COMPLETION-PLAN.md) for the route to continuous public monitoring and team-wide Claude access.
