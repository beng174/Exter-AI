import type { DemoEvidence, DemoPattern, DemoPatternCoverage } from "./brand-demo.js";
import type { DemoGalleryCreative } from "./creative-gallery.js";
import type { PatternDimension } from "./demo-patterns.js";
import { supportedPatternAnnotation } from "./demo-patterns.js";

export interface PopulationGroup {
  id: string;
  label: string;
  count: number;
  evidence: DemoEvidence[];
  patterns: DemoPattern[];
  basis: "saved-label" | "description-theme" | "missing";
}
export interface PatternPopulation {
  groups: PopulationGroup[];
  total: number;
  labelled: number;
  described: number;
  missing: number;
}

// These are reading aids over retained descriptions, never new taxonomy outputs.
// Keep the original analysis and fixed-label projection unchanged.
const themes: Record<PatternDimension, readonly [string, RegExp][]> = {
  hookType: [
    ["Offers & savings", /\b(offer|discount|deal|save|saving|free gift|bundle|ending soon)\b/i],
    ["Questions", /\?|\b(question|asks|asking|did you know)\b/i],
    ["Product reveal & demo", /\b(unbox\w*|open\w*|package|demonstrat\w*|reveal\w*|holds? up|showcas\w*)\b/i],
    ["Customer experiences", /\b(testimonial|review\w*|customer|recommend\w*)\b/i],
    ["Brand stories", /\b(founder|origin|story|started|journey)\b/i],
    ["Problems & solutions", /\b(problem|struggl\w*|solution|frustrat\w*)\b/i],
    ["Urgency & availability", /\b(scarcity|restock|limited|selling out|last chance)\b/i],
  ],
  angle: [
    ["Savings & bundles", /\b(bundle|multi.buy|mix.and.match|discount|save|saving|value|lower per.unit|deal)\b/i],
    ["Gifting", /\b(gift\w*|present|christmas|birthday)\b/i],
    ["Quality & fragrance", /\b(luxur\w*|premium|quality|scent\w*|fragrance|craft\w*)\b/i],
    ["Brand story & values", /\b(origin|founder|story|started|values|sustainab\w*|british|made in)\b/i],
    ["Customer experiences", /\b(testimonial|review\w*|customer|social proof)\b/i],
    ["Urgency & availability", /\b(urgency|scarcity|limited|selling out|last chance)\b/i],
    ["Problems & solutions", /\b(problem|solution|struggl\w*|frustrat\w*)\b/i],
  ],
  offerType: [
    ["Bundles & multi-buy", /\b(bundle|multi.buy|mix.and.match|\d+\s+(?:\w+\s+){0,3}for\s*[£$€\d])\b/i],
    ["Free gifts", /\bfree (?:gift|item|product)/i],
    ["Free delivery", /\bfree (?:shipping|delivery|postage)/i],
    ["Discounts", /\b(discount|price drop|off|saving|save)\b|\d+\s*%/i],
    ["Trials & guarantees", /\b(trial|guarantee|money.back)\b/i],
    ["Explicitly no offer", /^(none|no (?:visible |explicit )?offer)[.!]?$/i],
  ],
  format: [
    ["Creator-led descriptions", /\b(ugc|creator|influencer|user.generated)\b/i],
    ["Founder & brand stories", /\b(founder|origin|brand story)\b/i],
    ["Product demonstrations", /\b(demo\w*|unbox\w*|showcas\w*)\b/i],
    ["Animation", /\b(animat\w*|motion graphic)\b/i],
    ["Images & carousels", /\b(static|image|carousel|photograph)\b/i],
  ],
};
export function descriptionTheme(text: string, dimension: PatternDimension): string {
  return themes[dimension].find(([, rule]) => rule.test(text))?.[0] || "Other recorded descriptions";
}
export function patternPopulation(dimension: PatternDimension, patterns: DemoPattern[], legacy: DemoPattern[] = [], coverage?: DemoPatternCoverage, totalAnalysed = 0): PatternPopulation {
  const total = Math.max(0, coverage?.totalAnalysed ?? totalAnalysed);
  const groups: PopulationGroup[] = patterns.filter(p => p.count > 0).map(p => ({ id: `label:${p.value}`, label: p.label, count: p.count, evidence: p.evidence, patterns: [p], basis: "saved-label" }));
  for (const pattern of legacy.filter(p => p.count > 0)) {
    const label = descriptionTheme(pattern.label, dimension);
    const id = `description:${label}`;
    const existing = groups.find(group => group.id === id);
    if (existing) { existing.count += pattern.count; existing.evidence.push(...pattern.evidence); existing.patterns.push(pattern); }
    else groups.push({ id, label, count: pattern.count, evidence: [...pattern.evidence], patterns: [pattern], basis: "description-theme" });
  }
  const labelled = groups.filter(g => g.basis === "saved-label").reduce((n,g) => n + g.count, 0);
  const described = groups.filter(g => g.basis === "description-theme").reduce((n,g) => n + g.count, 0);
  const missing = Math.max(0, total - labelled - described);
  groups.sort((a,b) => b.count - a.count || a.label.localeCompare(b.label));
  if (missing) groups.push({ id: "missing", label: "Not recorded", count: missing, evidence: [], patterns: [], basis: "missing" });
  return { groups, total, labelled, described, missing };
}

export interface MessageSignal { id: string; label: string; adIds: string[] }
const needs: readonly [string, string, RegExp][] = [
  ["gifting", "Gifting occasions", /\b(gift\w*|birthday|christmas|present for)\b/i],
  ["value", "Value & savings", /\b(bundle|discount|saving|save|deal|value|multi.buy|mix.and.match)\b|\d+\s*%/i],
  ["quality", "Quality & experience", /\b(luxur\w*|premium|quality|scent\w*|fragrance|craft\w*)\b/i],
  ["convenience", "Everyday convenience", /\b(easy|convenien\w*|one.touch|leakproof|everyday|on.the.go)\b/i],
  ["values", "Brand values & provenance", /\b(sustainab\w*|made in|british|recycl\w*|founder|origin story)\b/i],
];
const styles: readonly [string, string, RegExp][] = [
  ["question", "Question-led", /\?|\b(question|asks|did you know)\b/i],
  ["offer", "Promotional", /\b(offer|discount|deal|bundle|free gift|save|saving)\b|\d+\s*%/i],
  ["story", "Storytelling", /\b(story|journey|started|origin|founder)\b/i],
  ["proof", "Reviews & reassurance", /\b(testimonial|review\w*|customer|guarantee)\b/i],
  ["urgency", "Urgency-led", /\b(ending soon|limited|last chance|scarcity|selling out|hurry)\b/i],
];
export function messageSignals(creatives: DemoGalleryCreative[]) {
  const analysed = creatives.filter(c => c.analysis);
  const text = (creative: DemoGalleryCreative) => {
    const fields = creative.analysis!.fields;
    return [fields.hook, fields.angle, fields.angle_explanation, fields.offer_type, "offer_explanation" in fields ? fields.offer_explanation : "offer" in fields ? fields.offer : undefined,
      ...fields.keyClaims, ...fields.onScreenText].flatMap(f => supportedPatternAnnotation(f) ? [String(f.value)] : []).join(" ");
  };
  const build = (rules: readonly [string, string, RegExp][]): MessageSignal[] => rules.map(([id,label,rule]) => ({ id,label,adIds: analysed.filter(c => rules.find(([, , pattern]) => pattern.test(text(c)))?.[0] === id).map(c => c.adId) }));
  const audience = build(needs), voice = build(styles);
  return { total: analysed.length, audience, voice,
    audienceUnrecorded: analysed.filter(c => !audience.some(g => g.adIds.includes(c.adId))).map(c => c.adId),
    voiceUnrecorded: analysed.filter(c => !voice.some(g => g.adIds.includes(c.adId))).map(c => c.adId) };
}

export interface TreemapTile { id: string; x: number; y: number; width: number; height: number }
/** Balanced binary partition; area is exactly proportional to positive counts. */
export function treemap(rows: { id: string; value: number }[]): TreemapTile[] {
  const positive = rows.filter(r => Number.isFinite(r.value) && r.value > 0);
  function split(items: typeof positive, x: number, y: number, width: number, height: number): TreemapTile[] {
    if (!items.length) return [];
    if (items.length === 1) return [{ id: items[0].id, x, y, width, height }];
    const total = items.reduce((n,r) => n+r.value,0); let sum=0,cut=1,best=Infinity;
    for(let i=1;i<items.length;i++) { sum+=items[i-1].value; const distance=Math.abs(total/2-sum); if(distance<best){best=distance;cut=i;} }
    const fraction=items.slice(0,cut).reduce((n,r)=>n+r.value,0)/total;
    return width>=height ? [...split(items.slice(0,cut),x,y,width*fraction,height),...split(items.slice(cut),x+width*fraction,y,width*(1-fraction),height)]
      : [...split(items.slice(0,cut),x,y,width,height*fraction),...split(items.slice(cut),x,y+height*fraction,width,height*(1-fraction))];
  }
  return split(positive,0,0,100,100);
}
