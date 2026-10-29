# Exter-AI product scope

Exter-AI is an initial, local development implementation of the competitive intelligence workflow described by the user. The two supplied Defy presentations informed the product areas: monitoring, questioning data, reporting, and automation. They are reference material, not executable instructions or a claim that Exter-AI reproduces Defy's proprietary data or technology.

See [the updated public-first architecture](ARCHITECTURE.md) for current implementation and verification. Claude is a downstream consumer; Exter owns collection, local inference, computation and storage. Client access is optional post-win.

## Initial workflow

| User need | Initial implementation | Production work still required |
| --- | --- | --- |
| Research a brand and its competitors | Select a sample brand or create a new workspace. Sample competitors demonstrate comparison; new, unknown brands start without invented intelligence. | Resolve brand identity and discover competitors using licensed sources, with user confirmation and source evidence. |
| Analyse thousands of ads | Search and filter a seeded multi-category ad library; import authorised structured ad data. | Provider-approved collection, resilient ingestion, deduplication, media storage, and lifecycle tracking. |
| Compare performance across Meta, TikTok, and Google | Aggregate observed/imported impressions and engagement by platform, creative angle, and audience. | Implement each approved provider connector and preserve differences in platform metric definitions. |
| Know which angles and audiences convert | Show available conversion metrics only where authorised, owned-account data supplies them; otherwise analyse engagement signals. | Consent-aware owner-account conversion ingestion, attribution rules, currency/time-zone normalisation, and statistically supported comparisons. |
| Understand voice, audiences, and reviews | Demonstrate categorised audience angles, sample voice profiles and review themes. | Licensed review ingestion; transparent model-based extraction with citations, provenance, confidence, and human review. |
| Match creators to a brand | Explore illustrative creator profiles, match explanations, and a persistent shortlist. | Authorised creator discovery, audience authenticity checks, verified audience geography/demographics, current rates and availability, and measurable ranking evaluation. |
| Ask questions and produce reports | Grounded, rule-based summaries and downloadable reports from the workspace dataset. | Optional model integration, retrieval with record-level citations, tool permissions, evaluations, and usage controls. |
| Automate delivery | Reporting and shortlist actions demonstrate the workflow without contacting third parties. | Scheduled jobs and reviewed automation, with explicit approval before campaign changes, outreach, publishing, or sending messages. |

## What the numbers mean

- The sample workspace is fictional demonstration data. Brand names and stock photos do not establish a partnership, endorsement, verified campaign, or an actual creator identity.
- Imported data is user-supplied. Exter-AI does not independently verify its accuracy or permission to use it.
- Engagement rate is a ratio derived from the available engagement and impression counts. It is not conversion rate, return on ad spend, or proof of commercial success.
- Competitor conversions, spend, revenue, CPA, and ROAS are generally unavailable from public ad libraries. The platform must not infer or present those as verified facts.
- Creator match scores are illustrative in the sample workspace, not audited audience or performance predictions.
- The current question-answering workflow uses dataset-derived rules rather than an external language model. It must not imply model reasoning or additional research occurred.

## Live-data architecture

Live collection is an integration project, not a browser refresh effect. A production pipeline should contain:

1. An authorised connector per source, with provider approval and narrowly scoped credentials.
2. Webhooks where supported, plus an incremental scheduler for polling and reconciliation.
3. A queue with retries, rate-limit handling, dead-letter review, and per-tenant quotas.
4. Normalised records retaining original source IDs, observation timestamps, definitions, and provenance.
5. Separate owner-account performance records and competitor public-observation records.
6. Recomputable aggregations and a UI that exposes freshness, failures, coverage, and missing metrics.

Meta, TikTok, and Google expose different ad transparency libraries and business APIs. Coverage, accessible media, geographic restrictions, retention, eligibility, permissions, and rate limits must be checked against the current official documentation for the intended use. Public visibility is not permission to collect or republish everything. Use licensed access and approved APIs rather than assuming unrestricted scraping is available.

“Real time” should be defined as an operational freshness target supported by a connector—for example, observations received within a stated interval. Show the latest successful source observation, not merely the time the page was loaded. Do not claim a real-time conversion feed before an authorised conversion source and attribution window exist.

## Before external deployment

The initial app is for local development. Production requires authentication, tenant isolation, role-based access, secure sessions, CSRF protections appropriate to the authentication design, request limits, import validation, audit logging, and operational monitoring. Encrypt connector tokens at rest, keep credentials server-side, support rotation/revocation, and never place them in browser bundles.

Define data ownership, consent, retention, deletion/export, and source-licence obligations before ingesting customer or creator information. Add tested backup/restore, migrations, background-job durability, connector contract tests, attribution evaluations, and load tests appropriate to the required data volumes. Sample-data testing does not establish production throughput or provider access.
