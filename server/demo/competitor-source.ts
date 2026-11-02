import { access } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import type { DemoCompetitorId } from "../../shared/demo-collection.js";
import type { Ad } from "../../shared/types.js";
import { creativeFromVerifiedSnapshot, type SmokeCreative, type SmokeSnapshot } from "../smoke/source.js";

export interface CompetitorDefinition {
  id: DemoCompetitorId;
  name: string;
  domain: string;
  domains: readonly string[];
  advertiserNames: readonly string[];
  query: string;
  identityNote?: string;
}
/** Domains were checked on the publisher websites; numeric advertiser IDs are never guessed. */
export const DEMO_COMPETITORS: readonly CompetitorDefinition[] = [
  { id: "aery-living", name: "Aery Living", domain: "aeryliving.com", domains: ["aeryliving.com", "osmology.co.uk"], advertiserNames: ["Aery Living", "Aery", "Osmology", "Osmology by Aery"], query: "Aery Living", identityNote: "The official aeryliving.com website redirects to Osmology by Aery. Source records must match an explicit Aery/Osmology advertiser name and official landing domain." },
  { id: "the-white-company", name: "The White Company", domain: "thewhitecompany.com", domains: ["thewhitecompany.com"], advertiserNames: ["The White Company"], query: "The White Company" },
  { id: "neom", name: "NEOM", domain: "neomwellbeing.com", domains: ["neomwellbeing.com", "neomorganics.com"], advertiserNames: ["NEOM", "NEOM Wellbeing", "NEOM Wellbeing London", "NEOM Organics", "NEOM Organics London"], query: "NEOM Wellbeing" },
];
export class CompetitorSourceError extends Error {
  constructor(public code: string, message: string, public httpStatus?: number) { super(message); }
}
export interface CollectedCompetitorCreative {
  nativeId: string;
  advertiserPageId: string;
  advertiserName: string;
  observedAt: string;
  sourceUrl: string;
  title: string;
  copy: string;
  copyTruncated: boolean;
  format: string;
  active: boolean;
  deliveryStartAt?: string;
  deliveryStopAt?: string;
  publisherPlatforms: string[];
  brandedContentPartner?: Ad["brandedContentPartner"];
  creative: SmokeCreative;
}
export interface CompetitorSource {
  collect(): Promise<{ observedAt: string; sourceUrl: string; creatives: CollectedCompetitorCreative[] }>;
  refresh(nativeId: string, advertiserPageId: string): Promise<SmokeCreative>;
  close(): Promise<void>;
}
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const numericId = (value: unknown) => typeof value === "string" && /^\d{5,30}$/.test(value);
const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
const identity = (value: unknown) => clean(value, 200).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
function sourceDate(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > 253402300799) return;
  return new Date(value * 1000).toISOString();
}
function officialLanding(value: unknown, definition: CompetitorDefinition, depth = 0): boolean {
  if (depth > 2 || typeof value !== "string" || value.length > 20000) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (["l.facebook.com", "lm.facebook.com"].includes(url.hostname) && url.pathname === "/l.php") return officialLanding(url.searchParams.get("u"), definition, depth + 1);
    return definition.domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}
function profileUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["facebook.com", "www.facebook.com", "instagram.com", "www.instagram.com"].includes(url.hostname)) return null;
    const id = url.pathname === "/profile.php" ? url.searchParams.get("id") : null;
    url.search = ""; url.hash = "";
    if (id && /^\d{1,30}$/.test(id)) url.searchParams.set("id", id);
    return url.href;
  } catch { return null; }
}
/** Read only already rendered JSON. A keyword match alone never establishes advertiser identity. */
export function competitorCreativesFromScripts(scripts: string[], definition: CompetitorDefinition, observedAt: string, verifiedPageIds = new Set<string>()): CollectedCompetitorCreative[] {
  const candidates = new Map<string, { row: Record<string, any>; snapshot: Record<string, any>; name: string; partner: Ad["brandedContentPartner"] }>();
  let challenge = false, visited = 0;
  const names = new Set(definition.advertiserNames.map(identity));
  const visit = (value: unknown, depth = 0) => {
    if (depth > 40 || ++visited > 250000) return;
    if (Array.isArray(value)) { for (const child of value) visit(child, depth + 1); return; }
    if (typeof value === "string" && value.length < 2000000 && /^[{[]/.test(value)) { try { visit(JSON.parse(value), depth + 1); } catch {} return; }
    const row = record(value), snapshot = record(row.snapshot), partnership = record(snapshot.branded_content);
    if (row.xfb_ad_library_is_captcha_required === true) challenge = true;
    if (numericId(row.ad_archive_id) && numericId(row.page_id) && typeof row.is_active === "boolean") {
      const own = String(snapshot.page_id) === row.page_id && names.has(identity(snapshot.page_name));
      const partner = String(partnership.page_id) === row.page_id && names.has(identity(partnership.page_name)) && names.has(identity(row.page_name));
      if (own || partner) {
        const cards = Array.isArray(snapshot.cards) ? snapshot.cards : [];
        const landing = [snapshot.link_url, snapshot.link_destination, row.link_url, ...cards.flatMap((card: unknown) => [record(card).link_url, record(card).link_destination])].some(url => officialLanding(url, definition));
        if (landing) verifiedPageIds.add(row.page_id);
        candidates.set(row.ad_archive_id, { row, snapshot, name: own ? clean(snapshot.page_name, 200) : clean(partnership.page_name, 200), partner: partner && numericId(snapshot.page_id) && String(snapshot.page_id) !== row.page_id ? { pageId: snapshot.page_id, name: clean(snapshot.page_name, 120), profileUrl: profileUrl(snapshot.page_profile_uri) } : undefined });
      }
    }
    for (const child of Object.values(row)) if (child && (typeof child === "object" || typeof child === "string")) visit(child, depth + 1);
  };
  for (const script of scripts) { if (script.length > 10000000) continue; try { visit(JSON.parse(script)); } catch {} }
  if (challenge) throw new CompetitorSourceError("source_restricted", "Meta requested an access challenge. No challenge was bypassed and no ad absence is inferred.");
  return [...candidates.values()].filter(({ row }) => verifiedPageIds.has(row.page_id)).map(({ row, snapshot, name, partner }) => {
    const copy = clean(record(snapshot.body).text, 1000000);
    const format = String(snapshot.display_format || row.display_format || "").toUpperCase();
    return { nativeId: row.ad_archive_id, advertiserPageId: row.page_id, advertiserName: name, observedAt,
      sourceUrl: `https://www.facebook.com/ads/library/?id=${row.ad_archive_id}`, title: clean(snapshot.title, 160) || `${definition.name} ad ${row.ad_archive_id}`,
      copy: copy.slice(0, 400), copyTruncated: copy.length > 400, format: ({ VIDEO: "Video", IMAGE: "Static image", STATIC_IMAGE: "Static image", CAROUSEL: "Carousel", DCO: "Dynamic creative", DPA: "Dynamic product ad" } as Record<string, string>)[format] || "Unknown media format",
      active: row.is_active, deliveryStartAt: sourceDate(row.start_date), ...(row.is_active ? {} : { deliveryStopAt: sourceDate(row.end_date) }),
      publisherPlatforms: Array.isArray(row.publisher_platform) ? row.publisher_platform.filter((item: unknown): item is string => typeof item === "string" && /^[A-Z_]{1,30}$/.test(item)) : [],
      ...(partner ? { brandedContentPartner: partner } : {}), creative: creativeFromVerifiedSnapshot(snapshot, row) };
  });
}

export interface PublicCompetitorSourceOptions { readSnapshot?: (url: string) => Promise<SmokeSnapshot>; now?: () => Date }
export class PublicCompetitorSource implements CompetitorSource {
  private browser?: Browser;
  private context?: BrowserContext;
  private readonly pages = new Set<string>();
  constructor(private readonly definition: CompetitorDefinition, private readonly options: PublicCompetitorSourceOptions = {}) {}
  private async read(url: string): Promise<SmokeSnapshot> {
    if (this.options.readSnapshot) return this.options.readSnapshot(url);
    if (!this.context) {
      const executablePath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
      try {
        await access(executablePath);
        const raw = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
        const value = raw ? new URL(raw) : null;
        if (value && !["http:", "https:"].includes(value.protocol)) throw new Error("Unsupported proxy protocol.");
        const proxy = value ? { server: `${value.protocol}//${value.hostname}${value.port ? `:${value.port}` : ""}`, ...(value.username ? { username: decodeURIComponent(value.username) } : {}), ...(value.password ? { password: decodeURIComponent(value.password) } : {}) } : undefined;
        this.browser = await chromium.launch({ executablePath, headless: true, proxy, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
        this.context = await this.browser.newContext({ viewport: { width: 1440, height: 1000 } });
      } catch { throw new CompetitorSourceError("browser_unavailable", "The public collector needs the current Render Docker image, Chromium and enough memory to launch its ordinary browser."); }
    }
    const page = await this.context.newPage();
    try {
      await page.setExtraHTTPHeaders({ "Cache-Control": "no-cache", Pragma: "no-cache" });
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForFunction(() => /Library ID:|No ads match|captcha|security check/i.test(document.body?.innerText || ""), undefined, { timeout: 10000 }).catch(() => {});
      const scripts = await page.locator("script").evaluateAll(nodes => nodes.map(node => node.textContent || "").filter(text => /^[{[]/.test(text.trim())).slice(0, 1000));
      if (scripts.reduce((sum, script) => sum + script.length, 0) > 20000000) throw new CompetitorSourceError("source_too_large", "The rendered public result exceeded the bounded collector size.");
      return { url: page.url(), status: response?.status() || 0, scripts };
    } catch (error) {
      if (error instanceof CompetitorSourceError) throw error;
      throw new CompetitorSourceError(error instanceof Error && error.name === "TimeoutError" ? "source_timeout" : "source_unavailable", "The ordinary public browser could not read this Meta result. Certificate, access or network failures are not treated as an empty ad library.");
    } finally { await page.close().catch(() => {}); }
  }
  private async capture(url: string): Promise<CollectedCompetitorCreative[]> {
    const snapshot = await this.read(url);
    let returned: URL;
    try { returned = new URL(snapshot.url); } catch { throw new CompetitorSourceError("source_restricted", "Meta returned an invalid public result location."); }
    if (returned.protocol !== "https:" || !["facebook.com", "www.facebook.com"].includes(returned.hostname) || !/^\/ads\/library\/?$/.test(returned.pathname))
      throw new CompetitorSourceError("source_restricted", "Meta redirected to a login or restricted page. No access challenge was bypassed.", snapshot.status);
    const rows = competitorCreativesFromScripts(snapshot.scripts, this.definition, (this.options.now?.() || new Date()).toISOString(), this.pages);
    if (!rows.length && snapshot.status >= 400) throw new CompetitorSourceError(snapshot.status === 403 || snapshot.status === 401 ? "source_forbidden" : snapshot.status === 429 ? "source_rate_limited" : "source_http_error", `The public Meta result could not be read (HTTP ${snapshot.status}).`, snapshot.status);
    return rows;
  }
  async collect() {
    const result = new Map<string, CollectedCompetitorCreative>();
    const makeUrl = (query: string, pageId?: string) => {
      const url = new URL("https://www.facebook.com/ads/library/");
      for (const [key, value] of Object.entries({ active_status: "all", ad_type: "all", country: "GB", media_type: "all", ...(pageId ? { view_all_page_id: pageId, search_type: "page" } : { q: query, search_type: "keyword_unordered" }) })) url.searchParams.set(key, value);
      return url.href;
    };
    let sourceUrl = makeUrl(this.definition.query);
    for (const row of await this.capture(sourceUrl)) result.set(row.nativeId, row);
    // A second explicit current alias is useful when the publisher renamed its brand.
    if (!result.size && this.definition.id === "aery-living") {
      sourceUrl = makeUrl("Osmology");
      for (const row of await this.capture(sourceUrl)) result.set(row.nativeId, row);
    }
    for (const pageId of [...this.pages].slice(0, 3)) {
      if (result.size >= 25) break;
      for (const row of await this.capture(makeUrl("", pageId))) result.set(row.nativeId, row);
    }
    if (!result.size) throw new CompetitorSourceError("source_identity_unverified", "No public advertiser/ad snapshot matched both an approved brand identity and official landing domain. No page ID or empty-market claim was guessed.");
    return { observedAt: (this.options.now?.() || new Date()).toISOString(), sourceUrl, creatives: [...result.values()].slice(0, 25) };
  }
  async refresh(nativeId: string, advertiserPageId: string): Promise<SmokeCreative> {
    if (!numericId(nativeId) || !this.pages.has(advertiserPageId)) throw new CompetitorSourceError("source_identity_unverified", "Refresh requires a previously verified ad and advertiser.");
    const rows = await this.capture(`https://www.facebook.com/ads/library/?id=${nativeId}`);
    return rows.find(row => row.nativeId === nativeId && row.advertiserPageId === advertiserPageId)?.creative || { kind: "unknown", reason: "The fresh, verified snapshot did not expose a supported creative." };
  }
  async close() { await this.browser?.close().catch(() => {}); this.browser = undefined; this.context = undefined; }
}
