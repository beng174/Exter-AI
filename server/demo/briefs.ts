import { ANGLE_OPTIONS, ANGLE_VALUES, type CreativeAngle } from "../../shared/creative-taxonomy.js";
import type { DemoBrief, DemoEvidence, DemoOpportunity, DemoPattern, DemoPoint, DemoWebsiteEvidence } from "../../shared/brand-demo.js";
import { creativeEvidence, supported, type DemoCreative } from "./scores.js";

const label = (angle: CreativeAngle) => ANGLE_OPTIONS.find(([value]) => value === angle)?.[1] || angle;
const websiteTests: Record<string, RegExp> = {
  gifting: /\bgift(?:ing|s| boxes?)?\b/i,
  "quality-luxury": /\bluxur\w*|\bquality\b|\bcraft\w*|\bhandmade\b/i,
  "identity-values": /\bvegan\b|cruelty.free|\brecycl\w*|\bsustainab\w*|\bvalues\b/i,
  "value-bundle": /\bbundle\b|\bmulti.buy\b|\bsave\b|\bvalue\b/i,
  "problem-solution": /\bproblem\b|\bsolution\b|\bodou?r\b|\bsolve\b/i,
  "social-proof": /\breviews?\b|\bratings?\b|\btestimonial\w*/i,
  novelty: /\bnew\b|\blaunch\w*/i,
  "scarcity-urgency": /\blimited\b|\brestock\w*|\bback in stock\b/i,
};
function point(text: string, evidence: DemoEvidence[], kind: DemoPoint["kind"] = "recommendation"): DemoPoint {
  return { text, kind, evidence };
}
function draft(angle: CreativeAngle, evidence: DemoEvidence[], reference: DemoCreative | undefined): DemoBrief {
  const description = label(angle).toLowerCase();
  const formatValue = reference?.analysis.fields.format.value;
  const knownFormat = formatValue && !["unknown", "unsure"].includes(formatValue);
  const formatEvidence = reference && knownFormat ? [creativeEvidence(reference, "format", reference.analysis.fields.format)] : evidence;
  const hooks: Record<string, string[]> = {
    gifting: ["Draft question: ‘Choosing a gift? Start with what they actually enjoy.’", "Draft demonstration: open the verified gift packaging and show its exact contents.", "Draft alternative: ‘What is inside?’ Reveal only the products confirmed in the cited material."],
    "value-bundle": ["Draft question: ‘What is actually included?’ Show the verified contents first.", "Draft demonstration: lay out each included item, then display checked current terms.", "Draft alternative: open with the exact verified price and its conditions; omit it if no current price is confirmed."],
    "quality-luxury": ["Draft question: ‘What should you look for in [verified product category]?’", "Draft demonstration: show one observable material or production detail from the cited evidence.", "Draft alternative: let a close-up introduce the product before explaining one substantiated feature."],
    "problem-solution": ["Draft question: ‘Does this situation sound familiar?’ Show the problem without promising an unverified result.", "Draft demonstration: show the intended use and its limitations.", "Draft alternative: contrast the problem and the demonstrated use; do not invent a before-and-after outcome."],
    "identity-values": ["Draft question: ‘What matters to you when choosing [verified product category]?’", "Draft demonstration: show the documented value or provenance detail and its source.", "Draft alternative: lead with one verified brand commitment, using the source's exact wording."],
    "social-proof": ["Draft question: ‘What did this customer actually say?’ Use a permission-cleared, attributable review.", "Draft demonstration: pair one verified review excerpt with a matching product view.", "Draft alternative: display the exact dated rating and denominator only after checking the source."],
    novelty: ["Draft question: ‘What is different about this release?’ Use only a verified difference.", "Draft demonstration: reveal the documented feature in use.", "Draft alternative: introduce the product through one source-backed detail; avoid ‘new’ unless its timing is confirmed."],
    "scarcity-urgency": ["Draft question: ‘Is it available now?’ Check stock before using urgency.", "Draft demonstration: show the product and the exact verified availability terms.", "Draft alternative: explain the documented restock without inventing a deadline or limited quantity."],
  };
  const selected = hooks[angle] || ["Draft question: introduce one verified product detail.", "Draft demonstration: show that detail in use.", "Draft alternative: test a different opening while holding the verified proposition constant."];
  const proposition = reference?.analysis.fields.keyClaims.find(supported);
  const propositionEvidence = reference && proposition ? [creativeEvidence(reference, "keyClaims", proposition)] : evidence;
  return {
    label: "Draft recommendation - review before production",
    hooks: selected.map(text => point(text.replaceAll("[verified product category]", reference?.ad.category?.toLowerCase() || "this product category"), evidence)),
    format: point(knownFormat ? `Draft: test a ${formatValue} execution as a controlled reference, then adapt the opening to ${description}. The cited format was observed, not proven effective.` : "Draft: choose a product demonstration or still-image sequence after reviewing available production assets. Format suitability is unverified.", formatEvidence),
    scriptBeats: [
      point(`Opening: use one of the ${description} draft hooks above; make the product or situation identifiable immediately.`, evidence),
      point("Middle: demonstrate one detail supported by the cited creative or website. Keep sung music separate from any spoken script.", evidence),
      point("Proof: show the source of the claim, review or product detail. Remove any statement whose proof or usage permission cannot be supplied.", evidence),
      point("Close: use one explicit next action, and include only checked current offer terms. Production timing is a recommendation, not an observed result.", evidence),
    ],
    proof: [
      ...(proposition ? [point(`Advertiser statement to verify: “${String(proposition.value).slice(0, 450)}”. Show its supporting demonstration or documentation; the source ad records the claim but does not establish its truth.`, propositionEvidence)] : []),
      point(evidence.length ? "Required before production: verify current offer terms and permissions. Comparative or superlative wording needs a substantiation review (ASA). The cited material motivates the draft; it does not independently prove the claim." : "Source evidence is unavailable. Supply product documentation and a retained creative before treating this draft as production-ready.", evidence, evidence.length ? "recommendation" : "limitation"),
    ],
    creatorProfile: point("Draft production profile: someone able to demonstrate the verified product clearly and disclose a paid relationship where applicable. Audience fit, identity, rates and performance are unverified; this is a role brief, not a named creator recommendation.", evidence),
  };
}

/** ‘Gap’ means absent from an adequately labelled analysed sample, never absent from a market. */
export function buildOpportunities(creatives: DemoCreative[], patterns: DemoPattern[], website: DemoWebsiteEvidence): DemoOpportunity[] {
  if (!creatives.length) return [];
  const denominator = patterns[0]?.denominator || 0;
  const adequate = denominator >= 10 && denominator / Math.max(1, creatives.length) >= 0.7;
  const observed = patterns.filter(pattern => pattern.count > 0 && pattern.value !== "none").sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const candidateAngles: CreativeAngle[] = [];
  if (observed[0]) candidateAngles.push(observed[0].value as CreativeAngle);
  const websiteAngles = Object.entries(websiteTests).filter(([, regex]) => website.excerpts.some(excerpt => regex.test(excerpt.quote))).map(([angle]) => angle as CreativeAngle);
  const legacyContextAngles = Object.entries(websiteTests).filter(([, regex]) => creatives.some(creative => regex.test([creative.analysis.fields.angle.value, creative.analysis.fields.hook.value, ...creative.analysis.fields.keyClaims.map(claim => claim.value)].join(" ")))).map(([angle]) => angle as CreativeAngle);
  const preference: CreativeAngle[] = [...websiteAngles, ...legacyContextAngles, "gifting", "quality-luxury", "problem-solution", "identity-values", "value-bundle", "social-proof", "novelty", "scarcity-urgency"];
  for (const angle of preference.sort((a, b) => (patterns.find(pattern => pattern.value === a)?.count || 0) - (patterns.find(pattern => pattern.value === b)?.count || 0)))
    if (!candidateAngles.includes(angle) && candidateAngles.length < 3 && ANGLE_VALUES.includes(angle)) candidateAngles.push(angle);
  return candidateAngles.slice(0, 3).map(angle => {
    const pattern = patterns.find(item => item.value === angle), count = pattern?.count || 0;
    const websiteEvidence = website.excerpts.filter(excerpt => websiteTests[angle]?.test(excerpt.quote)).slice(0, 2);
    const comparisonEvidence = observed.slice(0, 2).flatMap(item => item.evidence.slice(0, 1));
    const evidence = [...(pattern?.evidence.slice(0, 2) || []), ...websiteEvidence, ...(count === 0 ? comparisonEvidence : [])];
    const saturated = adequate && count >= 4 && count / denominator >= 0.4;
    const gap = adequate && count === 0;
    const status = saturated ? "saturated" : gap ? "gap" : "unknown";
    const rationale = saturated
      ? `${count}/${denominator} supported angle labels use ${label(angle)}. This exceeds the declared 40% and four-ad repetition threshold in this analysed sample; it is a repetition signal, not proof of market saturation or fatigue.`
      : gap
        ? `${count}/${denominator} supported angle labels use ${label(angle)}; ${denominator}/${creatives.length} analysed creatives had an eligible angle label. This is an unobserved angle in this sample, offered as a test hypothesis, not a proven market opportunity.`
        : `${count}/${denominator} supported angle labels use ${label(angle)}. ${adequate ? "The declared repetition/gap thresholds are not met." : "At least 10 supported angle labels and 70% sample coverage are required to call a gap or repeated angle."} Opportunity status remains unknown. Descriptions without a consistent category are excluded from these frequency counts.`;
    const reference = creatives.find(creative => creative.analysis.fields.angle.value === angle) || creatives.find(creative => websiteTests[angle]?.test([creative.analysis.fields.angle.value, creative.analysis.fields.hook.value, ...creative.analysis.fields.keyClaims.map(claim => claim.value)].join(" "))) || creatives[0];
    const referenceEvidence = reference ? [
      ...(supported(reference.analysis.fields.angle) ? [creativeEvidence(reference, "angle", reference.analysis.fields.angle)] : []),
      ...(supported(reference.analysis.fields.hook) ? [creativeEvidence(reference, "hook", reference.analysis.fields.hook)] : []),
      ...reference.analysis.fields.keyClaims.filter(supported).slice(0, 1).map(claim => creativeEvidence(reference, "keyClaims", claim)),
    ] : [];
    const draftEvidence = [...evidence, ...referenceEvidence].slice(0, 5);
    const rationaleEvidence = evidence.length ? evidence : referenceEvidence;
    return { id: `angle-${angle}`, title: saturated ? `Refresh the repeated ${label(angle).toLowerCase()} angle` : `Test ${label(angle).toLowerCase()}`, angle, status, count, denominator, rationale: point(rationale, rationaleEvidence, "observation"), evidence: rationaleEvidence, brief: draft(angle, draftEvidence, reference) };
  });
}
