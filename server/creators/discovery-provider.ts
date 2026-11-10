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
export function discoveryProfile(raw: unknown, at: string, secret = ""): DiscoveryProfile | null {
  if(secret && JSON.stringify(raw)?.includes(secret))return null;
  const row = object(raw), handle = creatorHandle(row.username ?? row.ownerUsername ?? object(row.owner).username);
  if (!handle) return null;
  const clean = (v: unknown, n?: number) => scrubCreatorText(typeof v === "string" && secret ? v.split(secret).join("") : v, n);
  const bio = typeof row.biography === "string" ? row.biography : typeof row.bio === "string" ? row.bio : "";
  const rawPosts: unknown[] = Array.isArray(row.latestPosts) ? row.latestPosts : Array.isArray(row.posts) ? row.posts : row.ownerUsername ? [row] : [];
  const comments: string[] = []; let commentPosts = 0;
  const posts = rawPosts.slice(0, 12).flatMap((value): DiscoveryPost[] => {
    const p = object(value), url = publicCreatorUrl(p.url ?? p.permalink ?? (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null), true);
    if (!url) return [];
    const sample = Array.isArray(p.latestComments) ? p.latestComments.slice(0, 20).map((c: unknown) => clean(object(c).text, 200).toLowerCase()).filter(Boolean) : [];
    if (sample.length) commentPosts++; comments.push(...sample);
    const date = new Date(p.timestamp ?? p.takenAtTimestamp * 1000);
    return [{ id: String(p.id ?? p.shortCode ?? url).slice(0, 150), url, caption: clean(p.caption), at: Number.isFinite(date.getTime()) ? date.toISOString() : null,
      likes: null, comments: null, thumbnail: creatorImageUrl(p.displayUrl ?? p.thumbnailUrl), location: coarseCreatorLocation(p.locationName ?? object(p.location).name), paidPartnership: p.isSponsored === true || p.isPaidPartnership === true }];
  });
  const text = (bio + " " + String(row.businessCategoryName ?? "")).toLowerCase();
  const kind = /\breseller\b|we resell/.test(text) ? "reseller" : /\bmeme page\b|repost page|reposting/.test(text) ? "repost" : row.isBusinessAccount === true && /shopping|retail|product\/service|brand|shop/.test(text) ? "brand" : /\bcreator\b|\bblogger\b|\bugc\b|personal blog/.test(text) ? "creator" : "unknown";
  let website: string | null = null; try { const u = new URL(row.externalUrl ?? row.website); if (u.protocol === "https:" && !u.username && !u.password) website = u.origin; } catch { /* No saved link. */ }
  return { handle, name: clean(row.fullName ?? row.name, 100) || handle, bio: clean(bio), website, businessEmail: businessEmail(bio), private: row.private === true || row.isPrivate === true, accountKind: kind,
    posts, related: (Array.isArray(row.relatedProfiles) ? row.relatedProfiles : []).slice(0, 100).map((p: unknown) => creatorHandle(typeof p === "string" ? p : object(p).username)).filter((p: string | null): p is string => p !== null), appearsInAds: [],
    audit: comments.length ? { sampledPosts: commentPosts, comments: comments.length, repeatedFraction: 1 - new Set(comments).size / comments.length } : null,
    followers: null, mediaCount: null, verification: "Unverified", verificationReason: "Official numbers have not been checked.", checkedAt: null, discoveredAt: at };
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
      return [{ id: String(p.id), url, caption: clean(p.caption), at: date && Number.isFinite(date.getTime()) ? date.toISOString() : null, likes: count(p.like_count), comments: count(p.comments_count), thumbnail: creatorImageUrl(p.thumbnail_url ?? (p.media_type !== "VIDEO" ? p.media_url : null)) ?? earlier?.thumbnail ?? null, location: earlier?.location, paidPartnership: earlier?.paidPartnership }];
    });
    return { ...profile, name: clean(data.name).slice(0, 100) || profile.name, bio: clean(data.biography) || profile.bio,
      followers: count(data.followers_count), mediaCount: count(data.media_count), posts, verification: "Verified", verificationReason: "Numbers checked through the official API.", checkedAt: (this.options.now?.() ?? new Date()).toISOString() };
  }
}
