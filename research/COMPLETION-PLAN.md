# Completing Exter's public-first platform

The target is category intelligence from public paid ads and organic posts before a client grants account access. Public engagement and source dates are the core measures. Private account reporting is an optional later layer.

## 1. Make public collection repeatable and measurable

Use ad libraries for creatives, advertiser identities, source activity and delivery dates. The corrected Valentte browser test supplies 58 real records and proves that the previous HTTP-only access check was inadequate. Next add incremental collection, supported pagination, durable scheduling, retries and native-ID deduplication across libraries and public posts. Prefer official APIs or licensed feeds where they improve permitted coverage and reliability.

Store original publication, delivery start/end, first seen, last checked and metric observation timestamps separately. Show sample size, source coverage and the last successful check in every answer. Never present a bounded search sample as every ad in the category.

## 2. Add public engagement observations

Connect each creative to a public post when a verified mapping is available, then collect the counts that source actually exposes. Store reactions, comments, shares and views separately, with metric definitions and timestamps. Calculate engagement rate only with a declared denominator; keep impression-, view- and follower-based rates separate. Missing counts remain unavailable. Ad longevity and variant counts can be additional indicators, labelled with their meaning rather than treated as estimated engagement.

## 3. Improve Exter's own AI

Add video-frame sampling, speech transcription, OCR and category context before richer format, message and angle analysis. Run a stronger multimodal model in Exter's inference service, with structured outputs and access to Exter's stored evidence and calculations. The current assistant is rules-based, so general research reasoning is a separate addition. Claude remains an optional reader of Exter's results.

Create a human-labelled set of real ads across categories and platforms. Measure format and concept accuracy, test the Valentte packaging error, keep low-confidence fields unknown, and require source evidence for UGC/influencer origin. Add persistent analysis jobs and model/version tracking. Larger models require an infrastructure and capacity choice.

## 4. Build real creator and review ingestion

Collect permitted public creator content/profiles and customer reviews with their source and dates. Extract recurring needs, objections, product experiences and brand language with supporting excerpts. Rank creators by relevant content, tone, language/geography and engagement consistency, explaining each component. Validate initial shortlists manually. Audience demographics remain inferred or unavailable unless a source actually measures them.

## 5. Turn the snapshot into a hosted product

Run the full app with persistent database and media storage, durable collectors and analysis workers. Add sign-in, organisations, client-workspace permissions, tenant isolation, credential storage, monitoring, backups and recovery. The ZIP remains a review artifact; the hosted service performs collection and computation. Domain, hosting capacity and any required source-service access are external setup dependencies.

## 6. Connect the team to Claude

The local read-only MCP server already supports Claude Desktop configuration against the full app's database. It does not use a Claude API key. For shared browser/team use, deploy an authenticated HTTPS MCP endpoint with workspace permissions, then add it through Claude's custom connector settings. There is no deployed Exter connector URL yet. See [Claude setup](../docs/CLAUDE.md).

## Acceptance checks using Valentte

- Retrieve the correct advertiser's real creatives and preserve IDs, source links and exact date meanings.
- Run a second successful refresh without duplicates; retain history and expose collection failures.
- Validate creative classifications against human labels, including unknown and mixed formats.
- Compare engagement only for records with usable, compatible public metrics; show coverage gaps.
- Add comparable real competitor evidence before claiming a category result.
- Make Claude retrieve and cite the same saved source records, respecting each client's workspace access.
- Verify that an interrupted worker, failed source or restart preserves successful collection and analysis history.

These checks establish a usable public-data product without requiring client advertising-account access or pretending that unavailable public metrics exist.
