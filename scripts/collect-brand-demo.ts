import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { openDatabase, readJson } from "../server/db.js";
import type { Ad, Brand, Category } from "../shared/types.js";
import { META_LIBRARY_METRIC_CAVEAT } from "../shared/meta-library.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const runFile = promisify(execFile);
const categories = ["Beauty & skincare", "Fashion", "Wellness", "Food & beverage", "Home fragrance & gifting"] as const;
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, max = 400) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const identityName = (value: unknown) => text(value, 200).normalize("NFKC").toLowerCase();
const nativeId = (value: unknown, label: string) => {
  if (typeof value !== "string" || !/^\d{5,30}$/.test(value)) throw new Error(`${label} must be a numeric string identifier.`);
  return value;
};
const isoTime = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("Every capture requires its actual ISO observedAt timestamp.");
  return new Date(value).toISOString();
};
const deliveryTime = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 253402300799) throw new Error("Ad delivery dates must be Unix seconds or null.");
  return new Date(value * 1000).toISOString();
};
function officialLibraryUrl(value: unknown, pageId?: string, country?: string) {
  let url: URL;
  try { url = new URL(String(value)); } catch { throw new Error("Supply an official HTTPS Meta Ad Library page URL."); }
  if (url.protocol !== "https:" || !["facebook.com", "www.facebook.com"].includes(url.hostname) || !/^\/ads\/library\/?$/.test(url.pathname) || url.username || url.password || url.port)
    throw new Error("Supply an official HTTPS Meta Ad Library page URL.");
  const id = nativeId(url.searchParams.get("view_all_page_id"), "Meta view_all_page_id");
  if (pageId && id !== pageId) throw new Error("Captured URL does not match the supplied advertiser page.");
  if (country && url.searchParams.get("country") !== country) throw new Error("Captured URL does not match the requested country.");
  const safe = new URL("https://www.facebook.com/ads/library/");
  for (const key of ["view_all_page_id", "active_status", "country", "ad_type", "search_type", "media_type"])
    if (url.searchParams.has(key)) safe.searchParams.set(key, url.searchParams.get(key)!.slice(0, 50));
  return { url: safe.href, pageId: id };
}
function publicWebsite(value: unknown) {
  let url: URL;
  try { url = new URL(String(value)); } catch { throw new Error("Supply the brand's public HTTPS website."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.includes(".") ||
      url.hostname === "localhost" || /^\d+(?:\.\d+){3}$/.test(url.hostname)) throw new Error("Supply the brand's public HTTPS website.");
  url.search = ""; url.hash = "";
  return { url: url.href, domain: url.hostname.toLowerCase().replace(/^www\./, "") };
}
function publicProfile(value: unknown) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["facebook.com", "www.facebook.com", "instagram.com", "www.instagram.com"].includes(url.hostname)) return null;
    const profileId = url.pathname === "/profile.php" && ["facebook.com", "www.facebook.com"].includes(url.hostname) ? url.searchParams.get("id") : null;
    url.search = ""; url.hash = "";
    if (profileId && /^\d{1,30}$/.test(profileId)) url.searchParams.set("id", profileId);
    return url.href;
  } catch { return null; }
}
export interface DemoBrandIdentity {
  name: string;
  advertiserName: string;
  websiteUrl: string;
  domain: string;
  pageId: string;
  metaLibraryUrl: string;
  country: string;
  category: Category;
}
export function demoBrandIdentity(input: { name: string; advertiserName?: string; website: string; metaUrl: string; country: string; category: string }): DemoBrandIdentity {
  if (!input.name.trim() || input.name.length > 120 || /[\r\n\x00-\x1f]/.test(input.name)) throw new Error("Supply a brand name of at most 120 characters.");
  const advertiserName = input.advertiserName || input.name;
  if (!advertiserName.trim() || advertiserName.length > 200 || /[\r\n\x00-\x1f]/.test(advertiserName)) throw new Error("Supply the exact public advertiser name.");
  const country = input.country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("Country must be a two-letter Meta country code.");
  if (!(categories as readonly string[]).includes(input.category)) throw new Error("Choose an existing brand category.");
  const website = publicWebsite(input.website), meta = officialLibraryUrl(input.metaUrl);
  return { name: input.name.trim(), advertiserName: advertiserName.trim(), websiteUrl: website.url, domain: website.domain,
    metaLibraryUrl: meta.url, pageId: meta.pageId, country, category: input.category as Category };
}
export function normalizeDemoCapture(input: unknown, identity: DemoBrandIdentity, brand: Brand) {
  if (identityName(brand.name) !== identityName(identity.name) || brand.domain.toLowerCase().replace(/^www\./, "") !== identity.domain)
    throw new Error("Capture identity does not match its workspace.");
  const capture = record(input, "Capture");
  const observedAt = isoTime(capture.observedAt);
  if (capture.advertiserPageId !== identity.pageId || capture.country !== identity.country) throw new Error("Capture advertiser/country metadata does not match the supplied identity.");
  const requestUrl = officialLibraryUrl(capture.requestUrl, identity.pageId, identity.country).url;
  const renderedUrl = officialLibraryUrl(capture.renderedUrl, identity.pageId, identity.country).url;
  if (!Array.isArray(capture.ads) || !capture.ads.length || capture.ads.length > 10000) throw new Error("Capture requires between 1 and 10,000 actual public ad records.");
  const status = typeof capture.status === "number" && Number.isInteger(capture.status) && capture.status >= 100 && capture.status <= 599 ? capture.status : null;
  let excludedAdvertiserRecords = 0;
  const result = new Map<string, Ad>();
  for (const raw of capture.ads) {
    const row = record(raw, "Ad");
    if (nativeId(row.page_id, "Ad page_id") !== identity.pageId) { excludedAdvertiserRecords++; continue; }
    const snapshot = record(row.snapshot, "Ad snapshot"), snapshotPage = nativeId(snapshot.page_id, "Snapshot page_id");
    let partner: Ad["brandedContentPartner"];
    if (snapshotPage === identity.pageId) {
      if (identityName(snapshot.page_name) !== identityName(identity.advertiserName)) throw new Error("Captured advertiser name does not match the supplied identity.");
    } else {
      const relationship = record(snapshot.branded_content, "Branded-content advertiser relationship");
      if (relationship.page_id !== identity.pageId || identityName(relationship.page_name) !== identityName(identity.advertiserName) ||
          identityName(row.page_name) !== identityName(identity.advertiserName) || !text(snapshot.page_name))
        throw new Error("Partnership card does not establish the supplied advertiser identity.");
      partner = { pageId: snapshotPage, name: text(snapshot.page_name, 120), profileUrl: publicProfile(snapshot.page_profile_uri) };
    }
    const id = nativeId(row.ad_archive_id, "Ad library ID");
    if (typeof row.is_active !== "boolean") throw new Error("Ad active status must be source-provided.");
    const start = deliveryTime(row.start_date), stop = row.is_active ? undefined : deliveryTime(row.end_date);
    if (start && stop && stop < start) throw new Error("Delivery stop cannot precede delivery start.");
    const copy = snapshot.body == null ? "" : text(record(snapshot.body, "Ad copy").text, 1000000);
    const format = text(snapshot.display_format).toUpperCase();
    const formatLabels: Record<string, string> = { IMAGE: "Static image", VIDEO: "Video", CAROUSEL: "Carousel", DCO: "Dynamic creative", DPA: "Dynamic product ad" };
    result.set(id, {
      id: `meta-library:${brand.id}:${id}`, brandId: brand.id, brand: brand.name, platform: "Meta", category: brand.category,
      title: text(snapshot.title, 160) || `${brand.name} ad ${id}`, copy: copy.slice(0, 400), copyTruncated: copy.length > 400,
      angle: "Not analysed", audience: "Not inferred", format: formatLabels[format] || "Unknown media format",
      creativeFormats: format === "IMAGE" ? ["Static"] : format === "CAROUSEL" ? ["Carousel"] : [],
      contentSource: "paid", providerAdId: id, advertiserPageId: identity.pageId, brandedContentPartner: partner,
      publisherPlatforms: Array.isArray(row.publisher_platform) ? [...new Set(row.publisher_platform.filter((value): value is string => typeof value === "string" && /^[A-Z_]{1,30}$/.test(value)))] : [],
      observedAt, firstObservedAt: observedAt, deliveryStartAt: start, deliveryStopAt: stop, dateBasis: start ? "delivery" : "observed",
      publishedAt: start || observedAt, active: row.is_active, deliveryStatus: row.is_active ? "active" : "inactive", image: "", color: brand.color,
      metricsAvailable: false, engagementRateBasis: "unavailable", engagementMetric: "Not supplied by Meta Ad Library",
      impressions: 0, engagements: 0, spend: null, conversions: null, revenue: null, owned: false, source: "public",
      sourceUrl: `https://www.facebook.com/ads/library/?id=${id}`,
    });
  }
  if (!result.size) throw new Error("No captured records match the supplied advertiser; nothing was imported.");
  return { observedAt, requestUrl, renderedUrl, httpStatus: status, excludedAdvertiserRecords, ads: [...result.values()] };
}

export function mergeDemoAds(existing: Ad[], incoming: Ad[], identity: DemoBrandIdentity, brandId: string) {
  const merged = new Map<string, Ad>();
  for (const ad of [...existing, ...incoming]) {
    if (ad.brandId !== brandId || ad.source !== "public" || ad.platform !== "Meta" || ad.advertiserPageId !== identity.pageId || !ad.providerAdId)
      throw new Error("Only matching source records may enter this workspace import.");
    const previous = merged.get(ad.providerAdId);
    if (!previous) { merged.set(ad.providerAdId, ad); continue; }
    const latest = (ad.observedAt || "") >= (previous.observedAt || "") ? ad : previous;
    const firstObservedAt = [previous.firstObservedAt || previous.observedAt, ad.firstObservedAt || ad.observedAt].filter((value): value is string => Boolean(value)).sort()[0];
    merged.set(ad.providerAdId, { ...previous, ...latest, firstObservedAt, analysis: previous.analysis || ad.analysis,
      videoAnalysis: previous.videoAnalysis || ad.videoAnalysis, videoMediaId: previous.videoMediaId || ad.videoMediaId });
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function outsideRepository(path: string) {
  const absolute = resolve(path), fromRoot = relative(root, absolute);
  if (!fromRoot || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) throw new Error("Keep raw captures outside the repository, for example under /tmp.");
  return absolute;
}
export async function collectBrandDemo(args: string[]) {
  const values = new Map<string, string>(), inputs: string[] = [];
  let collect = false, dryRun = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === "--collect") collect = true;
    else if (key === "--dry-run") dryRun = true;
    else if (["--name", "--advertiser-name", "--website", "--category", "--meta-url", "--country", "--capture-dir", "--input", "--db", "--output"].includes(key)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${key} requires a value.`);
      if (key === "--input") inputs.push(outsideRepository(value)); else values.set(key, value);
    } else throw new Error("Unknown option. Supply explicit brand identity, website, category, country and Meta library URL.");
  }
  const required = (key: string) => { const value = values.get(key); if (!value) throw new Error(`${key} is required.`); return value; };
  const identity = demoBrandIdentity({ name: required("--name"), advertiserName: values.get("--advertiser-name"), website: required("--website"),
    category: required("--category"), metaUrl: required("--meta-url"), country: required("--country") });
  if (collect && dryRun) throw new Error("Dry-run reads existing captures without writing files. Run --collect separately, or supply --input with --dry-run.");
  if (!inputs.length && !collect) throw new Error("Use --collect for actual public-browser capture, or --input for retained raw captures.");
  if (collect) {
    const captureDir = outsideRepository(required("--capture-dir"));
    for (const status of ["active", "all"]) {
      const output = resolve(captureDir, `${identity.pageId}-${status}-${Date.now()}.json`);
      try {
        await runFile("python3", [resolve(root, "scripts/collect-meta-library.py"), "--page-id", identity.pageId, "--country", identity.country,
          "--status", status, "--max-records", "30", "--output", output], { cwd: root, timeout: 60000, maxBuffer: 100000 });
        inputs.push(output);
      } catch { throw new Error(`Public ${status} browser capture did not finish. No challenge was bypassed and no database import was started; any successful raw capture remains outside the repository.`); }
    }
  }
  const captures = await Promise.all(inputs.map(async path => JSON.parse(await readFile(path, "utf8")) as unknown));
  // Validate all captures before opening or creating the destination database.
  const provisional: Brand = { id: "validation", name: identity.name, domain: identity.domain, category: identity.category, color: "#657869",
    initials: identity.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase(), voice: [], competitors: [], mode: "imported", createdAt: new Date().toISOString() };
  for (const capture of captures) normalizeDemoCapture(capture, identity, provisional);
  const db = dryRun ? null : openDatabase(values.get("--db") || ".data/exter.db", false);
  try {
    const brands = db ? readJson<Brand>(db.prepare("SELECT data FROM brands").all()) : [];
    const found = brands.find(brand => identityName(brand.name) === identityName(identity.name) && brand.domain.toLowerCase().replace(/^www\./, "") === identity.domain);
    if (found?.mode === "demo") throw new Error("Refusing to turn a fictional sample workspace into a real source workspace.");
    const brand = found || { ...provisional, id: dryRun ? "dry-run" : randomUUID() };
    const normalized = captures.map(capture => normalizeDemoCapture(capture, identity, brand));
    const existing = db ? readJson<Ad>(db.prepare("SELECT data FROM ads WHERE brand_id=? AND source='public' AND platform='Meta'").all(brand.id)).filter(ad => ad.advertiserPageId === identity.pageId) : [];
    const capturedAds = mergeDemoAds([], normalized.flatMap(capture => capture.ads), identity, brand.id);
    const ads = mergeDemoAds(existing, capturedAds, identity, brand.id);
    const sources = normalized.map(({ ads: _ads, ...source }) => source);
    const evidence = { kind: "bounded-public-meta-capture", brand, identity, observedAt: sources.map(source => source.observedAt).sort().at(-1), sources,
      identityBasis: "Explicit supplied brand website and advertiser identity; captured page IDs and exact public advertiser names matched. No independent website ownership verification is claimed.",
      metricCaveat: META_LIBRARY_METRIC_CAVEAT, coverage: { uniqueAds: capturedAds.length, activeAds: capturedAds.filter(ad => ad.active).length }, ads: capturedAds };
    if (db) {
      db.exec("CREATE TABLE IF NOT EXISTS brand_demo_capture_sources (id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),data TEXT NOT NULL)");
      db.exec("BEGIN");
      try {
        db.prepare("INSERT INTO brands VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(brand.id, JSON.stringify(brand));
        const upsert = db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET published_at=excluded.published_at,data=excluded.data");
        for (const ad of ads) upsert.run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
        db.prepare("INSERT INTO brand_demo_capture_sources VALUES (?,?,?)").run(randomUUID(), brand.id, JSON.stringify({ ...evidence, ads: undefined }));
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      const output = values.get("--output") || `.data/demo-captures/${identity.pageId}.json`;
      await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
    }
    return { dryRun, brandId: brand.id, brandName: brand.name, advertiserPageId: identity.pageId, country: identity.country,
      ...evidence.coverage, storedAds: ads.length, sourceCaptures: sources.length, observedAt: evidence.observedAt, inferenceRequests: 0, metricCaveat: META_LIBRARY_METRIC_CAVEAT };
  } finally { db?.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await collectBrandDemo(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error instanceof Error && error.name === "Error" && !("code" in error) ? error.message : "Brand demo collection/import failed; raw capture and provider details were not printed."); process.exitCode = 1; }
}
