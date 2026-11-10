# Automatic brand onboarding review

Fictional real-workspace-shaped fixtures, not live results. The bottle brand and
all competitors use reserved example domains. Browser traffic outside the local
app is blocked; `audit.json` records zero provider requests and zero page errors.
No fixture records are written to a production database.

Reproduce with the production client served at `http://127.0.0.1:3141`:

```sh
npm run build
python tests/ui_automatic_onboarding_browser.py
```

The script uses system Chromium and Playwright already installed in the review
environment. It checks 390px, 1280px, 1440px and 1920px widths, the two-field form,
Page confirmation, competitor removal/swapping and three independent Page inputs.

| Changed view | App and approved reference | Mobile |
| --- | --- | --- |
| Brand research | [Side by side](BrandResearch-comparison.png) | [390px](BrandResearch-390.png) |
| Data sources | [Side by side](DataSources-comparison.png) | [390px](DataSources-390.png) |
| Setup checklist | [1440px](Progress-1440.png) | [390px](Progress-390.png) |
| Add brand | [1440px](AddBrand-1440.png) | [390px](AddBrand-390.png) |
| Manual watchlist | [1440px](Watchlist-1440.png) | [390px](Watchlist-390.png) |

Intentional differences from the references:

- Completed setup collapses to one coverage line and a View setup details button.
- The authorised setup checklist sits above existing Brand research and Data
  sources content. Its counts, costs and controls have no original reference.
- Specific bottle categories, website claims and prices replace the reference's
  sample product values. Unsupported sections keep their designed frame and one
  muted missing-data line; onboarding does not invent reviews or sales.
- Three relevant Pages remain individually editable instead of one Page input.
- The new workspace form asks only for a name and website. It no longer asks the
  owner to choose a broad industry before website understanding.
- This fixture shows partial progress: 15 collected ads, 12 previews and 10 tags.
  The full pipeline database fixture separately reaches 15 previews and 15 tags.
- Monograms stand in for unavailable fixture Page pictures. Production pictures
  use the existing stored, bounded raster-logo path and shared Meta request gate.

Same reference shell, components, typography, spacing and alignment are retained.
Existing sample workspaces keep their current screens and cannot start setup.
