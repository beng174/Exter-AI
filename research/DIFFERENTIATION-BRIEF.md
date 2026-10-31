# Exter AI — Differentiation Brief for Development

**Purpose of this doc:** explain what makes Exter AI different from existing tools, and what needs to be built so that difference is real. Please check each section against the current codebase and flag anything that already exists, conflicts, or isn't feasible.

---

## 1. Context: why this matters

Exter AI currently pulls public ad data and analyses it. That's useful internally, but on its own it isn't a differentiator:

- **Foreplay** (and similar tools like Motion, Atria) already offer competitor ad tracking, a large ad library, creative analytics on a brand's own account, and AI brief generation.
- A brand can also paste competitor ads into ChatGPT and get a reasonable summary.

**So we will not compete on the ad library or on "AI analysis of public ads."** We use public data as one input, and build what those tools structurally can't have.

### The positioning the software must support

> "Foreplay shows you what your competitors are running. We know what's actually converting in your category, because we run the accounts, and we produce the ads that prove it."

### What the software needs to do that others can't
1. **Real outcome data** from the ad accounts we manage (not inferred from public signals).
2. **Customer evidence** (reviews, returns, comments) combined with competitor signals.
3. **Decisions, not a library:** a ranked angle map telling us what to make next.
4. **Ad → customer value link:** which ads bring in customers who buy again.
5. **Creator performance tracking:** which creators reliably produce winners.
6. **Calculations done in code**, so results are consistent and checkable.

---

## 2. What NOT to build

- **Don't rebuild an ad library or scraper at scale.** Pull competitor ad data from existing sources (Meta Ad Library, or Foreplay's API if we subscribe) and spend build time on the differentiators below.
- **Don't build a general dashboard product.** The output is for our team and our clients' decisions, not a self-serve SaaS (for now).

---

## 3. Differentiators to build

### D1. Connected client ad accounts + tagged results database (highest priority — this is the moat)

**What:** read-only connection to each client's ad accounts, with every ad tagged and its performance stored.

**Requirements:**
- Read-only connection to Meta (Marketing API) and Google Ads (API). Read access only — no ability to change campaigns.
- Pull ad-level performance daily: spend, impressions, clicks, purchases, revenue, CPA, ROAS, plus date ranges.
- **Tag every ad** with a consistent taxonomy (see section 4). Tags can be suggested by AI from the creative/copy, but must be confirmable/editable by a human.
- Define and calculate **"winner"** status in code, with configurable rules. Starting suggestion:
  - spends at least 10× the account's median ad spend, and at least £X total (Motion's public benchmark definition), **and/or**
  - beats the account's median CPA by Y% over at least 7 days with at least £Z spend.
  - Thresholds must be editable per client.
- Track **creative lifespan**: date it became a winner, date performance declined (e.g. CPA rises above a threshold), to measure fatigue.

**Acceptance check:** for any client, we can answer "which angles, hooks, formats and creators produced winners in the last 30/90 days, and how long did they last?"

### D2. Cross-client category benchmarks (anonymised)

**What:** aggregate tagged results across clients in the same category to show what wins in that category.

**Requirements:**
- Each client assigned one or more categories (e.g. supplements, apparel, beauty, home).
- Aggregate win rates by angle / hook / format / creator type **within a category**.
- **Fully anonymised:** no client names, spend figures or identifiable creatives shown to other clients.
- Show sample size on every benchmark (e.g. "based on 4 brands, 312 ads"). Hide or flag benchmarks below a minimum sample.
- Only include clients whose contracts permit anonymised use (needs a flag per client).

**Acceptance check:** "In [category], over the last 90 days, which angle types had the highest winner rate, and how many brands/ads is that based on?"

### D3. Customer evidence ingestion

**What:** pull in what customers say and group it into themes.

**Sources (phase by availability):**
- Brand's own reviews (site review platform exports or APIs, e.g. Trustpilot, Yotpo, Judge.me, Okendo).
- Amazon reviews where relevant.
- Return reasons (Shopify / returns platform exports).
- Customer service tickets (Gorgias / Zendesk / email export).
- Comments on the brand's own ads.
- Post-purchase survey answers if the brand runs one.

**Requirements:**
- AI groups text into themes: reasons to buy, objections, use cases, complaints, comparisons to competitors, repeat-purchase reasons, churn reasons.
- **Counting and ranking themes is done in code** (frequency, trend over time), not by the model's estimate.
- Each theme links back to real example quotes so we can verify it.

### D4. Angle map output (the main deliverable)

**What:** combine competitor signals (public), customer evidence (D3) and our results data (D1/D2) into a ranked list of what to make next.

**Output per brand:**
- Top 5–10 recommended angles, each with:
  - the persona and problem it targets
  - supporting evidence from each source (competitor activity, customer quotes, our results data)
  - a confidence level based on how much evidence supports it
  - suggested hook and format, and creator type to brief
- Clearly labelled gaps: angles customers talk about that competitors aren't using (white space), and angles competitors push that customers don't mention.
- Exportable as a clean report (PDF or shareable page) for client meetings and audits.

**Note:** this is also used as a sales demo — run it on a prospect's brand before the pitch (public data + their reviews only, since we won't have their ad account yet).

### D5. Ad → customer value link (LTV-led acquisition)

**What:** find out which ads, angles and creators bring in customers who buy again, not just customers who buy once.

**Requirements:**
- Read-only Shopify connection (Admin API) to pull orders and customers.
- Link each customer's **first order** to the campaign/ad that acquired them, using UTM parameters / landing data on the order (and click IDs where available).
- For each ad, angle, creator and format, calculate:
  - first-order CPA
  - repeat rate at 30 / 60 / 90 / 180 days
  - revenue per customer at the same intervals
  - "true CPA" adjusted for repeat value
- Support **historical backfill**: if a client already has UTMs on past orders, analyse them immediately.
- Clearly show attribution coverage (e.g. "62% of first orders matched to a campaign") so we don't overstate precision.

**Acceptance check:** "Angle A: £18 CPA, 12% repeat at 90 days. Angle B: £26 CPA, 35% repeat at 90 days" — produced automatically per client.

### D6. Creator performance tracking

**What:** a record of every creator we work with and how their content performs.

**Requirements:**
- Creator profile: handle, platform, follower range, category, cost/gifting history, usage rights status.
- For gifting campaigns: gifted date, posted (yes/no), post date, link, discount code.
- Link creator content to ads (D1) and to sales via codes/links and D5.
- Per creator: post rate, number of winners produced, average CPA/ROAS of their ads, repeat rate of customers they bring in.
- Usage rights tracking: which channels we're allowed to use their content on (paid ads, email/SMS, website) and expiry dates.
- **UK compliance field:** record that each gifted/paid post used correct disclosure ("Ad" first). Keep a record of everyone gifted.

### D7. Paid win-back measurement (supporting feature)

**What:** prove the impact of win-back ads to lapsed customers.

**Requirements:**
- Read Klaviyo segments (lapsed 90+ days, one-time buyers, high-value churners). Audience sync to Meta/Google can use Klaviyo's native sync.
- Support a **holdout group**: a random 10–20% of each segment excluded from ads.
- Compare repurchase rate and revenue between exposed and holdout groups over the campaign window.

---

## 4. Tagging taxonomy (starting point — refine with the team)

| Field | Examples |
|---|---|
| Angle | problem/solution, social proof, comparison, founder story, ingredient/material, offer-led, gifting, lifestyle |
| Persona | e.g. defined per brand (busy parent, gym-goer, gift buyer) |
| Hook type | question, bold claim, demonstration, before/after, testimonial, unboxing, POV |
| Format | UGC talking head, founder-led, static, carousel, product demo, unboxing, behind-the-scenes |
| Creator type | none (brand), micro creator, nano creator, customer, expert |
| Offer | none, % off, bundle, free gift, free shipping |
| Funnel stage | prospecting, retargeting, win-back |
| Platform / placement | Meta feed, Reels, Stories, TikTok, YouTube, Google |

Tags must be stored as structured fields (not free text) so they can be counted and compared.

---

## 5. How AI should and shouldn't be used

- **Code does the maths:** counting, winner calculations, benchmarks, repeat rates, rankings, trends.
- **AI does language tasks:** suggesting tags, grouping customer text into themes, writing explanations and summaries.
- Every AI-generated claim in the angle map must link to the underlying data or quotes.
- **Please confirm which external models (if any) the current build calls** (e.g. OpenAI, Anthropic). We need to describe this accurately to clients: "calculations are done in our own code; AI is used to label and explain."

---

## 6. Data, privacy and permissions

- **Read-only access everywhere** (ad platforms, Shopify, Klaviyo, review tools).
- Client data is personal data under UK GDPR (customer orders, emails, reviews). Need: secure storage, access controls, data minimisation (store only what we need), and the ability to delete a client's data on request.
- Customer-level data (D5, D7) should be stored pseudonymised where possible (IDs, not names/emails).
- Per-client flag for whether their data can be included in anonymised category benchmarks (D2), based on contract.
- Audit log of who accessed what.

---

## 7. Suggested build order

| Phase | What | Why first |
|---|---|---|
| 1 | D1 (account connection + tagging + winner calc) | It's the moat and gets more valuable every week it runs. Start collecting data on current clients now. |
| 2 | D4 (angle map) using public data + D3 (reviews first) | Gives us a sales demo and audit deliverable quickly. |
| 3 | D5 (Shopify link, LTV by angle) | Strongest new insight for clients; historical backfill makes it useful immediately. |
| 4 | D6 (creator tracking) | Supports the creator seeding service and links creators to results. |
| 5 | D2 (category benchmarks) | Only meaningful once several clients per category are connected. |
| 6 | D7 (win-back holdout measurement) | Supporting feature. |

---

## 8. Open questions for the developer

1. What does the current build already do (data sources, models used, storage)?
2. Which external AI models are called, and for what?
3. Effort estimate for each phase above?
4. Any API access approvals needed (Meta app review, Google Ads developer token, Shopify app setup)?
5. Recommended approach for sourcing competitor ad data: Meta Ad Library directly, or a paid source such as Foreplay's API?
6. Hosting and security setup for client data under UK GDPR?
