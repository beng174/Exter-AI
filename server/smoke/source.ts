import { access } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext } from "playwright-core";

export const VALENTTE_PAGE_ID = "172851066181411";
export class SmokeSourceError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
/** Only media inside a verified advertiser/ad snapshot is eligible. Temporary URLs stay in memory. */
export function videoSourcesFromScripts(scripts: string[], wanted: Set<string>): Map<string, string> {
  const found = new Map<string, string>();
  let challenge = false;
  let visited = 0;
  const urls = (value: unknown, depth = 0): string[] => {
    if (depth > 15 || !value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(v => urls(v, depth + 1));
    const v = object(value);
    const direct = [v.video_hd_url, v.video_sd_url].filter((u): u is string => typeof u === "string" && u.length < 20000).filter(u => {
      try { const parsed = new URL(u); return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port && parsed.hostname.endsWith(".fbcdn.net"); } catch { return false; }
    });
    return [...direct, ...Object.values(v).flatMap(nested => urls(nested, depth + 1))];
  };
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
    if (wanted.has(id) && pageMatches && !found.has(id)) {
      const source = urls(snapshot)[0];
      if (source) found.set(id, source);
    }
    for (const nested of Object.values(row)) if (nested && (typeof nested === "object" || typeof nested === "string")) visit(nested, depth + 1);
  };
  for (const script of scripts) {
    if (script.length > 10000000) continue;
    try { visit(JSON.parse(script)); } catch {}
  }
  if (challenge) throw new SmokeSourceError("source_restricted", "Meta requested an access challenge. No challenge was bypassed; stored videos were preserved.");
  return found;
}

export interface SmokeVideoSource {
  resolve(nativeId: string): Promise<string | null>;
  close(): Promise<void>;
}
export class PublicValentteVideoSource implements SmokeVideoSource {
  private browser?: Browser;
  private context?: BrowserContext;
  private readonly cache = new Map<string, string>();
  private readonly checked = new Set<string>();
  private primed = false;
  constructor(private readonly wanted: Set<string>) {}
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
  private async capture(url: string) {
    await this.initialise();
    const page = await this.context!.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForFunction(() => Boolean(document.querySelector('script[type="application/json"]')) && /Library ID:|No ads match/.test(document.body?.innerText || ""), undefined, { timeout: 12000 }).catch(() => {});
      if (!/^https:\/\/(?:www\.)?facebook\.com\/ads\/library\//.test(page.url()))
        throw new SmokeSourceError("source_restricted", "Meta redirected to a login or access page. No sign-in or access challenge was attempted.");
      const scripts = await page.locator("script").evaluateAll(nodes => nodes.map(node => node.textContent || "").filter(text => /^[{[]/.test(text.trim())));
      const sources = videoSourcesFromScripts(scripts, this.wanted);
      for (const [id, source] of sources) this.cache.set(id, source);
      return sources;
    } catch (error) {
      if (error instanceof SmokeSourceError) throw error;
      throw new SmokeSourceError("source_unavailable", "The public Meta video source could not be read. Existing stored videos were preserved; retry preparation later.");
    } finally { await page.close().catch(() => {}); }
  }
  async resolve(nativeId: string): Promise<string | null> {
    if (!this.wanted.has(nativeId) || !/^\d{5,30}$/.test(nativeId)) throw new SmokeSourceError("invalid_ad", "Choose a verified Valentte ad identifier.");
    if (this.cache.has(nativeId)) return this.cache.get(nativeId)!;
    if (!this.primed) {
      this.primed = true;
      await this.capture(`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=GB&view_all_page_id=${VALENTTE_PAGE_ID}&search_type=page&media_type=video`);
      if (this.cache.has(nativeId)) return this.cache.get(nativeId)!;
    }
    if (!this.checked.has(nativeId)) {
      this.checked.add(nativeId);
      await this.capture(`https://www.facebook.com/ads/library/?id=${nativeId}`);
    }
    return this.cache.get(nativeId) || null;
  }
  async close() { await this.browser?.close().catch(() => {}); this.browser = undefined; this.context = undefined; }
}
