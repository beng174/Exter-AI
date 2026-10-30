# Exter-AI product scope

Exter's functional benchmark is [Somin](https://somin.ai/), as specified by the user on 30 October 2026. The goal is a public-first marketing intelligence platform for agencies: research a real brand and its category, find defensible opportunities, and turn the evidence into strategy, creator briefs and creative work. The supplied Defy presentations remain supporting product references.

The benchmark covers the complete research-to-creative workflow. A searchable ad dashboard alone does not complete it. Public marketing pages establish advertised functionality, not access to Somin's private product, data, model weights or measured performance. See [the source-backed reference](../research/SOMIN-REFERENCE.md) and [current architecture](ARCHITECTURE.md).

## Core user journey

1. **Start with a brand.** Enter a name/domain, category and market. Resolve the brand's public profiles and advertiser identities. Propose competitors with evidence explaining their relevance; let the agency manage that set.
2. **Monitor the category.** Collect public paid ads, organic posts and creator content. Retain source IDs, links, media, dates and dated observations. Refresh on a stated schedule, with coverage and last-successful-check indicators for each source.
3. **Understand the content.** Analyse media format separately from creative style, then extract messages, claims, hooks, brand voice, audience interests, needs and tensions. Keep observed evidence separate from model interpretation. Native video uses the configured provider through Exter's versioned analysis pipeline.
4. **Explain what is working.** Compare formats, messages and angles within each platform using compatible public engagement measures and comparable content ages. Distinguish frequently used or long-running creatives from measured engagement leaders. Show sample size, denominator, dates and missing coverage.
5. **Choose a strategy.** Build a traceable chain from evidence to inferred audience/persona, need/tension, creative angle and strategic proposition. Explain which competitor/category evidence supports each proposed opportunity.
6. **Create useful work.** Produce sourced briefs, hooks, scripts, storyboards, platform-specific executions and draft content calendars in the brand's voice. Separate observations from proposed creative tests and unvalidated predictions.
7. **Match and brief creators.** Discover relevant creators as well as analyse an existing roster. Match actual content, tone, language/geography and available public engagement; show reasons and examples. Give each creator a distinct role and a brief suited to their content.
8. **Use the same evidence in Claude.** Claude reads Exter's stored intelligence through MCP for downstream creative work. Exter owns collection, analysis orchestration, validation, storage and calculations; a Claude account is not required for those operations.

## User requirements that stay fixed

- Client advertising-account permission is **not** a prerequisite. The pre-win workflow uses public category and competitor content. Private account reporting remains an optional post-win layer.
- Public engagement and source dates are the primary comparison measures. CPA/ROAS are not needed for the core product. Never manufacture competitor conversions or use ad longevity as proof of effectiveness.
- Paid/organic classification and platform-specific format comparisons remain explicit. The target includes Meta, TikTok and Google ads, plus requested public social coverage across TikTok, Instagram, LinkedIn, Facebook, X and YouTube as source integrations are completed.
- Reviews from sources such as the brand's site, Trustpilot and Amazon should reveal customer language, recurring needs and objections. Store source context and dates; selected brand-site reviews are not a representative independent review sample.
- Inferred audiences are model interpretations of content, not measured platform demographics. Missing personal attributes and attention maps remain unavailable.
- UGC/influencer classifications need recorded partnership-label or visible third-party creator-handle evidence. Video appearance alone does not establish creator origin.
- Every answer should identify its source set, dates, metric definitions and supporting records. Display observation freshness rather than the time the dashboard was opened.
- Creator discovery is an explicit Exter requirement. Somin's public creator proposition primarily starts with an existing roster; that does not remove Exter's discovery requirement.

## Current implementation versus the target

| Area | Working now | Work still required |
| --- | --- | --- |
| Brand/category setup | Real Valentte website research, sourced positioning, public profile links and analyst-selected competitor candidates. New workspaces and imports. | Automatic brand/profile resolution, evidence-based competitor discovery and market selection throughout the workflow. |
| Public monitoring | Repeatable normal-browser Meta library capture; 58 distinct real Valentte records in a bounded snapshot; stable native IDs, source links and delivery dates. | Scheduled/paginated multi-platform collection, lifecycle history and fresh public engagement observations at category scale. |
| Content understanding | Local text/still-image inference; native Gemini Files/Interactions adapter, retained video, timestamped fields, evidence gates and append-only result history; explicit Pegasus stub. | Live Gemini verification after credential setup, human-labelled real-ad accuracy assessment, richer category-level aggregation and a completed second provider for comparison. |
| Format comparisons | Platform-separated calculations, explicit creative tags, native-video style integration, missing-metric and denominator safeguards. | Sufficient comparable real category data, content-age comparisons and validated classification coverage. |
| Audiences and tensions | Structured ad fields and sample audience/review views; source-backed website findings. | Real content/review ingestion, evidence-linked clustering of needs/tensions/personas and validated brand-voice analysis. |
| Strategy and creative | Data-grounded rule-based answers, reports and read-only Claude tools; saved native-video evidence available through MCP. | An Exter research reasoning workflow that produces complete evidence-to-opportunity-to-brief chains, creative propositions and calendars. |
| Creators | Illustrative creator views/shortlists; real website features and explicit library creator attributions. | Real creator discovery, content ingestion, evaluated matching, roster territories and creator-specific briefs. |
| Team operation | Local database and retained media; Mac Claude setup helper; persisted native-video jobs/results. | Always-on hosting, shared authenticated access, agency/client permissions, tenant isolation, scheduled workers, backups and monitoring. |

The four demonstration workspaces and 2,400 sample ads remain fictional. The Valentte snapshot is real but bounded. Its retrieved library records lack public engagement counts and a usable denominator, so there is no measured winning Valentte format yet. One actual Valentte video has been retained and reused without its remote URL; live Gemini inference and real-ad accuracy have not been established. See [the verification record](../research/NATIVE-VIDEO-TEST.md).

## Intelligence and prediction boundaries

Exter may report observed format prevalence, delivery duration and source engagement. Each signal must retain its actual meaning. Impression-, view- and follower-based engagement rates are different bases and cannot be pooled into a single ranking. Missing counts are unavailable, not zero.

Somin markets predictive creative scoring as well as analysis. Exter does not yet have a validated predictive CTR/clickability model. Model confidence is not predicted ad performance. Add such scoring only after defining outcomes, training/validation data and held-out evaluation; creative hypotheses can be produced before that work is complete.

## Acceptance test for the reference workflow

Use Valentte and source-verified category competitors in the chosen market. Starting from the brand domain, Exter should resolve the source identities, refresh actual paid/organic records, retain available media, classify content with evidence, compare compatible public signals, surface customer tensions and creator matches, and produce a cited creative brief that Claude can inspect. A second refresh should preserve history and avoid duplicates. The result must remain useful and explicit about coverage even when some metrics are unavailable.

This acceptance test spans the complete workflow. Completing a collector, a video adapter or a dashboard independently does not establish functional parity.
