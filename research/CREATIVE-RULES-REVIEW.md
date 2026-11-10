# Creative rules review

Reviewed 9 November 2026. Research proposals only: **no product code, formula,
weight, prompt, model, collection or UI behaviour changes in this PR**.

The imported skills are reference material, not product requirements.
[PRODUCT-SPEC](PRODUCT-SPEC.md), the own-account
[CREATIVE-ANALYTICS-SPEC](CREATIVE-ANALYTICS-SPEC.md) and
[UI-SPEC](UI-SPEC.md) take precedence. This document uses Exter's own wording;
source names below are internal attribution, never proposed user-facing copy.
The kernel remains paused and both owned-account live gates remain open.

## Sources, licence and evidence strength

Nine distinct skills are retained from
[thatrebeccarae/claude-marketing](https://github.com/thatrebeccarae/claude-marketing/tree/a8a63ec1341f05ec9c1e9cb52b4edeb14e3bdcba),
revision `a8a63ec1341f05ec9c1e9cb52b4edeb14e3bdcba`. Each has its own unchanged
MIT licence. The upload was flattened; exact Git blob matches establish the
folder/file mapping. [Import inventory](../.agents/skills/README.md) and
[provenance manifest](../.agents/skills/marketing-provenance.json) record kept,
deduplicated and removed files. No upstream script was installed or executed.

| Source key | Retained skill and relevant documents |
| --- | --- |
| FB-S / FB-R / FB-C / FB-E | [facebook-ads](../.agents/skills/facebook-ads/SKILL.md), [REFERENCE](../.agents/skills/facebook-ads/REFERENCE.md), [CHECKS](../.agents/skills/facebook-ads/CHECKS.md), [EXAMPLES](../.agents/skills/facebook-ads/EXAMPLES.md) |
| XP-S / XP-R | [cross-platform-audit](../.agents/skills/cross-platform-audit/SKILL.md), [REFERENCE](../.agents/skills/cross-platform-audit/REFERENCE.md) |
| TT-S / TT-E | [tiktok-ads](../.agents/skills/tiktok-ads/SKILL.md); its REFERENCE is a five-line placeholder; [EXAMPLES](../.agents/skills/tiktok-ads/EXAMPLES.md) |
| CA-S / CA-R | [competitor-ads-analyst](../.agents/skills/competitor-ads-analyst/SKILL.md), [REFERENCE](../.agents/skills/competitor-ads-analyst/REFERENCE.md) |
| BD-S / BD-R | [brand-dna](../.agents/skills/brand-dna/SKILL.md), [REFERENCE](../.agents/skills/brand-dna/REFERENCE.md) |
| ICP-S / ICP-R | [icp-research](../.agents/skills/icp-research/SKILL.md), [REFERENCE](../.agents/skills/icp-research/REFERENCE.md) |
| WS-S / WS-R | [wasted-spend-finder](../.agents/skills/wasted-spend-finder/SKILL.md), [REFERENCE](../.agents/skills/wasted-spend-finder/REFERENCE.md) |
| AS-S / AS-R / AS-E | [account-structure-review](../.agents/skills/account-structure-review/SKILL.md), [REFERENCE](../.agents/skills/account-structure-review/REFERENCE.md), [EXAMPLES](../.agents/skills/account-structure-review/EXAMPLES.md) |
| MR-S | [market-research](../.agents/skills/market-research/SKILL.md) |

Evidence grades used in every rule table:

- **D: cited data.** A traceable study/dataset with sample, method and relevant
  outcome. **None of the imported creative-effectiveness thresholds meets this
  standard.** Worked example tables and numerical claims are not study data.
- **P?: platform guidance claimed, unverified.** A technical placement/platform
  statement in the skill, without a dated primary platform citation. It must be
  checked against current placement documentation before becoming a restriction.
  No row here is promoted to verified platform guidance merely for mentioning Meta.
- **O: opinion or operational convention.** A useful hypothesis or checklist,
  not evidence that satisfying it improves outcomes. Unsupported percentages,
  numeric thresholds and example recommendations also get O.
- **X: transfer limitation.** Added to a grade when advice is for another platform,
  account management or a worked example rather than an individual Meta ad.

The source files contain no linked empirical study supporting these creative
rules. Their Meta API example still names v19.0; Exter's connector version and
metric definitions must not be replaced with it. Primary placement limits,
recommendations and eligibility may have changed since the skill's March 2026
metadata. This is a review of the retained upload, not fresh verification of
platform documentation or advertising results.

## What Exter actually has

Availability is per ad. Many collected ads have only public copy/dates/reach;
media, tags, transcripts and scenes are optional. A file or field existing in a
TypeScript interface does not mean all 7,800 collected ads have it.

| Data | Current basis and limit | What can be checked without collecting new data |
| --- | --- | --- |
| Official copy, headline where returned, start/stop/status, platforms, published UK/EU/country reach | Observed when supplied; an omitted value stays missing. Capture endpoints do not prove uninterrupted delivery. | Literal words, dates, counts and existing reach-per-day arithmetic. No spend, impressions, clicks, frequency, purchases or sales inference for competitors. |
| Video transcript, on-screen text, hook, CTA, offer, claims, tags and timestamps | Existing analysis annotations are Modelled; confidence is uncalibrated. Coverage/timestamp bounds must be usable. Lyrics are not speech. | Compute timing/text-presence checks from existing annotations; attach quotes/time links and retain human review. No fresh model call is implied. |
| Still-image/carousel text and one-based image indices | Modelled annotations. Empty indices can mean copy-only support. | Text/offer/CTA presence and first-slide placement only with image support. No video timing from a still or poster. |
| Scenes and optional retained video dimensions/duration | Scenes can be absent; dimensions may exist in saved video normalisation metadata rather than the browser response. | Compute cuts/length/ratio where the stored metadata exists. A current screen endpoint might still need an approved projection later. |
| Media format, creative style, product category | Media format is Observed from media; creative style and category are separate Modelled labels. | Like-for-like category/format samples and style comparisons. Unknown tags are excluded, never inferred from brand fame. |
| Days running, exact file/copy versions, dated public observations | Observed facts and existing Estimated derivatives, subject to complete copy/hash and collection scope. Similar copy is not an exact duplicate. | Age, observed changes and repeat-use counts. No causal fatigue, profitability or actual audience exposure from these alone. |
| Owned ad days, account/currency/attribution/event scope | Read-only fixtures and implementation exist; live gates remain open. Only successfully synced, available fields can support an actual analysis. | Existing spec metrics, ratios of sums and account benchmarks. This is not evidence that every owned field is live-verified today. |
| Brand website research, saved reviews, approved brand context | Publisher statements/quotes have their own provenance; they are not independent proof of product performance. | Compare supplied copy with an approved message or documented quote. Audience age, customer identity, review truth and rights cannot be guessed. |

Read-only code anchors: [video fields](../shared/video-analysis.ts),
[image fields](../shared/image-analysis.ts),
[public signals/versions](../shared/public-signals.ts),
[current checklist](../server/demo/scores.ts),
[prediction preview](../server/demo/prediction.ts).
The proposed extraction stages in PRODUCT-SPEC are not a claim that the paused
kernel already supplies product-presence timing, caption geometry or audio rights.

## A. Concrete rules found in the retained guidance

This inventory covers creative execution, presentation, messaging, proof, fatigue
and creative-test interpretation. Identical repeats are merged; materially different
thresholds are retained separately. Portfolio/account checks are labelled as such,
so an individual static ad is not failed because its account lacks video. Google
keyword, bidding, pixel/CAPI, audience exclusion and budget-management checks are
outside a Meta creative checklist; they are not silently converted into creative
points. Thresholds below describe source claims, not approved Exter settings.

### Opening, product timing, captions and pacing

| ID | Concrete rule or claim, paraphrased | Skill and exact source location | Evidence | Exter decision |
| --- | --- | --- | --- | --- |
| R01 | Put an identifiable opening message in the first three seconds of a Reels/Stories video. | XP-R, Format Requirements by Platform; TT-S, Creative Best Practices | P? for the placement assertion; O for effectiveness; TT is X | Timed annotations can be checked. PRODUCT-SPEC's creative checklist says two seconds; the imported three-second claim does not override it. |
| R02 | In the short-video template, use seconds 0–3 for the opening, roughly 3–15 for the explanation, and the final three seconds for the CTA. | TT-S, The TikTok Creative Formula | O-X | Time the existing transcript/CTA where supported. Treat the exact windows as a cross-platform experiment, not a Meta requirement. |
| R03 | Use opening text, an unexpected image or direct address to establish the opening. | TT-S, Creative Best Practices 1 | O-X | Existing hook/text annotations can suggest examples; whether an image interrupts attention needs viewing and outcomes. No automatic pass for a stock phrase. |
| R04 | Provide on-screen text; the source claims 73% of leading ads use it. | TT-S, Creative Best Practices 5 | O-X; no dataset or definition of leading ads | Text presence can be counted. The percentage cannot justify a score weight or mandatory caption rule. |
| R05 | Make a cut about every two to three seconds. | TT-S, Creative Best Practices 6 | O-X | Scene times can measure cuts where complete. Do not fail a strong demonstration, static ad or deliberately long shot for this cadence. |
| R06 | Prefer phone-shot people and a social-feed style over highly polished production. | TT-S, Creative Best Practices 2 and 7 | O-X | Existing style/person labels can describe execution; no universal preference or bonus is established. Creator/UGC identity still needs Exter's explicit proof. |
| R07 | Design around sound; the source claims 93% of consumption is with sound. | TT-S, Creative Best Practices 3; XP-R, Meta Reels/Stories row | O-X for the percentage; P? for placement recommendation | Audio/transcript annotations describe content, not whether a viewer had sound on. Preserve an independent muted-view review. |
| R08 | Show the product early; provide accurate captions; use real proof. | No retained skill supplies a Meta product-appearance deadline, caption accuracy threshold or proof-quality timing rule. PRODUCT-SPEC, Creative score row, supplies the goals. | Exter product requirement, not a sourced effectiveness result | These are explicit gaps in the imported evidence, not invented skill rules. Product timing/caption accuracy/proof truth require the additional evidence described below. |

### Placement and text fit

All dimensions/durations in this table are **claims in the source**, not freshly
verified Meta upload limits. They must not reject existing ads or change Exter's
media storage settings.

| ID | Concrete source rule | Skill/location | Evidence | Checkability and limit |
| --- | --- | --- | --- | --- |
| R09 | Supply a vertical 9:16 video for Stories/Reels; square/tall-feed video alone is weaker coverage. | FB-C, M-CR3; XP-R, Format Requirements | P? | Saved original dimensions plus actual placement are needed. A re-encoded derivative's ratio may be available, but does not prove the delivered crop. |
| R10 | Feed still image: 1:1, 1080 × 1080. | FB-R, Creative Specifications / Image Ads | P? | Media dimensions may permit a technical check; actual placement and current requirements need verification. |
| R11 | Stories/Reels still image: 9:16, 1080 × 1920. | FB-R, Image Ads | P? | Same limitation as R10. |
| R12 | Right-column still image: 1.91:1, 1200 × 628. | FB-R, Image Ads | P? | Same limitation as R10; this is a placement claim, not a sales-quality criterion. |
| R13 | Marketplace still image: 1:1, 1080 × 1080. | FB-R, Image Ads | P? | Same limitation as R10. |
| R14 | Feed video: 1:1 or 4:5; 15–60 seconds, with 15 called optimal. | FB-R, Video Ads | P? for format claim; O for optimal length | Duration/ratio may be measurable. The stated optimum has no outcome evidence and must not become a universal pass/fail. |
| R15 | Stories/Reels video: 9:16 and 15–30 seconds. | FB-R, Video Ads | P? | Duration can be checked for retained media; it is not a verified current maximum. |
| R16 | In-stream video: 16:9 and 5–15 seconds. | FB-R, Video Ads | P? | Needs actual placement; do not infer in-stream delivery from a landscape file. |
| R17 | Keep primary copy under 125 characters before expansion. | FB-R, Text Limits | P? for expansion claim; O for copy advice | Count complete copy. Expansion varies with placement/device; longer copy is not a failed creative. |
| R18 | Keep headline under 40 characters. | FB-R, Text Limits | P? | Count an actual headline field, not a guessed title from ad copy. Verify current placement behaviour. |
| R19 | Keep description under 30 characters. | FB-R, Text Limits | P? | Description is not guaranteed to be collected/projected; missing means unassessed. |
| R20 | Use a CTA button whose action matches the viewer's next step. | FB-R, Text Limits / CTA Button | O; preset-button support is P? | Existing CTA words can be checked; the real rendered button and destination flow may be absent. |
| R21 | Do not letterbox a horizontal file into a vertical short-video placement. | TT-S, Creative Best Practices 4 | O-X / P? | Stored ratio alone cannot reveal black bars, crop or obstructed text; needs frames/rendered placement review. |
| R22 | Short-video in-feed template: vertical 9:16, 5–60 seconds. | TT-S, Ad Formats / In-Feed | P?-X | Different platform's format claim, not a Meta limit. |
| R23 | Keep core proposition, promotion, destination experience and recognisable voice consistent across platforms, adapting tone/length/format. | XP-R, Cross-Platform Creative Alignment | O | Compare available copy and approved context. Destination consistency needs the current landing page and commercial terms. |

No retained source defines Meta safe-zone pixel boundaries, minimum caption font
size, contrast ratio, complete-speech caption coverage or a first-product deadline.
Do not manufacture those thresholds. A future placement check needs current primary
specifications and the actual rendered asset, not a social screenshot or poster.

### Message, offer, proof and audience fit

| ID | Checkable rule or research proposition | Skill/location | Evidence | Exter decision |
| --- | --- | --- | --- | --- |
| R24 | State a specific audience problem and an intelligible benefit, rather than an unsupported list of features. | ICP-S, Key Principles 1–3 and Craft Messaging Angles; CA-S, Categorize | O | Match supported hook/copy/angle text to a supplied audience problem; no audience intent is inferred from appearance. |
| R25 | Build each messaging angle around a headline, supporting proof and a specific next action. | ICP-S, Craft Messaging Angles; ICP-R, Messaging Angles | O | Presence can be proposed from existing text; proof accuracy and CTA suitability still need review. |
| R26 | Match the objection to a relevant response: price/value, time/effort, trust/proof, need or authority. | ICP-S, Identify Objections; ICP-R, Objections & Responses | O | Existing copy/claims can suggest a link; a validated customer objection set is needed before judging fit. |
| R27 | Use an observable problem → consequence → solution, before → after → bridge, or feature → advantage → benefit sequence when testing that structure. | ICP-R, Messaging Angle Formulas | O | Existing transcript/scene ordering can support a Modelled structural classification. These are alternatives, not three mandatory sections. |
| R28 | Support a factual or numerical assertion with an attributable source; identify uncertainty and date-sensitive evidence. | MR-S, Quality Standards 1–4; CA-S, Key Principles 3–4 | O as method, not a performance finding | Identify claims/quoted numbers from copy/OCR; independent truth, study quality and permission need external documentation. |
| R29 | Keep pain-point language faithful to documented customer language, not imagined persona claims. | ICP-S, Community Research and Key Principles | O | Compare only with saved, attributable quotes. Brand-published reviews are not independent research or verified demographics. |
| R30 | A proposed creative should address an explicitly evidenced gap rather than copy a frequently used competitor message. | CA-S, Analyze Patterns and Key Principles; CA-R, Messaging Matrix | O | Category/format/tag counts can describe gaps in a collected sample. Absence in that sample is not absence in the market or proof of demand. |
| R31 | Keep visual identity and voice consistent with the brand's documented palette, imagery, values and vocabulary. | BD-R, How Downstream Skills Consume / cross-platform-audit; BD-S, Voice | O | Text/context comparisons are possible; palette, typography and exact layout checks need approved identity data and image analysis. Do not copy another brand's design. |
| R32 | The source starts voice axes at five, then shifts them for second-person wording (+2 casual), jargon (−2 expert), sentences of at most eight words (+2 bold), numbers (−2 rational), change-themed verbs (+2 innovative), testimonials (+2 emotional), trust/award language (−1 traditional), humour (+2 playful), and formal third-person wording (−2 serious). | BD-S, Voice axes | O | Counts are computable; the arbitrary +2 axis adjustments are not validated creative-quality points. |
| R33 | Do not treat a sparse website with fewer than 200 words as a confident brand profile. | BD-S, Limitations | O | Count retained website text when complete; word count does not validate inferred audience identity. |
| R34 | Separate customer profiles; tie message specificity to a documented role, buying trigger and problem. | ICP-S, Key Principles 3–5 | O | Review against approved profile data, not generated demographic guesses. |
| R35 | Classify message type and funnel role before recommending an execution. | CA-S, Categorize | O | Existing categories/angles/offer labels describe content; awareness/consideration/conversion intent is not established just by ad format. |
| R36 | Match execution to the story being tested: product/lifestyle image, quote/stat card, comparison, demonstration or educational video. | CA-R, Creative Format Taxonomy | O | Format/style/claims can be described; the source's funnel mapping is a hypothesis, not a guaranteed best format. |
| R37 | Source length suggestions: testimonials/problem-solution/before-after 15–30 seconds; demonstrations 30–60; founder stories 30–90; tutorials 60–120. | CA-R, Video Formats | O | Compare available length/style within category and format. No automatic duration penalty or claimed effect size. |
| R38 | Source length bins: short below 15 seconds, medium 15–60, long above 60. | CA-S, Creative Format | O, descriptive convention | Can compute from duration; bins are not quality bands and do not replace Exter's taxonomy. |
| R39 | Promote real organic/social proof rather than only producing fresh paid assets. | FB-C, M-CR6; FB-S, Creative Strategy | O | Needs a verified organic-post match, permission/partnership evidence and organic outcomes. A testimonial-looking ad is not verified proof. The checklist uses a non-Meta feature name here, reducing confidence in its platform-specific detail. |

A review, star rating, discount or before/after assertion appearing in a creative
is **content**, not confirmation it is true. No retained skill supplies a validated
Meta offer-clarity rubric, required proof count, mandatory discount, product-timing
cut-off or caption-reading-rate limit. Exter's existing substantiation flags,
explicit no-offer handling and source-linked draft-brief rules take precedence.

### Fatigue, performance and portfolio rules

These rules mostly require **owned** reporting and delivery context. They cannot
be evaluated from public reach, age or copies, and none authorises pausing ads.

| ID | Concrete source rule/threshold | Skill/location | Evidence | Required data / interpretation |
| --- | --- | --- | --- | --- |
| R40 | Review fatigue when CTR falls by more than 20% over 14 days while frequency exceeds three. | FB-S, Hard Rule 6; FB-C, M-CR4 | O | Needs comparable owned daily link CTR, frequency and stable delivery context. The checklist's warning band is 10–20%; it also calls no >20% decline a pass before its combined fail rule. Treat the ambiguity as unresolved, not confirmed fatigue. |
| R41 | Example stop rule: CTR below 1% and frequency above three. | FB-E, Creative Fatigue Diagnosis / Recommendation 5 | O-X, worked example | Requires owned metrics and human review. This absolute trigger conflicts with other benchmark bands; do not automate a stop. |
| R42 | Prospecting ad-set weekly frequency: pass below three, warning three–five, fail above five. | FB-C, M-CR10 | O | Audience/funnel/ad-set frequency is missing from public data and not reconstructible by adding per-ad frequencies. |
| R43 | Retargeting ad-set weekly frequency: pass below eight, warning eight–12, fail above 12. | FB-C, M-CR11 | O | Needs retargeting membership and frequency. Not a universal ad threshold. |
| R44 | Campaign prospecting frequency: pass below four, warning four–six, fail above six. | FB-C, M-ST13 | O | Campaign aggregation differs from R42; do not mix the scopes. |
| R45 | Alternative source bands: prospecting frequency 1–1.5 great, 1.5–2.5 good, warning above 3.5; retargeting good three–six, warning above ten. | FB-S, Key Benchmarks | O | These are uncited and differ from R42–44. Intermediate ranges and overlaps are not a validated classification. |
| R46 | Frequency above five on social suggests refresh or a wider audience. | XP-R, Kill List Criteria | O-X, account rule | Does not distinguish prospecting/retargeting or prove the creative caused deterioration. |
| R47 | High frequency together with no conversions can flag creative waste. | WS-S, Meta Ads Waste Detection | O | Needs owned frequency, conversions, attribution lag and exposure. Zero conversions must be observed, not a missing value. |
| R48 | Video opening skip-rate bands: under 50% good, 50–70% warning, above 70% poor. | FB-C, M-CR5 | O | No precise skip denominator or cited source. Public reach cannot supply skips; do not substitute 1 − Exter's hook rate. |
| R49 | Hook-rate bands: 30–40% good, at least 50% great, below 25% warning. | FB-S, Key Benchmarks | O | Only use the spec's owned Meta three-second-plays / impressions definition and minimums; do not adopt these generic bands. |
| R50 | Thumb-stop bands: 25–35% good, at least 40% great, below 20% warning. | FB-S, Key Benchmarks | O | Denominator is unspecified and appears separate from hook rate. No new Exter metric or conversion between them is justified. |
| R51 | Link CTR bands: 1–2% good, at least 3% great, below 0.8% warning. | FB-S, Key Benchmarks | O | Owned link clicks/impressions, not public reach. Industry, objective and placement are unaccounted for. |
| R52 | Alternative CTR bands: at least 1% pass, 0.5–1% warning, below 0.5% fail; another source flags below half the platform benchmark. | FB-C, M-CR12; XP-R, Kill List Criteria | O | The boundary at 1% overlaps and the benchmark may be undefined. Retain conflicting claims for review; do not combine them into a score. |
| R53 | Keep at least three active media formats; two are warning, one is failure. | FB-C, M-CR1 | O, portfolio-level | Known active formats can be counted in a dated sample. A single ad does not fail for being one format; diversity is not evidence of sales. |
| R54 | Source per-ad-set volume: five–eight good, three–four warning, below three poor. | FB-C, M-CR2 | O, account-level | Requires actual ad-set membership and distinct creative families. Public brand-level ad counts are not ad-set counts. |
| R55 | Use at least 30% creator/social-native creative; 10–30% warning, below 10% poor. | FB-C, M-CR7 | O, portfolio-level | Count only supportable style labels and known denominators. Never infer partnership or creator identity from a face; this quota is not validated. |
| R56 | Test a new creative within 30 days; 30–60 is warning, over 60 poor. | FB-C, M-CR9 | O | Launch dates show introductions, not an experiment, and scheduled age alone is not fatigue. The 30-day boundary overlaps in the source. |
| R57 | Refresh Meta creative every 30–45 days. | XP-R, Cross-Platform Creative Alignment | O | Conflicts with R56 and the worked examples below. Use as a planning hypothesis only. |
| R58 | Example cadence: a two-week cycle with three–four new ads; elsewhere four–six new assets every two weeks or two new ads per fortnight. | FB-E, Full Account Audit / Action Plan; Creative Fatigue Diagnosis; Advantage+ / Guardrails | O-X | Several distinct example recommendations, not a single Meta standard. Counts are observable introductions, not causal evidence that refresh was needed. |
| R59 | A refresh cycle should test at least three genuinely different angles, not merely recrop the same pitch. | FB-E, Creative Fatigue Diagnosis / Recommendation 1 | O-X | Category/angle/copy/family grouping can suggest conceptual diversity; similar wording is not proof of the same concept or repeated audience exposure. |
| R60 | Test enhancements against a control rather than treating the enabled setting as proof. | FB-C, M-CR8 | O, test-design rule | Needs account settings, actual rendered variants and controlled experiment results. None is guaranteed by public records. |
| R61 | Short-video alternative cadence: refresh after seven–14 days, hold three–five creatives per group and review weekly frequency above three. | TT-S, Creative Fatigue; TT-E, Creative Strategy Refresh | O-X | Another platform's advice. Its claim that fatigue is two–three times faster has no cited comparison study. TT-E, Creative Strategy Refresh also proposes five new concepts and a three–five-day hook test from a worked example with two creatives running 21 days. Do not transfer the clock or thresholds to Meta. |
| R62 | Claimed creator-style benefit: CTR lasts 30–50% longer than studio production. | FB-E, Creative Fatigue Diagnosis / Recommendation 4 | O-X, unsupported example claim | No dataset, matching method or uncertainty is supplied. Do not use it as a prior bonus, multiplier or prediction. |
| R63 | An example calls for at least 10–15 assets before an automated shopping campaign; other examples suggest six prospecting, three retargeting and two retention assets, or eight–12 assets and three–four ads per set rotated weekly. | FB-E, Readiness Assessment / Launch Checklist; AS-E, low-budget Meta example | O-X, account/launch examples | Inconsistent context-specific volumes require account membership and budget/objective context. Not individual-ad quality rules. |

For completeness, the skills also supply CPC, CPM, landing-page conversion rate,
ROAS and lead-cost benchmark tables. Those are account/business outcomes, not
checks of hook, offer or media quality. No imported currency benchmark replaces
Exter's same-account ratios, attribution and conversion-event definitions.

### Test design, evidence and outcome interpretation

| ID | Concrete rule | Skill/location | Evidence | Exter decision |
| --- | --- | --- | --- | --- |
| R64 | Test distinct concepts before small changes; alternatives include creator/studio, testimonial/demo, problem/aspiration, media format and proposition. | FB-R, Concept Testing | O | Existing style/angle/format labels can describe a test plan. They cannot identify a winning treatment without outcomes and assignment. |
| R65 | For iteration, vary opening three seconds, headline/copy, CTA, visual treatment or execution format; the short-video source also proposes keeping body/CTA fixed while changing the hook. | FB-R, Iterative Testing; TT-S, Creative Fatigue | O; TT is X | Compare known versions and text; full visual equivalence and controlled assignment need more data. |
| R66 | Keep audience consistent and distinguish element tests from complete-concept tests. | FB-R, Testing Structure | O | Needs experiment/ad-set/audience/budget context; multiple archive IDs alone are not a controlled test. |
| R67 | Wait for at least 50 conversions per variant before calling a result significant. | FB-R, Testing Structure | O | Fixed count does not guarantee significance, power or independence. Owned outcome counts alone do not supply randomisation or a planned effect size. |
| R68 | The source mentions 50/50 A/B tests for Meta; its detailed 14–30-day split and 100-conversion reliability suggestion belong to a Google structural experiment. | AS-S, Core Capabilities / Consolidation and Step 6; AS-R, Step 6 Option A (Google only) | O-X, structural test | Do not misattribute the Google duration/conversion suggestion to Meta. Neither fixed time nor 100 conversions proves adequate power; both require randomisation and mature outcomes. |
| R69 | Put roughly 10–15% of budget into tests and observe 14 days after reallocations. | XP-R, Reallocation Rules | O-X, account operations | Does not authorise any budget change or imply that 14 days gives adequate creative-test power. |
| R70 | Review benchmark results in the context of business model, objective, budget and data maturity. | XP-S, Context Intake; AS-S, Structure Health | O | Require context before outcome judgments. Learning-phase suggestions such as 50 events/week are not evidence that a creative is bad below that count. |
| R71 | For a zero-conversion Meta waste flag, source spend threshold is 2.5 × account CPA; minimum clicks are Feed 20, Stories 15, Audience Network ten; suggested CVR floors are Feed 0.5%, Stories 0.3%. | WS-S, Waste Thresholds | O-X, diagnostic thresholds | Need owned spend, clicks, placements, conversions and attribution maturity. These minima conflict with Exter's rate-quality gates and are not adopted. |
| R72 | Alternative stop/watch rules: CPA above three times target, or twice target for 30 days; zero conversions after $500 spend; CTR below half a platform benchmark. | XP-R, Kill List Criteria | O-X | Generic business diagnostics, not public creative labels. Currency, margin, objective and test power must be known; never automatic account action. |
| R73 | Before a negative conclusion, check delayed/assisted/view-through conversions and whether a campaign is under 14 days old. | WS-S, Safety Rules; WS-R, Common False Positives | O | Needs mature owned attribution and full outcome context. Do not equate unobserved conversion data with zero. |
| R74 | Review multiple competitors and ads over an explicit period; source suggests three–five competitors and 30/60/90-day scopes, with an example of 20 ads from five competitors. | CA-S, Define Scope and Key Principles | O | Compute dated sample sizes, but the suggested counts do not prove representativeness or satisfy model-training minima. |
| R75 | Separate observations from proposed actions, date findings, and adapt ideas rather than copying ads. | CA-S, Key Principles | O, research practice | Directly compatible with Exter's source labels and own-word briefs; no source text or product-screen borrowing. |
| R76 | Back recommendations with traceable sources, document uncertainty and recent evidence; the source suggests the last two years and three sources for market sizing. | MR-S, Quality Standards | O, research practice | Date/source checking is possible for retained documents. Recency and three mentions do not establish causation or independent replication of creative claims. |
| R77 | The persona framework multiplies subjective frequency and intensity scores, then recommends leading with problems scored 80–100, supporting 50–79, mentioning 30–49 and omitting 1–29. | ICP-R, Pain Point Scoring Matrix | O | No calibrated measurement scale or customer denominator is given. Do not replace Exter's review-derived customer demand or opportunity formula with these numbers. |
| R78 | In the source's brand analysis, wording and styling are used to infer audience age/profession. | BD-S, Target Audience; BD-R, Target Audience | O, not acceptable audience evidence | Exter must not infer demographic identity or targeting from a creative's appearance. Use documented targeting/published reach separately; this suggestion is rejected. |

The catalogue does not turn claim wording into proof, longevity into profit,
creator style into creator identity, popularity into effectiveness or an ad-library
sample into a controlled trial. No retained rule has a validated causal effect size.

## B. Automatic checks now, partial checks and missing data

“Now” means a pure calculation over **already stored, adequate data**, not that
this documentation PR adds a computation or fills a field. Missing analysis,
full media, dates or labels must remain Unavailable/unassessed. A model-derived
annotation must never be re-labelled Observed merely because its timing is counted.

| Check family / catalogue IDs | What existing data can support | What it cannot support without more data |
| --- | --- | --- |
| Opening placement (R01–03) | Earliest supported hook/transcript/OCR timestamp; first slide where an image index is supplied. Compare a bounded interval with the approved window. | Attention capture, meaningfulness, precise first appearance when an annotation crosses the boundary, or timing from copy/poster only. Requires validated annotations and human judgments. |
| Early product/brand (R08) | Product/category words in copy/transcript, or a recorded visual claim, can be flagged for review. | No general first-product-visible timestamp is stored in current analysis fields. Product mentions are not product appearance. Needs product/frame annotations, visible identity and intended ad objective. |
| Captions / mute understanding (R04, R07–08) | On-screen text and spoken-word annotations can be compared for apparent omissions/overlap. Existing exposure intervals can yield the current disclosed text-rate calculation. | Full caption coverage, synchronisation, meaning, visual legibility, crop/safe-zone obstruction and contrast require complete frames, text boxes, font/colour data and reviewed speech. OCR text alone is not captions. |
| Pacing/structure (R02, R05, R27) | Cuts per opening/window where scenes are complete; order of transcript/offer/CTA annotations. | Scene boundaries are not always stored, and annotation intervals are not shot boundaries. No freshness/performance conclusion from cut density. |
| CTA (R02, R20, R25) | Existing CTA words/times/slide indices and source copy; a readable next-step phrase can be assessed provisionally. | Actual clickable button, correct current destination, clickability, fulfilment and whether the offer is suitable need the rendered placement/destination and approved brief. |
| Offer clarity (R23, R25–26) | Explicit price/discount/bundle/shipping/guarantee and deliberate no-offer annotations; consistent literal wording across saved variants. | Current price, stock, end date, exclusions, eligibility, maths and ad-to-page consistency need authoritative terms/current landing-page data. A website path alone is insufficient. |
| Proof/claims (R28–29, R39) | Identify claim/review/rating text, source citations, creator-label evidence and an existing substantiation flag. | Claim truth, causal before/after proof, actual review denominator, customer identity and usage/music permissions need documents/rights records and human verification. Presence is not proof quality. |
| Format/length/copy fit (R09–23, R36–38) | Existing duration/media format, optional saved dimension metadata and complete copy/headline character counts; like-for-like samples. | Current placement requirements, actual delivered crop, safe zones, missing description/buttons and aspect ratios for unretained media need new evidence. A poster cannot establish video duration or pacing. |
| Message/brand/category fit (R24–35, R78) | Describe supported problem/benefit/angle/offer text and compare known category/style with approved context. | Customer need, audience identity, forbidden colours, brand preferences or willingness to pay cannot be inferred without approved research. Brand-context inferences remain Modelled. |
| Versions and novelty (R53–65) | Exact retained media hashes/full copy IDs, new launch dates, style/angle/category counts and dated introductions. | Multiple ad IDs do not prove budget scaling, independent creative concepts, a randomised test or audience saturation. Partial copy cannot establish exact-copy identity. |
| Public fatigue warning (R40–63) | Age, repeat use and changing public reach describe continued use or change, with sample dates. | No public CTR, frequency, impressions, ad-set membership or conversion time series. Neither long-running nor many versions confirms fatigue; reach per day is not frequency. |
| Owned fatigue/attention (R40–52, R71–73) | Only genuinely available, successfully synced scoped owned fields can support the spec's link CTR, hook/hold, retention, frequency and mature outcomes. | Live gate is still open. New placement/funnel membership, complete attribution maturity, change logs and randomisation may be needed. Never add per-ad frequency or mix accounts/windows/currencies. |
| Testing (R60, R64–74) | Suggest a source-linked comparison or brief from observed differences; report sample sizes and field gaps. | Incremental lift, statistical significance, causal fatigue, wasted spend and optimal refresh require controlled delivery/outcomes, planned power and attribution checks. |

Owned metrics retain the module's **ratio of sums**, same account/platform/date,
currency/attribution/event benchmark, and minimums: 1,000 impressions for link CTR
and hook rate; 300 early views for hold; ten purchases for CPA/ROAS. Below minimum
is “too early”, not zero. Meta's three-second attention and TikTok's two-second
attention must never be directly ranked. No imported skip/thumb-stop/ThruPlay
formula overrides the module's definitions.

## C. Proposed score changes, in Exter's own words

### The baseline is not changed

The implemented [server/demo/scores.ts](../server/demo/scores.ts) has five checks
worth 20 points each: opening placement, a recorded proposition, text exposure,
explicit CTA wording and an assessable offer/no-offer decision. Unknown checks
are removed from both numerator and denominator; incomplete coverage is Provisional.
Its opening rule currently uses a three-second evidence window and text pacing
uses an unvalidated three-words-per-second threshold. A recorded proposition is
an availability check, not proof of truth or persuasion. PRODUCT-SPEC describes a
two-second hook plus early product/captions/offer/CTA/proof. That difference must be
resolved by an authorised scoring spec and validation before implementation.

### Candidate creative checklist: needs validation against outcomes

The candidate asks seven questions instead of awarding points merely because an
analysis field exists. **Every row below needs validation against outcomes.**
Weights are proposed research allocations, not imported facts or calibrated effect
sizes. A labelled, sufficiently diverse outcome set must compare these choices
with the current equal-weight checklist before any product change.

| Candidate | Proposed maximum | Proposed assessment in Exter's own words | Basis / missing evidence | Status |
| --- | --- | --- | --- | --- |
| Clear opening | 20 | A relevant, understandable opening is established by two seconds, or on the first still/slide. Timing and message relevance are separate annotations. | PRODUCT-SPEC takes precedence over R01's three-second suggestion. Requires usable time/slide support and human relevance labels. | needs validation against outcomes |
| Recognisable product or benefit | 15 | The viewer can identify the product, brand or intended benefit early enough to understand the message. Test a three-second product-visibility candidate for video; first image/slide for stills. | Early-product goal is in PRODUCT-SPEC; three seconds is an explicit new research hypothesis, not a sourced rule. Needs visual product timing/approved objective; words alone do not pass it. | needs validation against outcomes |
| Understandable without sound | 15 | Essential spoken meaning is available visually, with readable, correctly timed text. For silent/still creative, assess the actual visual message rather than demanding captions. | R04/R07 are weak transfer ideas; needs reviewed speech, full frames, geometry and muted-view judgments. Do not promote the current three-words/second proxy to proven readability. | needs validation against outcomes |
| Clear commercial decision | 10 | Any offer has understandable value and conditions; an intentionally absent offer is valid. Missing terms are unassessed, not an invented discount or automatic fail. | R23/R25 plus Exter's existing no-offer rule. Requires current terms to verify accuracy, not only an offer-type label. | needs validation against outcomes |
| Credible support | 15 | A material claim has the kind of support it requires, and the viewer can recognise that support. Avoid treating a quoted claim as its own proof. | R28/R39; needs underlying documents, correct attribution, permissions and human review. Claims requiring substantiation remain flagged, not adjudicated as lawful/unlawful. | needs validation against outcomes |
| Appropriate next action | 15 | The next step is explicit, consistent with the message and achievable at the destination. A clear CTA elsewhere in a video can work; a final-three-second rule is only a test candidate. | R02/R20/R25; existing text/times partly support this, actual button/destination require more data. No automatic penalty for unfamiliar language or non-English phrasing. | needs validation against outcomes |
| Placement-compatible execution | 10 | The retained creative fits the intended placement without hiding its main message; ratio, crop and text remain usable. | R09–23 need current primary placement guidance and the delivered rendering. Do not fail all non-vertical videos or impose a single optimal length. | needs validation against outcomes |

Candidate reporting, also **needs validation against outcomes**:

- Predeclare applicability by objective/media type before seeing results. An
  inapplicable check contributes no points and no hidden penalty; show its reason.
  An applicable but unsupported check is Not assessed. Do not add a new UI state
  or denominator change until the scoring/UI specs approve it.
- For an assessed check, use Met or Not met with a one-sentence reason and a
  timestamp/slide/quote. Unknown evidence is never a failed check or assumed pass.
- Candidate score = earned points / assessed possible points × 100, rounded for
  display. Show assessed checks, assessed/applicable points and omitted points.
  Any applicable unassessed check makes it **Provisional**. With none assessed,
  show Unavailable rather than 0 or 100.
- Example: 60 earned out of 75 assessed = 80; 25 applicable points unassessed;
  75% coverage, Provisional. “100 of 100” is invalid when coverage is incomplete.
  The seven proposed maxima sum to 100, but applicability/coverage must accompany it.
- Do not claim this measures sales, ROAS, persuasion or causal lift. Analyse
  creator style, colour, length and cut frequency as contextual features first;
  they receive no automatic bonus. Keep fatigue out of a pre-launch checklist.

Before changing the checklist: blind human annotation, adjudicate disagreements,
check field accuracy under the existing 85% / 200-ad gate, and compare checklist
versions against mature outcomes on an untouched time holdout. A reliable tagger
is not automatically a useful score. Publish per-format/category coverage and
failure cases, including low-coverage creatives that otherwise score 100.

### Working Score: proposed adjustments, not a new implementation

The current specification uses within-brand percentiles for survival **35%**,
scaling **25%**, reach velocity **25%** and organic response **15%**. Missing
signals lose their weight; available weights are rescaled. A continuing ad is
unfinished, not an early failure. Relative longevity needs ten ads and three
stopped ads for that brand. The implementation gap remains: production pages show
Longest running until the real Working Score exists; sample scores are illustrative.

| Proposal | What would be studied | Protection / source relationship | Status |
| --- | --- | --- | --- |
| Compare the right peers | Evaluate category/media-format-conditioned reference sets before comparing percentiles; keep existing My categories / Same format UI defaults and sample sizes. | Do not silently change the spec's within-brand reference distribution. Sparse groups remain unranked; the UI's ten-ad visibility rule alone does not prove statistical reliability. R23/R35/R36 motivate context, not weights. | needs validation against outcomes |
| Survival with collection uncertainty | Assess censored survival and known collection gaps rather than assuming exact uninterrupted delivery from endpoints. | Keep the 30-day/top-third/scaling proven-ad definition until separately approved; never score a still-running ad as a short failure. No generic refresh-age penalty from R56–61. | needs validation against outcomes |
| Distinguish replication from real iteration | Compare exact file/copy reuse with validated conceptual changes; separate simultaneous clones from later launches. | Preserve the spec's 45-day iteration window. An archive ID/placement duplicate does not independently show budget scaling. R59/R65 motivate family labels; those labels need validation. | needs validation against outcomes |
| Reach at a fixed observation horizon | Compare existing reach-per-day measurements at matched ages and report the observation date/region. Assess whether snapshots support a meaningful time trend. | Use published UK reach, or EU only as the defined fallback; never add overlapping UK and EU totals or substitute impressions. Reach restatements and missing days are not extra delivery. No new public formula in this PR. | needs validation against outcomes |
| Keep organic evidence independent | Evaluate organic response only for a verified matching post and the spec's declared denominator. | No testimonial/creator-style proxy for engagement. Do not mix per-view and per-follower rates; missing organic data is excluded/rescaled, not zero. R39's platform wording is not authority. | needs validation against outcomes |
| Separate age/repetition from fatigue | Show an age/reuse observation separately from an owned fatigue review requiring declining scoped CTR and rising frequency, with mature outcomes. | Reject R40–63's conflicting universal triggers. Public ads never receive confirmed fatigue or an automatic stop from age/reach/versions alone. | needs validation against outcomes |
| Test weights and confidence honestly | Compare the existing 35/25/25/15 rule with simple longevity/reach baselines and alternatives on mature held-out data. Check error/calibration per brand/category/format. | Do not import external audit scores, brand-voice axes or arbitrary UGC bonuses. Keep spec weights, labels and confidence rules unchanged unless an authorised spec revision follows validation. | needs validation against outcomes |
| Keep creative quality separate | Study whether checklist components add value over the public signals at all. | No current creative-score bonus or penalty inside Working Score. Training on a label defined by the same checklist would be circular. | needs validation against outcomes |
| Calibrate against private results where authorised | Evaluate association with same-scope owned ROAS/CPA and, separately, randomised incremental outcomes where available. | Monthly calibration is in PRODUCT-SPEC, but association is not causal sales evidence. Respect account/currency/attribution/event separation and minimums; no competitor outcomes. | needs validation against outcomes |

Keep the spec's label rules visible in any later implementation: Proven winner
requires score at least 75 and 30+ days; Rising requires age under 14 days and
top-third reach velocity or duplication; Steady is 40–74; Switched off fast requires
a known stop within seven days. Spec confidence is High with reach and 21+ days,
Medium with survival/scaling only, Low below seven days. Missing signals, unclear
maturity and collection gaps require explicit limitations, not invented confidence.
These are existing product requirements, not rules validated by the imported skills.

## D. What a real prediction model needs

### Target, labels and timing

PRODUCT-SPEC's predictive score is the likelihood that a **new creative becomes a
proven ad**, not the likelihood of a sale or a forecast of competitor ROAS.

1. Freeze a target definition/version first. For the existing public target, a
   positive needs the declared 30+ days, brand-relative longevity and supported
   scaling conditions after a predeclared observation horizon. Preserve the
   underlying dates, media family, version evidence, brand cohort and label source.
   Do not silently redefine the target as a high checklist score.
2. Negatives must be resolved under the same rule and maturity horizon. A new ad,
   a still-running/censored ad, a missed collection, a disabled watchlist or an
   expired media link is **not** a negative. Track unknown/censored outcomes and
   reasons explicitly. Resolve capture gaps and ambiguous stop dates before labelling.
3. For pre-launch prediction, feature data must be limited to what is available at
   launch: creative content/format/category and approved context. Later days
   running, reach, copies, Working Score and final labels are outcomes/leakage,
   not pre-launch features. A separate day-seven model needs a separate target and
   only information known by day seven. Never mix these evaluation tasks.
4. Keep exact-media/copy/concept families and near-duplicate versions together
   across splits. Thousands of archive IDs can be copies of a few creatives.
   Later versions of a training creative must not leak into a newer holdout.
   Distinguish useful iteration history from independent training examples.
5. Separate source provenance: Observed public proxy labels, Modelled annotations,
   human labels and permissioned owned outcomes. Human hook/format labels are
   input-quality labels, not commercial outcome labels. Public proven-ad labels
   remain estimated behavioural proxies; do not present them as proof of profit.
6. If a later model targets business outcomes, collect permissioned, mature owned
   spend, purchases, purchase value and conversion context. Define ROAS/CPA labels
   within account/platform/date/currency/attribution/event cohorts and product
   margin/objective where relevant. Never invent such labels for competitors.

### How many ads

The PRODUCT-SPEC planning requirement is **about 3,000 resolved ads from 30+
advertisers**. It means mature, usable, appropriately independent labelled ads,
not 3,000 raw observations, collection rows, extracted scenes, synthetic examples
or duplicate archive IDs. There must be meaningful positive and negative classes
across dates, advertisers, media types and categories. Human labelling quality,
class balance, censoring, family duplication and test-set uncertainty can require
more data; the count is a starting scale, not a guarantee of learnability.

The reported catalogue of roughly 7,800 public ads does not demonstrate 3,000
resolved outcomes or 30 advertisers. No current production label count, training
run or AUC result was verified in this review. Fictional sample workspaces must
be excluded from performance evaluation.

The **200 human-labelled ads / at least 85% field agreement** gate in PRODUCT-SPEC
is for exposing AI-extracted fields; the **within two points per field** pipeline
replacement gate is separate. Neither is a predictive-model training set size or
proof that a creative score predicts outcomes. A strategist's top-50-by-spend
review in the own-account module is valuable quality work, but is not a random,
representative commercial validation set.

### Validation and the AUC 0.65 release gate

**Existing product gate, unchanged:** train on older ads, test on newer ads,
beat simple baselines and achieve **AUC at least 0.65**. Until then, predictive
probabilities remain hidden. The rules-based proven-ad signal must be labelled
as rules-based when available; production's current Longest running fallback
must not be rebranded as a validated Working Score or prediction.

Proposed evaluation protocol, **needs validation against outcomes**:

- Reserve a genuinely later, untouched holdout before choosing features,
  thresholds, label horizons or weights. Group related creative families; ensure
  every training label was resolved before the holdout decision date. Evaluate
  within known advertisers and also an advertiser-held-out set for transfer.
- Compare with simple pre-launch format/category or base-rate baselines. For a
  post-launch task, include matched-age longevity/reach baselines using only data
  known at its decision time. A later-day baseline cannot fairly assess a
  pre-launch model. Check class balance and advertiser concentration.
- Report ROC-AUC, positive/negative counts, uncertainty intervals and performance
  per brand/category/format/time. With rare positives, include precision-recall
  and practical ranking quality; AUC alone can hide poor usefulness. AUC 0.65
  means ranking discrimination, **not 65% accuracy** or a calibrated 65% chance.
- Require the point estimate to meet the product gate and exceed appropriate
  baselines on the untouched test. Report the confidence interval; a minimum
  lower confidence bound would be an additional proposed gate, not existing spec.
- Calibrate any probability on separate validation data and measure calibration
  on the holdout. Assess missing-media/tag groups and drift over later periods.
  Do not show a bare probability if it is uncalibrated or outside the trained scope.
- Recheck feature provenance, train/test duplicate leakage, label completeness,
  geography, seasonality, objective, selection and spending confounding. An
  observational association between content and continued delivery is not proof
  that changing the content causes a sales lift.
- Keep a versioned model/data/label manifest and failure report. If the gate is
  not met, leave predictive output unavailable; do not backfill a made-up score
  from source opinions or the sample workspace. Deployment needs its own
  authorised spec item and release review.

This PR supplies the reference inventory and hypotheses only. It runs no paid
analysis, training, advertiser mutations or live provider verification, and leaves
all existing score code, weights, minimum samples and data-honesty rules intact.
