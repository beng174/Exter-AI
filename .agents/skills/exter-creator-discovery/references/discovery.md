# Public discovery and official verification

Use several channels so a single popular hashtag cannot dominate the pool:

| Channel | Method | Limit |
| --- | --- | --- |
| Hashtags | Recent public posts from brief tags; collect their authors | Suggested tags are not claims about current popularity |
| Keywords | Search public profile names/bios for category and niche phrases | A name match is a candidate, not fit proof |
| Competitor tags | Public posts tagging supplied competitor handles | A tag alone does not prove a paid collaboration |
| Seed lookalikes | Public related-profile suggestions and searches using seed niche terms | No follower lists, private audience harvest or invented lookalikes |
| Collected ads | Exact visible handles or linked branded-partner profiles in stored competitor ads | A person or partner name is not an Instagram handle |

Use maintained actors supported by the existing server-side client. Inspect the
current actor schema, pricing and supported fields before implementation; store
actor/version and query purpose. Split collection into paced batches below 200;
deduplicate by lowercased Instagram username. Never merge across platforms by name.
A changed username needs a verified platform identity link before merging records.

Quote a conservative maximum reservation for every paid batch, including profile
and post fetches. Reserve through the existing data-provider budget before starting.
Enforce provider charge/result limits too. Recheck remaining budget between batches,
stop rather than overrun, and preserve paid results on failure. Unknown final charges
retain their reservation; an automatic retry must not double-bill. Target count is
an upper limit, not a promise of enough eligible or verifiable creators.

Fetch official figures through Instagram Graph API Business Discovery using the
configured research account, never a creator's credentials. It supports eligible
public professional accounts; unsupported personal/private accounts, hidden counts,
missing permissions and rate limits remain Unverified. Store a controlled reason,
check time and sample size. Never replace an official missing count with a scraper
count. The scraper may supply public discovery text, related handles and thumbnails.
Never persist a token, provider message, paging URL or raw dataset.

Exclude explicit brand/shop accounts, meme/repost pages, resellers and private
accounts. Apply exact excluded handles and declared excluded topics. An explicit
non-target country is excluded when the country filter is active. Unknown location
stays in a review queue and cannot pass a UK-only shortlist automatically. A business
account is not inherently a brand: professional individual creators remain eligible.
Show each exclusion reason and retain only minimal diagnostics, not rejected profiles.
