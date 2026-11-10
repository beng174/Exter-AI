import { linkKind, commentQuality, type PublicCreatorScreening } from "../../shared/creator-screening.js";
import { creatorHandle, scrubCreatorText, businessEmail, coarseCreatorLocation, type DiscoveryProfile, type DiscoveryPost } from "../../shared/creator-discovery.js";
import { assertProxySupport } from "../connectors/http.js";
const object = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const count = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
export function publicCreatorUrl(value: unknown, post = false): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname) || url.username || url.password || url.port || (post ? !/^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) : !creatorHandle(url.pathname.replaceAll("/", "")))) return null; return `https://www.instagram.com${url.pathname}`; } catch { return null; }
}
export function creatorImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.port && ["cdninstagram.com", "fbcdn.net"].some(h => u.hostname === h || u.hostname.endsWith("." + h)) ? u.href : null; } catch { return null; }
}
export function publicScreening(row: Record<string, any>, at: string, prior?: PublicCreatorScreening): PublicCreatorScreening {
  const hasBio=typeof row.biography==="string" || typeof row.bio==="string";
  const bio = String(row.biography ?? row.bio ?? ""), link=row.externalUrl !== undefined ? row.externalUrl : row.website;
  return {version:1, category:typeof (row.businessCategoryName ?? row.categoryName ?? row.category)==="string" ? scrubCreatorText(row.businessCategoryName ?? row.categoryName ?? row.category,100) : prior?.category ?? null,
    personalAccount:typeof row.isPersonalAccount==="boolean"?row.isPersonalAccount:row.accountType==="Personal"?true:prior?.personalAccount??null,
    linkKind:link!==undefined?linkKind(link):prior?.linkKind??"unknown",
    businessAddress:Boolean(!hasBio && prior?.businessAddress || row.businessAddress || row.businessAddressJson || /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){0,3}(?:Street|Road|Lane|Avenue|Close|Drive|St\b|Rd\b)/i.test(bio)),
    openingHours:Boolean(!hasBio && prior?.openingHours || row.openingHours || /\b(?:open(?:ing)? (?:hours|daily|mon|tue|wed|thu|fri|sat|sun)|\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:to|-)\s*\d{1,2})/i.test(bio)),
    shopOwner:!hasBio && prior?.shopOwner || /\b(?:founder|co[ -]?founder|owner|i own|my (?:shop|store|business|brand))\b/i.test(bio), observedAt:at};
}
export function discoveryProfile(raw: unknown, at: string, secret = ""): DiscoveryProfile | null {
  if(secret && JSON.stringify(raw)?.includes(secret))return null;
  const item = object(raw), isPost=Boolean(item.ownerUsername || object(item.owner).username) && Boolean(item.shortCode || item.caption !== undefined || item.timestamp);
  const row = isPost ? {...object(item.owner),username:item.ownerUsername ?? object(item.owner).username,fullName:item.ownerFullName ?? object(item.owner).fullName,latestPosts:[item]} : item;
  const handle = creatorHandle(row.username);
  if (!handle) return null;
  const clean = (v: unknown, n?: number) => scrubCreatorText(typeof v === "string" && secret ? v.split(secret).join("") : v, n);
  const bio = typeof row.biography === "string" ? row.biography : typeof row.bio === "string" ? row.bio : "";
  const rawPosts: unknown[] = Array.isArray(row.latestPosts) ? row.latestPosts : Array.isArray(row.posts) ? row.posts : row.ownerUsername ? [row] : [];
  const comments: string[] = [], commentIds:string[]=[]; let commentPosts = 0;
  const orderedPosts=[...new Map(rawPosts.map(value=>{const p=object(value);return [String(p.id??p.shortCode??p.url),value] as const;})).values()].sort((a,b)=>{const date=(v:unknown)=>{const p=object(v);return new Date(p.timestamp??p.takenAtTimestamp*1000).getTime()||0;};return date(b)-date(a);});
  const posts = orderedPosts.slice(0, 12).flatMap((value): DiscoveryPost[] => {
    const p = object(value), url = publicCreatorUrl(p.url ?? p.permalink ?? (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null), true);
    if (!url) return [];
    const sample = Array.isArray(p.latestComments) ? p.latestComments.slice(0, 20).map((c: unknown) => clean(object(c).text, 200).toLowerCase()).filter(Boolean) : [];
    if (sample.length) {commentPosts++;commentIds.push(String(p.id ?? p.shortCode ?? url).slice(0,150));} comments.push(...sample);
    const date = new Date(p.timestamp ?? p.takenAtTimestamp * 1000);
    return [{ id: String(p.id ?? p.shortCode ?? url).slice(0, 150), url, caption: clean(p.caption), at: Number.isFinite(date.getTime()) ? date.toISOString() : null,
      likes: count(p.likesCount ?? p.likeCount ?? p.like_count), comments: count(p.commentsCount ?? p.commentCount ?? p.comments_count), thumbnail: creatorImageUrl(p.displayUrl ?? p.thumbnailUrl), location: coarseCreatorLocation(p.locationName ?? object(p.location).name), altText: clean(p.alt ?? p.altText ?? p.accessibilityCaption,800), personPresent:typeof p.personPresent==="boolean"?p.personPresent:null, productOnly:typeof p.productOnly==="boolean"?p.productOnly:null, paidPartnership: p.isSponsored === true || p.isPaidPartnership === true }];
  });
  const text = (bio + " " + String(row.businessCategoryName ?? "")).toLowerCase();
  const kind = /\breseller\b|we resell/.test(text) ? "reseller" : /\bmeme page\b|repost page|reposting/.test(text) ? "repost" : row.isBusinessAccount === true && /shopping|retail|product\/service|brand|shop/.test(text) ? "brand" : /\bcreator\b|\bblogger\b|\bugc\b|personal blog/.test(text) ? "creator" : "unknown";
  let website: string | null = null; try { const u = new URL(row.externalUrl ?? row.website); if (u.protocol === "https:" && !u.username && !u.password) website = u.origin; } catch { /* No saved link. */ }
  const followers=count(row.followersCount ?? row.followers ?? row.followers_count), mediaCount=count(row.postsCount ?? row.mediaCount ?? row.media_count);
  const observed=followers!==null || mediaCount!==null;
  return { handle, name: clean(row.fullName ?? row.name, 100) || handle, bio: clean(bio), website, businessEmail: businessEmail(bio), screening:publicScreening(row,at), private:typeof (row.private ?? row.isPrivate)==="boolean" ? (row.private ?? row.isPrivate) : null, accountKind: kind,
    posts, related: (Array.isArray(row.relatedProfiles) ? row.relatedProfiles : []).slice(0, 100).map((p: unknown) => creatorHandle(typeof p === "string" ? p : object(p).username)).filter((p: string | null): p is string => p !== null), appearsInAds: [],
    audit: comments.length ? { observedAt:at,postIds:commentIds,...commentQuality(comments),sampledPosts: commentPosts, comments: comments.length, repeatedFraction: 1 - new Set(comments).size / comments.length } : null,
    followers, mediaCount, verification: observed ? "Observed (public profile)" : "Unverified", verificationReason: observed ? "Public profile counts; the official check is separate." : "Public profile counts were not returned.", checkedAt: observed ? at : null, discoveredAt: at };
}

/** Extract authors, never tagged profiles. Hashtag datasets contain top and recent posts. */
export function discoveryProfiles(rows: unknown[], at: string, secret = "", includePost?: (post: Record<string, any>) => boolean): DiscoveryProfile[] {
  const authors = new Map<string,Record<string,any>>();
  const visit = (raw: unknown, depth=0) => {
    if(depth>2)return;
    if(secret && JSON.stringify(raw)?.includes(secret))return;
    const row=object(raw), nested=[row.topPosts,row.latestPosts,row.recentPosts].filter(Array.isArray);
    if(!row.username && !row.ownerUsername && !object(row.owner).username && nested.length){for(const posts of nested)for(const post of posts.slice(0,100))visit(post,depth+1);return;}
    if(includePost && !includePost(row))return;
    const isPost=Boolean(row.ownerUsername || object(row.owner).username) && Boolean(row.shortCode || row.caption!==undefined || row.timestamp);
    const owner=isPost ? {...object(row.owner),username:row.ownerUsername??object(row.owner).username,fullName:row.ownerFullName??object(row.owner).fullName} : row;
    const handle=creatorHandle(owner.username);if(!handle)return;
    const prior=authors.get(handle), posts=isPost?[row]:Array.isArray(row.latestPosts)?row.latestPosts:Array.isArray(row.posts)?row.posts:[];
    const unique=new Map<string,any>();
    for(const post of [...(prior?.latestPosts??[]),...posts]){const key=post.id??post.shortCode??post.url;if(key)unique.set(String(key),post);}
    authors.set(handle,{...prior,...owner,latestPosts:[...unique.values()].sort((a,b)=>Date.parse(b.timestamp??"")-Date.parse(a.timestamp??"")).slice(0,12)});
  };
  for(const row of rows)visit(row);
  return [...authors.values()].flatMap(row=>{const p=discoveryProfile(row,at,secret);return p?[p]:[];});
}
export class CreatorVerificationError extends Error {
  constructor(readonly reason: "configuration" | "permissions" | "rate_limited" | "unavailable" | "unsupported") {
    super(({ configuration: "Set up the official creator account check first.", permissions: "The official account check needs renewed access.", rate_limited: "The official account check is waiting for its request limit.", unavailable: "The official account check could not finish.", unsupported: "This public account cannot be verified through the official API." })[reason]);
  }
}
export interface VerificationOptions { env?: Record<string, string | undefined>; fetch?: typeof fetch; now?: () => Date }
export class InstagramCreatorVerifier {
  private env: Record<string, string | undefined>;
  constructor(private options: VerificationOptions = {}) { this.env = options.env ?? process.env; }
  configured() { return Boolean(this.env.EXTER_INSTAGRAM_ACCESS_TOKEN?.trim() && !/[\r\n]/.test(this.env.EXTER_INSTAGRAM_ACCESS_TOKEN!) && /^\d{1,40}$/.test(this.env.EXTER_INSTAGRAM_ACCOUNT_ID ?? "") && /^v\d+\.0$/.test(this.env.META_API_VERSION || "v26.0")); }
  async verify(profile: DiscoveryProfile): Promise<DiscoveryProfile> {
    if (!this.configured()) throw new CreatorVerificationError("configuration");
    if (profile.private || !creatorHandle(profile.handle)) throw new CreatorVerificationError("unsupported");
    assertProxySupport(Boolean(this.options.fetch), this.env);
    const url = new URL(`https://graph.facebook.com/${this.env.META_API_VERSION || "v26.0"}/${this.env.EXTER_INSTAGRAM_ACCOUNT_ID}`);
    url.searchParams.set("fields", `business_discovery.username(${profile.handle}){username,name,biography,website,followers_count,media_count,media.limit(12){id,caption,like_count,comments_count,timestamp,media_type,thumbnail_url,media_url,permalink}}`);
    let response: Response;
    try { response = await (this.options.fetch ?? fetch)(url, { headers: { Authorization: `Bearer ${this.env.EXTER_INSTAGRAM_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(30000), redirect: "manual" }); }
    catch { throw new CreatorVerificationError("unavailable"); }
    const reader = response.body?.getReader(); if (!reader) throw new CreatorVerificationError("unavailable");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error(); } chunks.push(part.value); } }
    catch { throw new CreatorVerificationError("unavailable"); } finally { reader.releaseLock(); }
    let data: Record<string, any>;
    try {
      const body = object(JSON.parse(Buffer.concat(chunks).toString("utf8"))), code=object(body.error).code;
      if (!response.ok || body.error) throw new CreatorVerificationError(response.status===429||[4,17,32,613].includes(code)?"rate_limited":[401,403].includes(response.status)||[10,102,190,200,294].includes(code)?"permissions":response.status===400?"unsupported":"unavailable");
      data = object(body.business_discovery);
    } catch(e) { if(e instanceof CreatorVerificationError)throw e;throw new CreatorVerificationError("unavailable"); }
    if (creatorHandle(data.username) !== profile.handle || count(data.followers_count) === null) throw new CreatorVerificationError("unsupported");
    if(JSON.stringify(data).includes(this.env.EXTER_INSTAGRAM_ACCESS_TOKEN!))throw new CreatorVerificationError("unavailable");
    const secret = this.env.EXTER_INSTAGRAM_ACCESS_TOKEN!, clean = (v: unknown) => scrubCreatorText(typeof v === "string" ? v.split(secret).join("") : v);
    const posts = (Array.isArray(data.media?.data) ? data.media.data : []).slice(0, 12).flatMap((value: unknown): DiscoveryPost[] => {
      const p = object(value), url = publicCreatorUrl(p.permalink, true), date = typeof p.timestamp === "string" ? new Date(p.timestamp) : null;
      if (!url || !/^\d{1,50}$/.test(String(p.id))) return [];
      const earlier = profile.posts.find(e => e.id === String(p.id) || e.url.replace(/\/$/, "") === url.replace(/\/$/, ""));
      return [{ id: String(p.id), url, caption: clean(p.caption), at: date && Number.isFinite(date.getTime()) ? date.toISOString() : null, likes: count(p.like_count), comments: count(p.comments_count), thumbnail: creatorImageUrl(p.thumbnail_url ?? (p.media_type !== "VIDEO" ? p.media_url : null)) ?? earlier?.thumbnail ?? null, location: earlier?.location, paidPartnership: earlier?.paidPartnership,altText:earlier?.altText,personPresent:earlier?.personPresent,productOnly:earlier?.productOnly }];
    });
    let website=profile.website; if(data.website!==undefined){website=null;try{const u=new URL(data.website);if(u.protocol==="https:"&&!u.username&&!u.password)website=u.origin;}catch{ /* Keep an absent official link absent. */ }}
    const checkedAt=(this.options.now?.() ?? new Date()).toISOString();
    return { ...profile, website,private:false,screening:publicScreening(data,checkedAt,profile.screening), name: clean(data.name).slice(0, 100) || profile.name, bio: typeof data.biography==="string"?clean(data.biography):profile.bio,
      followers: count(data.followers_count), mediaCount: count(data.media_count), posts, verification: "Verified", verificationReason: "Numbers checked through the official API.", checkedAt };
  }
}
