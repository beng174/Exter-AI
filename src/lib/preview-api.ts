import { analyzeFormats, formatReportSummary, normalizeCreativeFormats } from "../../shared/formats";
import { answerResearchQuestion } from "../../shared/research";
import { normalizeAdAnalysis } from "../../shared/ad-intelligence";
import { hydrateAd } from "../../shared/ad-records";
import {
  CATEGORIES,
  PLATFORM_NAMES,
  CONTENT_PLATFORMS,
  seedData,
} from "../../server/seed";
import { analyzeRecords, reportContent } from "../../shared/analytics";
import type {
  Ad,
  Brand,
  Creator,
  Dashboard,
  Report,
  Review,
} from "../../shared/types";

declare global {
  interface Window {
    __EXTER_PREVIEW_IMAGES__?: Record<string, string>;
    __EXTER_RESET_PREVIEW__?: () => void;
    __EXTER_PREVIEW_STORAGE__?: { persistent: boolean; message: string };
    __EXTER_PREVIEW_INSTALLED__?: boolean;
  }
}

interface PreviewState {
  version: 1;
  brands: Brand[];
  ads: Ad[];
  creators: Creator[];
  reviews: Review[];
  reports: Report[];
  shortlist: Record<string, string[]>;
}

const STORAGE_KEY = "exter-offline-v1";
class PreviewError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function text(
  value: unknown,
  label: string,
  max = 200,
  optional = false,
): string {
  if (optional && (value === undefined || value === null || value === ""))
    return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new PreviewError(
      `${label} must be a non-empty string of at most ${max} characters.`,
    );
  }
  return value.trim();
}

function nonnegative(
  value: unknown,
  label: string,
  nullable = false,
): number | null {
  if (nullable && (value === undefined || value === null || value === ""))
    return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new PreviewError(`${label} must be a finite, non-negative number.`);
  }
  return value;
}

function uuid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function importRow(value: unknown, brand: Brand): Ad {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PreviewError("Each ad must be an object.");
  const row = value as Record<string, unknown>;
  const advertiser = text(row.brand, "brand", 80);
  const platform = text(row.platform, "platform") as Ad["platform"];
  if (!CONTENT_PLATFORMS.includes(platform))
    throw new PreviewError("Imported platform must be Meta, TikTok or Google.");
  if (row.owned !== undefined && typeof row.owned !== "boolean")
    throw new PreviewError("owned must be a boolean.");
  const owned = row.owned === true;
  if (owned && advertiser.toLowerCase() !== brand.name.toLowerCase())
    throw new PreviewError("Owned metrics must use the workspace brand name.");
  const conversions = nonnegative(row.conversions, "conversions", true);
  const spend = nonnegative(row.spend, "spend", true);
  const revenue = nonnegative(row.revenue, "revenue", true);
  if (!owned && (conversions !== null || spend !== null || revenue !== null)) {
    throw new PreviewError(
      "Competitor spend, revenue and conversions are not accepted. Only import these metrics for owned ads.",
    );
  }
  const date = text(row.publishedAt, "publishedAt", 40);
  const parsed = new Date(date);
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.getTime() > Date.now() + 300000 ||
    parsed.getUTCFullYear() < 2000 ||
    parsed.toISOString().slice(0, 10) !== date.slice(0, 10)
  ) {
    throw new PreviewError(
      "publishedAt must be a valid ISO date between 2000 and now.",
    );
  }
  const sourceUrl = text(row.sourceUrl, "sourceUrl", 2000, true);
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new PreviewError(
        "sourceUrl must be an HTTP or HTTPS URL without credentials.",
      );
    }
  }
  return {
    contentSource: row.contentSource === "organic" ? "organic" : "paid",
    metricsAvailable: row.metricsAvailable !== false,
    engagementRateBasis: ["views", "followers", "unavailable"].includes(
      String(row.engagementRateBasis),
    )
      ? (row.engagementRateBasis as Ad["engagementRateBasis"])
      : "impressions",
    views:
      row.views === undefined ? undefined : nonnegative(row.views, "views")!,
    followers:
      row.followers === undefined
        ? undefined
        : nonnegative(row.followers, "followers")!,
    creativeFormats: normalizeCreativeFormats(row.creativeFormats),
    analysis: normalizeAdAnalysis(row.analysis),
    currency: text(row.currency, "currency", 3, true) || undefined,
    conversionEvent:
      text(row.conversionEvent, "conversionEvent", 120, true) || undefined,
    id: `import-${uuid()}`,
    brandId: brand.id,
    brand: advertiser,
    platform,
    category: brand.category,
    title: text(row.title, "title", 200),
    copy: text(row.copy, "copy", 4000, true),
    angle: text(row.angle, "angle", 100),
    audience: text(row.audience, "audience", 200),
    format: text(row.format, "format", 50, true) || "Imported ad",
    image: "",
    color: brand.color,
    active: true,
    publishedAt: parsed.toISOString(),
    impressions: nonnegative(row.impressions, "impressions")!,
    engagements: nonnegative(row.engagements, "engagements")!,
    spend,
    conversions,
    revenue,
    owned,
    source: "import",
    sourceUrl: sourceUrl || null,
  };
}

function makeMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
}

function isState(value: unknown): value is PreviewState {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<PreviewState>;
  return (
    data.version === 1 &&
    Array.isArray(data.brands) &&
    Array.isArray(data.ads) &&
    Array.isArray(data.creators) &&
    Array.isArray(data.reviews) &&
    Array.isArray(data.reports) &&
    !!data.shortlist &&
    typeof data.shortlist === "object" &&
    data.brands.every(
      (b) =>
        b &&
        typeof b.id === "string" &&
        typeof b.name === "string" &&
        Array.isArray(b.voice),
    ) &&
    data.ads.every(
      (a) =>
        a &&
        typeof a.id === "string" &&
        typeof a.brandId === "string" &&
        typeof a.publishedAt === "string" &&
        Number.isFinite(a.impressions) &&
        Number.isFinite(a.engagements),
    )
  );
}

/** Local, self-contained preview transport. It never connects to ad providers. */
export function installPreviewApi(): void {
  if (window.__EXTER_PREVIEW_INSTALLED__) return;
  window.__EXTER_PREVIEW_INSTALLED__ = true;
  let persistent = true;
  let storage: Storage;
  function notice(message: string) {
    window.__EXTER_PREVIEW_STORAGE__ = { persistent, message };
    window.dispatchEvent(
      new CustomEvent("exter-preview-storage", {
        detail: window.__EXTER_PREVIEW_STORAGE__,
      }),
    );
  }
  try {
    storage = window.localStorage;
    const probe = `${STORAGE_KEY}-probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
  } catch (error) {
    persistent = false;
    storage = makeMemoryStorage();
    try {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: storage,
      });
    } catch {
      /* Root preview banner explains browser restrictions. */
    }
    const full =
      error instanceof DOMException && error.name === "QuotaExceededError";
    setTimeout(
      () =>
        notice(
          full
            ? "Browser storage is full. This preview is using temporary memory; changes will be lost when you close or reload it."
            : "Browser storage is unavailable. Changes are kept only until this preview is closed or reloaded.",
        ),
      0,
    );
  }
  window.__EXTER_PREVIEW_STORAGE__ = {
    persistent,
    message: persistent
      ? "Test changes are saved in this browser only."
      : "Temporary memory only; changes will be lost on reload.",
  };

  let state: PreviewState;
  try {
    const stored: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    if (!isState(stored)) throw new Error("No valid saved preview");
    state = stored;
  } catch {
    state = { version: 1, ...seedData(), reports: [], shortlist: {} };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setTimeout(
        () =>
          notice(
            "Browser storage is full. The sample workspace loaded, but saving test changes may fail. Reset this preview or free browser storage.",
          ),
        0,
      );
    }
  }

  function commit(next: PreviewState) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      notice(
        "Browser storage is full. The last change was not saved. Reset this preview or free browser storage before trying again.",
      );
      throw new PreviewError(
        "Browser storage is full. The change was not saved. Try a smaller import or reset the preview.",
      );
    }
    state = next;
  }
  window.__EXTER_RESET_PREVIEW__ = () => {
    storage.removeItem(STORAGE_KEY);
    storage.removeItem("exter-brand");
    storage.removeItem("exter-saved-ads");
    window.location.reload();
  };

  function getBrand(value: unknown): Brand {
    const id = text(value, "brandId", 120);
    const brand = state.brands.find((b) => b.id === id);
    if (!brand) throw new PreviewError("Brand not found.", 404);
    return brand;
  }
  function filters(values: URLSearchParams | Record<string, unknown>) {
    const get = (key: string) =>
      values instanceof URLSearchParams
        ? (values.get(key) ?? undefined)
        : values[key];
    const platform = String(get("platform") ?? "all");
    if (
      platform !== "all" &&
      !CONTENT_PLATFORMS.includes(platform as Ad["platform"])
    )
      throw new PreviewError("platform must be all, Meta, TikTok or Google.");
    const range = Number(get("range") ?? 30);
    if (![7, 30, 90].includes(range))
      throw new PreviewError("range must be 7, 30 or 90 days.");
    return { platform, range };
  }
  function adsFor(brand: Brand, platform = "all", range = 30) {
    const since = new Date(Date.now() - range * 86400000).toISOString();
    return state.ads
      .filter(
        (a) =>
          a.brandId === brand.id &&
          a.source === (brand.mode === "demo" ? "sample" : "import") &&
          a.publishedAt >= since &&
          (platform === "all" || a.platform === platform),
      )
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .map(hydrateAd);
  }
  function creatorsFor(brand: Brand) {
    return brand.mode === "demo"
      ? state.creators.filter((c) => c.category === brand.category)
      : [];
  }
  function dashboardFor(brand: Brand, platform = "all", range = 30) {
    return analyzeRecords(
      brand,
      adsFor(brand, platform, range),
      creatorsFor(brand),
      brand.mode === "demo"
        ? state.reviews.filter((r) => r.brandId === brand.id)
        : [],
      range,
    );
  }
  function images(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(images);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "image" && typeof item === "string"
          ? (window.__EXTER_PREVIEW_IMAGES__?.[item] ?? item)
          : images(item),
      ]),
    );
  }
  function json(value: unknown, status = 200) {
    return new Response(JSON.stringify(images(value)), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
  function findReport(id: string) {
    const report = state.reports.find((r) => r.id === id);
    if (!report) throw new PreviewError("Report not found.", 404);
    return report;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, "https://exter-preview.invalid");
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, init);
    try {
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      let body: Record<string, unknown> = {};
      if (method !== "GET") {
        const source =
          init?.body === undefined && input instanceof Request
            ? await input.text()
            : init?.body;
        if (source != null) {
          if (typeof source !== "string")
            throw new PreviewError(
              "The preview accepts JSON request bodies only.",
            );
          if (source.length > 20 * 1024 * 1024)
            throw new PreviewError("Request exceeds the 20 MB limit.", 413);
          try {
            const parsed: unknown = JSON.parse(source);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
              throw new Error();
            body = parsed as Record<string, unknown>;
          } catch {
            throw new PreviewError("Invalid JSON request body.");
          }
        }
      }
      const path = url.pathname;
      if (method === "GET" && path === "/api/health")
        return json({
          status: "ok",
          service: "exter-offline-preview",
          liveFeeds: false,
          offline: true,
        });
      if (method === "GET" && path === "/api/brain/status")
        return json({
          runtime:
            "Stored sample analysis in this preview; local models run in the full platform",
          claudeRequired: false,
          clientAdAccountRequired: false,
        });
      if (method === "GET" && path === "/api/brain/jobs") return json([]);
      if (
        method === "POST" &&
        (path.startsWith("/api/brain/") || path.startsWith("/api/public/"))
      )
        throw new PreviewError(
          "This is the offline test drive. Public collection and local text/vision inference run in the full Exter server application, without client account access or Claude.",
          409,
        );
      if (method === "GET" && path === "/api/connections") {
        getBrand(url.searchParams.get("brandId"));
        return json({
          connections: ["Meta", "TikTok", "Google"].map((platform) => ({
            platform,
            status: "not_configured",
            missing: [
              "Full application and authorised provider account configuration",
            ],
            lastSuccessfulSyncAt: null,
            latestMetricDate: null,
            lastError: null,
            records: 0,
            scope: "owned_account",
            refreshMode: "manual",
            pollIntervalSeconds: null,
            metricDefinition:
              "This test drive is offline; no external platform is monitored.",
            creativeClassification:
              "Creative formats are supplied annotations, not inferred from generic media.",
          })),
        });
      }
      if (method === "POST" && /^\/api\/connections\//.test(path))
        throw new PreviewError(
          "The test drive is offline. Run the full server application and configure authorised provider access to sync.",
          409,
        );
      if (method === "GET" && path === "/api/formats") {
        const brand = getBrand(url.searchParams.get("brandId"));
        const { platform, range } = filters(url.searchParams);
        const metric = url.searchParams.get("metric") || "engagement";
        if (!["engagement", "cpa", "conversionRate"].includes(metric))
          throw new PreviewError("Invalid format metric.");
        return json(
          analyzeFormats(brand, adsFor(brand, "all", 90), {
            platform,
            range,
            metric: metric as "engagement" | "cpa" | "conversionRate",
            contentSource: url.searchParams.get("contentSource") || "all",
            sourceStatus: { connected: false },
          }),
        );
      }
      const adDetail = path.match(/^\/api\/ads\/([^/]+)$/);
      if (method === "GET" && adDetail) {
        const brand = getBrand(url.searchParams.get("brandId"));
        const ad = state.ads.find(
          (a) =>
            a.id === decodeURIComponent(adDetail[1]) &&
            a.brandId === brand.id &&
            (brand.mode === "demo"
              ? a.source === "sample"
              : a.source !== "sample"),
        );
        if (!ad) throw new PreviewError("Ad not found in this workspace.", 404);
        return json(hydrateAd(ad));
      }
      if (method === "GET" && path === "/api/brands") return json(state.brands);
      if (method === "POST" && path === "/api/brands") {
        const name = text(body.name, "name", 80);
        const existing = state.brands.find(
          (b) => b.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) return json(existing);
        if (!CATEGORIES.includes(body.category as Brand["category"]))
          throw new PreviewError("Choose a supported brand category.");
        let domain = text(body.domain, "domain", 240, true);
        if (domain) {
          try {
            const parsed = new URL(
              domain.includes("://") ? domain : `https://${domain}`,
            );
            if (
              !["http:", "https:"].includes(parsed.protocol) ||
              parsed.username ||
              parsed.password ||
              !parsed.hostname.includes(".")
            )
              throw new Error();
            domain = parsed.hostname;
          } catch {
            throw new PreviewError("Enter a valid website domain.");
          }
        }
        const brand: Brand = {
          id: uuid(),
          name,
          domain,
          category: body.category as Brand["category"],
          color: "#8fae95",
          initials: name.slice(0, 1).toUpperCase(),
          voice: [],
          competitors: [],
          mode: "imported",
          createdAt: new Date().toISOString(),
        };
        commit({ ...state, brands: [...state.brands, brand] });
        return json(brand, 201);
      }
      if (method === "GET" && path === "/api/dashboard") {
        const brand = getBrand(url.searchParams.get("brandId"));
        const { platform, range } = filters(url.searchParams);
        return json(dashboardFor(brand, platform, range));
      }
      if (method === "GET" && path === "/api/ads") {
        const brand = getBrand(url.searchParams.get("brandId"));
        const { platform, range } = filters(url.searchParams);
        let ads = adsFor(brand, platform, range);
        const search = (url.searchParams.get("search") || "")
          .toLowerCase()
          .slice(0, 200);
        if (
          url.searchParams.get("contentSource") &&
          url.searchParams.get("contentSource") !== "all"
        )
          ads = ads.filter(
            (ad) =>
              (ad.contentSource || "paid") ===
              url.searchParams.get("contentSource"),
          );
        if (search)
          ads = ads.filter((a) =>
            [a.title, a.brand, a.copy, a.angle, a.audience].some((s) =>
              s.toLowerCase().includes(search),
            ),
          );
        const angle = url.searchParams.get("angle") || "all";
        if (angle !== "all") ads = ads.filter((a) => a.angle === angle);
        const page = Math.max(1, Number(url.searchParams.get("page") || 1));
        if (!Number.isSafeInteger(page))
          throw new PreviewError("page must be a positive integer.");
        return json({
          items: ads.slice((page - 1) * 12, page * 12),
          total: ads.length,
          page,
          pages: Math.ceil(ads.length / 12),
        });
      }
      if (method === "GET" && path === "/api/creators")
        return json(creatorsFor(getBrand(url.searchParams.get("brandId"))));
      if (
        path === "/api/shortlist" &&
        (method === "GET" || method === "POST")
      ) {
        const brand = getBrand(
          method === "GET" ? url.searchParams.get("brandId") : body.brandId,
        );
        let ids = state.shortlist[brand.id] || [];
        if (method === "POST") {
          const id = text(body.creatorId, "creatorId", 120);
          if (!creatorsFor(brand).some((c) => c.id === id))
            throw new PreviewError(
              "Creator is not available in this workspace.",
            );
          ids = ids.includes(id)
            ? ids.filter((existing) => existing !== id)
            : [...ids, id];
          commit({
            ...state,
            shortlist: { ...state.shortlist, [brand.id]: ids },
          });
        }
        return json({ ids });
      }
      if (method === "POST" && path === "/api/import") {
        const brand = getBrand(body.brandId);
        if (
          !Array.isArray(body.ads) ||
          !body.ads.length ||
          body.ads.length > 10000
        )
          throw new PreviewError(
            "ads must contain between 1 and 10,000 records.",
          );
        const ads = body.ads.map((row) => importRow(row, brand));
        const names = [
          ...new Set([
            ...state.ads
              .filter((a) => a.brandId === brand.id && a.source === "import")
              .map((a) => a.brand),
            ...ads.map((a) => a.brand),
          ]),
        ];
        const nextBrand: Brand = {
          ...brand,
          mode: "imported",
          competitors: names.filter(
            (name) => name.toLowerCase() !== brand.name.toLowerCase(),
          ),
        };
        commit({
          ...state,
          brands: state.brands.map((b) => (b.id === brand.id ? nextBrand : b)),
          ads: [...state.ads, ...ads],
          shortlist: { ...state.shortlist, [brand.id]: [] },
        });
        return json({ imported: ads.length }, 201);
      }
      if (method === "GET" && path === "/api/reports") {
        const brand = getBrand(url.searchParams.get("brandId"));
        return json(
          state.reports
            .filter((r) => r.brandId === brand.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      }
      if (method === "POST" && path === "/api/reports") {
        const brand = getBrand(body.brandId);
        const report: Report = {
          id: uuid(),
          brandId: brand.id,
          title: `${brand.name} · Intelligence brief`,
          createdAt: new Date().toISOString(),
          content: reportContent(dashboardFor(brand))+formatReportSummary(analyzeFormats(brand,adsFor(brand,"all",30),{range:30})),
          mode: brand.mode,
        };
        commit({ ...state, reports: [...state.reports, report] });
        return json(report, 201);
      }
      const download = path.match(/^\/api\/reports\/([^/]+)\/download$/);
      if (method === "GET" && download) {
        const report = findReport(decodeURIComponent(download[1]));
        return new Response(report.content, {
          headers: {
            "Content-Type": "text/markdown",
            "Content-Disposition": `attachment; filename="exter-brief-${report.id}.md"`,
          },
        });
      }
      if (method === "POST" && path === "/api/ask") {
        const brand = getBrand(body.brandId);
        const question = text(body.question, "question", 2000);
        const { platform, range } = filters(body);
        const data: Dashboard = dashboardFor(brand, platform, range);
        return json(
          answerResearchQuestion({
            question,
            brand,
            ads: adsFor(brand, "all", 90),
            dashboard: data,
            platform,
            range,
            metric: body.metric as
              | "engagement"
              | "cpa"
              | "conversionRate"
              | undefined,
            sourceStatus: { connected: false },
          }),
        );
      }
      throw new PreviewError("API route not found.", 404);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The offline preview could not complete this request.",
        },
        error instanceof PreviewError ? error.status : 400,
      );
    }
  };

  document.addEventListener(
    "click",
    (event) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (anchor?.getAttribute("href") === "/") {
        event.preventDefault();
        window.location.reload();
        return;
      }
      const match = anchor
        ?.getAttribute("href")
        ?.match(/^\/api\/reports\/([^/]+)\/download(?:\?.*)?$/);
      if (!match) return;
      event.preventDefault();
      try {
        const report = findReport(decodeURIComponent(match[1]));
        const objectUrl = URL.createObjectURL(
          new Blob([report.content], { type: "text/markdown" }),
        );
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `exter-brief-${report.id}.md`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (error) {
        notice(
          error instanceof Error
            ? error.message
            : "The report could not be downloaded.",
        );
      }
    },
    true,
  );
}
