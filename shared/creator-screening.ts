import type { CreatorBrief, CreatorStyle, DiscoveryPost, DiscoveryProfile, FollowerTier } from "./creator-discovery.js";
export type RuleState = "pass" | "fail" | "review";
export type CreatorDisposition = "Results" | "Needs review" | "Rejected";
export const REJECT_REASONS = ["Business page", "Repost page", "Outside follower range", "Not UK", "Off-niche", "Style mismatch", "Inactive", "Private account", "Excluded by brief", "Suspicious audience", "Missing profile counts", "Incomplete checks"] as const;
export type RejectReason = typeof REJECT_REASONS[number];
export interface CreatorRule { id: string; label: string; state: RuleState; reason: string; rejection?: RejectReason }
export interface PublicCreatorScreening {
  version: 1; category: string | null; personalAccount: boolean | null;
  linkKind: "none" | "blog" | "link page" | "shop" | "unknown";
  businessAddress: boolean; openingHours: boolean; shopOwner: boolean;
  observedAt: string;
}
export interface IndividualCreatorCheck { state: RuleState; positives: string[]; negatives: string[]; reason: string }
export interface CreatorScreen { disposition: CreatorDisposition; individual: IndividualCreatorCheck; rules: CreatorRule[]; rejectedReasons: RejectReason[]; screenedAt: string; activeUntil: string | null }
// Provisional screening bands. They flag unusual activity; they do not establish fraud.
export const CREATOR_ENGAGEMENT_BANDS: Record<FollowerTier, { min: number; max: number }> = {
  Nano: { min: .003, max: .20 }, Micro: { min: .002, max: .15 },
  Mid: { min: .0015, max: .10 }, Macro: { min: .001, max: .08 },
};
const BUSINESS_CATEGORY = /\b(?:shopping|retail|brand|product[ /-]*service|local business|restaurant|shop|clothing store|agency|magazine|media|publisher|news|community|organi[sz]ation|non[ -]?profit|school|reseller|management)\b/i;
const CREATOR_CATEGORY = /\b(?:digital creator|blogger|personal blog|public figure|artist|content creator)\b/i;
const BUSINESS_COPY = /\b(?:shop|store|official|studio|ltd|boutique|brand)\b|(?:^|\s)co\.(?:\s|$)|\bdm to order\b|\bshop now\b|\bworldwide shipping\b|\bfree delivery\b|\bdiscount code for our\b|\b(?:talent|marketing|management) agency\b|\btalent management\b|\bwe manage\b/i;
const PRODUCT_NAME = /\b(?:clothing|fashion|wear|apparel|collection|fragrances?|candles?|home|interiors|shop|store|boutique|co|ltd|official|studio|brand|gifts?)\b/i;
const REPOST_COPY = /\b(?:repost(?:ing)?|memes?|quotes?|fan page|fan account|aggregator|featuring page|tag us|dm for features|credit to (?:the )?owners|daily inspo|featured creators|curated by us)\b/i;
const OWNER = /\b(?:founder|co[ -]?founder|owner|i own|my (?:shop|store|business|brand))\b/i;
const DAY = 86400000;
const normal = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function nicheTextMatch(text: string, terms: string[]) { const words = ` ${normal(text)} `; return terms.some(t => { const term = normal(t.replace(/^#/, "")); return term && words.includes(` ${term} `); }); }
export function linkKind(value: unknown): PublicCreatorScreening["linkKind"] {
  if (value === "" || value === null) return "none";
  if (typeof value !== "string") return "unknown";
  try {
    const u = new URL(value); if (u.protocol !== "https:" || u.username || u.password) return "unknown";
    if (/(?:^|\.)(?:myshopify\.com|etsy\.com)$/.test(u.hostname) || /\/(?:shop|store|checkout|cart|products|collections)(?:\/|$)/i.test(u.pathname)) return "shop";
    if (/\/(?:blog|journal)(?:\/|$)/i.test(u.pathname) || /(?:^|\.)(?:wordpress\.com|blogspot\.com)$/.test(u.hostname)) return "blog";
    if (/\/(?:links|link-in-bio)(?:\/|$)/i.test(u.pathname) || /^(?:linktr\.ee|beacons\.ai|bio\.site|campsite\.bio|lnk\.bio)$/.test(u.hostname)) return "link page";
  } catch { /* No inference from an invalid or unknown destination. */ }
  return "unknown";
}
export function personalName(name: string, handle: string): boolean {
  const parts = name.trim().split(/\s+/); return name.toLowerCase() !== handle.toLowerCase() && parts.length >= 2 && parts.length <= 4 && parts.every(p => /^[\p{L}][\p{L}'’-]+$/u.test(p)) && !BUSINESS_COPY.test(name) && !REPOST_COPY.test(name) && !/\b(?:creator|blogger|lifestyle|candles|fragrance|interiors|gifts|wellness|beauty|news|daily|inspo|home|fashion|media|agency|management)\b/i.test(name);
}
export function postAppearance(post: DiscoveryPost): { person: boolean | null; productOnly: boolean | null } {
  const alt = post.altText ?? "", caption = post.caption;
  const explicitNoPerson = /\b(?:no (?:people|person)|without (?:people|a person)|product.only|catalogue image|catalog image)\b/i.test(alt);
  const person = typeof post.personPresent === "boolean" ? post.personPresent : explicitNoPerson ? false : /\b(?:person|woman|man|people|selfie|portrait|talking to camera)\b/i.test(alt) || /\b(?:me (?:talking|holding|wearing)|my selfie|i(?:'m| am) (?:on camera|talking to camera))\b/i.test(caption) ? true : null;
  const product = typeof post.productOnly === "boolean" ? post.productOnly : person === false && /\b(?:product|catalogue|catalog|price|bottle|candle|packshot)\b|[£$€]\s*\d/i.test(`${alt} ${caption}`) ? true : null;
  return { person, productOnly: person === true ? false : product };
}
export function individualCreator(profile: DiscoveryProfile): IndividualCreatorCheck {
  const positives: string[] = [], negatives: string[] = [], meta = profile.screening;
  const category = meta?.category ?? "", identity = `${profile.name} ${profile.bio}`;
  if (CREATOR_CATEGORY.test(category) || meta?.personalAccount === true) positives.push("Creator category or personal account.");
  if (personalName(profile.name, profile.handle)) positives.push("A personal name is shown.");
  if (/\b(?:i|my|mum of|mom of|she\/her|he\/him|they\/them)\b/i.test(profile.bio)) positives.push("The bio speaks as an individual.");
  const posts = profile.posts.slice(0, 12), appearances = posts.map(postAppearance);
  if (appearances.some(p => p.person === true)) positives.push("Recent post text describes a person.");
  if (posts.some(p => p.paidPartnership || /(?:^|\s)#(?:ad|gifted|sponsored)\b|paid partnership/i.test(p.caption)) || /\b(?:for collabs|for collaborations|collabs email|collaboration enquiries)\b/i.test(profile.bio)) positives.push("Public collaboration signs are present.");
  const repost = profile.accountKind === "repost" || REPOST_COPY.test(identity);
  if (repost) negatives.push("The page describes reposts, features or aggregated content.");
  if (BUSINESS_CATEGORY.test(category) || ["brand", "reseller"].includes(profile.accountKind)) negatives.push("The account category describes a business.");
  if (BUSINESS_COPY.test(identity)) negatives.push("The name or bio has business wording.");
  const productIdentity = `${profile.name} ${profile.handle.replace(/[._]/g," ")}`;
  const productHandle = /clothing|fashion|apparel|collection|london.*wear|fragrances?|candles?|home|interiors|shop|store|boutique|official|studio|brand|gifts?|(?:^|[._])(?:co|ltd)(?:$|[._])/i.test(profile.handle);
  if (PRODUCT_NAME.test(productIdentity) || productHandle) negatives.push("The name or handle describes products or a shop.");
  if ((meta?.linkKind ?? linkKind(profile.website)) === "shop") negatives.push("The public link leads to a shop.");
  if (meta?.businessAddress || meta?.openingHours) negatives.push("The bio advertises shop premises or opening hours.");
  if (posts.length >= 3 && appearances.filter(p => p.person === false && p.productOnly === true).length > posts.length / 2) negatives.push("Most sampled posts show products without a person.");
  const otherBusiness = /\b(?:agency|management|restaurant|magazine|media|publisher|news|community|organi[sz]ation|non[ -]?profit|school|reseller)\b/i.test(`${category} ${identity}`);
  const shopOwnership = (meta?.shopOwner || OWNER.test(profile.bio)) && (meta?.linkKind==="shop" || /\b(?:shop|store|boutique)\b/i.test(profile.bio));
  const hybrid = !repost && !otherBusiness && positives.length >= 2 && personalName(profile.name,profile.handle) && appearances.some(p=>p.person===true) && shopOwnership && negatives.length > 0;
  if (hybrid) return { state: "review", positives, negatives, reason: "A creator also owns a business. Check the account's main purpose." };
  if (negatives.length) return { state: "fail", positives, negatives, reason: negatives.join(" ") };
  if (positives.length < 2) return { state: "review", positives, negatives, reason: "At least two personal creator signals are needed." };
  if (!posts.length || appearances.filter(p=>p.person!==null).length<=posts.length/2) return {state:"review",positives,negatives,reason:"Recent post descriptions cannot rule out a product-only feed."};
  if (!meta || meta.linkKind === "unknown") return { state: "review", positives, negatives, reason: "The business and public-link checks need confirmation." };
  return { state: "pass", positives, negatives, reason: `${positives.length} personal signals; no business or repost signals found.` };
}
export function commentQuality(comments: string[]): { genericFraction: number; emojiFraction: number } {
  if (!comments.length) return { genericFraction: 0, emojiFraction: 0 };
  const emoji = (v: string) => !/[\p{L}\p{N}]/u.test(v);
  const generic = (v: string) => emoji(v) || /^(?:nice|nice (?:post|pic)|great|great (?:post|pic)|wow|love (?:it|this)|amazing|beautiful|awesome|cool|lovely|so good|gorgeous|stunning|follow me|check my profile)$/.test(normal(v));
  return { genericFraction: comments.filter(generic).length / comments.length, emojiFraction: comments.filter(emoji).length / comments.length };
}
export interface ScreenInputs {
  engagement: number | null; assessedPosts: number; tier: FollowerTier | null;
  uk: { band: string; confidence: number | null; reasons: string[]; foreign: boolean; signalCount?: number };
  styles: CreatorStyle[];
}
export function screenCreator(profile: DiscoveryProfile, brief: CreatorBrief, input: ScreenInputs, now: Date): CreatorScreen {
  const individual = individualCreator(profile), rules: CreatorRule[] = [];
  const add = (id: string, label: string, state: RuleState, reason: string, rejection?: RejectReason) => rules.push({ id, label, state, reason, rejection });
  add("individual", "Individual creator", individual.state, individual.reason, profile.accountKind === "repost" || REPOST_COPY.test(`${profile.name} ${profile.bio}`) ? "Repost page" : "Business page");
  const countAt=profile.checkedAt?Date.parse(profile.checkedAt):NaN;
  const sourcedCounts = profile.verification !== "Unverified" && Number.isFinite(countAt) && countAt<=now.getTime();
  const knownFollowers = profile.verification !== "Unverified" && profile.followers !== null && Number.isSafeInteger(profile.followers) && profile.followers>=0;
  const outside = knownFollowers && (profile.followers! < brief.minFollowers || profile.followers! > brief.maxFollowers);
  const freshCounts = sourcedCounts && now.getTime()-countAt<=35*DAY;
  add("followers", "Follower range", outside ? "fail" : knownFollowers && freshCounts ? "pass" : "review", knownFollowers ? `${profile.followers!.toLocaleString("en-GB")} followers; the brief requires ${brief.minFollowers.toLocaleString("en-GB")} to ${brief.maxFollowers.toLocaleString("en-GB")}.${!freshCounts?" Refresh the dated count.":""}` : "Public or verified follower numbers are needed.", "Outside follower range");
  const ukPass = input.uk.band === "High" && (input.uk.signalCount ?? 0) >= 2;
  add("country", "Country", brief.country !== "GB" ? "pass" : input.uk.foreign ? "fail" : ukPass ? "pass" : "review", brief.country !== "GB" ? "The brief allows all countries." : input.uk.foreign ? "The bio states a base outside the UK." : ukPass ? "High UK confidence from at least two independent signals." : "High UK confidence needs at least two independent signals.", "Not UK");
  const unique = new Map<string, DiscoveryPost>();
  for(const p of [...profile.posts].filter(p=>p.at && Number.isFinite(Date.parse(p.at))).sort((a,b)=>Date.parse(b.at!)-Date.parse(a.at!))) if(!unique.has(p.id)) unique.set(p.id,p);
  const posts = [...unique.values()].slice(0, 12), terms = [...brief.keywords, ...brief.hashtags];
  const matched = posts.filter(p => nicheTextMatch(`${p.caption} ${p.altText ?? ""}`, terms)).length;
  const completeText = posts.length === 12 && posts.every(p => Boolean(p.caption.trim() || p.altText?.trim()));
  add("niche", "Niche match", !terms.length ? "review" : matched >= 3 ? "pass" : completeText ? "fail" : "review", !terms.length ? "Add niche keywords or hashtags to the brief." : `${matched} of 12 recent posts match; at least 3 are needed.`, "Off-niche");
  const styleMatch = brief.styles.some(s => input.styles.includes(s));
  add("style", "Content style", !brief.styles.length || styleMatch ? "pass" : completeText ? "fail" : "review", !brief.styles.length ? "No content style is required." : styleMatch ? "At least one selected content style matches." : "No selected style is supported by the sampled content.", "Style mismatch");
  const latest = posts[0]?.at ? Date.parse(posts[0].at) : NaN, age = (now.getTime() - latest) / DAY;
  const totalKnown = freshCounts && profile.mediaCount !== null && Number.isSafeInteger(profile.mediaCount) && profile.mediaCount >= 0;
  const activeFail = Number.isFinite(age) && age > 30 || totalKnown && profile.mediaCount! < 12;
  const activePass = Number.isFinite(age) && age >= 0 && age <= 30 && totalKnown && profile.mediaCount! >= 12;
  add("active", "Recent activity", activeFail ? "fail" : activePass ? "pass" : "review", activeFail ? "Needs a post within 30 days and at least 12 posts overall." : activePass ? "Posted within 30 days; at least 12 posts are recorded." : "Recent activity or the public post count needs confirmation.", "Inactive");
  add("public", "Public account", profile.private === true ? "fail" : profile.private === false ? "pass" : "review", profile.private === true ? "The account is private." : profile.private === false ? "The public profile was accessible." : "Public account status is unknown.", "Private account");
  const identityText = `${profile.name} ${profile.bio} ${profile.posts.map(p => p.caption).join(" ")}`;
  const blocked = brief.exclusions.some(v => v.trim().replace(/^@/, "").toLowerCase() === profile.handle || nicheTextMatch(identityText, [v]));
  const minor = /\b(?:i am|i'm|age|aged)\s*(?:1[0-7]|[0-9])\b/i.test(profile.bio);
  add("exclusions", "Brief exclusions", blocked || minor ? "fail" : "pass", minor ? "The bio states an age under 18." : blocked ? "Matches the brief's exclusion list." : "No brief exclusion matches.", "Excluded by brief");
  const band = input.tier ? CREATOR_ENGAGEMENT_BANDS[input.tier] : null;
  const rateKnown = input.engagement !== null && input.assessedPosts === 12 && freshCounts && band;
  const low = rateKnown && input.engagement! < band.min, high = rateKnown && input.engagement! > band.max;
  const growth = profile.growth, days = growth ? (Date.parse(growth.to) - Date.parse(growth.from)) / DAY : NaN;
  const growthKnown = growth && (growth.source ?? "Verified")===profile.verification && days >= 7 && days <= 35 && Number.isSafeInteger(growth.previousFollowers) && growth.previousFollowers > 0 && Number.isSafeInteger(growth.followers) && growth.followers >= 0 && growth.followers===profile.followers && Date.parse(growth.to)===countAt && freshCounts;
  const jump = growthKnown && Math.abs(growth.followers / growth.previousFollowers - 1) >= .5;
  const audit = profile.audit, auditKnown = audit && audit.observedAt && now.getTime()-Date.parse(audit.observedAt)>=0 && now.getTime()-Date.parse(audit.observedAt)<=35*DAY && audit.postIds && new Set(audit.postIds.filter(id=>posts.some(p=>p.id===id))).size>=3 && Number.isSafeInteger(audit.sampledPosts) && audit.sampledPosts >= 3 && audit.sampledPosts<=12 && Number.isSafeInteger(audit.comments) && audit.comments >= 10 && [audit.repeatedFraction,audit.genericFraction,audit.emojiFraction].every(v=>typeof v==="number" && Number.isFinite(v) && v>=0 && v<=1);
  const badComments = auditKnown && (audit.genericFraction! >= .5 || audit.emojiFraction! >= .5 || audit.repeatedFraction >= .5);
  const audienceFail = Boolean(low || high || jump || badComments);
  const audienceReasons = [low ? "Engagement is unusually low; bought followers are one possible cause." : high ? "Engagement is unusually high; coordinated activity is one possible cause." : !rateKnown ? "Needs public or verified engagement counts on all 12 posts." : `Engagement is within the provisional ${input.tier!.toLowerCase()} range.`, jump ? "Followers changed by at least 50% between recent checks." : !growthKnown ? "Two comparable follower checks are needed to assess sudden changes." : "No sudden follower change was found.", badComments ? "Most sampled comments are generic, emoji-only or repeated." : !auditKnown ? "Comment quality needs a sample across at least three posts." : "Most sampled comments are specific to the posts."];
  const invalidOptional = Boolean(audit && !auditKnown || growth && !growthKnown);
  add("audience", "Engagement plausibility", audienceFail ? "fail" : rateKnown && !invalidOptional ? "pass" : "review", audienceReasons.join(" "), "Suspicious audience");
  const rejectedReasons = [...new Set(rules.filter(r => r.state === "fail").map(r => r.rejection!))];
  const pending=rules.filter(r=>r.state==="review"), mixedOnly=pending.length===1 && pending[0].id==="individual" && individual.negatives.length>0 && individual.positives.length>=2;
  if(pending.length && !mixedOnly)rejectedReasons.push(!knownFollowers?"Missing profile counts":"Incomplete checks");
  return { individual, rules, rejectedReasons, disposition: rejectedReasons.length ? "Rejected" : mixedOnly ? "Needs review" : "Results", screenedAt: now.toISOString(), activeUntil: activePass ? new Date(latest + 30 * DAY).toISOString() : null };
}
