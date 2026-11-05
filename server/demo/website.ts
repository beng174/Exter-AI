import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import type { DatabaseSync } from "node:sqlite";
import { load } from "cheerio";
import type { Brand } from "../../shared/types.js";
import type { DemoWebsiteEvidence } from "../../shared/brand-demo.js";
import { readBrandResearch } from "../brand-research.js";

const MAX_BYTES = 1024 * 1024;
export class WebsiteEvidenceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export interface DemoWebsiteOptions {
  fetch?: typeof fetch;
  resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  now?: () => Date;
}
export function publicWebsiteAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{0,3}:/i.test(address) && !/^(?:2001:(?:db8|0):|2002:)/i.test(address);
}
function brandUrl(brand: Brand): URL {
  const domain = brand.domain.trim().toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))
    throw new WebsiteEvidenceError("Save a public website domain, without a path, port or credentials, before refreshing evidence.");
  return new URL(`https://${domain}/`);
}
async function checkedUrl(raw: string, initialHost: string, options: DemoWebsiteOptions, allowedHost?: (host:string)=>boolean) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new WebsiteEvidenceError("The website URL is invalid."); }
  const base = initialHost.replace(/^www\./, ""), host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(host) || !(allowedHost ? allowedHost(host) : [base, `www.${base}`].includes(host)) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test)$/.test(host))
    throw new WebsiteEvidenceError("Website evidence accepts only the saved public HTTPS website; unrelated, private and credential-bearing destinations are blocked.");
  const addresses = await (options.resolve || (hostname => lookup(hostname, { all: true, verbatim: true })))(host).catch(() => {
    throw new WebsiteEvidenceError("The brand website could not be resolved.", 502);
  });
  if (!addresses.length || addresses.some(item => !publicWebsiteAddress(item.address)))
    throw new WebsiteEvidenceError("The website resolves to a private, reserved or unsupported address.");
  url.hash = "";
  return { url, addresses };
}
/** Pin the DNS result used for the native connection, closing a resolve/fetch rebinding gap. */
async function nativePage(url: URL, addresses: { address: string; family: number }[], maxBytes = MAX_BYTES, accept = "text/html,application/xhtml+xml"): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET", agent: false, signal: AbortSignal.timeout(15000), headers: { Accept: accept, "User-Agent": "Exter-Website-Evidence/1.0", "Accept-Encoding": "identity" },
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      },
    }, response => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) { response.destroy(); req.destroy(); reject(new WebsiteEvidenceError("Website response exceeds the 1 MB limit.", 413)); }
        else chunks.push(chunk);
      });
      response.on("error", () => reject(new WebsiteEvidenceError("The website response could not be read.", 502)));
      response.on("end", () => {
        const headers = new Headers();
        for (const key of ["content-type", "content-length", "location", "content-encoding"]) {
          const value = response.headers[key]; if (typeof value === "string") headers.set(key, value);
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode || 502, headers }));
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error("timeout")));
    req.on("error", () => reject(new WebsiteEvidenceError("The public website could not be reached within the request limit.", 502)));
    req.end();
  });
}
async function readBounded(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new WebsiteEvidenceError("Website response exceeds the 1 MB limit.", 413);
  if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get("content-type") || ""))
    throw new WebsiteEvidenceError("The website did not return public HTML.", 502);
  if (response.headers.get("content-encoding") && response.headers.get("content-encoding") !== "identity")
    throw new WebsiteEvidenceError("The website returned an unsupported compressed response.", 502);
  if (!response.body) throw new WebsiteEvidenceError("The website returned an empty page.", 502);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new WebsiteEvidenceError("Website response exceeds the 1 MB limit.", 413); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export function emptyWebsiteEvidence(brand: Brand): DemoWebsiteEvidence {
  return { status: "not-refreshed", url: `https://${brand.domain}/`, fetchedAt: null, title: "", excerpts: [], limitations: ["Website evidence has not been refreshed. Opening this report never fetches a website."] };
}
export function readWebsiteEvidence(db: DatabaseSync, brand: Brand): DemoWebsiteEvidence {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='brand_demo_website'").get();
  const row = exists ? db.prepare("SELECT data FROM brand_demo_website WHERE brand_id=?").get(brand.id) as { data: string } | undefined : undefined;
  if (row) return JSON.parse(row.data);
  // Previously explicitly collected website evidence is reusable without a network call.
  const old = readBrandResearch(db, brand.id);
  const sources = old?.sources.filter(source => source.kind === "website" && source.status === "available" && source.textExcerpt.trim()) || [];
  if (!sources.length) return emptyWebsiteEvidence(brand);
  return { status: "available", url: sources[0].url, fetchedAt: sources[0].observedAt, title: sources[0].title, excerpts: sources.map(source => ({ kind: "website", sourceUrl: source.url, quote: source.textExcerpt.slice(0, 1800), observedAt: source.observedAt })), limitations: ["Reused previously collected website text; it has not been refreshed for this report.", "Website statements are publisher claims, not independently verified facts."] };
}
export async function refreshWebsiteEvidence(db: DatabaseSync, brand: Brand, options: DemoWebsiteOptions = {}): Promise<DemoWebsiteEvidence> {
  if (!options.fetch && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy))
    throw new WebsiteEvidenceError("Website refresh is unavailable with this service’s outbound proxy configuration. Configure a supported proxy transport or direct public HTTPS egress; saved evidence was preserved.", 409);
  const initial = brandUrl(brand);
  let destination = await checkedUrl(initial.href, initial.hostname, options), response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects++) {
    try {
      response = options.fetch ? await options.fetch(destination.url, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity" } }) : await nativePage(destination.url, destination.addresses);
    } catch (error) { if (error instanceof WebsiteEvidenceError) throw error; throw new WebsiteEvidenceError("The public website could not be reached.", 502); }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (response.body) await response.body.cancel();
      if (!location || redirects === 3) throw new WebsiteEvidenceError("The website exceeded the supported redirect limit.", 502);
      destination = await checkedUrl(new URL(location, destination.url).href, initial.hostname, options);
      continue;
    }
    if (!response.ok) throw new WebsiteEvidenceError(`The website is unavailable (HTTP ${response.status}); previous evidence was preserved.`, 502);
    const html = await readBounded(response), $ = load(html);
    $("script,style,noscript,template,svg,form,input,button,nav,header,footer,dialog,[role='dialog']").remove();
    const clean = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);
    const title = clean($("title").first().text(), 250);
    if (/just a moment|access denied|attention required|verify.*human|robot check/i.test(title)) throw new WebsiteEvidenceError("The website returned an access challenge; it was not saved as evidence.", 502);
    const root = $("main").length ? $("main").first() : $("body");
    const lines = [...new Set(root.find("h1,h2,h3,p,li,blockquote").map((_index, item) => clean($(item).text(), 700)).get())].filter(text => text.length >= 15 && !/cookie consent|privacy policy|terms and conditions/i.test(text)).slice(0, 16);
    if (!lines.length) throw new WebsiteEvidenceError("The website did not expose enough public text; previous evidence was preserved.", 502);
    const fetchedAt = (options.now?.() || new Date()).toISOString();
    const result: DemoWebsiteEvidence = { status: "available", url: destination.url.href, fetchedAt, title, excerpts: lines.map(quote => ({ kind: "website", sourceUrl: destination.url.href, quote, observedAt: fetchedAt })), limitations: ["One bounded public page, refreshed explicitly. No linked pages were crawled.", "Website statements are publisher claims, not independently verified facts. Current offers and substantiation need review before production."] };
    db.exec("CREATE TABLE IF NOT EXISTS brand_demo_website (brand_id TEXT PRIMARY KEY REFERENCES brands(id),data TEXT NOT NULL)");
    db.prepare("INSERT INTO brand_demo_website VALUES (?,?) ON CONFLICT(brand_id) DO UPDATE SET data=excluded.data").run(brand.id, JSON.stringify(result));
    return result;
  }
  throw new WebsiteEvidenceError("The website could not be refreshed.", 502);
}

/** Same public-host/DNS-pinned transport for small retained website assets. */
async function fetchBoundedResource(domain: string, raw: string, maxBytes: number, options: DemoWebsiteOptions, allowedHost?: (host:string)=>boolean) {
  if (!options.fetch && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy))
    throw new WebsiteEvidenceError("Website icons are unavailable with this outbound proxy configuration.", 409);
  let destination = await checkedUrl(raw, domain, options, allowedHost);
  const timeout = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = options.fetch ? await options.fetch(destination.url, {redirect:"manual", signal:timeout, headers:{Accept:"text/html,image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon", "Accept-Encoding":"identity"}}) : await nativePage(destination.url,destination.addresses,maxBytes,"text/html,image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon");
    if (response.status >= 300 && response.status < 400) {
      const location=response.headers.get("location");await response.body?.cancel();
      if (!location || redirects===3) throw new WebsiteEvidenceError("Website redirect limit exceeded.");
      destination=await checkedUrl(new URL(location,destination.url).href,domain,options,allowedHost);continue;
    }
    if (!response.ok || !response.body) {await response.body?.cancel();throw new WebsiteEvidenceError("Website asset is unavailable.",502);}
    if (Number(response.headers.get("content-length"))>=maxBytes || ![null,"identity"].includes(response.headers.get("content-encoding"))) {await response.body.cancel();throw new WebsiteEvidenceError("Website asset exceeds its size or encoding limit.",413);}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try {while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>=maxBytes){await reader.cancel();throw new WebsiteEvidenceError("Website asset exceeds its size limit.",413);}chunks.push(part.value);}}
    finally{reader.releaseLock();}
    return {bytes:Buffer.concat(chunks),type:(response.headers.get("content-type")||"").split(";")[0].toLowerCase(),url:destination.url.href};
  }
  throw new WebsiteEvidenceError("Website asset is unavailable.",502);
}

export function fetchWebsiteResource(domain:string,raw:string,maxBytes:number,options:DemoWebsiteOptions={}) {
  return fetchBoundedResource(domain,raw,maxBytes,options);
}
/** Anonymous public Page picture only; no reporting token or credentials follow redirects. */
export function fetchMetaPagePicture(pageId:string,maxBytes:number,options:DemoWebsiteOptions={}) {
  const version=process.env.EXTER_META_GRAPH_VERSION||"v25.0";
  if(!/^\d{1,30}$/.test(pageId)||!/^v\d+\.0$/.test(version))throw new WebsiteEvidenceError("A saved numeric Meta Page ID and supported Graph version are required.");
  const allowed=(host:string)=>host==="graph.facebook.com"||host==="lookaside.facebook.com"||["fbcdn.net","fbsbx.com"].some(domain=>host===domain||host.endsWith("."+domain));
  return fetchBoundedResource("graph.facebook.com",`https://graph.facebook.com/${version}/${pageId}/picture?type=large`,maxBytes,options,allowed);
}
