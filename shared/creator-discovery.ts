import { screenCreator, type CreatorScreen, type PublicCreatorScreening } from "./creator-screening.js";
/** Creator research is a checklist, never a sales prediction. */
export const CREATOR_RULE_VERSION = "creator-discovery-v3-public-people";
export const CREATOR_STYLES = ["UGC", "Talking to camera", "Tutorial", "Aesthetic", "Lifestyle"] as const;
export type CreatorStyle = typeof CREATOR_STYLES[number];
export type FollowerTier = "Nano" | "Micro" | "Mid" | "Macro";
export interface CreatorBrief {
  category: string; keywords: string[]; hashtags: string[]; competitors: string[];
  country: string; minFollowers: number; maxFollowers: number; seeds: string[];
  exclusions: string[]; styles: CreatorStyle[]; target: number;
}
export interface DiscoveryPost {
  id: string; url: string; caption: string; at: string | null;
  likes: number | null; comments: number | null; thumbnail: string | null;
  location?: string; paidPartnership?: boolean; altText?: string; personPresent?: boolean | null; productOnly?: boolean | null;
}
export interface DiscoveryProfile {
  handle: string; name: string; bio: string; website: string | null; businessEmail: string | null;
  screening?: PublicCreatorScreening;
  sources?: { kind: "disclosed-competitor" | "collected-ad" | "seed" | "competitor-mention" | "hashtag"; query: string }[];
  private: boolean | null; accountKind: "creator" | "brand" | "repost" | "reseller" | "unknown";
  posts: DiscoveryPost[]; related: string[]; appearsInAds: string[];
  growth?: { from: string; to: string; previousFollowers: number; followers: number; source?: "Verified" | "Observed (public profile)" };
  audit: { observedAt?: string; postIds?: string[]; sampledPosts: number; comments: number; repeatedFraction: number; genericFraction?: number; emojiFraction?: number } | null;
  followers: number | null; mediaCount: number | null;
  verification: "Verified" | "Observed (public profile)" | "Unverified"; verificationReason: string;
  checkedAt: string | null; discoveredAt: string;
}
export interface FitPart { key: string; label: string; points: number | null; max: number; reason: string }
export interface CreatorEvaluation {
  discoverySources?: DiscoveryProfile["sources"];
  handle: string; tier: FollowerTier | null; engagement: number | null; assessedPosts: number;
  frequency: number | null; from: string | null; to: string | null;
  uk: { confidence: number | null; band: "High" | "Medium" | "Low" | "Unknown"; reasons: string[]; foreign: boolean; signalCount: number };
  niches: string[]; styles: CreatorStyle[]; collaborations: string[]; workedWithCompetitors: string[];
  risk: { status: "Review" | "No sampled flags" | "Not assessed"; reasons: string[] };
  excluded: string[]; review: string[]; fit: number | null; assessedPoints: number;
  provisional: boolean; parts: FitPart[]; goodFit: boolean; ruleVersion: string; screen: CreatorScreen;
}
export interface DiscoveryCreator { profile: DiscoveryProfile; evaluation: CreatorEvaluation; saved: boolean; briefVersion: string; nextRefreshAt: string }
export interface CreatorFilters {
  tier?: string; niche?: string; engagement?: string; uk?: string; style?: string;
  worked?: boolean; ads?: boolean; minFit?: number; saved?: boolean; review?: boolean;
}
export interface CreatorSegment { id: string; name: string; filters: CreatorFilters; count: number; createdAt: string }
export interface DiscoveryQuote { id: string; maxCostGbp: number; batches: number; expiresAt: string; available: boolean; reason: string }
export interface CreatorProviderRunView {reservationId:string;searchId:string;runId:string|null;status:string;found:number|null;usageUsd:number|null;costGbp:number|null;heldGbp:number;startedAt:string;checkedAt:string|null}
export interface CreatorLegacyHold {reservationId:string;heldGbp:number;createdAt:string}
export interface DiscoveryRun { id: string; kind: string; status: string; found: number; verified: number; step: number; totalSteps: number; reservedGbp: number; error: string | null; createdAt: string;providerRuns?:CreatorProviderRunView[];legacyHolds?:CreatorLegacyHold[];reconcilePending?:boolean;reconcileNote?:string|null;stopRequested?:boolean }
export interface CreatorPrecision {
  field: "Individual creator" | "Good fit" | "UK"; tp: number; fp: number; fn: number; precision: number | null;
  interval: [number, number] | null; labelled: number; matched: number; missing: number;
  negativeCoverage?: { business: number; repost: number };
  clientReady: boolean; checkedAt: string; ruleVersion: string; briefVersion: string; fixture: boolean;
}
export interface DiscoverySnapshot {
  configured: boolean; verificationConfigured: boolean; reason: string; brief: CreatorBrief | null;
  briefVersion: string | null; creators: DiscoveryCreator[]; segments: CreatorSegment[];
  rejected: RejectedCreator[];
  suggestions?: { hashtags: string[]; competitors: string[]; keywords: string[]; unconfirmedHandles: string[] };
  runs: DiscoveryRun[]; precision: CreatorPrecision[]; clientReady: boolean;
}
export interface RejectedCreator { handle: string; name: string; profileUrl: string; evaluation: CreatorEvaluation; briefVersion: string; checkedAt: string }
export const emptyDiscovery = (): DiscoverySnapshot => ({ configured: false, verificationConfigured: false, reason: "Creator research needs its data source and budget configured.", brief: null, briefVersion: null, creators: [], segments: [], rejected: [], runs: [], precision: [], clientReady: false });
export function creatorHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(handle) && !handle.endsWith(".") && !handle.includes("..") ? handle : null;
}
export function followerTier(count: number | null): FollowerTier | null {
  return count === null || !Number.isFinite(count) || count < 0 ? null : count < 10000 ? "Nano" : count < 100000 ? "Micro" : count < 500000 ? "Mid" : "Macro";
}
export function creatorSourceText(sources: DiscoveryProfile["sources"]) {
  const names={"disclosed-competitor":"Disclosed competitor post","collected-ad":"Collected competitor ad","seed":"Seed creator or lookalike","competitor-mention":"Competitor mention","hashtag":"Hashtag post"};
  return sources?.map(s=>`${names[s.kind]}${s.query?`: ${s.query}`:""}`).join(" · ") || "Earlier search";
}
export function scrubCreatorText(value: unknown, max = 1200): string {
  if (typeof value !== "string") return "";
  return value.replace(/\b(?:Bearer\s+\S+|(?:access_token|api_key|password|secret)\s*[:=]\s*\S+)\b/gi, "")
    .replace(/https?:\/\/[^\s<>]+/gi, "")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "")
    .replace(/(?:\+?\d[\s().-]*){7,}/g, "")
    .replace(/\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){0,3}(?:Street|Road|Lane|Avenue|Close|Drive|St\b|Rd\b)/gi, "")
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "")
    .replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}
export function businessEmail(bio: unknown): string | null {
  if (typeof bio !== "string") return null;
  const match = /\b(?:business|work|enquiries|inquiries|collaborations|collabs|bookings)\s*(?:only)?\s*[:\-]?\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i.exec(bio);
  return match?.[1].toLowerCase() ?? null;
}
export const median = (values: number[]): number | null => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b), n = sorted.length;
  return n ? n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : null;
};
const validCount = (v: number | null): v is number => v !== null && Number.isSafeInteger(v) && v >= 0;
export function hasCreatorCounts(profile: DiscoveryProfile) {
  return profile.verification !== "Unverified" && (validCount(profile.followers) || validCount(profile.mediaCount));
}
/** Older failed official checks kept counts but cleared their verification label. */
export function restoreSavedCreatorCounts(profile: DiscoveryProfile): DiscoveryProfile {
  return profile.verification === "Unverified" && (validCount(profile.followers) || validCount(profile.mediaCount))
    ? {...profile,verification:"Observed (public profile)",verificationReason:"Saved public counts; the official check needs renewal."}
    : profile;
}
export function recentCreatorPosts(posts: DiscoveryPost[]) {
  const seen = new Set<string>();
  return [...posts].filter(p => p.at && Number.isFinite(Date.parse(p.at))).sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!)).filter(p => !seen.has(p.id) && Boolean(seen.add(p.id))).slice(0, 12);
}
export function engagementMetrics(profile: DiscoveryProfile) {
  const posts = recentCreatorPosts(profile.posts), dates = posts.map(p => p.at!);
  const eligible = hasCreatorCounts(profile) && validCount(profile.followers) && profile.followers > 0 ? posts.filter(p => validCount(p.likes) && validCount(p.comments)) : [];
  const elapsed = dates.length > 1 ? (Date.parse(dates[0]) - Date.parse(dates.at(-1)!)) / 86400000 : 0;
  return { engagement: median(eligible.map(p => (p.likes! + p.comments!) / profile.followers!)), assessedPosts: eligible.length,
    frequency: elapsed > 0 ? (posts.length - 1) * 7 / elapsed : null, from: dates.at(-1) ?? null, to: dates[0] ?? null };
}
const UK = /\b(?:UK|United Kingdom|Britain|England|Scotland|Wales|Northern Ireland|London|Manchester|Birmingham|Bristol|Leeds|Glasgow|Edinburgh|Cardiff|Belfast|Liverpool|Brighton|Nottingham|Sheffield|Bath|York|Cornwall|Devon|Kent|Surrey|Essex|Sussex)\b/i;
const FOREIGN = /\b(?:based in|living in|located in|home in)\s+(?:USA|US|United States|New York|Los Angeles|Canada|Toronto|Australia|Sydney|Dubai|UAE|France|Paris|Germany|Berlin|Ireland|Dublin|India|Mumbai|Singapore)\b/i;
export function coarseCreatorLocation(value: unknown): string { return typeof value === "string" ? UK.exec(value)?.[0] ?? "" : ""; }
export function ukCreatorSignals(profile: DiscoveryProfile): CreatorEvaluation["uk"] {
  const reasons: string[] = [], base = UK.test(profile.bio) && !/\b(?:visiting|holiday in|trip to|travelling to)\b/i.test(profile.bio), foreign = FOREIGN.test(profile.bio);
  const places = profile.posts.filter(p => p.location && UK.test(p.location));
  const repeated = new Set(places.map(p => p.id)).size >= 2;
  let domain = false; try { domain = Boolean(profile.website && new URL(profile.website).hostname.endsWith(".co.uk")); } catch { /* Not a location signal. */ }
  const spelling = /\b(?:colour|favourite|cosy|centre|organise|personalised)\b/i.test(profile.bio + " " + profile.posts.map(p => p.caption).join(" "));
  if (base) reasons.push("Public bio names a UK place.");
  if (repeated) reasons.push("At least two posts name UK places.");
  if (domain) reasons.push("Website uses a .co.uk domain.");
  if (spelling) reasons.push("Public text uses British spelling.");
  if (foreign) reasons.push("Public bio says they are based outside the UK.");
  let confidence: number | null = base ? Math.min(1, .8 + Number(repeated) * .1 + Number(domain) * .05 + Number(spelling) * .05) : repeated || domain || spelling ? Math.min(.7, Number(repeated) * .5 + Number(domain) * .1 + Number(spelling) * .1) : null;
  if (foreign) confidence = base || repeated ? .2 : 0;
  const signalCount=Number(base)+Number(repeated)+Number(domain)+Number(spelling);
  return { confidence, band: confidence === null ? "Unknown" : confidence >= .8 && signalCount>=2 ? "High" : confidence >= .5 ? "Medium" : "Low", reasons, foreign, signalCount };
}
function words(text: string) { return new Set(text.toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !["the", "and", "for", "with", "this", "that", "from"].includes(w)) ?? []); }
function similarity(a: string, b: string) { const x = words(a), y = words(b), union = new Set([...x, ...y]).size; return union ? [...x].filter(w => y.has(w)).length / union : null; }
export function evaluateCreator(profile: DiscoveryProfile, brief: CreatorBrief, seeds: DiscoveryProfile[] = [], now = new Date()): CreatorEvaluation {
  const metrics = engagementMetrics(profile), uk = ukCreatorSignals(profile), tier = followerTier(hasCreatorCounts(profile) ? profile.followers : null);
  const text = `${profile.bio} ${profile.posts.map(p => p.caption).join(" ")}`.toLowerCase();
  const terms = [...new Set([brief.category, ...brief.keywords].map(v => v.trim().toLowerCase()).filter(Boolean))];
  const niches = terms.filter(t => text.includes(t));
  const styleRules: Record<CreatorStyle, RegExp> = { UGC: /\bugc\b|user.generated content/, "Talking to camera": /talking (?:to|on) camera|face.to.camera/, Tutorial: /\btutorial\b|how.to|step.by.step/, Aesthetic: /\baesthetic\b|moodboard/, Lifestyle: /\blifestyle\b|daily routine|evening routine/ };
  const styles = CREATOR_STYLES.filter(s => styleRules[s].test(text));
  const collaborationPosts = profile.posts.filter(p => p.paidPartnership || /(?:^|\s)#(?:ad|sponsored)\b|paid partnership/i.test(p.caption));
  const collaborations = collaborationPosts.map(p => p.url);
  const workedWithCompetitors = brief.competitors.filter(handle => collaborationPosts.some(p => new RegExp(`@${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(p.caption)));
  const audited = Boolean(profile.audit && profile.audit.sampledPosts >= 3 && profile.audit.comments >= 10);
  const growthDays=profile.growth?(Date.parse(profile.growth.to)-Date.parse(profile.growth.from))/86400000:0;
  const growthFlag=Boolean(profile.growth&&growthDays>=7&&growthDays<=35&&profile.growth.previousFollowers>0&&profile.growth.followers/profile.growth.previousFollowers>=1.5);
  const flagged = growthFlag || audited && (profile.audit!.repeatedFraction >= .5 || (profile.audit!.genericFraction??0)>=.5 || (profile.audit!.emojiFraction??0)>=.5);
  const risk: CreatorEvaluation["risk"] = { status: flagged ? "Review" : audited ? "No sampled flags" : "Not assessed", reasons: growthFlag ? ["Followers rose at least 50% between recent monthly checks. Review the change."] : audited ? [flagged ? "Most sampled comments are generic, emoji-only or repeated." : "No repeated-comment pattern in this small sample."] : ["Comment and follower-history checks are incomplete."] };
  const benchmarks: Record<FollowerTier, number> = { Nano: .03, Micro: .02, Mid: .015, Macro: .01 };
  const seedValues = seeds.filter(s => brief.seeds.includes(s.handle) && s.handle !== profile.handle).map(s => similarity(text, `${s.bio} ${s.posts.map(p => p.caption).join(" ")}`)).filter((v): v is number => v !== null);
  const parts: FitPart[] = [
    { key: "niche", label: "Niche", points: terms.length && text.trim() ? 30 * niches.length / terms.length : null, max: 30, reason: niches.length ? `Matches: ${niches.join(", ")}.` : "No configured niche terms found." },
    { key: "engagement", label: "Engagement", points: metrics.assessedPosts === 12 && tier && metrics.engagement !== null ? Math.min(1, metrics.engagement / benchmarks[tier]) * 20 : null, max: 20, reason: metrics.assessedPosts === 12 ? "Compared with a provisional tier guide." : "Needs public or verified counts on 12 posts." },
    { key: "uk", label: "UK", points: brief.country === "GB" && uk.confidence !== null ? uk.confidence * 20 : null, max: 20, reason: uk.reasons.join(" ") || "No UK location signals found." },
    { key: "style", label: "Style", points: brief.styles.length && text.trim() ? 10 * brief.styles.filter(s => styles.includes(s)).length / brief.styles.length : null, max: 10, reason: "Estimated from public text, without visual inspection." },
    { key: "authenticity", label: "Authenticity", points: flagged ? 0 : audited ? 10 : null, max: 10, reason: risk.reasons[0] },
    { key: "seeds", label: "Seed similarity", points: seedValues.length ? Math.max(...seedValues) * 10 : null, max: 10, reason: seedValues.length ? "Public topic overlap with fetched seed profiles." : "No comparable seed profiles fetched." },
  ];
  const assessedPoints = parts.reduce((n, p) => n + (p.points === null ? 0 : p.max), 0);
  const screen=screenCreator(profile,brief,{...metrics,uk,tier,styles},now);
  const fit = assessedPoints ? Math.round(100 * parts.reduce((n, p) => n + (p.points ?? 0), 0) / assessedPoints) : null;
  return { handle: profile.handle, discoverySources:profile.sources, ...metrics, uk, tier, niches, styles, collaborations, workedWithCompetitors, risk, excluded: screen.rules.filter(r=>r.state==="fail").map(r=>r.reason), review: screen.rules.filter(r=>r.state==="review").map(r=>r.reason), fit, assessedPoints, provisional: assessedPoints < 100,
    parts, screen, goodFit: screen.disposition === "Results" && assessedPoints >= 80 && fit !== null && fit >= 70, ruleVersion: CREATOR_RULE_VERSION };
}
export function matchesCreator(row: DiscoveryCreator, f: CreatorFilters, disposition: "Results" | "Needs review" = "Results", now = new Date()): boolean {
  const e = row.evaluation;
  return e.ruleVersion===CREATOR_RULE_VERSION && e.screen?.disposition===disposition && (disposition!=="Results" || e.screen.rules.length===9 && e.screen.rules.every(r=>r.state==="pass")) && !(disposition==="Results" && e.screen.activeUntil && Date.parse(e.screen.activeUntil)<now.getTime()) && !f.review && (!f.tier || e.tier === f.tier) && (!f.niche || e.niches.includes(f.niche)) && (!f.uk || e.uk.band === f.uk) && (!f.style || e.styles.includes(f.style as CreatorStyle)) && (!f.worked || e.workedWithCompetitors.length > 0) && (!f.ads || row.profile.appearsInAds.length > 0) && (!f.saved || row.saved) && (f.minFit == null || e.fit !== null && e.fit >= f.minFit) && (!f.engagement || e.engagement !== null && (f.engagement === "Under 1%" ? e.engagement < .01 : f.engagement === "1 to 3%" ? e.engagement >= .01 && e.engagement < .03 : e.engagement >= .03));
}
export function nextCreatorRefresh(at: string): string {
  const date = new Date(at), day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(day, last)); return date.toISOString();
}
export interface CreatorLabel { handle: string; good_fit: boolean; is_uk: boolean; is_individual?: boolean; account_type?: "individual" | "business" | "repost" | "unknown" }
export function parseCreatorLabels(csv: string): CreatorLabel[] {
  if (BufferByteLength(csv) > 200000) throw new Error("Label file is too large.");
  const rows: string[][] = [], row: string[] = []; let field = "", quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i + 1] === '"') { field += '"'; i++; } else if (!quoted && field.length) throw new Error("Invalid CSV quote."); else quoted = !quoted; }
    else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && csv[i + 1] === "\n") i++; row.push(field); if (row.some(v => v.trim())) rows.push([...row]); row.length = 0; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()?.map(v => v.trim().replace(/^\uFEFF/, "")).join(",");
  const legacy = header === "handle,good_fit,is_uk,notes";
  if (!legacy && header !== "handle,good_fit,is_uk,is_individual,account_type,notes") throw new Error("Use handle,good_fit,is_uk,is_individual,account_type,notes columns.");
  const seen = new Set<string>();
  return rows.map(r => {
    const h = creatorHandle(r[0]), good = r[1]?.trim().toLowerCase(), uk = r[2]?.trim().toLowerCase(), individual=r[3]?.trim().toLowerCase(), kind=r[4]?.trim().toLowerCase();
    if (r.length !== (legacy?4:6) || !h || seen.has(h) || !["yes", "no"].includes(good) || !["yes", "no"].includes(uk) || !legacy && (!["yes","no"].includes(individual) || !["individual","business","repost","unknown"].includes(kind))) throw new Error("Each handle needs one yes/no label per field and an account type.");
    if(!legacy && ["business","repost"].includes(kind) && (individual!=="no" || good!=="no")) throw new Error("Business and repost negatives must be labelled no for individual and good fit.");
    seen.add(h); return { handle:h, good_fit:good==="yes", is_uk:uk==="yes", ...(!legacy?{is_individual:individual==="yes",account_type:kind as CreatorLabel["account_type"]}:{}) };
  });
}
function BufferByteLength(value: string) { return new TextEncoder().encode(value).length; }
export function creatorPrecision(labels: CreatorLabel[], creators: (DiscoveryCreator | RejectedCreator)[], briefVersion: string, at: string, fixture = true): CreatorPrecision[] {
  const matching = creators.filter(c => c.briefVersion === briefVersion && c.evaluation.ruleVersion === CREATOR_RULE_VERSION);
  const byHandle = new Map(matching.map(c => ["profile" in c ? c.profile.handle : c.handle, c]));
  return (["Good fit", "UK", "Individual creator"] as const).map(field => {
    let tp = 0, fp = 0, fn = 0, matched = 0;
    for (const label of labels) {
      const row = byHandle.get(label.handle); if (!row || field === "Individual creator" && label.is_individual === undefined) continue; matched++;
      const actual = field === "Good fit" ? label.good_fit : field === "UK" ? label.is_uk : label.is_individual;
      const predicted = field === "Good fit" ? row.evaluation.goodFit : field === "UK" ? row.evaluation.uk.band === "High" : row.evaluation.screen.individual.state === "pass";
      if (predicted && actual) tp++; if (predicted && !actual) fp++; if (!predicted && actual) fn++;
    }
    const negativeCoverage = {business:labels.filter(l=>l.account_type==="business" && l.is_individual===false && byHandle.has(l.handle)).length,repost:labels.filter(l=>l.account_type==="repost" && l.is_individual===false && byHandle.has(l.handle)).length};
    const n = tp + fp, precision = n ? tp / n : null, z = 1.96, d = 1 + z * z / Math.max(1, n), centre = precision === null ? 0 : (precision + z * z / (2 * n)) / d, half = precision === null ? 0 : z * Math.sqrt((precision * (1 - precision) + z * z / (4 * n)) / n) / d;
    return { field, tp, fp, fn, precision, interval: precision === null ? null : [centre - half, centre + half], labelled: labels.length, matched, missing: labels.length - matched,
      negativeCoverage, clientReady: !fixture && negativeCoverage.business>0 && negativeCoverage.repost>0 && matched === labels.length && n >= 20 && precision !== null && precision >= .85, checkedAt: at, ruleVersion: CREATOR_RULE_VERSION, briefVersion, fixture };
  });
}
export function creatorCsv(rows: DiscoveryCreator[]) {
  const cell = (v: unknown) => '"' + String(v ?? "Unverified").replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""') + '"';
  const header = ["Handle", "Name", "Followers", "Media count", "Engagement percent", "Posts assessed", "Posts per week", "UK confidence", "Niche", "Style", "Fit", "Fit coverage", "Verification", "Last checked", "Business email"];
  return [header, ...rows.filter(r=>matchesCreator(r,{})).map(r => [r.profile.handle, r.profile.name, r.profile.followers, r.profile.mediaCount, r.evaluation.engagement === null ? null : 100 * r.evaluation.engagement, r.evaluation.assessedPosts, r.evaluation.frequency, r.evaluation.uk.band, r.evaluation.niches.join("; "), r.evaluation.styles.join("; "), r.evaluation.fit, r.evaluation.assessedPoints, r.profile.verification, r.profile.checkedAt, r.profile.businessEmail])].map(r => r.map(cell).join(",")).join("\r\n");
}
