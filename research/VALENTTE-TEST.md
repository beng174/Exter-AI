# Valentte real-brand test — 29 October 2026

**Result: website research and local text/image analysis worked. Ad-format performance remains unmeasured.**

The public brand site, creator-programme pages, competitor websites and public Instagram profile metadata were inspected without client-account access. Exter's own local text and visual models processed the website text and a publicly featured gift-set image. Website research is stored separately from ads; **no synthetic Valentte ads, engagement rates or conversions were inserted**.

## Findings

- **Category:** home fragrance, reed diffusers, candles and gifting, with skincare also in the range.
- **Positioning:** UK/Cheshire manufacture and affordable-luxury messaging. These are brand-owned claims, not independently verified product results.
- **Creative-direction evidence:** the ambassador programme explicitly recruits UGC creators, and the TikTok creator programme describes product features, gifting/commission opportunities and everyday home-fragrance content. This supports a creator-led test hypothesis; it does not prove UGC is the best-performing format.
- **Featured creators:** four Instagram profiles appear in the brand's own “Real homes” section. Their audience fit and commercial terms were not independently assessed.
- **Candidate competitors:** Wax Lyrical (close UK home-fragrance range overlap), NEOM Wellbeing (premium/wellbeing benchmark), and Rituals (adjacent home-fragrance/lifestyle benchmark). This is a source-backed, analyst-selected candidate set, not automatic or exhaustive competitor discovery.

## What the test could not establish

- The Meta Ad Library search returned HTTP 403 with an access challenge. It was not bypassed.
- Instagram supplied rounded profile metadata, but no individual posts, likes, captions or ad-level results were ingested.
- The local visual model described the gift-set packaging as cosmetics. That interpretation is explicitly unvalidated and exposes a classification gap; the source image and source context must take precedence over an unverified label.
- **There is no measured winning ad format, CPA, conversion rate or real-time competitor performance result in this test.** Zero ingested ads does not mean the brand has no active ads.

## Source links

- [Valentte homepage](https://valentte.com/)
- [TikTok creator programme](https://valentte.com/tiktok-creators/)
- [Ambassador / UGC programme](https://valentte.com/ambassadors/)
- [Official Instagram profile](https://www.instagram.com/valentte_london/)
- [Wax Lyrical](https://www.waxlyrical.com/)
- [NEOM Wellbeing](https://neomwellbeing.com/)
- [Rituals home fragrance](https://www.rituals.com/en-gb/home-fragrance)

## Reproduce in the full app

Start `npm run dev`, then run `npm run research:valentte` from the repository root. The command researches the public site, runs Exter's own local models, checks public source access, saves a separate brand-research profile, and exports the browser snapshot. Public access and website contents may change. The competitor reference set retains its original observation timestamps. No Claude connection or client advertising account is required.

The downloadable HTML contains this real research snapshot and four separate sample workspaces. It is a reviewable test of the findings and interface; refreshing public collection and executing models require the full server application.
