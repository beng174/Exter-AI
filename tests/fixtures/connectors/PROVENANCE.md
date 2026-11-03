# Connector fixture provenance

These are sanitised protocol fixtures, not claimed recordings of approved live
accounts. No keys are configured or used by these tests.

- `meta-page.json`: synthetic regression data following the current connector's
  documented Meta Ad Library fields. Native IDs, names and dates are fixtures.
- `tiktok-page.json`: adapted from TikTok's official Query Ads response example,
  with a synthetic i64 ID to test lossless parsing and a non-live media URL.
- Missing, malformed, empty, denied and rate-limited cases are generated in tests.

Reviewed 3 November 2026:
https://developers.tiktok.com/docs/en/commercial-content-api-query-ads
https://developers.tiktok.com/docs/en/client-access-token-management

The backlog keeps genuine sanitised recorded Meta responses and live approval
verification as pending gates. Do not rename these examples as live captures.
