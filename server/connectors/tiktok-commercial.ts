import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { boundedPublicBody, parsePublicJson } from "./public-json.js";
const API = "https://open.tiktokapis.com";
export const TIKTOK_AD_FIELDS = "ad.id,ad.first_shown_date,ad.last_shown_date,ad.status,ad.status_statement,ad.videos,ad.image_urls,ad.reach,advertiser.business_id,advertiser.business_name,advertiser.paid_for_by";
const COUNTRIES = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE NO IS LI GB CH".split(" "));
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const credential = (value: string | undefined) => Boolean(value?.trim() && !/[\r\n]/.test(value));
export function tiktokCommercialStatus(env: Record<string, string | undefined> = process.env) { const configured = credential(env.TIKTOK_CLIENT_KEY) && credential(env.TIKTOK_CLIENT_SECRET); return { platform: "TikTok", method: "Commercial Content API", status: configured ? "configured" : "not_connected", connected: false, configured, message: configured ? "TikTok credentials are configured; application approval and endpoint access are verified on an actual request." : "TikTok not connected. Configure TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in secure runtime settings.", coverage: "Commercial ad-library query, subject to approved research.adlib.basic access and supported countries. Not private advertiser performance reporting." }; }
export class TikTokCommercialError extends Error {
    constructor(public code: "not_connected" | "configuration" | "authentication" | "rate_limited" | "unavailable" | "schema", message: string, public httpStatus?: number) { super(message); }
}
export interface TikTokCommercialQuery {
    searchTerm?: string;
    countries: string[];
    publishedFrom: string;
    publishedTo: string;
    status?: "ACTIVE" | "INACTIVE";
    maxCount?: number;
    cursor?: {
        searchId: string;
        queryHash: string;
        pageFingerprint: string;
    };
    signal?: AbortSignal;
}
export interface TikTokCommercialAd {
    id: string;
    advertiserId: string | null;
    advertiserName: string | null;
    firstShownDate: string | null;
    lastShownDate: string | null;
    active: boolean | null;
    reach: {
        basis: "observed" | "estimated" | "unavailable";
        value: number | null;
        display: string | null;
    };
    media: {
        videos: string[];
        images: string[];
    };
}
function identifier(value: unknown): string | null { if (typeof value === "string" && /^\d{1,40}$/.test(value))
    return value; if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value); return null; }
function sourceDate(value: unknown): string | null { const text = String(value ?? "").replaceAll("-", ""); if (!/^\d{8}$/.test(text))
    return null; const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`; const date = new Date(`${iso}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null; }
function mediaUrl(value: unknown, secrets: string[]): string | null { if (typeof value !== "string" || value.length > 10000 || secrets.some(secret => secret && value.includes(secret)))
    return null; try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !isIP(url.hostname) && !/(?:^|\.)(?:localhost|local|internal|lan)$/.test(url.hostname) ? url.href : null;
}
catch {
    return null;
} }
export function normaliseTikTokCommercialAd(value: unknown, secrets: string[] = []): TikTokCommercialAd {
    const item = record(value), ad = record(item.ad), advertiser = record(item.advertiser), id = identifier(ad.id);
    if (!id)
        throw new TikTokCommercialError("schema", "TikTok returned an unsupported ad identifier.");
    const raw = record(ad.reach).unique_users_seen ?? record(ad.reach).unique_user_seen, display = typeof raw === "string" && raw.length <= 40 ? raw : null, exact = typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : typeof raw === "string" && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
    const text = (value: unknown) => typeof value === "string" && value.length <= 400 && !secrets.some(secret => secret && value.includes(secret)) ? value : null;
    return { id, advertiserId: identifier(advertiser.business_id ?? advertiser.buisness_id), advertiserName: text(advertiser.business_name), firstShownDate: sourceDate(ad.first_shown_date), lastShownDate: sourceDate(ad.last_shown_date), active: typeof ad.status === "string" ? ad.status.toLowerCase() === "active" ? true : ad.status.toLowerCase() === "inactive" ? false : null : null, reach: { basis: exact !== null ? "observed" : display && /^\d+(?:\.\d+)?[KM+]$/i.test(display) ? "estimated" : "unavailable", value: exact, display: text(display) }, media: { videos: (Array.isArray(ad.videos) ? ad.videos : []).flatMap(value => { const url = mediaUrl(record(value).url, secrets); return url ? [url] : []; }), images: (Array.isArray(ad.image_urls) ? ad.image_urls : []).flatMap(value => { const url = mediaUrl(value, secrets); return url ? [url] : []; }) } };
}
export class TikTokCommercialConnector {
    #accessToken: string | null = null;
    #expiresAt = 0;
    #pendingToken: Promise<string> | null = null;
    #env: Record<string, string | undefined>;
    private readonly fetcher: typeof fetch;
    private readonly now: () => number;
    constructor(options: {
        env?: Record<string, string | undefined>;
        fetch?: typeof fetch;
        now?: () => number;
    } = {}) { this.#env = options.env || process.env; this.fetcher = options.fetch || fetch; this.now = options.now || Date.now; }
    status() { return tiktokCommercialStatus(this.#env); }
    private async json(path: string, init: RequestInit, signal?: AbortSignal) {
        let response: Response;
        try {
            response = await this.fetcher(new URL(path, API), { ...init, redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
        }
        catch {
            throw new TikTokCommercialError("unavailable", "TikTok request could not complete; no raw provider error is exposed.");
        }
        if (!response.ok) {
            if (response.status === 401) {
                this.#accessToken = null;
                this.#expiresAt = 0;
            }
            throw new TikTokCommercialError([401, 403].includes(response.status) ? "authentication" : response.status === 429 ? "rate_limited" : "unavailable", `TikTok request failed (HTTP ${response.status}); verify approval, credentials and rate limits.`, response.status);
        }
        try {
            return record(parsePublicJson(await boundedPublicBody(response, path.startsWith("/v2/oauth/") ? 65536 : 2 * 1024 * 1024)));
        }
        catch {
            throw new TikTokCommercialError("schema", "TikTok returned an invalid or oversized JSON response.");
        }
    }
    private async token(signal?: AbortSignal): Promise<string> {
        if (!this.status().configured)
            throw new TikTokCommercialError("not_connected", "TikTok not connected.");
        if (this.#accessToken && this.#expiresAt > this.now() + 60000)
            return this.#accessToken;
        if (this.#pendingToken)
            return this.#pendingToken;
        const request = (async () => {
            const body = await this.json("/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: this.#env.TIKTOK_CLIENT_KEY!, client_secret: this.#env.TIKTOK_CLIENT_SECRET!, grant_type: "client_credentials" }).toString() }, signal);
            if (typeof body.access_token !== "string" || !body.access_token || body.access_token.length > 8192 || /[\r\n]/.test(body.access_token) || typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0 || body.expires_in > 86400)
                throw new TikTokCommercialError("authentication", "TikTok client token was not granted. Verify approved API access.");
            this.#accessToken = body.access_token;
            this.#expiresAt = this.now() + body.expires_in * 1000;
            return body.access_token;
        })();
        this.#pendingToken = request;
        try {
            return await request;
        }
        finally {
            if (this.#pendingToken === request)
                this.#pendingToken = null;
        }
    }
    async page(query: TikTokCommercialQuery) {
        if (!this.status().configured)
            throw new TikTokCommercialError("not_connected", "TikTok not connected.");
        const from = sourceDate(query.publishedFrom), to = sourceDate(query.publishedTo), maxCount = query.maxCount ?? 10;
        if (!from || !to || from > to || Date.parse(from) < this.now() - 366 * 86400000 || Date.parse(to) > this.now() + 86400000 || !Array.isArray(query.countries) || !query.countries.length || query.countries.length > 32 || query.countries.some(country => !COUNTRIES.has(country)) || query.searchTerm !== undefined && (typeof query.searchTerm !== "string" || !query.searchTerm.trim() || query.searchTerm.length > 50) || !Number.isSafeInteger(maxCount) || maxCount < 1 || maxCount > 10 || query.status !== undefined && !["ACTIVE", "INACTIVE"].includes(query.status))
            throw new TikTokCommercialError("configuration", "Provide a supported country, date range within one year, and a query of at most 50 characters.");
        const filters = { ad_published_date_range: { min: from.replaceAll("-", ""), max: to.replaceAll("-", "") }, country_code_list: [...new Set(query.countries)].sort(), ...(query.status ? { ad_status: query.status } : {}) }, input = { filters, ...(query.searchTerm ? { search_term: query.searchTerm.trim(), search_type: "exact_phrase" } : {}), max_count: maxCount };
        const queryHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
        if (query.cursor && (query.cursor.queryHash !== queryHash || typeof query.cursor.searchId !== "string" || !query.cursor.searchId || query.cursor.searchId.length > 2000 || !/^[a-f0-9]{64}$/.test(query.cursor.pageFingerprint)))
            throw new TikTokCommercialError("configuration", "A TikTok search cursor belongs to a different or unsupported query.");
        const token = await this.token(query.signal), body = await this.json(`/v2/research/adlib/ad/query/?fields=${encodeURIComponent(TIKTOK_AD_FIELDS)}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...input, ...(query.cursor ? { search_id: query.cursor.searchId } : {}) }) }, query.signal), error = record(body.error);
        if (error.code !== undefined && error.code !== "ok") {
            if (error.code === "access_token_invalid" || error.code === "access_token_expired") {
                this.#accessToken = null;
                this.#expiresAt = 0;
            }
            throw new TikTokCommercialError(error.code === "rate_limit_exceeded" ? "rate_limited" : "authentication", "TikTok did not grant the ad-library query. Verify token scopes, limits and application approval.");
        }
        const data = record(body.data);
        if (!Array.isArray(data.ads) || data.ads.length > maxCount || ![true, false, "true", "false"].includes(data.has_more as boolean))
            throw new TikTokCommercialError("schema", "TikTok returned an unsupported ad page.");
        const hasMore = data.has_more === true || data.has_more === "true", secrets = [this.#env.TIKTOK_CLIENT_KEY!, this.#env.TIKTOK_CLIENT_SECRET!, token];
        const ads = data.ads.map(row => normaliseTikTokCommercialAd(row, secrets));
        // search_id identifies cached search state and can remain unchanged.
        // Detect no progress from repeated ad IDs instead of assuming cursor rotation.
        const pageFingerprint = createHash("sha256").update(JSON.stringify(ads.map(ad => ad.id).sort())).digest("hex");
        if (query.cursor?.pageFingerprint === pageFingerprint && hasMore)
            throw new TikTokCommercialError("schema", "TikTok returned a repeating result page.");
        let cursor: null | {
            searchId: string;
            queryHash: string;
            pageFingerprint: string;
        } = null;
        if (hasMore) {
            if (typeof data.search_id !== "string" || !data.search_id || data.search_id.length > 2000 || secrets.some(secret => String(data.search_id).includes(secret)))
                throw new TikTokCommercialError("schema", "TikTok returned an unsupported search cursor.");
            cursor = { searchId: data.search_id, queryHash, pageFingerprint };
        }
        return { ads, cursor, observedAt: new Date(this.now()).toISOString(), source: "TikTok Commercial Content API", limitations: ["Rounded reach strings are retained as reported displays; no exact count or invented range is inferred.", "Media transport URLs are ephemeral worker inputs and must not be logged or exported.", "Fixture-tested protocol handling does not establish approved live access."] };
    }
}
