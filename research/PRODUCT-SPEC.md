# Exter AI: Product Spec

Source of truth for what Exter AI does. Exported from the live spec doc on 3 Nov 2026. If this file and any older spec (BUILD-SPEC.md, COMPLETION-PLAN.md) disagree, this file wins.

## What Exter AI is

Exter AI is Exter Media's creative intelligence engine. It watches the public ads of a brand and its competitors, reads every creative with AI, and turns that into ranked angles and ready-to-shoot briefs before any budget is spent.

**The one question it answers:** what should this brand make next, and what is the market evidence for it?

- **Public data first.** Ad libraries, public organic posts and customer reviews. A client's own ad account is an optional extra, used later to calibrate scores.
- **The edge versus Defy and Somin.** Exter does not try to out-collect them. Its edge is the full loop: competitor ads plus customer reviews, into proven-demand angles, briefs and matched creators.
- **Who it serves.** Exter Media's team first, as the research engine inside the agency service. Clients see a clean, read-only report of their own brand.

**What it is not:** a tracker of competitors' sales or conversions (public data cannot show them), a guaranteed performance predictor, or a self-serve SaaS product yet.

## Who uses it and what it must do

Four users, eight jobs. Every screen in Exter should serve at least one of these jobs.

| User | What they do in Exter |
| --- | --- |
| Exter strategist | Sets up a brand and its competitors, reviews the analysis, picks angles, writes briefs, exports reports |
| Media buyer | Chooses which creatives to test next, watches what competitors launch each week |
| Client (read-only) | Sees their landscape, opportunities and briefs; comments |
| Prospect (sales demo) | Sees a teardown of their own brand against 3 competitors |

**The eight jobs, in priority order**

1. **Map the landscape:** which brands advertise in the category, how many ads, which formats, since when.
2. **Understand every creative:** hook, angle, offer, claims, format, audio, creator, with timestamps.
3. **Spot patterns and gaps:** what everyone does, what nobody does, what each brand leans on.
4. **Turn gaps into briefs:** 3 opportunity angles, each with hooks, format, script beats, proof and creator type.
5. **Mine customer voice:** recurring needs, objections and phrases from reviews, linked to angles.
6. **Find creators who fit:** relevance, tone, language, location, engagement consistency, with example posts.
7. **Score creatives:** a best-practice score now; a predictive score once enough history exists.
8. **Monitor and report:** weekly changes (new ads, stopped ads, new angles) and a clean client report.

## Data sources

Phase 1 runs on two official sources only: the Meta Ad Library API and the TikTok Commercial Content API. Both cover ads shown in the UK and EU, and both publish reach, which is what makes performance estimates possible. Everything else waits until these two are live.

**Meta Ad Library API: what it returns** ([field reference](https://developers.facebook.com/docs/graph-api/reference/archived-ad/))

| Data | Fields | What Exter uses it for |
| --- | --- | --- |
| Advertiser | Page ID, page name, beneficiary and payer (EU ads) | Which brand ran it |
| Ad copy | Body text, link titles, link descriptions, link captions (landing domain), languages | Copy analysis, landing pages |
| Timing | Created, delivery start, delivery stop | Days active, launch cadence, survival |
| Placements | Facebook, Instagram, Messenger, Audience Network | Platform mix, expansion to new placements |
| Reach | Total EU reach; reach by location for the EU and the UK | Reach velocity, share of voice, spend ranges |
| Audience reached | Age and gender distribution (UK and EU ads) | Who each ad actually reaches |
| Targeting | Age range, gender, locations chosen (UK and EU ads) | Each brand's targeting strategy |
| Creative file | Snapshot page link only, not the video or image file | Exter opens the snapshot and saves the file |

Coverage: commercial ads shown in the UK or EU, searchable for one year after they ran ([details](https://adsuploader.com/blog/facebook-ad-library-api)). Spend and impressions exist only for political ads.

**TikTok Commercial Content API: what it returns** ([ad details](https://developers.tiktok.com/doc/commercial-content-api-get-ad-details), [search](https://developers.tiktok.com/doc/commercial-content-api-query-ads))

| Data | Fields | What Exter uses it for |
| --- | --- | --- |
| Advertiser | Business ID, business name, country, paid by, TikTok account, follower count | Which brand ran it, brand size |
| Creative | Caption, video file links, image links, call to action, landing page, app download link | Creative analysis (video files come directly, no capture needed) |
| Objective | Campaign objective, for example Sales | Separating sales ads from awareness ads |
| Timing and status | First shown, last shown, active or inactive | Days active, cadence, survival |
| Reach | Unique users seen (rounded, for example "11K"), by country, by age and gender | Reach velocity, share of voice, who it reaches |
| Targeting | Users targeted, countries, age, gender, audiences included and excluded, interests, creator and video interactions, cities, languages, devices, spending power | Each brand's targeting strategy |
| Rejections | Reasons and affected countries for rejected ads | Compliance flags |

Search works by keyword (up to 50 characters) with filters for publish date (from 1 October 2022), country, ad type, status, reach band, age and gender, 10 results per page. There is no advertiser filter, so Exter searches each brand's name and keeps ads whose business ID matches. Field names in TikTok's docs are inconsistent (for example `paid_for_by` vs `paid_by`, `videos` vs `ad_videos`); verify against live responses.

**Neither source gives** spend, impressions, clicks, CTR, conversions or likes on ads. Exter estimates performance from reach, survival and scaling instead.

**Later sources (phase 2):** Google Ads Transparency Center, Instagram and YouTube organic posts, customer reviews, brand websites, and optional client ad accounts.

**Rules for every source**

- Save the video or image file at the moment of collection. Links expire within days.
- Preserve history. Meta API collection adds a dated observation when a stored
  field changes. An identical check advances last_confirmed_at on the latest
  observation instead of duplicating it. Keep the first raw payload and each
  changed payload; later observations may reference the earlier unchanged
  payload. Never delete old rows.
- Show the last successful check and the sample size next to every number.
- A failed source shows as failed with its reason, never as an empty result.

## Public previews and like-for-like comparisons (9 Nov 2026)

Owner-authorised extension to public collection; official reach and dates do not change.
Target an image, video poster or catalogue product image for every collected ad.
Hand new ads to the existing media queue after each successful collection.
Initial preview backfills continue in consecutive budgeted batches, without a daily
cap, prioritising longest-running leaders and high UK reach before new ads. Daily
limits apply to failed retries. Recover from existing paid datasets before buying
another lookup. Unreturned ads can use exact-ID detail lookup across countries,
while the original official UK record and Page remain mandatory. The client target
is at least 95% preview coverage per brand, with one controlled reason for the rest.
Winners defaults to ads with previews; a toggle reveals loading states. Catalogue
templates use stored product-card titles/images without altering official copy. Retry
missing previews daily, with controlled reasons. Show “No preview from Meta” only
after seven distinct failed UK days with a recorded reason. Budget/configuration
pauses do not count as failed media days. Show public image/video coverage on Creatives.

Retain full 720p H.264 videos for priority ads first (30+ days, brand top 20 by
published reach, or launched in the last seven days). With headroom below the
existing 80% disk limit, extend full videos to other known video ads, newest first.
Missing previews take precedence over optional video upgrades. Keep existing actor
result limits, price ceiling, budget guards, files and history.

Keep two separate fields: **media format** is Observed from media (video, static
image, carousel, catalogue); **creative style** remains the existing Modelled
UGC/creator-led/studio classification. **Product categories** are Modelled from
copy, headline and landing-page path using low-cost asynchronous Flash-Lite batches.
Store classification provenance separately; never replace official fields.
Unknown classifications are excluded from comparisons rather than guessed.

Each workspace has editable primary categories in Brand research. The owner's
home-fragrance workspace defaults to home fragrance and candles. Public comparisons
on Home, Competitors, Winners, Formats, Patterns, Creative detail and Briefs default
to **My categories** and **Same format**. Explicit category/format controls and
source-linked sample sizes describe the selected group. This does not filter or
combine private account performance, currencies or reporting scopes.

- Overview tables use format row groups inside one table, ordered by the brand's
  ad count, largest first. Show “Video · you 46 ads · competitors 312”.
- Hide a format group only when both sides have fewer than 10 ads; mention the
  hidden formats once. This visibility rule does not change metric formulas.
- Charts use a format switch, defaulting to the brand's largest visible format.
- Detail comparisons always use the selected ad's own format and a shared product
  category. Rank similar competitor ads by matching angle, then matching offer.
- Brief comparisons require all cited ads to belong to one eligible format group.
- Samples remain fictional, read-only and isolated behind `?demo=1`.

## Getting access: Meta and TikTok

Meta is waiting on Meta; TikTok needs one application, which TikTok says it answers within 2 working days. Exter collects nothing new from either until access is live.

**Meta Ad Library API (inactive today)**

The Exter AI Library app went to Meta App Review on 2 Nov 2026 (most reviews finish within 20 days, so expect it by about 22 Nov). Separately, the API still refuses the account with error 2332002, which has been reported to Meta with trace IDs.

1. **Before activation:** Codex builds and tests the connector on recorded sample responses. Browser capture keeps saving creative files.
2. **Activation day:** when the test query returns ads, generate a fresh token, extend it to 60 days, and add it as `META_ACCESS_TOKEN` on exter-ai and exter-worker in Render.
3. **Same day:** backfill the last 12 months for every watchlist brand, then collect daily at 3am.
4. **First week:** reach velocity, share of voice and spend ranges switch on; Working Score confidence rises from Medium to High.
5. **Within 60 days:** replace the token with a Business Manager system-user token so collection never stops on expiry.

**TikTok Commercial Content API (to apply for)**

1. **Account:** create a TikTok for Developers account with the official Exter Media email.
2. **Application:** apply on the [Commercial Content API page](https://developers.tiktok.com/products/commercial-content-api), describing Exter Media as an agency researching UK and EU ad transparency data. TikTok's page names "the public and researchers" and says nothing about commercial use, so ask TikTok in writing whether agency use is allowed.
3. **Keys:** on approval, add the client key and secret to Render as `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.
4. **Connector:** search each brand's name, keep ads whose business ID matches, fetch full details, and download video files at once (the links are signed and expire).
5. **If TikTok says no to agency use:** keep TikTok out of client reports, ask what terms they would accept, and use third-party library readers only if TikTok's terms allow it.

## What Exter reads from every creative

Exter analyses each unique creative once. Free open-source tools extract what is said and shown, a low-cost model picks the fixed values, and only unclear cases get full video analysis. Fixed values make ads countable across brands; a short note explains each choice.

| Field | Allowed values | Example: Valentte ad 1321091253011155 |
| --- | --- | --- |
| Format | UGC, creator-led, founder-led, studio product, lifestyle, motion graphics, static graphic, mixed | Studio product |
| Hook type | Offer-led, scarcity or restock, problem, question, bold claim, social proof, demo, testimonial, unboxing, trend | Scarcity or restock ("sells out fast, back now") |
| Angle | Value or bundle, urgency, gifting, quality or luxury, problem-solution, identity or values, social proof, newness, seasonal | Value or bundle, plus urgency |
| Offer type | Percent off, price drop, bundle or multibuy, free gift, free shipping, none | Bundle plus percent off (£39.99, over 50% off) |
| Claims | Each claim tagged: price, comparative, superlative, performance, provenance, values, social proof | "Made in the UK" (provenance), "5 Star Reviews" (social proof) |
| Audio | Voiceover, on-camera speech, music only, music plus voiceover, silent | Voiceover |
| People | Person on camera; talking to camera | No person on camera |
| Pacing | Length, cuts in first 3 seconds, seconds until product appears, captions on or off | 32 seconds, captions on |
| Text | Full transcript and on-screen text, each with timestamps | 8 spoken lines, 11 text overlays |
| Call to action | Exact CTA words | "Tap below to shop yours before it's gone" |
| Creator | Creator handle, only with proof (branded-content label or visible handle) | None |

**Rules**

- Comparative and superlative claims ("8x stronger than other reed diffusers", "UK's best") get a flag: may need substantiation under ASA rules.
- Background song lyrics are never treated as a voiceover.
- Unsure means "unknown", never a guess.
- A field is shown to clients only after it matches human labels on at least 90% of a 200-ad test set.

**How a video is analysed**

| Step | Tool | Output | Cost per ad |
| --- | --- | --- | --- |
| 1. Deduplicate | File hash and visual fingerprint | Each creative analysed once, however many ad IDs use it | Free |
| 2. Cut and sample | ffmpeg, PySceneDetect | Length, aspect ratio, scene cuts, cuts in the first 3 seconds, keyframes (one per cut, plus 3 a second in the first 3 seconds) | Free |
| 3. Speech | faster-whisper (open-source Whisper) | Timestamped transcript and language | Free |
| 4. Audio type | Audio classifier (YAMNet) | Voiceover, music only, music plus voiceover, silent; song lyrics never counted as voiceover | Free |
| 5. On-screen text | RapidOCR on keyframes | Timestamped overlays, captions on or off, prices and offers shown | Free |
| 6. People and product | Face detection; image matching against product photos from the brand's site | Person on camera, talking to camera, seconds until the product appears | Free |
| 7. Classify | Gemini 3.1 Flash-Lite, given steps 2 to 6 plus 8 low-resolution keyframes; thinking off, labels only | Format, hook type, angle, offer, claim types, CTA | About £0.0008 |
| 8. Escalate | Gemini Flash on the full video, only for low-confidence results and each week's top 10 ads | A second opinion on hard cases | About £0.013, on roughly 1 ad in 10 |

"Free" means no per-ad fee: steps 1 to 6 run on the Render worker Exter already pays for (Standard plan, 2 GB). Step 7 is priced at Flash-Lite's $0.25 per million input tokens and $1.50 per million output tokens ([pricing](https://www.usagepricing.com/blueprint/activity/google-gemini-2026-07-28-gemini-36-flash-ai-plus)); batch mode halves it.

**Cost per 1,000 creatives**

| Method | Cost |
| --- | --- |
| Current: Gemini Flash watches every full video at 3 frames a second | About £13 now; about £27 after Google's price rise on 1 Jan 2027 |
| New default: free extraction, Flash-Lite labels in batch mode, 1 in 10 escalated | About £1.70 to £3.50 |
| Fully free: free extraction plus an open model ([Qwen3-VL](https://freeapihub.com/ai-models/qwen3-vl), Apache 2.0) on Exter's own computer | £0 in fees; slower, needs a capable machine |

**Why quality holds:** transcripts and on-screen text come from tools built only for that job, and the model only chooses labels from that evidence. The new pipeline replaces the current one only if it matches the current method's accuracy within 2 points, field by field, on the 200 human-labelled ads.

## What Exter works out from public data

Public data never shows sales, so Exter infers performance from what advertisers do with their own money. Brands see their sales and keep paying for ads that work; how long an ad runs, how often it is copied and how widely it reaches are public signals of that decision.

| Metric | How it is calculated | Type | Needs |
| --- | --- | --- | --- |
| Days active | Stop date (or last seen) minus start date | Observed | Any collection |
| Relative longevity | Days active divided by the brand's median days active | Estimated | 10+ ads, 3+ stopped, for that brand |
| Reach per day | Published UK reach, or EU reach when UK is absent, divided by positive days running; an average over the saved period | Estimated | Published reach and running dates |
| Duplicates | Number of ad IDs using the same video or image file | Observed | Media saved |
| Iteration count | New versions of the same concept launched within 45 days | Estimated | AI analysis |
| Estimated impressions | Reach multiplied by a frequency range you set | Estimated, shown as a range | Meta or TikTok reach |
| Estimated spend | Impressions divided by 1,000, multiplied by a CPM range from your benchmarks | Estimated, shown as a range | Meta or TikTok reach |
| Modelled reach | For ads without reach: a model trained on ads that have it; hidden if its error is above 50% | Modelled | Meta or TikTok reach |
| Share of voice | A brand's estimated impressions divided by the whole watchlist's | Estimated | Meta or TikTok reach |
| Organic engagement | Engagements per view, or per follower; the two are never mixed | Observed | Organic sources |
| Proven-ad signal | Ran 30+ days, top third of the brand's longevity, and scaled (copied or iterated) | Estimated, rules-based | Collection history |
| Creative score | 0 to 100 against a best-practice checklist (hook in 2 seconds, product early, captions, clear offer, CTA, proof) | Estimated, rules-based | AI analysis |
| Predictive score | Likelihood a new creative becomes a proven ad, learned from creative features | Modelled | About 3,000 resolved ads from 30+ advertisers |
| Opportunity score | How often customers raise a need, against how few competitors address it | Estimated | Reviews plus AI analysis |
| Creator fit | Relevance, tone, language, location and engagement consistency, each shown separately | Estimated | Creator posts |

**The predictive score ships only when it earns it:** trained on older ads, tested on newer ones, beating simple baselines (AUC of at least 0.70). Until then the screen shows the rules-based proven-ad signal, labelled as such.

## Which ads are working: the Working Score

Every ad gets a Working Score from 0 to 100, recalculated daily and reported weekly. It ranks ads by how much their advertiser is backing them, which is the best public proof that an ad sells.

**Refresh:** daily once the Meta and TikTok APIs are connected (collection runs at 3am), weekly reporting on Mondays. Public sources update daily, so "real time" means within 24 hours.

**The four signals**, each turned into a percentile (0 to 100) against the same brand's other ads, so a small brand is not punished for spending less than a big one:

| Signal | What it measures | Calculation | Weight |
| --- | --- | --- | --- |
| Survival (S) | The advertiser keeps paying for it | Days active divided by the brand's median days active; ads still running are handled as unfinished, not short | 35% |
| Scaling (C) | The advertiser is putting more behind it | Duplicates (same file in several ad IDs) plus new versions of the same concept within 45 days | 25% |
| Reach velocity (R) | How fast it reaches people | UK and EU reach divided by days active (Meta reach or TikTok unique users seen) | 25% |
| Organic response (O) | How people react when it also runs as a post | Engagements divided by views, against the brand median | 15% |

```latex
\text{Working Score} = \frac{0.35\,S + 0.25\,C + 0.25\,R + 0.15\,O}{\text{sum of weights of available signals}}
```

When a signal is missing (no reach yet, no matching organic post), its weight is dropped and the rest are rescaled, and the confidence label falls.

| Label | Rule |
| --- | --- |
| Proven winner | Score 75 or more, and running 30+ days |
| Rising | Under 14 days old, and top third of the brand for reach velocity or already duplicated |
| Steady | Score 40 to 74 |
| Switched off fast | Stopped within 7 days of launch: likely a losing test |

**Confidence:** High when reach is available and the ad has been observed for 21+ days; Medium with survival and scaling only; Low under 7 days of history. Confidence is shown next to every score.

**Calibration:** for Exter Media clients who connect their ad account, compare the score with real ROAS and CPA every month and adjust the weights. The score is never described as sales or ROAS.

Automatic brand setup follows [AUTOMATIC-ONBOARDING-SPEC.md](AUTOMATIC-ONBOARDING-SPEC.md)
(BO-01 to BO-07): website understanding, domain-backed Page confirmation, verified
UK competitors and budgeted collection/enrichment. Manual overrides remain authoritative.

## Brand vs competitors: what is missing and what to work on

Exter compares the brand with its competitors on the same fields, then turns the differences into a ranked list of what to test, scale, fix or stop.

**Scorecard (brand against the competitor average, every week)**

| Metric | Calculation |
| --- | --- |
| Share of voice | Brand's estimated impressions divided by the watchlist total; before the Meta API, share of active ads |
| Activity | Active ads, new ads this week, ads stopped this week |
| Staying power | Median days running; share of ads that are proven winners |
| Testing pace | New concepts per month; versions per concept |
| Creative mix | Share of ads by format, hook type, angle, offer type and claim type |

**Three numbers behind every recommendation**, worked out for each value of each field (for example the angle "gifting"):

- **Usage gap:** competitors' share of ads using it minus the brand's share, in percentage points.
- **Category win rate:** proven winners using it divided by all category ads using it (only when 10+ ads use it).
- **Customer demand:** share of the brand's reviews that mention the matching need or objection.

```latex
\text{Priority} = \text{category win rate} \times \text{usage gap} \times (1 + \text{customer demand})
```

**What each result means**

| Action | When | What Exter suggests |
| --- | --- | --- |
| Test now | High category win rate, brand uses it 15+ points less than competitors | A brief with 3 variants, linked to the competitor ads that prove it |
| Scale | The brand's own winners sit in an angle competitors barely use | More versions of the winning concept, new creators |
| Fix | The brand uses it a lot but wins less than the category | New hooks or formats for the same angle |
| Reduce | Low win rate everywhere, and the brand overuses it | Move budget to Test now items |
| Watch | A competitor angle that is new or rising this week | Note in the report; test if it is still rising next week |

The top 3 priorities each week come with the numbers, 3 example ads and a ready brief.

## The weekly report

Every Monday at 6am, Exter freezes a weekly data pack per client brand covering the previous 7 days (Excel, CSV and chart images). Exter Media writes the client report from it; the pack covers everything below, with definitions and sample sizes.

1. **Headline:** 3 findings in one sentence each, with the number behind each one.
2. **Top working ads:** the 5 highest Working Scores for the brand and for each competitor, with thumbnail, score, label, confidence and the signal that drives it.
3. **Rising this week:** new ads already scaling fast, brand and competitors.
4. **What changed:** ads launched and stopped, new concepts, new offers, shifts in angle mix, share of voice up or down. Campaigns launched and ended this week, with offers.
5. **Offers:** share of new ads with an offer and the deepest discount, per brand, against the same week last year.
6. **Brand vs competitors scorecard:** this week against last week.
7. **What to work on:** the top 3 priorities (Test now, Scale, Fix, Reduce), each with its numbers, 3 example ads and a linked brief.
8. **Last week's tests:** how the brand's newly launched ads are doing on the Working Score.
9. **Data coverage:** ads observed, sources checked, last successful check, what is estimated and why.

Every number in the report opens its ads and its calculation. Each week is saved, so trends build up month on month.

## Market activity layer (added 16 Nov 2026)

Exter ranks individual creatives. This layer adds the campaign-level view agencies plan with: what each competitor is running, with which offers, how this compares with last year, and what to do this week. It reuses data Exter already collects wherever possible.

**1. Weekly opportunities (Home)**

Every Monday, Exter writes up to 3 opportunity cards per client brand. Each card has:

- A one-line play, written as an action ("Put the refill kit in your gifting ads this week").
- Tier (1 to 3) and timing (This week, Next 2 weeks, Plan for next month).
- The evidence: the numbers behind it (Working Score winners, usage gap, offer share, creator trend size, last year's timing), each one opening its ads or posts.
- What changed since last week, and whether last week's suggestion was acted on.
- What to do: 2 to 4 specific steps (how many ads, which format, which campaign, which creators, which words customers use).
- Sources and a link to the brief.

Cards expire when their trigger stops being true. Opportunities and briefs keeps the full history.

**2. Campaigns**

Exter groups each brand's ads (and later posts, emails and creator content) into named campaigns. The grouping signals are: same landing page or collection, same stated offer, same theme or product, launch dates within 14 days, and similar copy. AI names each campaign ("Black Friday Sale, up to 50% off"). Each campaign shows its brand, dates, status (live or ended), pieces by channel, active ads, offer and depth, products featured, its top ads by Working Score, and a weekly launch chart. Labelled Estimated, because the grouping is inferred. Strategists can merge, split or rename campaigns.

**3. Offer tracking**

For every new ad, Exter reads the stated offer from the copy, headline and on-screen text: percent off, money off, bundle, free gift, free delivery, discount code, buy one get one, or none. It also reads the depth ("up to 50%"). Weekly per brand, it shows: the share of new ads with an offer, the mix of offer types, and the deepest discount stated. Observed from the ad text. Feeds the scorecard, campaigns and opportunities.

**4. Same period last year**

For any date range, Exter shows each brand's campaigns and stated offers in the same weeks last year, with their dates and length. It uses the ad library's history where it keeps it (EU-delivered ads, and UK where available) plus Exter's own saved history. Missing sources are named, never filled in. This is used to plan seasonal moments (Black Friday, Christmas, January sale, Mother's Day).

**5. Creator trends**

Exter tracks public creator and press posts that mention or tag the client brand and its competitors (Instagram and TikTok first). Each post is classed as paid (#ad, paid partnership), gifted, affiliate (discount code), brand partnership or earned. Weekly per brand: creator posts by type, creator size, views and interactions, and discount codes seen. Trends: recurring themes across posts (for example "Black Friday wishlists"), with the posting accounts per week, total reach and phase (Emerging, Rising, Steady, Fading), plus the top posts. These creators feed the Creators screen as warm candidates.

**6. Product and review signals**

Per competitor website (product feeds where public): product launches, removals, low stock, stockouts, restocks and markdowns, weekly. Per brand: review rating and count, with change over time. These are used as evidence in opportunities (for example "competitor stocked out of X"). Phase 2. Collected within the data-provider budget, with UK GDPR rules unchanged.

**Order:** 1 to 3 first (they use ads already collected), then 4, then 5 and 6. None of this starts until the core loop works on real data: Winners, creative breakdown, Patterns, briefs.

## Creator Sales Signal and ROAS forecasting

Owner-authorised extension, 20 November 2026. These items extend Creators without
changing its strict individual-creator screening, data budgets or privacy rules.
Sales Signal is an **Estimated research checklist**, never ROAS, verified sales,
a conversion prediction or permission to weaken the existing Results gate.

### CP-01 Creator ad evidence

Link only directly supported creator identities: partnership/co-author or
whitelisted creator handles/profile links, explicit ad-copy credits, and visible
handles with recorded on-screen timestamps. A name, face, ordinary brand mention
or a guessed handle is insufficient. Copy credits need wording such as “with”,
“by”, “featuring” or a creator-credit label beside the handle. Keep the proof kind,
short supporting quote/timestamp, source ad, brand and check date. Several proof
kinds for one ad count as one ad; one creator can feature in many ads.

Per creator show featured ads, brands, days running, exact creative/copy versions,
published UK reach, real Working Score when available, and published reached
age/gender/country groups. Never invent a Working Score. This is the audience of
the linked ads, not a demographic inference about the creator or their followers.
Per-ad reach can overlap; totals describe published ad reach, not unique people.
Archive IDs never establish owned-account ad identity. Build links in bounded
background index chunks, including existing ads on deploy, not raw scans on reads.

### CP-02 Creator Sales Signal

Version `creator-sales-v1` is a provisional deterministic checklist needing outcome
validation. Its five maximum weights are: ad backing 35, repeat brand use 20,
sponsored response 15, audience fit 20 and authenticity 10. Each part is normalised
0–100. Overall score = sum(part value × available weight) / available weight,
rounded to an integer. Missing parts drop out, never fail or earn free points.
Coverage is available weight / 100; show Provisional below full coverage. High
confidence requires >=80% coverage and >=10 distinct ads; Medium requires >=50%
and >=3 ads; otherwise Low. These are evidence sufficiency labels, not probabilities.

- Ad backing: mean of the median real Working Score and longevity, each half of
  the 35 weight. Longevity = min(longest observed days / 90, 1) × 100. Omit either
  missing half and reduce coverage. These are advertiser-backing signals only.
- Repeat brand use: share of linked brands with at least two dated campaign
  bursts, separated by 30 days, ×100. Require explicit partnership/whitelist proof
  or reported campaigns. Ad copies/versions within a burst are not separate deals.
  The interface calls this repeat brand use; it cannot prove payment or a contract.
- Sponsored response: median post engagement / median organic engagement / 2,
  capped at 1, ×100. Use dated likes+comments divided by the same checked follower
  count. Need at least three disclosed paid posts and three organic posts within
  the latest twelve. Gifted/unclear posts are excluded from the organic baseline.
  A zero or absent organic baseline leaves this part unassessed.
- Audience fit: equally weighted available subparts: published UK share of linked
  ads' country reach; fraction of the brief's niche terms matched in saved public
  text; overlap with requested reached ages/genders, when explicitly selected.
  Do not use the creator's likely base as their audience's country. A UK-only
  publication does not prove 100% of the whole audience is UK. Mark country reach
  as a published sample. Missing subparts reduce the available 20 weight.
- Authenticity: reuse the existing assessed comment/history risk check: 100 when
  assessed with no flags, 0 with recorded flags, otherwise unassessed. This cannot
  prove fake followers or fraud.

Show earned/available weight, confidence, each formula and its source counts.
Example: “3 competitor ads, longest 74 days, 9 versions”. All counts open those ads.
Keep original observation dates and metrics. Saved segments and exports share the
same Sales Signal filter. No Sales Signal can admit a rejected creator to Results.

### CP-03 Discovery controls

Add a plain-English brief helper that proposes supported filters and displays them
before any paid search. Parse country, follower range/tier, selected content style,
niche and minimum Sales Signal; unrecognised requests stay visible as not applied.
It does not silently execute a search or use niche terms for account-name searches.
“Find creators like these” accepts one to three valid handles, using the existing
budgeted seed discovery. “Find creators for this brief” carries the selected stored
opportunity's category, creator profile and format into an editable search brief.
Keep the existing price quote and explicit Find creators step. Support sort/filter
by Sales Signal; missing scores sort last. Screening rules always apply first.

### CP-04 Own-account outcomes and history import

Observed spend, ROAS, CPA, hook and hold rates use shared/owned-metrics.ts and its
minimum samples, only for the connected workspace's owned ad IDs with explicit
partnership/whitelist identity. Never match archive and owned IDs by numeric
coincidence. Preserve account, currency, attribution, event, category, format and
dates as separate cohorts. Missing identity can be confirmed against an owned ad
in Creators; confirmation does not turn a public ad into an owned record.

Import CSV columns: creator_handle, brand, platform, start_date, end_date, spend,
revenue, roas, cpa, content_type. Optional campaign_id, purchases and ad_ids support
stronger checks and deduplication. Select currency, category, account/reporting
scope and product in the import form. Only the workspace's own brand is allowed;
never import competitor outcomes. Non-negative finite values, valid inclusive
dates, handles and formats are mandatory; empty optional metrics remain missing.
If spend and revenue exist, ROAS must match revenue/spend within rounding tolerance.
If purchases exist, CPA must match spend/purchases. Reject invalid rows atomically,
report row numbers and retain prior imports. Duplicate campaigns are idempotent;
conflicting revisions require a new campaign identifier. Label “Observed · imported”
and distinguish it from synced account reporting. Imports never invent purchases,
video views or impressions, and cannot establish an ad-level validation gate.
Store the Sales Signal feature snapshot only when recorded before campaign start;
late retrospective features cannot enter forecast training.

### CP-05 ROAS forecast training and publication

Training is explicit, bounded and off web startup. Only after at least 50 distinct
creators have resolved own-brand outcomes within one reporting cohort may Exter fit
a regularised log(1+ROAS) regression on the five Sales Signal inputs and missingness
flags. Freeze features before campaign start, and outcomes before the holdout.
Hold out the newest 20% of creators in time order; no creator/family crosses the
split. Predictions use only training data. Save model version, coefficients,
cohort, feature times, split dates and training IDs. Report held-out mean absolute
error against a training-median baseline and an empirical 90% error range. Do not
use training error as confidence or fit the final model on the holdout.

Fifty creators permit training, not publication. The existing AC-04 gates remain:
3,000 independent resolved holdout ads, account/category/format separation, AUC
>=0.70 for beating the account benchmark and passing calibration, from real owned
outcomes. Imports without those linked verified ad outcomes cannot release that
gate. A continuous forecast additionally needs held-out absolute error better than
the median baseline and >=85% coverage of its stated 90% range. Show validation
score, sample, version, range and confidence whenever a forecast is published.
Fixtures never open a live gate. Keep unvalidated forecasts out of cards, exports
and client reports. Below 50 show “Forecast available after 50 creator outcomes
(X so far)”. Above 50 but before validation say “Forecast is in validation”.
Expose model checks on Settings > Accuracy; never call a public Sales Signal ROAS.

### CP-06 Privacy and safety

Public professional profiles and explicitly published business contacts only.
No personal contacts, follower lists or inferred sensitive traits. Public ad reach
demographics describe published ad audiences only. Keep workspace access, deletion,
suppression, retention and fixture/sample isolation unchanged. Delete creator also
removes their new association/profile data and training artefacts containing it.
No outreach, provider calls from reads, budget increases or official reach/date
changes are authorised by this extension. Fixtures are not live verification.

## Platform screens

Fourteen screens, one per job. The rule across all of them: every number and every finding opens the ads behind it.

| Screen | What it shows | What you can do |
| --- | --- | --- |
| Brands | All client and prospect brands, last checked, alerts | Add a brand, its competitors and category keywords |
| Overview | 3 weekly opportunity cards; ads collected, active and analysed; format mix; top hooks and angles; what changed this week | Click any number or finding to see its ads |
| Campaigns | Live and ended campaigns per brand, with offer, dates, channels and top ads | Merge, split or rename campaigns |
| Last year | Campaigns and offers in the same weeks last year | Choose a date range |
| Creative library | Gallery of every ad as a thumbnail with format, days running and 2 to 3 tags | Filter by brand, format, hook, angle, offer, UGC; search transcripts and on-screen text |
| Ad detail | The video or image beside its full analysis | Play, jump to a timestamp, open in Meta Ad Library, previous and next ad |
| Competitors | The brand against 3 to 5 competitors: activity, longevity, format mix, hooks, angles, offers, UGC share | Switch metrics, open example ads per brand |
| Patterns | Bar charts by hook, angle, offer, format, claim type | Click a bar to filter the library |
| Customer voice | Review themes: needs, objections, outcomes, with real quotes and counts | Link a theme to an angle or brief |
| Opportunities and briefs | 3 ranked angles (gap or proven), each with evidence; a full brief per angle | Edit, approve, export a brief, send it to a creator |
| Creators | Shortlist cards: profile, fit components, example posts, ads they already appear in | Shortlist, compare, export |
| Scores | Creative score per ad; upload a draft to score it before launch; predictive preview | See which checklist items a creative misses |
| Ask Exter | Questions answered from the stored evidence, with citations | Ask, open cited ads, save an answer to a report |
| Reports | Clean read-only client report, sections badged Live, Beta or Preview | Share a link, export to PDF |

Settings sit apart: data sources and their health, watchlists, budgets, users and client access.

Two more screens serve the weekly cycle: **Winners** (every ad ranked by Working Score, filterable by brand, label and week) and **Weekly report** (the Monday report, with past weeks saved).

## Core data model

Eighteen objects. The brand is the centre: everything Exter knows hangs off a brand, and every insight points back to evidence items.

| Object | Key fields | Links to |
| --- | --- | --- |
| Workspace | Name, users, roles (agency or client) | Brands |
| Brand | Name, website, category, country, Meta page ID, Google advertiser ID, TikTok and Instagram handles, client or competitor | Workspace, competitors |
| Watchlist | Brands, category keywords, countries, schedule | Brand |
| Collection run | Source, start and end time, status, records new and updated, errors | Watchlist |
| Ad | Platform, native ad ID, start and stop dates, last seen, platforms, ad copy, CTA link, Ad Library link | Brand |
| Ad observation | Change date, last confirmed date, active or not, UK and EU reach, impression range, raw source data or its retained reference (one row per changed state; historical evidence retained) | Ad, collection run |
| Media asset | File hash, type, duration, stored file, thumbnail | Ad |
| Creative analysis | Model, mode, prompt version, all fields from the creative table, tokens, cost | Ad, media asset |
| Evidence item | One statement (a hook, claim, transcript line, review sentence), its source and timestamp, search embedding | Ad or review |
| Review | Source site, rating, date, text | Brand |
| Theme | Type (need, objection, outcome, desire), name, how often it appears | Evidence items |
| Creator | Handle, platform, followers, country, language | Posts, ads |
| Creator post | Date, caption, views, likes, comments (dated snapshots) | Creator |
| Opportunity | Angle, gap or proven, score components | Evidence items, themes |
| Brief | Hooks, format, script beats, proof points, creator profile, status | Opportunity, creators |
| Score | Ad or uploaded draft, best-practice or predictive, value, model version, main drivers | Ad |
| Human label | Field, value, labeller, date | Ad |
| Cost record | Cost type (inference or data provider), amount, request | Collection run or analysis |

## Data honesty rules

Exter Media underpromises and overdelivers, so the platform never shows a number it cannot stand behind. Every number carries one of four labels.

| Label | Meaning | Example |
| --- | --- | --- |
| Observed | Published by the source | Meta's UK reach for an ad |
| Estimated | Calculated from observed data plus stated assumptions, shown as a range | Spend of £3.1k to £6.8k |
| Modelled | Predicted by a trained model, with its error shown | Reach for an ad Meta does not publish |
| Unavailable | Not known; never filled with a guess or a zero | Engagement on an ad with no public post |

**Never claimed**

- Competitors' sales, conversions or ROAS.
- "Every ad in the category": results are samples, and the sample size is always shown.
- Audience demographics, unless the source publishes them.
- UGC or influencer content without proof (a branded-content label or a visible creator handle).
- A predictive score before it passes validation.

**Always shown**

- Sample size and date range next to every chart.
- The last successful check for each source.
- Live, Beta or Preview on every section a client sees.
- Illustrative sample data is never mixed with real data, and is off by default.

## Status today and build order

The engine works: Exter collects real ads and reads them accurately with AI. What is missing is the layer people see and use, plus competitor, review and creator data.

| Capability | Status on 3 Nov 2026 |
| --- | --- |
| Hosting, login, budgets, backups | Live |
| Meta ad collection (browser capture) | Live: 58 Valentte ads; keeps saving creative files |
| AI analysis, current full-video Gemini method | Live: 14 of 14 creatives; to be replaced by the low-cost pipeline |
| Low-cost video pipeline (Whisper, OCR, Flash-Lite) | To build; switches on only after matching accuracy on 200 labels |
| Labelling tool | Built; human labels not yet done |
| Meta Ad Library API | Inactive: App Review submitted 2 Nov 2026; account error reported to Meta |
| TikTok Commercial Content API | Not applied for yet; TikTok answers within 2 working days |
| Real data shown in Overview and other pages | Not wired: pages are empty |
| Fixed categories (hook, angle, offer, claim type) | In progress |
| Creative library and ad detail | To build |
| Working Score, competitor comparison, What to work on | To build |
| Weekly data pack | To build |
| Customer voice, creators, Google ads | Phase 2 |
| Market activity layer (opportunities, campaigns, offers, last year, creator trends, product and review signals) | To build, after the core loop works on real data |

Working Score, gap analysis and the weekly report are still to build. Survival and scaling can start now from browser collection history; reach velocity and share of voice need the Meta or TikTok API.

**Build order (one theme per week; each week ends with something you can show a prospect)**

1. **Week 1, 3 to 9 Nov: usable, and cheap to run.** Wire real Valentte data into every page and apply the clean design system. Creative library and ad detail: watch each ad beside its analysis. Build the low-cost video pipeline; Benjamin labels 200 ads to test it.
2. **Week 2, 10 to 16 Nov: score and compare.** Apply for the TikTok Commercial Content API on day 1. Working Score from survival and scaling; competitor comparison. What to work on, with briefs; switch the video pipeline only if accuracy holds.
3. **Week 3, 17 to 23 Nov: TikTok live (once approved).** TikTok connector: search by brand, full ad details, video files saved. TikTok reach and targeting feed the Working Score and comparisons. Weekly data pack every Monday: Excel, CSV and charts.
4. **Week 4, 24 to 30 Nov: Meta API live (once activated).** Activation day: 12-month backfill, then daily collection at 3am. Reach velocity, share of voice and spend ranges switch on. Working Score confidence rises to High; client report links.

**Gate:** AI fields must match 200 human labels on 90% before clients see them. Meta and TikTok dates depend on their approvals; each connector ships the day access arrives.

Week 1 comes first because nothing else can be shown until real ads appear in the pages; the TikTok and Meta weeks move earlier if either approval comes sooner.

## Product focus versus Motion and similar tools

Motion (motionapp.com) already covers own-account creative analytics, own-ad scores, reports, AI tags and a Meta-only competitor library. Exter does not compete on those. Build effort goes first to what differentiates Exter Media's service:

1. Competitor evidence from both Meta and TikTok, with the Working Score on competitors' ads.
2. Brand vs competitors gaps and "What to work on", ending in ready briefs.
3. Customer voice from reviews, linked to angles and briefs.

Whole-market trackers (e.g. LittleBirdie) cover campaign, offer and channel activity broadly but don't rank individual creatives or produce briefs; Exter adds the campaign and offer view on top of its creative winners, not instead of them.

Owned results and own-ad scores stay as they are; do not expand them until the three items above are live.

## Accuracy gates

Follow [ACCURACY-SPEC.md](ACCURACY-SPEC.md) for field-level measurements,
3,000 resolved time-holdout outcomes, AUC 0.70, calibration and recommendation
tests. Internal experimental likelihoods are labelled Estimated, not yet
validated; client reports exclude them until their exact model/cohort passes.
Public winner likelihood never claims competitor conversions.
