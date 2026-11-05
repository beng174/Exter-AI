# Public Performance signals and bounded ad media

## Purpose and big picture
Following the collection recovery/storage work in PR #17, implement the user's next tasks as a separate review against exter-test-drive. Public Creative detail Performance shows every available collected public signal without private outcomes or empty tiles. An opt-in maintained pay-per-result Apify actor supplies media/format only, with strict budget and disk limits. No paid actor run or live provider verification is authorised during implementation; fixtures only.

## Progress
- [x] 2026-11-05 UTC: Completed collection recovery in PR #17, commits 8d43b57 and 1e75fe9, with all four checks and fixture evidence.
- [ ] Read Creative detail, public read shapes, existing Apify/media/broker/storage/budget code and the applicable security/reference instructions.
- [x] 2026-11-05 UTC: Built public source-field projection, available-only reference tiles, observed audience bars, exact sampled versions and explicit rate arithmetic. All 464 unit tests, type check, build and browser fixtures at 1440/390 pass; secret scan is the final publication check.
- [ ] Verify a maintained actor's current input/output/pricing contract from public docs, then implement disabled-by-default media ingestion, bounded local retention and accounting.
- [ ] Test priorities, per-result costs, budget caps, shared-file storage, 720p H.264 videos, disk 80% cutoff, expiry, matching and defaults with fixtures; run all four checks and publish.

## Surprises and discoveries
The web service owns the persistent media disk; workers cannot read it. Investigate the existing scoped artifact broker instead of assuming a shared filesystem. Public actor Store metadata/documentation is available without running a paid actor. The better established actor candidate is curious_coder/facebook-ads-library-scraper: public metadata checked 5 Nov 2026 reports a 23 Oct modification, about 50,000 users, $0.00075 per returned ad and an additional $0.00005 start event at its default 512 MiB. Current billing is PAY_PER_EVENT, so the media guard must include both known event types rather than assume a purely per-result charge. Its input schema and targeted missing-ID contract still need verification. Do not choose an actor solely from a search snippet.

## Decision log
2026-11-05: User's following tasks extend this overall turn but do not cancel collection recovery. Complete PR #17 first, then make the public Performance/media work separately. Default EXTER_AD_MEDIA_ENABLED remains the string false on web, worker and scheduler. No provider data or priced run is fetched for tests.

## Outcomes and retrospective
Public Performance is implemented and fixture-validated, with publication pending. Media actor selection, transport and maximum-charge contracts still need investigation. No paid actor run or live verification has occurred.

## Context and orientation
Performance is in src/components/creatives/CreativeDetailPage.tsx and sample read models. Public API rows originate in server/infrastructure/meta-evidence.ts and shared/creative-browser.ts. Existing publishedReach covers EU/location/demographic measurements; raw payload retains targeting, languages and placements. server/creators/apify.ts establishes token/header and budget patterns. Existing video/image stores and kernel artifact broker must be read before designing media retention.

## Plan of work
1. Show UK reach, EU reach and all published countries as Observed; Estimated reach/day with actual arithmetic in a tooltip; Observed age/gender bars, chosen targeting ages/gender/locations, exact creative/copy version counts, platforms and languages. Keep Days running and Public signals only. Hide missing tiles. No public spend, impressions, clicks or conversions. Preserve samples and reference tile style.
2. Select a maintained pay-per-result Meta Ad Library actor costing about $0.50-$1/1,000 ads. Use APIFY_TOKEN from Render secrets. Query by confirmed brand Page ID in GB; join only exact archive/API IDs. Actor fields must never supply official reach/dates or change media-independent evidence. Map only image/video/carousel/catalogue format and assets.
3. Download images/posters immediately with the existing bounded public fetch and raster/media validation. Deduplicate by content hash. Save full videos only for ads running 30+ days, brand top 20 by reach, or launched in the current week; re-encode to 720p H.264. Store into the existing persistent media store through an authenticated bounded transfer if needed. Show disk used/remaining and stop video downloads at 80% allocation.
4. Reserve maximum per-result run cost before actor dispatch, account for every returned result including unmatched/duplicate results, show per-run cost in Budgets and schedule, and never exceed the cap. Preserve uncertain charges/restarts safely. First run covers the official 12-month watchlist window; subsequent requests target only ads missing media. Investigate actor support for targeted missing IDs rather than paying to refetch complete Page history daily.
5. Stored media automatically populates cards/detail. Missing media keeps text preview. Add disabled flag to all three Render services and document actor, why selected, current pricing evidence, secrets, rollout and limits. No new provider activation or kernel work.

## Concrete steps
Use the existing four checks: npm run check, npm test, npm run build, npm run secrets:check. Use injected actor responses and a dedicated disposable Postgres database. Browser fixtures block external requests. Public documentation research is permitted; never call actor-run endpoints during development.

## Validation and acceptance
Every requested public signal appears only when real source values support it, with correct Observed/Estimated labels and exact tooltip arithmetic. Missing metrics never become zeros. Same-copy/media version counts are deterministic. Actor media matches archive ID and saved Page ID; private actor metrics are ignored. All actual results are charged to the guarded data-provider reservation, including discarded results. An oversized/repriced/uncertain actor run cannot overrun the budget. Expiring links are consumed immediately and never hotlinked. Images/posters remain available; videos respect eligibility, content deduplication, 720p H.264 and physical disk cutoff. Defaults and sample actions make no provider calls. Complete all four checks for both parts.

## Idempotence and recovery
Keep all historical ads, observations, media and paid analyses. Do not delete anything to reclaim space. Default-off integration must not start on deploy. Reuse run/checkpoint/accounting patterns and retain uncertain paid attempts for review. Media retries reuse stored hashes and process only missing media. Preserve official reach/dates, schedule, existing budgets and flags.

## Interfaces and dependencies
No paid/live calls in fixtures. Prefer existing libraries, ffmpeg/ffprobe and bounded fetch. Any service transfer must honour actual disk ownership, workspace scope, authentication and content integrity. Follow AGENTS and existing request/accounting controls. New secrets/default flags only as required by the authorised feature; no new Render service or model pipeline.
