import { access } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext } from "playwright-core";

export const VALENTTE_PAGE_ID = "172851066181411";
export class SmokeSourceError extends Error {
  constructor(public code: string, message: string, public sourceHttpStatus?: number) { super(message); }
}
export interface SmokeSourceResolveOptions { refresh?: boolean }
export type SmokeCreative =
  | { kind: "video"; videoUrl: string }
  | { kind: "image"; imageUrls: string[] }
  | { kind: "carousel"; imageUrls: string[] }
  | { kind: "unknown"; reason: string; candidateKind?: "video" | "image" | "carousel" };
export interface SmokeSnapshot {
  url: string;
  status: number;
  scripts: string[];
}
export interface PublicValentteVideoSourceOptions {
  /** Test seam for reading an ordinary public snapshot, without browser/network work. */
  readSnapshot?: (url: string) => Promise<SmokeSnapshot>;
}
function snapshotHttpFailure(status: number) {
  const details: Record<number, [string, string]> = {
    401: ["source_unauthorized", "Meta requires authorization to read this ad snapshot (HTTP 401)."],
    403: ["source_forbidden", "Meta refused access to this ad snapshot (HTTP 403)."],
    404: ["source_not_found", "The ad snapshot was not found (HTTP 404)."],
    408: ["source_timeout", "Meta timed out while reading this ad snapshot (HTTP 408)."],
    410: ["source_expired", "The ad snapshot has expired or was removed (HTTP 410)."],
    429: ["source_rate_limited", "Meta rate-limited this snapshot request (HTTP 429). Retry later."],
  };
  const [code, message] = details[status] || ["source_http_error", `Meta returned HTTP ${status} for this ad snapshot. Retry later.`];
  return new SmokeSourceError(code, message, status);
}
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
function approvedMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length >= 20000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname.endsWith(".fbcdn.net");
  } catch { return false; }
}
function firstImage(value: unknown, imageObject = false, depth = 0): string | null {
  if (depth > 8) return null;
  if (approvedMediaUrl(value)) return value;
  const row = object(value);
  return [row.original_image_url, row.resized_image_url, row.image_url, ...(imageObject ? [row.uri, row.url] : []), row.image]
    .map(candidate => approvedMediaUrl(candidate) ? candidate : null).find(Boolean) ||
    (row.image && typeof row.image === "object" ? firstImage(row.image, true, depth + 1) : null);
}
function creativeOf(snapshot: Record<string, any>, row: Record<string, any>): SmokeCreative {
  const format = String(snapshot.display_format || row.display_format || "").toUpperCase();
  const videoUrls = (value: unknown, depth = 0): string[] => {
    if (depth > 15 || !value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(nested => videoUrls(nested, depth + 1));
    const media = object(value);
    return [...[media.video_hd_url, media.video_sd_url].filter(approvedMediaUrl),
      ...Object.values(media).flatMap(nested => videoUrls(nested, depth + 1))];
  };
  const videos = videoUrls(snapshot);
  const cards = Array.isArray(snapshot.cards) ? snapshot.cards : [];
  const images = Array.isArray(snapshot.images) ? snapshot.images : [];
  // Only creative image containers are eligible. Profile pictures, card links,
  // video previews and arbitrary nested URLs never become analysis inputs.
  const imageEntries = cards.length ? cards : images;
  const imageCandidates = cards.length ? cards.map(card => firstImage(card)) : images.map(image => firstImage(image, true));
  const imageUrls = imageCandidates.filter((url): url is string => url !== null);
  const completeImages = imageEntries.length === imageUrls.length && imageUrls.length <= 10;
  const carousel = format === "CAROUSEL" || snapshot.is_carousel === true || row.is_carousel === true;
  if (format === "VIDEO") return videos.length ? { kind: "video", videoUrl: videos[0] } : { kind: "unknown", candidateKind: "video", reason: "The verified video snapshot did not expose an approved video URL. A preview image is not the source video." };
  if (carousel) {
    if (videos.length) return { kind: "unknown", candidateKind: "carousel", reason: "The verified carousel includes mixed video/image content; it cannot be represented completely as a still-image set." };
    if (imageUrls.length && completeImages) return { kind: "carousel", imageUrls };
    return { kind: "unknown", candidateKind: "carousel", reason: imageEntries.length > 10 ? "The verified carousel exceeds the supported 10-card image limit; no partial set was selected." : "The verified carousel did not expose an approved creative image for every card; no partial set was selected." };
  }
  if (["IMAGE", "STATIC_IMAGE"].includes(format)) return imageUrls.length === 1 && completeImages ? { kind: "image", imageUrls } : { kind: "unknown", candidateKind: "image", reason: imageEntries.length > 1 ? "The verified image snapshot exposes multiple image variants without a declared carousel order; no single variant was guessed." : "The verified image snapshot did not expose an approved creative image URL." };
  if (videos.length) return { kind: "video", videoUrl: videos[0] };
  if (imageUrls.length === 1 && completeImages) return { kind: "image", imageUrls };
  if (imageUrls.length > 1) return { kind: "unknown", candidateKind: "image", reason: "The verified dynamic snapshot exposes multiple image variants without a declared carousel order." };
  if (imageUrls.length) return { kind: "unknown", candidateKind: "image", reason: "The verified dynamic snapshot exposes an incomplete image variant set; no partial set was selected." };
  return { kind: "unknown", reason: "The verified ad snapshot did not expose an approved source video, image or carousel." };
}
/** Caller must first verify the source advertiser, ad and snapshot identity. */
export function creativeFromVerifiedSnapshot(snapshot: Record<string, any>, row: Record<string, any>): SmokeCreative {
  return creativeOf(snapshot, row);
}
/** Only media inside a verified advertiser/ad snapshot is eligible. Temporary URLs stay in memory. */
export function creativeSourcesFromScripts(scripts: string[], wanted: Set<string>): Map<string, SmokeCreative> {
  const found = new Map<string, SmokeCreative>();
  let challenge = false;
  let visited = 0;
  const visit = (value: unknown, depth = 0) => {
    if (depth > 40 || ++visited > 250000) return;
    if (Array.isArray(value)) { for (const nested of value) visit(nested, depth + 1); return; }
    if (typeof value === "string" && value.length <= 2000000 && /^[{[]/.test(value)) {
      try { visit(JSON.parse(value), depth + 1); } catch {} return;
    }
    const row = object(value);
    if (row.xfb_ad_library_is_captcha_required === true) challenge = true;
    const id = String(row.ad_archive_id || "");
    const snapshot = object(row.snapshot);
    const partner = object(snapshot.branded_content);
    const pageMatches = String(row.page_id) === VALENTTE_PAGE_ID &&
      (String(snapshot.page_id) === VALENTTE_PAGE_ID || String(partner.page_id) === VALENTTE_PAGE_ID);
    if (wanted.has(id) && pageMatches && (!found.has(id) || found.get(id)?.kind === "unknown")) found.set(id, creativeOf(snapshot, row));
    for (const nested of Object.values(row)) if (nested && (typeof nested === "object" || typeof nested === "string")) visit(nested, depth + 1);
  };
  for (const script of scripts) {
    if (script.length > 10000000) continue;
    try { visit(JSON.parse(script)); } catch {}
  }
  if (challenge) throw new SmokeSourceError("source_restricted", "Meta requested an access challenge. No challenge was bypassed; stored videos were preserved.");
  return found;
}
/** Backwards-compatible projection for video-only callers. */
export function videoSourcesFromScripts(scripts: string[], wanted: Set<string>, staticAds?: Set<string>): Map<string, string> {
  const videos = new Map<string, string>();
  for (const [id, creative] of creativeSourcesFromScripts(scripts, wanted)) {
    if (creative.kind === "video") { videos.set(id, creative.videoUrl); staticAds?.delete(id); }
    if (creative.kind === "image" || creative.kind === "carousel") staticAds?.add(id);
  }
  return videos;
}

export interface SmokeVideoSource {
  resolve(nativeId: string, options?: SmokeSourceResolveOptions): Promise<string | null>;
  resolveCreative?(nativeId: string, options?: SmokeSourceResolveOptions): Promise<SmokeCreative>;
  close(): Promise<void>;
}
export class PublicValentteVideoSource implements SmokeVideoSource {
  private browser?: Browser;
  private context?: BrowserContext;
  private readonly cache = new Map<string, SmokeCreative>();
  private readonly checked = new Set<string>();
  private primed = false;
  constructor(private readonly wanted: Set<string>, private readonly options: PublicValentteVideoSourceOptions = {}) {}
  private async initialise() {
    if (this.context) return;
    const executablePath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
    try { await access(executablePath); }
    catch { throw new SmokeSourceError("browser_unavailable", "Public video capture requires Chromium on the Render web service. Deploy the current Docker image."); }
    try {
      const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
      let proxy: { server: string; username?: string; password?: string } | undefined;
      if (proxyUrl) {
        const parsed = new URL(proxyUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported proxy protocol");
        proxy = { server: `${parsed.protocol}//${parsed.hostname}${parsed.port ? ":" + parsed.port : ""}`,
          ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
          ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}) };
      }
      this.browser = await chromium.launch({ executablePath, headless: true, proxy, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
      this.context = await this.browser.newContext({ viewport: { width: 1440, height: 1000 } });
    } catch { throw new SmokeSourceError("browser_unavailable", "The public video browser could not start. Check Render web service memory and Chromium installation."); }
  }
  private async readSnapshot(url: string): Promise<SmokeSnapshot> {
    await this.initialise();
    const page = await this.context!.newPage();
    try {
      // Revalidate public page content so a newly opened snapshot does not
      // silently reuse a browser-cached document containing an expired CDN URL.
      await page.setExtraHTTPHeaders({ "Cache-Control": "no-cache", Pragma: "no-cache" });
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
      const status = response?.status() || 0;
      if (status >= 400) return { url: page.url(), status, scripts: [] };
      await page.waitForFunction(() => Boolean(document.querySelector('script[type="application/json"]')) && /Library ID:|No ads match/.test(document.body?.innerText || ""), undefined, { timeout: 12000 }).catch(() => {});
      const scripts = await page.locator("script").evaluateAll(nodes => nodes.map(node => node.textContent || "").filter(text => /^[{[]/.test(text.trim())));
      return { url: page.url(), status, scripts };
    } finally { await page.close().catch(() => {}); }
  }
  private async capture(url: string) {
    try {
      const snapshot = await (this.options.readSnapshot || (value => this.readSnapshot(value)))(url);
      if (snapshot.status >= 400) throw snapshotHttpFailure(snapshot.status);
      if (!/^https:\/\/(?:www\.)?facebook\.com\/ads\/library\//.test(snapshot.url))
        throw new SmokeSourceError("source_restricted", "Meta redirected to a login or access page. No sign-in or access challenge was attempted.");
      const sources = creativeSourcesFromScripts(snapshot.scripts, this.wanted);
      for (const [id, creative] of sources) {
        if (creative.kind !== "unknown" || !this.cache.has(id)) this.cache.set(id, creative);
      }
      return sources;
    } catch (error) {
      if (error instanceof SmokeSourceError) throw error;
      if (error instanceof Error && error.name === "TimeoutError")
        throw new SmokeSourceError("source_timeout", "Reading the public Meta ad snapshot timed out. Retry later.");
      throw new SmokeSourceError("source_unavailable", "The public Meta video source could not be read. Existing stored videos were preserved; retry preparation later.");
    }
  }
  async resolveCreative(nativeId: string, options: SmokeSourceResolveOptions = {}): Promise<SmokeCreative> {
    if (!this.wanted.has(nativeId) || !/^\d{5,30}$/.test(nativeId)) throw new SmokeSourceError("invalid_ad", "Choose a verified Valentte ad identifier.");
    if (options.refresh) {
      // A refresh always reopens this exact ad snapshot. Neither an earlier
      // search-page URL nor the already-checked marker can satisfy this request.
      this.cache.delete(nativeId);
      this.checked.add(nativeId);
      await this.capture(`https://www.facebook.com/ads/library/?id=${nativeId}`);
      return this.creative(nativeId);
    }
    if (this.cache.has(nativeId) && this.cache.get(nativeId)!.kind !== "unknown") return this.cache.get(nativeId)!;
    if (!this.primed) {
      this.primed = true;
      await this.capture(`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=GB&view_all_page_id=${VALENTTE_PAGE_ID}&search_type=page&media_type=all`);
      if (this.cache.has(nativeId) && this.cache.get(nativeId)!.kind !== "unknown") return this.cache.get(nativeId)!;
    }
    if (!this.checked.has(nativeId)) {
      this.checked.add(nativeId);
      await this.capture(`https://www.facebook.com/ads/library/?id=${nativeId}`);
    }
    return this.creative(nativeId);
  }
  async resolve(nativeId: string, options: SmokeSourceResolveOptions = {}): Promise<string | null> {
    const creative = await this.resolveCreative(nativeId, options);
    if (creative.kind === "video") return creative.videoUrl;
    if (creative.kind === "image" || creative.kind === "carousel")
      throw new SmokeSourceError("source_not_video", `This verified ad snapshot contains ${creative.kind === "carousel" ? "an image carousel" : "a static image"}, not a video.`);
    return null;
  }
  private creative(nativeId: string): SmokeCreative {
    return this.cache.get(nativeId) || { kind: "unknown", reason: "No verified creative media was exposed for this ad snapshot." };
  }
  async close() {
    await this.browser?.close().catch(() => {});
    this.browser = undefined; this.context = undefined;
    this.cache.clear(); this.checked.clear(); this.primed = false;
  }
}
