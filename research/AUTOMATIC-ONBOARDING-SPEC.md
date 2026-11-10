# Automatic UK brand onboarding

Authorised 10 November 2026. PRODUCT-SPEC remains the main product spec. This
module implements the owner's automatic onboarding instruction; it overrides the
older requirement for manual confirmation of every Page only within this flow.
The low-cost kernel remains paused. No prediction or accuracy gate changes.

- BO-01: name and public website only. Read homepage, up to two collections,
  three products and two About/story pages, at most eight pages per site. Use the
  existing bounded same-domain public fetch. Keep short text and source links,
  not HTML, scripts, provider URLs or credentials. Product prices come only from
  structured Product offers. Understanding, claims, audience and categories are
  Modelled with source quotes. Save specific product categories as My categories
  and discovery keywords. Existing manual categories remain authoritative.
- BO-02: rate-limited Pages search plus UK Ad Library ALL search. An exact Page
  name with its website matching the saved domain, or UK ads linking directly to
  that domain, permits automatic confirmation. Name/username similarity alone
  never does. Include every relevant Page found, each with its own watchlist,
  cursor and jobs. Show the top three ambiguous candidates for one-click Confirm.
  Pages-search permission failure falls back to the Ad Library. A bounded search
  is never described as an exhaustive directory of Pages or ads.
- BO-03: discover advertisers through up to ten category keyword searches (UK,
  active), plus up to eight AI-suggested brand/domain leads. Verify candidate
  websites and same-category products before acceptance. Exclude the own domain
  and retailers, resellers and marketplaces without a proven own-brand range in
  the relevant category. Rank UK ads found, published reach, category/keyword
  overlap and comparable GBP product prices. Auto-add at most eight qualifying
  high-confidence brands; never pad fewer than five with weak matches. Reasons
  and match confidence are visible; confidence is an estimated rule score, not
  calibrated prediction accuracy. Owners can remove, add or swap with one action.
- BO-04: durable worker-driven setup with one bounded operation per leased web
  step. Web owns SQLite and media; worker owns scheduling. Reserve before paid
  dispatch, store estimates before starting, settle only known usage, and keep
  ambiguous-start holds. Use existing asynchronous text batch model, budgets,
  rate limits and collection/media switches. No new secret names or limits.
- BO-05: enqueue official brand/Page collections, then existing media and category
  jobs. Keep official reach and dates unchanged. Progress reads never call
  providers. Show source counts, image/poster and tagged percentages, estimates,
  held costs and known costs. Missing previews retain their daily reason/retry;
  unknown text stays untagged. Winners retains the honest longest-running fallback.
- BO-06: monthly competitor reviews suggest new verified same-category UK brands;
  they do not silently alter the saved set. Removed competitors stay suppressed.
  Manual Page/category changes win. No-UK-ad brands still get competitor research.
- BO-07: fixture-only verification of a bottle brand, multiple Pages, no own ads,
  identity ambiguity, retailers, budget/configuration/rate pauses, lease/restart
  safety, manual overrides, monthly suggestions and sample isolation. Run all four
  project checks and record browser screenshots. Fixtures are not live validation.
