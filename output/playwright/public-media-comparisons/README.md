# Public previews and comparable groups

Fictional real-workspace API fixtures, not production records or live verification.
All external requests are blocked. The fixture has 420 public ads and a separate
private account record, with two visible formats, one hidden small group, unrelated
categories, unknown tags and three preview retry states.

`tests/ui_public_media_browser.py` passed 34 screen/width cases: ten changed
screens at 1280, 1440 and 1920px, plus Home, Creatives, Creative detail and Data
sources at 390px. The audit records zero external/provider calls. It also checks
format groups/samples, chart default/switch, category persistence, matching detail
links, actual failed-day thresholds and private-account metric preservation.

Each `*-comparison.png` has app on the left and its approved reference on the
right. Desktop screenshots use 1440px. Mobile files end in `-390.png`.

| Screen | App | App beside reference |
| --- | --- | --- |
| Home | [Home-1440.png](Home-1440.png) | [Home-comparison.png](Home-comparison.png) |
| BrandResearch | [BrandResearch-1440.png](BrandResearch-1440.png) | [BrandResearch-comparison.png](BrandResearch-comparison.png) |
| Competitors | [Competitors-1440.png](Competitors-1440.png) | [Competitors-comparison.png](Competitors-comparison.png) |
| Creatives | [Creatives-1440.png](Creatives-1440.png) | [Creatives-comparison.png](Creatives-comparison.png) |
| CreativeDetail | [CreativeDetail-1440.png](CreativeDetail-1440.png) | [CreativeDetail-comparison.png](CreativeDetail-comparison.png) |
| Formats | [Formats-1440.png](Formats-1440.png) | [Formats-comparison.png](Formats-comparison.png) |
| Patterns | [Patterns-1440.png](Patterns-1440.png) | [Patterns-comparison.png](Patterns-comparison.png) |
| Winners | [Winners-1440.png](Winners-1440.png) | [Winners-comparison.png](Winners-comparison.png) |
| Briefs | [Briefs-1440.png](Briefs-1440.png) | [Briefs-comparison.png](Briefs-comparison.png) |
| DataSources | [DataSources-1440.png](DataSources-1440.png) | [DataSources-comparison.png](DataSources-comparison.png) |

Kept differences from the illustrative references:

- Category/format controls, grouped format rows, group samples and the chart switch
  implement the owner's explicit comparison rules. Hidden formats have one line.
- Missing media uses a white branded copy preview and original ad link. No source
  preview is invented. The seven-day label requires seven recorded failed days.
- Metrics, recommendations, transcripts, Working Score and private outcomes remain
  absent when the fixture has no supporting data. Designed sections keep a muted
  gap line instead of borrowing illustrative reference values.
- Category tagging status and editable primary categories are new authorised sections.
- Existing measures/formulas, reference geometry, source labels, unknown values,
  private reporting scopes and collection budgets remain in force.

Data classes: source copy, stored media, observed media type, run status and saved
settings are Real data when present; coverage, scoped counts/shares, existing
median/longest-running measures and similarity selection are Compute now. Product
categories and creative style are Modelled. Production Working Score, unsupported
analysis and unconnected private metrics remain Unavailable. Images here are local
fictional raster fixtures. The separate sample-mode audit and all 16 app/reference
pairs are in [../public-media-sample/](../public-media-sample/).
