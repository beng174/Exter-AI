# Creative labelling guide

research/PRODUCT-SPEC.md is authoritative. Use these fields and allowed values exactly.
Unsure means "unknown", never a guess. Review the complete retained creative, not
a thumbnail. Preserve timestamps and exact source wording. Never infer creator identity.


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


Comparative and superlative claims receive "may need substantiation (ASA)".
Background song lyrics are music, never spoken voiceover. Client fields remain
unvalidated until each reaches 85% on 200 human labels. Do not filter ads by
uncalibrated model confidence.

## Historical schema compatibility

The archive below documents existing stored labels and exports only. It is not
the current allowed vocabulary. Do not rewrite paid analyses or silently map old
values into new ones. The current analysis method and labelling tool are unchanged
in M1; their versioned migration and evaluation belong to M2. Historical `unsure`
remains in old exports; new product-facing uncertainty is unknown.

# Human labelling guide — draft for Benjamin's review

**Status: DRAFT. Benjamin should review and edit this guide before real labelling starts.** The tool is available for review; its availability does not mean these definitions or any labels have been approved. This document implements Phase 5.2 of [BUILD-SPEC.md](BUILD-SPEC.md). It covers the seven dropdown fields in the Phase 5.1 tool and the shared model audio, claim and boolean vocabulary, with the exact stored values below.

**Guide version: `draft-v2`; human schema: `exter-human-labels-v2`; creative taxonomy: `exter-creative-taxonomy-v2`.** The source of allowed format, hook, angle, offer, audio, claim and boolean values is [shared/creative-taxonomy.ts](../shared/creative-taxonomy.ts). The model and human tool consume that registry. New reviews use v2; saved v1 labels and sessions retain their original versions and meanings. A session begun under v1 can still save its v1 values after deployment. Do not silently convert a historical label to a v2 value.

The examples are invented teaching examples, not labels for actual ads. Never copy them into an evaluation set. A label describes what is observable in the retained ad and original copy; it does not verify whether a marketing claim is true.

## Before each review

1. Enter the labeller's name consistently. Open an ad in the Labelling tool and review only its retained creative and original ad copy. Do not open model analysis, model reports, or another labeller's answers while deciding.
2. For video, watch the complete retained file with audio, then replay the opening five seconds for context and any ambiguous section. Classify the hook from the first three seconds, matching the model's hook window. Retained media is identified by SHA-256 so later comparisons can use the same video. A source link or an ad ID alone does not guarantee an unchanged creative.
3. For a static ad, inspect the actual still image and original copy. For a carousel, inspect every retained card in its source order; a carousel is a media container, not a separate creative format. Do not treat a video thumbnail as the complete video. A source marked "Dynamic creative" does not establish that the ad is a still: the tool blocks starting until the actual video is retained or refreshed source metadata explicitly confirms an image. If a carousel or another required part is unavailable, note the missing material and use `unsure` for affected fields.
4. Choose one value for every field. Use the field-specific `none` or `no` when the relevant feature is observably absent. Use `unsure` when the material is missing, unclear, contradictory, or does not fit these definitions. An unselected dropdown is an unfinished answer, not an abstention.
5. Add notes for ambiguity, conflicting evidence, missing audio, unfamiliar language, or a difficult boundary. Include useful video times, such as "creator handle at 00:12", and the actual visible wording when evidence matters. Do not record guessed identities or private information.
6. Save the completed review. The tool records the labeller, review timestamps, time taken, notes and creative identity. Recorded elapsed time is wall-clock time for the review session, so leaving the page open can inflate it; note significant interruptions. A new review is a new observation, not permission to overwrite an earlier decision.

Do not infer performance, intent, audience demographics, creator identity or payment from appearance. A person on camera, a casual room, a selfie angle and a first-person statement are observations; individually they do not prove user-generated origin. Do not identify a founder by their face. A creator handle must identify a non-brand creator; the advertiser's own handle is not creator evidence.

## Decision rules across fields

- **Format** describes the creative's production/presentation form; **UGC evidence** records specific attribution evidence. Label them separately. A visibly credited creator does not turn an otherwise static ad into a video format.
- **Hook type** is the main attention device in the first three seconds of a video, or the leading headline/visual in a static ad. Use the most prominent opening device, considering speech, on-screen text and visuals together. If two devices are equally prominent and cannot be resolved by replaying, choose `unsure` and note both.
- **Angle** is the main persuasive reason across the complete ad and copy. Prefer the reason repeatedly developed or supported, rather than an incidental phrase. If no reason is advanced, choose `none`; if several remain equally dominant, choose `unsure` and explain.
- **Person on camera** means any visible real human anywhere in the creative. It does not mean that person speaks, looks into the lens, owns the brand, or created the ad. Hands and other clearly human body parts count; drawn characters and product photographs without a person do not.
- **Offer type** concerns explicit commercial incentives or purchase terms. Record the incentive presented, not whether it is genuine, available, legally valid, or better than another price. A plain product price is not automatically a discount or offer.
- **CTA** is the main explicit requested action. Use the prominent final instruction or button; consider original copy when the creative lacks an instruction. If equally prominent requests conflict, choose `unsure` and note them. A platform's navigation controls are not part of the ad's CTA.

## Format (`format`)

Choose one principal format. Use `mixed` only when two or more defined moving-image formats are substantial parts of the ad and no single one dominates. A presenter with brief product cutaways is not automatically mixed. If the only apparent distinction is casual style and creator provenance is unproved, do not guess UGC; use an evidenced alternative or `unsure`.

| Stored value | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `UGC` | A moving-image creative presented by or sourced from a non-brand creator, with a visible creator handle or paid-partnership attribution establishing that origin. Casual presentation alone is insufficient. | A home-shot diffuser review carries the reviewer's non-brand handle throughout. | A creator demonstrates a cleanser beneath a paid-partnership label naming that creator and the brand. |
| `founder-led` | A moving-image creative principally led by someone explicitly identified in the ad or original source copy as the brand's founder or co-founder. A familiar face or generic spokesperson is insufficient. | A speaker says, "I'm Maya, founder of this candle company", then explains the formulation. | An on-screen caption identifies the presenter as "Co-founder, North Soap" while they tell the product story. |
| `studio` | A moving-image creative principally using visibly staged brand production: product shots, controlled sets, demonstrations or identified brand presenters, without the evidence required for UGC or founder-led. Production polish alone does not establish who made it. | A diffuser rotates against a seamless background with controlled lighting and brand captions. | A brand presenter demonstrates a moisturiser on a clearly staged set with intercut product close-ups. |
| `animation` | A moving-image creative principally made from drawn, rendered, typographic or other animated elements rather than recorded live action. | Animated fragrance notes move into a rendered candle jar. | Kinetic text and illustrated bubbles explain a drink's ingredients without live-action footage. |
| `mixed` | Two or more of UGC, founder-led, studio and animation occupy substantial portions of the moving-image ad, with no clearly dominant form. A minor overlay or short cutaway does not qualify. | About half the ad is a credited creator's review and half is an equally developed animated explanation. | An explicitly identified founder story alternates with a substantial studio product sequence, and neither dominates. |
| `static` | A still-image creative, including a carousel of still cards, without a moving-image sequence. Text, photographs and graphics may coexist. Use only when the actual ad is static, not merely when a video thumbnail is available. Carousel remains the media container value. | A single image shows a candle gift set and its price. | A retained three-card carousel shows product photographs, ingredients and a testimonial quote. |
| `unsure` | The complete creative is unavailable, the form is ambiguous, or its observable presentation does not support one of the defined formats. Do not use it as a synonym for a known mixed format. | A selfie-style video has no creator attribution and no evidence establishing another defined format. | Only a video poster image loads, so the actual moving-image form cannot be inspected. |

## Hook type (`hookType`)

Classify the dominant opening attention device, not the ad's overall message. An offer-led opening can have a quality/luxury angle later. Use `scarcity-restock` when availability or return to stock is the opening device; use `offer-led` when the incentive leads. Use `social-proof` for aggregate approval or adoption and `testimonial` for a particular person's experience. `none` requires a viewable, understandable opening with no identifiable hook from this taxonomy. The model stores the categorical value as `hook_type` plus a source-grounded explanation; the human field name is `hookType`.

| Stored value | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `scarcity-restock` | The opening foregrounds limited availability, a deadline or a product returning to stock. It need not include a discount. | "Back in stock after selling out" opens the video. | A static headline leads with "Only 100 gift boxes left." |
| `question` | The opening explicitly asks a question intended to engage the viewer. | "Why does your home fragrance disappear so quickly?" opens the video. | A static headline asks, "Still looking for a gift they'll use?" |
| `problem` | The opening foregrounds a difficulty, frustration or unmet need without principally phrasing it as a question. | "My candles never smelled strong enough" is the first spoken line. | A headline reads, "Dry skin makes every morning uncomfortable." |
| `bold-claim` | The opening leads with a striking promise, superlative or assertion about the product or result. Record the claim without endorsing it. | The first caption says, "One diffuser. Weeks of fragrance." | A speaker opens with, "This is the softest T-shirt you'll ever wear." |
| `demo` | The opening primarily attracts attention by showing a product, process or effect in action. | The first shot shows a stain being lifted from fabric. | A close-up immediately shows a textured cream spreading onto skin. |
| `testimonial` | The opening leads with a customer's or creator's stated experience, recommendation or quoted review. Attribution may be limited; do not infer authenticity. | "I've bought this gift box three times" is the first line. | A static headline leads with a quoted review: "My house finally smells lovely." |
| `offer-led` | The opening leads with an explicit price incentive, deal or commercial offer. | "Save 20% this weekend" fills the opening frame. | The leading static headline says, "Three candles for £30." |
| `social-proof` | The opening foregrounds collective approval, adoption, review counts or ratings, rather than one person's stated experience. | "Over 10,000 five-star reviews" is the first caption. | A static headline leads with "Our most-loved scent, chosen by 50,000 customers." |
| `curiosity` | The opening intentionally withholds an explanation or uses an unresolved reveal, surprise or incomplete statement to encourage continued viewing. | "I didn't expect this to happen when I opened the box…" opens the clip. | An obscured product is shown beneath the headline, "Meet the item everyone keeps asking about." |
| `none` | The inspected opening contains no identifiable attention device from this taxonomy. Mere presence of a brand or product is insufficient. | The opening holds a plain logo without a claim, question, demonstration or other device. | A static catalogue-style image contains only the product name on a neutral background. |
| `unsure` | The opening is missing, unintelligible or genuinely ambiguous between types after review. | Audio is missing and the opening text is unreadable. | A question and a discount occupy equal prominence in the opening, with neither clearly leading. |

## Angle (`angle`)

Classify the dominant persuasive reason for choosing the product. A claim can be labelled even if its truth is unverified. Do not infer an angle from category, audience stereotypes, or the model's prior annotations. The model stores this category in `angle` and the supporting reason in `angle_explanation`. A comparison or founder story is evidence for an angle only when its central reason fits a defined category; otherwise choose `unsure` and explain. Do not map every feature claim automatically to quality/luxury.

| Stored value | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `problem-solution` | The ad develops a specific difficulty and presents the product as its remedy. | A home-fragrance ad focuses on unwanted cooking smells and presents a diffuser as the solution. | A skincare ad describes tight, uncomfortable skin and presents a moisturiser as relief. |
| `value-bundle` | Price, savings, quantity for the price or a multi-item package is the central persuasive reason. | The ad repeatedly compares the bundle's price with buying its items individually. | A gift-box ad centres on three full-size products for a stated low total price. |
| `scarcity-urgency` | A limited quantity, deadline, restock or anticipated sell-out is the main reason to act. | Most of the ad emphasises a limited restock that previously sold out. | The copy repeatedly explains that the seasonal collection is available only until Sunday. |
| `gifting` | A gift recipient, gifting occasion or giving experience is the central reason to buy. Seasonality alone is insufficient. | A gift-box ad centres on choosing a Mother's Day present. | A candle ad repeatedly frames the product as a Christmas host gift. |
| `quality-luxury` | Craftsmanship, premium ingredients, finish, sensory quality or an explicitly luxurious experience is the main reason to choose the product. | The ad develops its hand-finished packaging and premium fragrance blend as a luxury gift. | A close-up sequence explains the fabric's fine weave and carefully finished seams. |
| `identity-values` | An expressed identity, ethical value, affiliation or way of living is the main persuasive reason. Do not infer the viewer's beliefs. | The ad centres on vegan ingredients and avoiding animal testing as reasons to choose it. | The creative asks viewers to support local makers and develops that community identity. |
| `social-proof` | Other people's approval, adoption, reviews or testimonials form the main reason to choose the product. | Most of the creative presents customer review quotations and ratings. | Several credited customers explain why they repurchased the product. |
| `novelty` | Newness, a launch, innovation or discovery is the main reason to choose the product. A new discount alone belongs to value/bundle. | The ad centres on discovering a newly launched fragrance range. | Most of the creative explains an unfamiliar refill mechanism as a new approach. |
| `none` | The complete ad and original copy provide no identifiable persuasive reason beyond naming or showing the product. | A plain product image has only its name and no developed reason to choose it. | A short logo ident contains no product argument, claim or occasion. |
| `unsure` | The persuasive reason is unavailable, unclear, outside these definitions, or tied between equally dominant angles. | Half the ad develops gifting and half develops savings, with no dominant argument. | The creative's language cannot be understood and the original copy is absent. |

## Person on camera (`personOnCamera`)

This field records whether a real human is visibly present anywhere in the creative, including still photographs. It is deliberately separate from speaking to camera, UGC origin and founder identity. A human voice without a visible person does not count as `yes`.

| Stored value | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `yes` | At least one real human or clearly human body part is visible in any inspected part of the complete creative. | A presenter silently holds a candle at the end of the video. | A static photograph shows a hand applying cream. |
| `no` | The complete inspected creative contains no visible real human or human body part. Audio-only narration and animated characters do not change this. | A voiceover accompanies product-only shots of diffuser bottles. | A static graphic contains a bottle, text and a drawn cartoon character. |
| `unsure` | Visibility or completeness is insufficient to establish whether a real human appears. | A tiny blurred background shape might be a person or a display mannequin. | Only the first two seconds of a longer video are available. |

## UGC evidence (`ugcEvidence`)

Record visible attribution evidence, not a judgement that the ad is authentic, unpaid, or created by a particular person. A non-brand creator handle must be attached to the creator or content, not a random mention. A paid-partnership label must actually be present in the creative or original source material. Do not manufacture attribution from appearance or general ad-library association.

| Stored value | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `paid-partnership-label` | An explicit paid-partnership or branded-content attribution is present, and no qualifying non-brand creator handle is visible. Record the wording in notes. | The creative displays "Paid partnership with North Soap" without a creator handle. | The original source shows a branded-content partner attribution by name, with no visible handle in the creative. |
| `visible-creator-handle` | A qualifying non-brand creator handle visibly attributes the content, with no paid-partnership label observed. A brand's own handle does not qualify. | A reviewer is captioned "@ellashome" while presenting their diffuser review. | A retained clip carries the original creator's non-brand watermark, with no partnership label visible. |
| `both` | Both a qualifying paid-partnership attribution and a non-brand creator handle are observed in the same ad or its original source material. | A review displays "@ellashome" and "Paid partnership with North Soap" together. | The clip carries a creator watermark and the original source separately identifies the branded-content partnership. |
| `none` | The complete inspected material contains neither qualifying attribution type. This means no evidence was observed, not proof that a creator or payment was absent. | A home-shot review has no visible handle or partnership label. | A polished product ad shows only the advertiser's own handle. |
| `unsure` | Attribution is missing, unreadable, cut off, contradictory or cannot confidently be classified as a non-brand creator or partnership label. | A watermark is visible but too blurred to read. | A handle appears, but the available material does not establish whether it is the advertiser's own account. |

## Offer type (`offerType`)

Record explicit incentives in the creative or original copy. A countdown or "limited time" without an identifiable incentive does not itself establish a discount. For `multiple`, at least two distinct offer types must be explicit; several percentage discounts still belong to `percentage-discount`.

| Stored value | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `percentage-discount` | An explicit percentage reduction is offered, with no other distinct offer type. | "20% off your first order" appears in the copy. | The creative advertises "Save 30% this weekend" without another incentive. |
| `fixed-discount` | An explicit fixed monetary reduction is offered, with no other distinct offer type. A plain price alone does not qualify. | The headline says, "£10 off your gift box." | The copy offers a £5 voucher deducted from the next purchase. |
| `bundle` | A multi-item package or quantity deal is explicitly presented as the incentive, with no other distinct offer type. | The creative offers "Any three candles for £30." | The copy presents a diffuser-and-refill duo as a bundle deal. |
| `free-gift` | An additional item is explicitly free with an order or qualifying purchase, with no other distinct offer type. | "Free mini candle with every gift box" appears on screen. | The copy offers a complimentary travel pouch when buying a skincare set. |
| `free-shipping` | Delivery or shipping is explicitly free, with no other distinct offer type. A minimum-spend condition still belongs here. | "Free UK delivery on orders over £40" is the incentive. | The headline says, "Free shipping this weekend." |
| `trial-guarantee` | A trial period, money-back commitment or satisfaction guarantee is explicitly used as an incentive, with no other distinct offer type. Do not assess enforceability. | The ad offers a "30-day money-back guarantee." | The copy invites viewers to try the product for seven days before committing. |
| `multiple` | At least two distinct defined offer types are explicitly offered in the same ad or original copy. | The ad offers 20% off and free delivery. | A bundle deal also includes a free mini candle. |
| `none` | No explicit incentive from this taxonomy is observed in the complete creative and original copy. A standard price or vague value claim alone is insufficient. | A product ad states "£24" without describing a reduction or other incentive. | A candle creative says "Beautiful fragrance for your home" without an offer. |
| `unsure` | The incentive is unreadable, incomplete, ambiguous or not classifiable from the available material. | The only offer text is clipped to "Save…" with no visible amount or terms. | The ad says "special deal" but does not reveal whether it is a discount, bundle or another incentive. |

## CTA (`cta`)

Classify the dominant explicit action requested by the ad, including a visible ad button and original copy. Infer neither an action from a product shot nor a CTA from ordinary platform controls. A discount without a request to act is an offer, not automatically a `shop` CTA.

| Stored value | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `shop` | The viewer is explicitly asked to buy, order, shop or add a product to a basket. | The closing card says, "Shop the gift collection." | The visible ad button reads "Buy now" and no other CTA dominates. |
| `learn-more` | The main request is to read, discover, explore details or find out more, without explicitly requesting purchase. | The button reads "Learn more" beneath an ingredient explanation. | The copy says, "Discover how our refill system works." |
| `sign-up` | The main request is to register, subscribe, join a list or create an account. | The closing card asks viewers to join the launch waitlist. | The copy says, "Subscribe to our newsletter for new releases." |
| `contact` | The main request is to message, call, email or otherwise contact the advertiser. | The creative says, "Message us to plan your gift order." | The closing frame asks viewers to call for a consultation. |
| `download` | The main request is to download an app, file or other resource. | The ad asks viewers to download the brand's app. | The copy says, "Download our fragrance guide." |
| `visit-store` | The main request is to visit a physical shop, showroom, event or other stated offline location. | The closing card says, "Visit our Bristol shop this Saturday." | The copy invites viewers to try the range at a named pop-up. |
| `engage` | The main request is a social interaction such as follow, like, comment, share or save. | The presenter says, "Comment with your favourite scent." | The copy asks viewers to save the routine for later. |
| `none` | No explicit request to act is observable in the complete creative, visible ad button or original copy. | A product montage ends with the logo and no instruction or button. | A static brand image contains only a slogan and product name. |
| `unsure` | The requested action is missing, unreadable, outside these definitions or tied between equally prominent conflicting CTAs. | The final instruction is cut off and the ad button is unavailable. | The ad gives equally prominent "Call us" and "Shop now" instructions, with no clear primary action. |

## Shared audio vocabulary (`audio_type`)

These model audit fields supplement the seven human dropdowns. Assess the retained audio, not captions alone. A sung or rapped lyric in background music is music, not spoken voiceover; do not put it in the spoken transcript. For example, a soundtrack singing "Upside down / Inside out" with product shots and no spoken narration is `music-only`, even though the words are intelligible. Separate any observed music lyrics from speech and identify their timing when possible. If both voiceover and on-camera speech occur, choose the dominant speech source and describe the secondary source; use `unsure` if they are tied.

| Stored value | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `voiceover` | Spoken narration is heard without the speaker visibly delivering it, and no music is audible. | An unseen narrator describes diffuser scents over product shots. | Instructions are spoken over hands assembling a gift box without music. |
| `on-camera-speech` | A visible person is heard speaking in sync, and no music is audible. A visible silent person alone does not qualify. | A founder talks to the camera in a quiet workshop. | A customer speaks while visibly demonstrating the product without music. |
| `music-only` | Music is audible, with or without sung lyrics, and no intelligible spoken narration is heard. | Product shots are accompanied only by an instrumental track. | A pop song's sung lyrics accompany a gift-box montage without spoken speech. |
| `music-plus-voiceover` | Music accompanies spoken narration from an unseen or off-camera speaker. Sung lyrics remain separate from that narration. | An unseen narrator explains an offer over quiet instrumental music. | A product demonstration has voiceover and a sung background track. |
| `music-plus-on-camera-speech` | Music accompanies a visible person's synchronised speech. | A presenter explains a candle while background music plays. | A credited creator delivers a review to camera over an instrumental track. |
| `silent` | The complete retained creative has no audible soundtrack; still images and still-image carousels belong here when they contain no audio. | A retained video has no audio track or audible sound. | A still product image has no audio. |
| `unsure` | Audio is unavailable, too unclear, contradictory or not classifiable in the categories above. | The audio cannot be decoded, so silence cannot be established. | An indistinct sound could be speech or a vocal music sample. |

`music_lyrics_present` records audible sung/rap lyrics, separately from speech. `has_licensed_music_lyrics` must remain unknown/null unless trusted source metadata explicitly establishes licensing; hearing a familiar song or observing lyrics does **not** establish a licence, permission or copyright infringement. A model must not invent licensing evidence. Missing or indecipherable audio is uncertainty, not a reliable negative. Retain source-grounded audio explanations rather than relying on an uncalibrated confidence number.

## Shared claim types (`claim_type`)

Preserve the actual claim wording and its source (speech, visible text or original copy). Assign all applicable types to each claim; a single claim can be comparative and performance-related. These tags describe what the ad asserts, not whether it is true. A claim tagged `comparative` or `superlative` receives the review marker **"may need substantiation (ASA)"**. This is a prompt for human evidence review, not a legal ruling or a statement that the ad breaches the ASA/CAP rules.

| Stored value | Definition | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `price-discount` | A price, saving, discount, value-for-money or stated commercial-price assertion. | "Now £20, was £30." | "Save 25% on the gift set." |
| `comparative` | An explicit or unambiguous comparison with competitors, an alternative, the market or a prior product/result. | "8x stronger than other diffusers." | "Lasts twice as long as our original candle." |
| `superlative` | A highest-ranking or absolute superiority assertion, including a claim to be best, number one or unmatched. | "The UK's best home fragrance." | "Our most effective formula ever." |
| `performance` | A functional result, efficacy, strength, duration or measurable product capability. | "Keeps your room fragrant for six weeks." | "Removes stains in one wash." |
| `provenance` | A claim about origin, manufacture, sourcing, ingredients' origin or maker identity. | "Made in the UK." | "Hand-poured in our Somerset workshop." |
| `social-proof` | A claim about customers' approval, reviews, ratings, adoption or endorsement. Do not verify authenticity. | "Over 10,000 five-star reviews." | "Loved by 50,000 customers." |
| `other` | A clear marketing assertion that does not fit any defined type. Explain its meaning without inventing an extra category. | "Available in six colours." | "Compatible with the matching refill bottle." |
| `unsure` | A claim appears to be present but its meaning or classification cannot be established. | A cropped caption reads "Better than…" without the comparison. | An audible assertion is too indistinct to determine what is promised. |

## Shared boolean tags (`tags`)

Each tag records explicit observable evidence anywhere in the complete creative or original copy. `true` means evidence is present; `false` means it was not observed after complete inspection, not that the opposite is proved. For unavailable or unclear material, preserve unknown/null when the model schema permits it and explain the limitation. Multiple tags can be true independently of the dominant hook, angle or offer.

| Stored value | Definition of true | Example 1 | Example 2 |
| --- | --- | --- | --- |
| `urgency_scarcity` | A deadline, limited availability, sell-out/restock or another explicit pressure to act quickly appears. | "Only 50 remaining." | "Offer ends tonight." |
| `social_proof` | Approval, customer adoption, testimonials, endorsements or reviews are explicitly presented. | A customer says they repurchased the candle. | "Join 50,000 customers" appears in the copy. |
| `reviews_ratings` | A review quotation, review count, star score or another explicit rating is presented. | A five-star review card is visible. | "Rated 4.8/5 from 2,000 reviews" appears on screen. |
| `made_in_uk` | UK manufacture is explicitly claimed. A UK price, address, flag or British-sounding voice alone is insufficient. | "Made in the UK" is printed on the creative. | The copy says the product is manufactured in Britain. |
| `provenance` | A place of manufacture, sourcing, maker identity or origin is explicitly claimed, including UK provenance. | "Hand-poured in Somerset" appears in the copy. | The ad states its lavender is sourced from France. |
| `values` | A stated ethical, environmental, dietary or other value is used as a product/brand claim. Do not infer verification. | "Vegan and cruelty-free" appears on screen. | The copy claims the packaging is plastic-free. |
| `price_shown` | A visible or written numeric price is presented, whether standard or discounted. Spoken-only pricing does not establish shown text. | "£25" is overlaid on a product shot. | The original ad copy lists a gift set at £30. |
| `discount_shown` | A visible or written explicit reduction, saving or former-to-current price is presented. A plain price is insufficient. | "20% off" appears on screen. | The copy says "Was £40, now £30." |

## Notes, disagreement and later evaluation

Record uncertain boundaries rather than resolving them by looking at a model answer. If a label changes after discussion, keep the earlier review and record a fresh review with the reason. Repeated disagreements are evidence that the definitions need revision; they are not a reason to guess at a consensus.

Changing allowed values, their meanings, or tie-break rules changes the label schema. Review those changes with Benjamin, version the guide and taxonomy together, and retain the version with each label. Keep `unsure` as an explicit human abstention; do not silently recode it as a negative or as a model's `unknown` value. V2 replaces the earlier hook values `demonstration`/`offer` with `demo`/`offer-led` and revises angle categories; historical v1 labels keep their original meaning and require an explicit reviewed mapping before combined evaluation.

Model confidence values are uncalibrated until measured against held-out human labels. Do not filter ads, accept labels automatically, or exclude difficult examples using those numbers. Use the human-labelled set to assess calibration before setting any confidence threshold.

The seven-field human export is a labelling dataset. It is not automatically interchangeable with the older native-video CSV evaluator: fields such as hook type, angle and CTA use categorical values here, while that evaluator also accepts source-grounded free text and transcript fields. Establish and document any mapping before computing accuracy. In particular, `personOnCamera` must not be mapped to `personTalkingToCamera`.

Phases 5.3–5.5 require separate work: a stratified 200-ad sample, a 50-ad held-out test set, 30 repeat labels after a week, per-field accuracy/F1/confusion/kappa, and a scale test. This guide and the tool do not assert that those labels, measurements or thresholds have been achieved. Do not use held-out test labels to tune prompts.
