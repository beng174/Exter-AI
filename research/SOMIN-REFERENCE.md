# Somin functional reference — 30 October 2026

The user identified Somin as Exter's product benchmark. The following official public pages were retrieved successfully during this review. These notes paraphrase Somin's advertised functions; they do not independently verify its customer results, private product capabilities, data completeness or model accuracy. No account, private workspace, product code or plugin installation was accessed.

| Public source | Advertised workflow | Implication for Exter |
| --- | --- | --- |
| [Somin homepage](https://somin.ai/) | Category/competitor listening, refreshed daily, feeds analysis, strategy, briefs and brand-specific ideas. Describes a five-stage listening, decoding, decision, creation and delivery loop, plus a persona/tension/angle/story chain. | Build an evidence-to-creative workflow around a brand/category. Daily monitoring is a freshness target, not a claim of an instantaneous stream. |
| [For agencies](https://somin.ai/somin-for-agencies/) | Brand Tracker classifies ads/posts; Perspective identifies strategic opportunities; Expressions develops campaign concepts from audience needs, tensions and angles. | Connect monitoring and structured analysis to opportunities and creative propositions. Preserve citations across the chain. |
| [Marketing Mondays plugin](https://somin.ai/marketing-mondays-plugin/) | MCP-based workflows over an existing Somin workspace: reports, audience/content analysis, insight chains, competitor offers, strategy decks and calendars. | Claude should consume a shared evidence base. Exter's own analysis pipeline remains separate from the downstream creative conversation. |
| [For creators](https://somin.ai/somin-for-creators/) | Roster analysis, differentiated creator territories, creator-specific briefs and content recommendations. It distinguishes this work from finding/paying creators. | Keep roster strategy and discovery separate. Exter additionally needs creator discovery/matching because the user explicitly requested it. |
| [Somonitor](https://somonitor.ai/) | Describes an early-access listening product powered by Somin, covering social/news/forums, conversation share, themes/tensions, alerts and cited summaries. | Public monitoring extends beyond ad search. Broad news/forum listening and crisis alerts are reference extensions, not already implemented Exter features or changes to the immediate ad-intelligence priority. |

## Preserve the user's scope

Exter starts with public competitor/category evidence before an agency wins an account. Private brand metrics can be connected later. Public engagement and dates are sufficient core measures; competitors' private sales are not a prerequisite. Creator discovery, customer-review analysis and native video remain explicit Exter requirements.

Somin also markets predicted creative performance and creator sales outcomes. Those claims do not establish that such outcomes are observable from public ads. Exter should distinguish public engagement, creative hypotheses, optional owned-account outcomes and any future validated predictive model.

The agency page describes a hybrid architecture using external LLMs and a separate internal predictive model. This is a vendor statement, not proof of implementation details. Exter's selected Gemini native-video provider is compatible with the user's architecture choice; it does not establish equivalent predictive performance or require adopting the vendor's model versions.

## Immediate priority order

1. Resolve real advertiser/competitor identities and refresh public content reliably.
2. Retain media and engagement observations with source dates, histories and coverage.
3. Run and evaluate native-video analysis on real ads; aggregate formats, messages, voice and audience tensions.
4. Build evidence-linked strategic opportunities and complete creative briefs.
5. Add real creator/review ingestion, discovery and matching, then creator-specific briefs.
6. Deliver shared agency/client access and the same evidence through Claude.

Current status and acceptance criteria are in [the product scope](../docs/PRODUCT.md); implementation work is tracked in [the completion plan](COMPLETION-PLAN.md).
