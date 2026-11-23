# TikTok review screenshots

Fictional real-workspace API fixtures only. No live source, model or media-service
calls. The browser fetches generated local fixture images. `audit.json` records
six screens at 1280px, 1440px, 1920px and 390px, including overflow and browser errors.

Each `*-comparison.png` places the app on the left and the approved Exter reference
on the right. Individual 1440px screenshots are also provided. Creative detail and
Data sources have 390px screenshots.

Differences kept:

- Platform filters preserve like-for-like research and are required for this source.
- Rounded TikTok reach is Estimated; absent metrics and sections keep real gates.
- Working Score includes its calculation and coverage, with unavailable inputs
  excluded. Table columns appear only when actual values exist.
- Data sources adds advertiser identity review, collection progress, media coverage
  and controlled errors, with edit/confirm/retry actions.
- Fictional copy, counts and thumbnails differ from reference sample values.

Reproduce with a local Vite preview on port 3144 and
`python tests/ui_tiktok_browser.py`. Live ION8 verification waits for deployment.
