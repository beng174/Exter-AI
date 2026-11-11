# Public discovery and official verification

Use sources in this quality order: disclosed posts mentioning competitors,
creators identified in collected competitor ads, seed lookalikes, other competitor
mentions, then niche hashtag posts. Keep the source and query on each candidate.
Ordinary mentions from the first lookup are reused later without another charge:

| Channel | Method | Limit |
| --- | --- | --- |
| Hashtags | Top and recent public posts from brief tags; collect their authors | Suggested tags are not claims about current popularity |
| Keywords | Check niche match in bios and captions only | Never use brief keywords or categories as account-name searches |
| Competitor tags | Public posts tagging supplied competitor handles | A tag alone does not prove a paid collaboration |
| Disclosed posts | Niche-matching #ad, #gifted, #sponsored and paid-partnership posts; take authors | Disclosure alone does not prove niche fit |
| Seed lookalikes | Public related-profile suggestions from the supplied seeds | No follower lists, private audience harvest or invented lookalikes |
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

Public profile follower, post, like and comment counts are Observed (public profile).
Use them for strict follower filters, tiers, engagement and activity. Store their
original observation time; unknown and hidden counts remain null. An official
Business Discovery check upgrades only its own returned fields to Verified.
Unsupported official checks leave public counts usable and explicitly public.
A failed check cannot erase good numbers or renew their date. Never substitute
public counts under the Verified label. No raw datasets, secrets or provider messages.

Never fall back from an empty keyword list to category-name account search.
Suggest 10–20 hashtags from onboarding categories and keywords, plus up to eight
saved competitor handles or clearly unconfirmed name-derived query suggestions.
Show these in the editable brief before quoting or running. Never invent seed
creators or pad a short competitor list with invented businesses. More than one
post from an author contributes to their latest-twelve-post sample.

Exclude explicit brand/shop accounts, meme/repost pages, resellers and private
accounts. Apply exact excluded handles and declared excluded topics. An explicit
non-target country is excluded when the country filter is active. Unknown location
fails qualification and cannot enter a UK-only shortlist. A business
account is not inherently a brand: professional individual creators remain eligible.
Show each exclusion reason and retain only minimal diagnostics, not rejected profiles.

Creator runtime recovery: Instagram runs may last fifteen minutes, with twenty
minutes of polling. Retry safe reads five times on temporary failures; never
retry a paid start or abort a running actor because its status check failed.
Persist provider and reservation IDs before advancing. Final timed-out/aborted
runs still contribute partial results through the same screening. Renew worker
leases and resume the same run. Delete provider datasets only after projection
and the durable step update. Reconcile final authenticated usage against its
original hold and frozen exchange rate; unknown costs keep their hold. Earlier
untracked runs require a confirmed run/hold mapping and input/actor checks.

Owner update, 10 Nov 2026: scraper public counts now drive screening; the previous
official-only filtering rule is superseded. Rescreen saved full profiles under the
new rule version without provider calls. Earlier discarded counts cannot be
recovered from minimal diagnostics. Preserve dated decisions for rejected accounts
whose full profiles were intentionally not kept.

Final owner clarification: keywords never become account searches, including
person-type keywords. Niche requires three matching posts among the latest twelve;
a bio match alone is insufficient. Missing hard checks are Rejected with reasons.
Needs review is reserved for genuine creator-founders passing the other rules.

Stop search is an explicit instruction to abort the current paid run. The web
service records the request; the worker aborts the known run, reads and processes
partial results, then reconciles final actual usage. Never start another step.
A temporary stop/check failure preserves the same run and reservation. Unknown
charges remain held until authenticated usage is available; never claim a refund
before it is confirmed. Queued searches stop without any provider request.
