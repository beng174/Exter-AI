import { reserveCost as reserveProviderCost } from "../infrastructure/budget.js";
import { infrastructureDatabase } from "../infrastructure/database.js";
import { assertProxySupport } from "../connectors/http.js";
import type { CreatorPost, CreatorPublicProfile } from "../../shared/creator-research.js";
import { CreatorProviderError, type CreatorDiscoveryProvider, type CreatorPlatform, type CreatorProviderAccounting, type CreatorProviderStatus, type CreatorSearchInput, type CreatorSearchResult } from "./types.js";

const API = "https://api.apify.com";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_DATASET_PAGES = 2;
const PAGE_SIZE = 100;
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const count = (value: unknown): number | null => {
  const parsed = typeof value === "string" && /^\d{1,16}(?:,\d{3})*$/.test(value) ? Number(value.replaceAll(",", "")) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};
const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const handleValue = (value: unknown): string | null => typeof value === "string" && /^[A-Za-z0-9._]{1,64}$/.test(value.replace(/^@/, "")) ? value.replace(/^@/, "").toLowerCase() : null;
const profileUrl = (platform: CreatorPlatform, handle: string) => platform === "instagram" ? `https://www.instagram.com/${handle}/` : `https://www.tiktok.com/@${handle}`;

export interface ApifyCreatorOptions {
  token?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  reserve?: (amountGbp: number, context: { platform: CreatorPlatform; actorId: string }) => Promise<{ reservationId: string; reservedGbp: number }>;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  now?: () => Date;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  maxPolls?: number;
}

function actorId(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace("/", "~");
  return /^[A-Za-z0-9_-]{1,100}(?:~[A-Za-z0-9_-]{1,100})?$/.test(normalized) ? normalized : null;
}
function scrubText(value: unknown, token: string, limit: number): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.split(token).join("[REDACTED]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:apify_api_[A-Za-z0-9]+|AIza[0-9A-Za-z_-]{35})\b/g, "[REDACTED]")
    .replace(/((?:api[-_]?key|access[-_]?token|authorization|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, raw => { try { const url = new URL(raw); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.href; } catch { return "[REDACTED URL]"; } }).slice(0, limit).trim();
}
function publicPostUrl(value: unknown, platform: CreatorPlatform, handle: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = platform === "instagram" ? "instagram.com" : "tiktok.com";
    if (url.protocol !== "https:" || ![host, `www.${host}`].includes(url.hostname) || url.port || url.username || url.password) return null;
    if (platform === "instagram" ? !/^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) : !new RegExp(`^/@${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/video/\\d+/?$`, "i").test(url.pathname)) return null;
    return `https://www.${host}${url.pathname}`;
  } catch { return null; }
}
function timestamp(value: unknown): string | null {
  const date = typeof value === "number" ? new Date(value < 100000000000 ? value * 1000 : value) : typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function firstCount(...values: unknown[]): number | null {
  for (const value of values) { const parsed = count(value); if (parsed !== null) return parsed; }
  return null;
}

/** Normalizes only public, observed fields. Missing counts remain null, never estimates. */
export function normaliseApifyCreators(rows: unknown[], platform: CreatorPlatform, options: { observedAt: string; token?: string; maxProfiles: number; maxPostsPerProfile: number }): CreatorPublicProfile[] {
  const profiles = new Map<string, CreatorPublicProfile>();
  const token = options.token || "\u0000never-a-public-field\u0000";
  for (const raw of rows) {
    const row = record(raw), author = record(row.authorMeta ?? row.author ?? row.owner), authorStats = record(row.authorStats);
    const handle = [row.username, row.ownerUsername, author.username, author.uniqueId, author.unique_id, platform === "tiktok" ? author.name : null].map(handleValue).find(Boolean);
    if (!handle || handle.includes(token.toLowerCase())) continue;
    const url = profileUrl(platform, handle);
    const followers = firstCount(row.followersCount, row.followers, author.fans, author.followersCount, author.followerCount, authorStats.followerCount);
    const existing = profiles.get(handle);
    if (!existing && profiles.size >= options.maxProfiles) continue;
    const profile: CreatorPublicProfile = existing || {
      platform, handle, displayName: scrubText(row.fullName ?? author.nickName ?? author.nickname ?? author.fullName, token, 200) || handle,
      profileUrl: url, sourceUrl: url, evidenceUrl: url, bio: scrubText(row.biography ?? author.signature ?? author.bio, token, 4000),
      followers, following: firstCount(row.followsCount, row.following, author.following, authorStats.followingCount),
      postsCount: firstCount(row.postsCount, author.video, author.videoCount, authorStats.videoCount),
      country: scrubText(row.country ?? author.country, token, 100), category: scrubText(row.businessCategoryName ?? row.category ?? author.category, token, 200),
      observedAt: options.observedAt, recentPosts: [], evidence: [],
    };
    if (profile.followers === null && followers !== null) profile.followers = followers;
    profiles.set(handle, profile);
    const candidates = [...(Array.isArray(row.latestPosts) ? row.latestPosts.slice(0, 100) : []), ...(Array.isArray(row.recentPosts) ? row.recentPosts.slice(0, 100) : []), row];
    for (const candidate of candidates) {
      const post = record(candidate), stats = record(post.stats);
      let postUrl = publicPostUrl(post.webVideoUrl ?? post.url ?? post.postUrl, platform, handle);
      if (!postUrl && platform === "instagram" && typeof post.shortCode === "string" && /^[A-Za-z0-9_-]+$/.test(post.shortCode)) postUrl = `https://www.instagram.com/p/${post.shortCode}/`;
      if (!postUrl || postUrl.toLowerCase().includes(token.toLowerCase())) continue;
      if (profile.recentPosts.some(item => item.url === postUrl)) continue;
      const entry: CreatorPost = {
        id: (typeof post.id === "string" || typeof post.id === "number") && /^[A-Za-z0-9_-]{1,100}$/.test(String(post.id)) && !String(post.id).toLowerCase().includes(token.toLowerCase()) ? String(post.id) : postUrl.split("/").filter(Boolean).at(-1)!,
        url: postUrl, publishedAt: timestamp(post.timestamp ?? post.createTimeISO ?? post.createTime ?? post.takenAtTimestamp),
        caption: scrubText(post.caption ?? post.text ?? post.desc, token, 4000),
        views: firstCount(post.videoViewCount, post.videoPlayCount, post.playCount, stats.playCount, stats.viewCount),
        likes: firstCount(post.likesCount, post.diggCount, post.likeCount, stats.diggCount, stats.likeCount),
        comments: firstCount(post.commentsCount, post.commentCount, stats.commentCount), shares: firstCount(post.shareCount, post.sharesCount, stats.shareCount),
        observedAt: options.observedAt, evidenceUrl: postUrl,
      };
      profile.recentPosts.push(entry);
    }
  }
  for (const profile of profiles.values()) {
    // Public actors can return posts out of order; rank the observed sample by date.
    profile.recentPosts.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
    profile.recentPosts = profile.recentPosts.slice(0, options.maxPostsPerProfile);
    profile.metricCoverage = { postsSampled: profile.recentPosts.length, postsWithViews: profile.recentPosts.filter(post => post.views !== null).length, postsWithLikes: profile.recentPosts.filter(post => post.likes !== null).length, postsWithComments: profile.recentPosts.filter(post => post.comments !== null).length, postsWithShares: profile.recentPosts.filter(post => post.shares !== null).length, followersAvailable: profile.followers !== null };
    profile.evidence = ["followers", "following", "postsCount", "country", "category"].map(field => ({ field, value: profile[field as "followers" | "following" | "postsCount" | "country" | "category"], evidenceUrl: profile.evidenceUrl, observedAt: options.observedAt }));
    for (const post of profile.recentPosts) for (const field of ["views", "likes", "comments", "shares"] as const)
      profile.evidence.push({ field: `post:${post.id}:${field}`, value: post[field], evidenceUrl: post.evidenceUrl, observedAt: options.observedAt });
  }
  return [...profiles.values()];
}

/** Compatible with Instagram scraper details/search and TikTok scraper public-post outputs.
 * No network work occurs until search is explicitly called by an authenticated action. */
export class ApifyCreatorProvider implements CreatorDiscoveryProvider {
  private readonly env: Record<string, string | undefined>;
  private readonly token: string;
  private readonly timeout: number;
  private readonly pollInterval: number;
  private readonly maxPolls: number;
  constructor(private readonly options: ApifyCreatorOptions = {}) {
    this.env = options.env ?? process.env;
    this.token = options.token ?? this.env.APIFY_TOKEN ?? "";
    this.timeout = options.requestTimeoutMs ?? 30000;
    this.pollInterval = options.pollIntervalMs ?? 2000;
    this.maxPolls = options.maxPolls ?? 60;
    if (!Number.isInteger(this.timeout) || this.timeout < 1 || this.timeout > 60000 || !Number.isInteger(this.pollInterval) || this.pollInterval < 0 || this.pollInterval > 10000 || !Number.isInteger(this.maxPolls) || this.maxPolls < 1 || this.maxPolls > 120)
      throw new CreatorProviderError("configuration", "Apify timeout or polling configuration is invalid.");
  }
  status(): CreatorProviderStatus {
    const platforms = (["instagram", "tiktok"] as const).filter(platform => !!actorId(this.env[`APIFY_${platform.toUpperCase()}_ACTOR_ID`]));
    const reserve = this.reserveAmount();
    const configured = Boolean(this.token.trim() && !/[\r\n]/.test(this.token) && reserve !== null && platforms.length);
    return { configured, platforms: configured ? platforms : [], message: configured
      ? "Apify public creator discovery is configured. Actor access and public metric availability are verified only when you run a search."
      : "Configure APIFY_TOKEN, APIFY_INSTAGRAM_ACTOR_ID and/or APIFY_TIKTOK_ACTOR_ID (compatible public scraper actors), and a conservative positive APIFY_REQUEST_RESERVE_GBP. A data-provider budget and database are required before paid dispatch." };
  }
  private reserveAmount(): number | null {
    const raw = this.env.APIFY_REQUEST_RESERVE_GBP;
    const amount = raw?.trim() ? Number(raw) : NaN;
    return Number.isFinite(amount) && amount > 0 && amount <= 10000 ? amount : null;
  }
  private async json(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const url = new URL(path, API);
    if (url.origin !== API || url.username || url.password || url.hash) throw new CreatorProviderError("configuration", "Apify requested an unsupported destination.");
    const timeout = AbortSignal.timeout(this.timeout);
    let response: Response;
    try { response = await (this.options.fetch ?? fetch)(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${this.token}` }, redirect: "manual", signal: signal ? AbortSignal.any([signal, timeout]) : timeout }); }
    catch { throw new CreatorProviderError(signal?.aborted ? "cancelled" : "unavailable", signal?.aborted ? "Creator discovery was cancelled; its reserved cost remains until reconciled." : "Apify request timed out or could not be reached. No automatic paid retry was started; its conservative reserve is retained."); }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new CreatorProviderError([401, 403].includes(response.status) ? "authentication" : response.status === 429 ? "rate_limited" : "unavailable", response.status >= 300 && response.status < 400 ? "Apify redirected the request; credentials were not forwarded." : `Apify request failed (HTTP ${response.status}). Check actor access and the provider account. The conservative reserve is retained; no paid retry was started.`);
    }
    if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES) { await response.body?.cancel().catch(() => {}); throw new CreatorProviderError("invalid_output", "Apify response exceeded the supported size limit."); }
    const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    if (!reader) throw new CreatorProviderError("invalid_output", "Apify returned an empty response.");
    try {
      while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new CreatorProviderError("invalid_output", "Apify response exceeded the supported size limit."); } chunks.push(item.value); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) { if (error instanceof CreatorProviderError) throw error; throw new CreatorProviderError("invalid_output", "Apify returned unreadable or invalid JSON."); }
    finally { reader.releaseLock(); }
  }
  private async pause(signal?: AbortSignal) {
    if (signal?.aborted) throw new CreatorProviderError("cancelled", "Creator discovery was cancelled.");
    if (this.options.sleep) return this.options.sleep(this.pollInterval, signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, this.pollInterval);
      function abort() { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new CreatorProviderError("cancelled", "Creator discovery was cancelled.")); }
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  async search(input: CreatorSearchInput): Promise<CreatorSearchResult> {
    const accounting: CreatorProviderAccounting = { reservedCostGbp: null, billedCostGbp: null, requestAttempts: 0, runIds: [] };
    if (!["instagram", "tiktok"].includes(input.platform) || !input.country?.trim() || input.country.length > 100 || !input.category?.trim() || input.category.length > 200 || (input.query?.length ?? 0) > 400)
      throw new CreatorProviderError("configuration", "Provide a platform, country and category within the supported search limits.", accounting);
    const actor = actorId(this.env[`APIFY_${input.platform.toUpperCase()}_ACTOR_ID`]);
    const reserveAmount = this.reserveAmount();
    if (!this.token.trim() || /[\r\n]/.test(this.token) || !actor || reserveAmount === null) throw new CreatorProviderError("configuration", this.status().message!, accounting);
    const maxProfiles = input.maxProfiles ?? 5, maxPosts = input.maxPostsPerProfile ?? 12;
    if (!Number.isInteger(maxProfiles) || maxProfiles < 1 || maxProfiles > 20 || !Number.isInteger(maxPosts) || maxPosts < 1 || maxPosts > 20 || (input.seedHandles?.length ?? 0) > 20 || input.seedHandles?.some(handle => !handleValue(handle))) throw new CreatorProviderError("configuration", "Creator search supports 1–20 profiles, 1–20 recent posts and valid explicit seed handles.", accounting);
    if (input.signal?.aborted) throw new CreatorProviderError("cancelled", "Creator discovery was cancelled before dispatch.", accounting);
    const operationSignal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000);
    assertProxySupport(Boolean(this.options.fetch), this.env);
    const query = [input.query?.trim() || input.category.trim(), input.country.trim()].join(" ");
    const handles = input.seedHandles?.map(handle => handleValue(handle)!);
    const actorInput = input.platform === "instagram" ? {
      resultsType: "details", resultsLimit: maxProfiles, addParentData: true,
      ...(handles?.length ? { directUrls: handles.map(handle => profileUrl(input.platform, handle)) } : { search: query, searchType: "user", searchLimit: maxProfiles }),
    } : { ...(handles?.length ? { profiles: handles } : { searchQueries: [query] }), resultsPerPage: Math.min(PAGE_SIZE, maxProfiles * maxPosts), shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false };
    let runId: string | null = null, completed = false;
    try {
      try {
        const reservation = this.options.reserve ? await this.options.reserve(reserveAmount, {platform:input.platform,actorId:actor}) : { reservationId: await reserveProviderCost(infrastructureDatabase(), "data_providers", "apify", reserveAmount), reservedGbp: reserveAmount };
        if (!reservation || typeof reservation.reservationId !== "string" || !reservation.reservationId || reservation.reservationId.length > 200 || !Number.isFinite(reservation.reservedGbp) || reservation.reservedGbp < reserveAmount) throw new Error("Reservation was not confirmed.");
        accounting.reservedCostGbp = reservation.reservedGbp;
      } catch { throw new CreatorProviderError("budget_paused", "Paid creator discovery is paused. Configure the data-provider monthly budget, DATABASE_URL and APIFY_REQUEST_RESERVE_GBP before retrying.", accounting); }
      accounting.requestAttempts++;
      let run = record(record(await this.json(`/v2/acts/${actor}/runs?timeout=120`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(actorInput) }, operationSignal)).data);
      if (!validId(run.id)) throw new CreatorProviderError("invalid_output", "Apify did not return a valid actor run ID.");
      runId = run.id; accounting.runIds.push(runId);
      for (let poll = 0; run.status !== "SUCCEEDED" && poll < this.maxPolls; poll++) {
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) throw new CreatorProviderError("unavailable", `Apify public creator collection ended with status ${run.status}; no metrics were fabricated.`);
        await this.pause(operationSignal);
        run = record(record(await this.json(`/v2/actor-runs/${runId}`, {}, operationSignal)).data);
        if (run.id !== runId) throw new CreatorProviderError("invalid_output", "Apify changed the actor run identity while polling.");
      }
      if (run.status !== "SUCCEEDED") throw new CreatorProviderError("unavailable", "Apify creator collection exceeded the bounded polling window. Its conservative budget reserve remains until reconciled.");
      completed = true;
      if (!validId(run.defaultDatasetId)) throw new CreatorProviderError("invalid_output", "Apify did not expose a valid result dataset.");
      const rows: unknown[] = [];
      for (let page = 0; page < MAX_DATASET_PAGES; page++) {
        const items = await this.json(`/v2/datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {}, operationSignal);
        if (!Array.isArray(items) || items.length > PAGE_SIZE) throw new CreatorProviderError("invalid_output", "Apify returned an unsupported creator dataset page.");
        rows.push(...items); if (items.length < PAGE_SIZE) break;
      }
      const observedAt = (this.options.now?.() ?? new Date()).toISOString();
      const profiles = normaliseApifyCreators(rows, input.platform, { observedAt, token: this.token, maxProfiles, maxPostsPerProfile: maxPosts });
      const warnings = ["Country and category are search terms, not verified creator residence, audience geography or a guarantee of category fit.", "Metrics are public observations of the returned recent-post sample. Missing metrics remain unavailable; no sales or conversion data is available.", "GBP cost is a conservative configured reservation, not an Apify invoice or confirmed billed amount."];
      if (rows.length === MAX_DATASET_PAGES * PAGE_SIZE) warnings.push("Dataset pagination was capped at 200 public records; additional records were not fetched.");
      if (!profiles.length) warnings.push("The actor returned no supported public creator profiles. Verify actor compatibility, search terms and public-access restrictions.");
      return { profiles, accounting, warnings };
    } catch (error) {
      if (error instanceof CreatorProviderError) { error.accounting = accounting; throw error; }
      throw new CreatorProviderError("unavailable", "Public creator collection could not complete; earlier saved observations are preserved.", accounting);
    } finally {
      if (runId && !completed) {
        // An abort controls an existing reserved run; it never starts another actor.
        try { await this.json(`/v2/actor-runs/${runId}/abort?gracefully=true`, {method:"POST"}); } catch { /* Keep the reserve when provider termination cannot be confirmed. */ }
      }
    }
  }
}
