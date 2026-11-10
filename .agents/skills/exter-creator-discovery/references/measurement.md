# Measurements

Version: creator-discovery-v1. Do not change ad metrics or existing Creative score.

- **Engagement rate:** take the latest 12 unique, dated posts ordered by publication
  time, not pinned order. For each post with official likes and comments and a
  positive official follower count, compute `(likes + comments) / followers`.
  Take the median (mean of the middle two for an even sample). Multiply by 100
  only for display. This uses followers at check time, not historical followers.
  Real zero counts are valid; null, hidden or invalid counts are not zero.
- Show assessed posts out of 12. Fewer than 12 is a partial sample; a single viral
  post cannot become the whole account's engagement rate. No posts or zero followers
  means Unverified. Do not mix engagements per view into this calculation.
- **Posting frequency:** `(dated posts - 1) * 7 / elapsed days between newest and
  oldest post`. Need at least two distinct dates; report the sampled window.
  This is a recent-post cadence, not a census of every post in the last month.
- **Follower tiers:** nano `[0,10000)`, micro `[10000,100000)`, mid
  `[100000,500000)`, macro `[500000,infinity)`. Unknown followers have no tier.
- **Partnerships:** #ad, sponsored or paid-partnership labels show a declared
  commercial relationship. Name the competitor only when that same post identifies
  it. Ordinary tagging is a mention. Appearance in an ad needs stored direct proof.
- **Precision:** TP / (TP + FP), separately for good fit and UK. No predicted
  positives means Not enough data. Show TP/FP/FN, labelled sample, date, version,
  exclusions and missing predictions; never substitute agreement or recall.

Source dates and post URLs are field-level provenance. Keep scraper text and
verified official numbers separate. A failed refresh cannot overwrite good earlier
numbers with zero or silently renew their check time.
