# Creative analytics module: specification

Exter AI build plan, 3 November 2026. Build only what a CA-xx ID below describes and cite the ID in every commit. Metric names and formulas come only from "Metric definitions". The UI follows `docs/BRANDING.md`; no other product's screens are used as a reference.

Decisions in force:

- The low-cost kernel work is paused until Phase 2; this module goes first.
- The first live test account is Exter Media's own Meta ad account; a prospect's account (free creative audit) comes after.
- Winner margin for CA-06 defaults to 20% better than benchmark, adjustable per workspace.

## Functional spec

Twelve features, each described by what it does, not how it looks. Every build task and commit cites its ID.

| ID | Feature | What it does | Done when |
| --- | --- | --- | --- |
| CA-01 | Account connections | A workspace (one per client brand) links any number of Meta ad accounts and TikTok advertiser accounts, read-only. Each shows status, last successful sync, latest data date and last error. | Two accounts on one workspace sync independently; a revoked token shows an error without losing stored history. |
| CA-02 | Daily sync | Backfills 90 days of ad-level daily rows, then each day re-pulls the last 7 days, because platforms restate recent conversions. Also stores ad, ad set and campaign names and creative asset IDs. | Spend and impressions match the platform's own reporting within 1% for 10 sampled ads. |
| CA-03 | Creative grouping | Treats ads that use the same underlying video or image as one creative and adds up their numbers, so one asset in 30 ads is judged once. | At least 95% of spend maps to a creative; unmapped spend is shown as its own line. |
| CA-04 | Naming conventions | A workspace defines its ad-name pattern, such as `concept_creator_hook_format` with a chosen separator. Parsed parts become filters and grouping options; names that don't fit are flagged, not guessed. | A test set of real ad names parses correctly; misfits are listed. |
| CA-05 | Creative tagging | Owned creatives go through Exter's existing taxonomy and analysis pipeline. A strategist can override any tag; overrides win and are logged with who and when. | Top 50 creatives by spend are tagged; overrides survive a re-analysis. |
| CA-06 | Winners board | The user picks a goal metric, minimum spend and date range. Creatives are ranked; a creative counts as a winner when it beats the account benchmark by a set margin (default 20%, adjustable per workspace) and has spent above the minimum. Shows rank change against the previous period of equal length. | Ranking reproduces by hand from the stored rows for one account. |
| CA-07 | Tag comparison | Pick a dimension, such as hook type or creator. For each value: number of creatives, share of spend, and benchmark-style metrics. Values with too little spend are marked low-confidence instead of ranked. | Totals across values equal the account total for the period. |
| CA-08 | Movers and fatigue | Lists creatives scaling up, scaling down and newly launched, week on week. Flags possible fatigue when a creative's recent cost per purchase rises against its own early weeks while frequency rises. Shown as a signal, not a verdict. | Each flag shows the numbers that triggered it. |
| CA-09 | Creative detail | One creative's daily trend, retention points (start, 25/50/75/95/100%), transcript, on-screen text and tags with their evidence timestamps. | Every number on the page traces to a stored row. |
| CA-10 | Owned vs category | For a tag value, compares the client's share of spend and results with how common that tag is among competitors' public ads, and how long those ads ran. Public ads are never given invented conversions. | Competitor side uses only collected public records and states its sample size. |
| CA-11 | Client view | A read-only, expiring share link per workspace or saved view; no login, no editing, no raw tokens exposed. | A revoked link stops working at once. |
| CA-12 | Weekly evidence pack | Every Monday, saves a dated snapshot of winners, movers and tag shifts for the strategist, with CSV and image exports. The written report stays with the Exter Media team. | Last week's pack stays unchanged after new data arrives. |

Later, once these are live: a pre-launch check that runs a new creative through tagging and Exter's existing prediction score before it goes out.

## Metric definitions

Every rate is a ratio of sums, never an average of per-ad rates, so big-spend creatives carry their proper weight. Meta and TikTok measure early viewing differently (3 seconds against 2 seconds), so their attention metrics are never ranked against each other.

| Metric | Formula | Meta field | TikTok field |
| --- | --- | --- | --- |
| Spend | sum of spend | `spend` | `spend` |
| CPM | spend ÷ impressions × 1,000 | `impressions` | `impressions` |
| Link CTR | link clicks ÷ impressions | `inline_link_clicks` | `clicks` |
| Hook rate | early views ÷ impressions | 3-second plays: `actions` with type `video_view` | 2-second views: `video_watched_2s` |
| Hold rate | longer views ÷ early views | `video_thruplay_watched_actions` ÷ 3-second plays | `video_watched_6s` ÷ `video_watched_2s` |
| Retention points | views reaching 25/50/75/95/100% ÷ video starts | `video_p25_watched_actions` … `video_p100_watched_actions`, ÷ `video_play_actions` | `video_views_p25` … `video_views_p100`, ÷ `video_play_actions` |
| Average watch time | as reported | `video_avg_time_watched_actions` | `average_video_play` |
| Frequency | as reported | `frequency` | `frequency` |
| Purchases | sum of purchases | `actions`, purchase types already mapped in the repo | `conversion` (the account's configured event, as the repo uses now) |
| CPA | spend ÷ purchases | derived | derived |
| ROAS | purchase value ÷ spend | `action_values`, purchase types | purchase value field: confirm in Phase 1 |
| CVR | purchases ÷ link clicks | derived | derived |

Rules that apply to every metric:

- **Benchmark** = the same ratio over all of the account's creatives for the same dates, currency, attribution setting and conversion event. Rows that differ on any of these are never mixed, matching the repo's existing rule.
- **Minimum sample** before a rate is shown or ranked. Starting defaults, to tune after real use: 1,000 impressions for hook rate and CTR, 300 early views for hold rate, 10 purchases for CPA and ROAS. Below the minimum the value shows as "too early", not zero.
- **Missing stays missing.** An image ad has no hook rate; it is excluded, not scored zero.
- **Restated data.** The latest pull for an ad and day replaces earlier ones; it is never added to them.

Verify before building the attention metrics: in June 2026 Meta retired a block of legacy reach, impression and 3-second viewer metrics, mainly for Pages and posts ([summary](https://admakeai.com/blog/meta-ads-updates-july-2026)). Phase 1 must confirm on a live ad account, starting with Exter Media's own, that the ad-level video fields above still return data on v25.0 or later. If they don't, the hook metric moves to Meta's current views fields.

## Tagging and low-cost video analysis

Owned creatives use the taxonomy and pipeline Exter already has for public ads, so there is one way of describing a creative across clients and competitors. No new model is needed. The cost saving comes from analysing each asset once and sending a compact evidence bundle to a small model instead of the full video.

Dimensions, all from `shared/creative-taxonomy.ts` (taxonomy v2): format, hook type, angle, offer type, audio type, claim type, plus the yes/no tags (urgency, social proof, reviews, price shown and so on). Three additions for owned ads, worked out without a language model:

- **Length band** and **aspect ratio**, from the media file.
- **Opening seconds**: on-screen text in the first frame, a face in the first second, from the OCR and face stages.
- **Creator and concept**, from the naming convention (CA-04) or a visible partnership label. Never guessed from a face.

The analysis path, as already designed in `research/PRODUCT-SPEC.md`:

1. Fetch the asset through the platform API and store it in the existing media store. Skip it if the same file hash was analysed before, so one asset in 30 ads costs one analysis.
2. On the worker: scene cuts and key frames (ffmpeg, PySceneDetect), speech transcript (faster-whisper), music versus voice (YAMNet), on-screen text (RapidOCR), face and product presence.
3. Send that bundle to `gemini-3.1-flash-lite` for the category labels only.
4. Send unclear cases to the full-video method, within the inference budget.
5. A strategist reviews the top 50 creatives by spend; corrections are kept and become the labelled set that measures accuracy.

Until the kernel stages pass their quality gates, owned creatives use the current full-video path behind the existing budget limits. Tags made that way are marked with their method so they can be re-run later.

## Data sources and API access

Start with Exter Media's own Meta ad account. The agency is its admin, and Meta's default access tier covers an app reading its own business's ad account, so a read-only system user works without App Review. Client and prospect accounts come next, shared to Exter Media's Business Manager. Meta's wording on whether those count as the app's own is loose, so test one before relying on it, and apply for Full access if Meta refuses.

| Source | Gives us | Access needed | Next step |
| --- | --- | --- | --- |
| Meta Marketing API | Ad-level daily insights, ad and campaign names, creative asset IDs and files | Business-type Meta app with the Marketing API product; `ads_read` permission only; system user in Exter Media's Business Manager assigned to each account | Create the system user, assign Exter Media's ad account first, store its token as a Render secret |
| Meta access tier | Limited access (the default) is heavily rate-limited and meant for development; Full access is for live advertisers | Full access needs App Review and Business Verification; qualifying takes 500 Marketing API calls in 15 days | Phase 1 syncs build up the call count; apply before onboarding brands that aren't Exter Media clients |
| Meta API version | The repo defaults to v23.0, available until 9 June 2026; v24.0 ran until 6 October 2026 | None | Set `EXTER_META_GRAPH_VERSION` to v25.0 or later before any live sync |
| TikTok API for Business (reporting) | Ad-level daily report with spend, clicks, conversions and video play metrics | Developer app, then each client authorises its advertiser account | Register the app; the existing `report/integrated/get` call gains the video metrics from "Metric definitions" |
| Exter's public collection (already built) | Competitor ads from the Meta Ad Library and TikTok's commercial content library | Already planned in the kernel spec | No change; feeds CA-10 |

The Meta Ad Library API (public competitor ads) and the Marketing API (an account's own reporting) are approved separately.

Sources: [Meta Marketing API changelog](https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog) · [Meta Marketing API authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization) · [TikTok video play metrics](https://ads.tiktok.com/help/article/video-play)

## Architecture and data model

The module adds a client-account path that reuses Exter's existing worker, storage and tagging:

- **Client path (new):** Meta and TikTok reporting APIs → owned sync job on the Render worker (daily rows, 7-day re-pull, asset files) → `owned_*` tables in Postgres → `shared/owned-metrics.ts` → boards, client links and weekly packs (CA-06 to CA-12).
- **Shared (existing):** media store and kernel tagging. New files from both paths go in; each file is analysed once per hash; taxonomy v2 tags are written back to both paths.
- **Public path (existing):** Meta and TikTok ad libraries → public collection jobs → `public_ads` and `ad_observations` → read-only MCP. The public tables also feed CA-10.

The existing Render cron scheduler starts each day's sync jobs on the Postgres job queue already used for public collection (`server/infrastructure/jobs.ts`).

| New table | One row per | Main columns |
| --- | --- | --- |
| `owned_accounts` | linked ad account | workspace, platform, account ID, status, last successful sync, latest data date, last error |
| `owned_ads` | ad | ad, ad set and campaign names; parsed naming parts; asset hash |
| `owned_ad_days` | platform, ad, day and attribution setting | spend, impressions, clicks, video fields, purchases, purchase value, currency, conversion event, pulled at |
| `owned_creatives` | asset file hash | media type, length, aspect ratio, tagging method |
| `tag_overrides` | corrected tag | creative, dimension, old value, new value, who, when |
| `naming_templates` | workspace | separator, ordered part names |
| `share_links` | client link | workspace, saved view, expiry, revoked at |
| `evidence_packs` | weekly snapshot | workspace, week, frozen figures, export files |

New code: `server/owned/` for connections, sync and asset fetching; `shared/owned-metrics.ts`, `shared/creative-groups.ts` and `shared/naming-convention.ts` for the logic; `src/components/owned/` for the boards.

## Build phases

Phases run in order. Each gate must pass on a live ad account, never on fixtures alone, before the next phase starts.

| Phase | Scope | Gate |
| --- | --- | --- |
| 0. Set-up | Clean-room rules in `AGENTS.md`, this spec in the repo, kernel paused, Meta API v25+ | System user reads Exter Media's own ad account |
| 1. Connections, sync and metrics | CA-01, CA-02: many accounts, daily sync, metric layer | Spend and impressions within 1% of the platform for 10 ads |
| 2. Creatives, naming and tags | CA-03 to CA-05: grouping, naming parser, tagging | 95% of spend mapped; top 50 creatives tagged and reviewed |
| 3. The boards | CA-06 to CA-09: winners, tags, movers, creative detail | Used in one client report or prospect audit |
| 4. Category view and sharing | CA-10 to CA-12: category view, client links, weekly pack | Shown in a prospect demo; one client link reviewed |
| 5. Self-serve connections | Meta and TikTok sign-in for brands, encrypted tokens | Meta Full access approved through App Review |

## Codex prompts

One prompt per phase, run in order as separate tasks. Do not start a later phase's prompt until the previous gate has passed.

**Phase 0: set-up**

```text
Read research/CREATIVE-ANALYTICS-SPEC.md, sections "Functional spec" to "Build phases".
Update AGENTS.md: the current priority is now the creative analytics module in that spec,
Phase 0 then Phase 1. The low-cost kernel work is paused until Phase 2: leave its code,
tests, research/PRODUCT-SPEC.md and research/STATE.md in place, but do not pick kernel tasks
(npm run kernel:next) unless I ask. Record the pause in research/STATE.md.
Add a "Creative analytics module" section to AGENTS.md with these rules: build only what a
CA-xx ID describes and cite it in commits; never name another company's product in code,
comments, prompts, fixtures or commits; never use screenshots or descriptions of other
products' screens; metric names and formulas come only from the spec.
In docs/INSIGHTS.md, remove the sentences that name another company's screenshot or brand
page as a layout or workflow reference, and describe the layout as Exter's own. Do not
change the UI.
Change the default Meta Graph version in server/connectors/types.ts from v23.0 to v25.0 and
update the tests. No live provider calls. Run npm test, npm run check, npm run secrets:check.
```

**Phase 1: connections, sync and metrics (CA-01, CA-02)**

```text
Implement CA-01 and CA-02 from the spec. Add a Postgres table owned_accounts (workspace,
platform, account id, status, last successful sync, latest data date, last error) and
owned_ad_days (one row per platform, ad, day, attribution setting; latest pull replaces
earlier ones). One Meta system-user token and one TikTok token stay in Render secrets;
never store or log tokens in the database.
Add an owned-sync job to the existing Postgres job pattern in server/infrastructure/jobs.ts:
the scheduler enqueues each account daily, the worker runs it. Backfill 90 days, then re-pull
the last 7. Extend the Meta insights fields and TikTok metrics to those in "Metric
definitions". Put every formula, the benchmark rule and the minimum-sample rule in a new
shared/owned-metrics.ts with unit tests.
Test with fixtures for pagination, restated days, a revoked token, two accounts on one
workspace and mixed currencies. Say clearly that fixtures are not live verification.
```

**Phase 2: creatives, naming and tags (CA-03, CA-04, CA-05)**

```text
Implement CA-03, CA-04 and CA-05. For each owned ad, fetch its video or image through the
platform API into the existing media store; deduplicate by file hash. Add owned_creatives
(asset hash to ads) and show unmapped spend as its own line.
Add a per-workspace naming template with a separator and named parts; names that don't fit
are flagged, never guessed. Run owned creatives through the existing taxonomy v2 analysis
path, recording which method produced each tag. Add tag overrides (who, when, old, new)
that survive re-analysis. Respect existing budgets and request guards.
```

**Phase 3: the boards (CA-06 to CA-09)**

```text
Implement CA-06 to CA-09. All ranking, grouping, movers and fatigue logic goes in shared/
with unit tests that reproduce results by hand from fixture rows; React components only
display. Follow docs/BRANDING.md and the existing component patterns. Below the minimum
sample, show "too early", never zero. Every fatigue flag shows the numbers behind it.
Run the browser smoke tests at 1024px and 390px.
```

**Phase 4: category view, client links, weekly pack (CA-10, CA-11, CA-12)**

```text
Implement CA-10 to CA-12. The category comparison uses only stored public records and states
its sample size; public ads never receive conversions. Client links are read-only, expire,
can be revoked immediately and never expose tokens or other workspaces. The weekly pack is an
immutable dated snapshot with CSV and PNG export; it does not write narrative text.
```

**Phase 5: self-serve connections**

```text
Add Facebook Login for Business with ads_read only, and TikTok advertiser authorisation, so a
brand can connect its own accounts. Store each token encrypted with a key held in Render
secrets; support revoke and reconnect. Draft the App Review use-case text and test-user steps
as a markdown file for me to submit. Do not submit anything yourself.
```
