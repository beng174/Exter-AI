import type { Ad, Brand } from "./types";

/** Verified advertiser identity, rather than a keyword match for “Valentte”. */
export const VALENTTE_META_PAGE_ID = "172851066181411";
export const META_LIBRARY_METRIC_CAVEAT =
  "Meta Ad Library supplied creative and delivery evidence, not measured likes, comments, shares, views or impressions for these ads. Engagement rate is unavailable. Delivery start is not the original social-post publication date. This bounded capture is not exhaustive monitoring.";

export interface MetaLibrarySource {
  url: string;
  requestUrl: string;
  observedAt: string;
  httpStatus: number | null;
}
export interface MetaLibraryImport {
  source: MetaLibrarySource;
  ads: Ad[];
  excludedAdvertiserRecords: number;
}
export interface MetaLibrarySnapshot {
  brandId: string;
  brandName: string;
  advertiserPageId: string;
  observedAt: string;
  sources: MetaLibrarySource[];
  coverage: {
    uniqueAds: number;
    activeAds: number;
    excludedAdvertiserRecords: number;
  };
  metricCaveat: string;
  ads: Ad[];
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function nativeId(value: unknown, label: string): string {
  // Numbers can lose precision for long platform identifiers; require strings.
  if (typeof value !== "string" || !/^\d{5,30}$/.test(value))
    throw new Error(`${label} must be a native numeric string identifier.`);
  return value;
}
function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error(`${label} must be an explicit ISO capture timestamp.`);
  return new Date(value).toISOString();
}
function deliveryDate(value: unknown, label: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 253402300799
  )
    throw new Error(`${label} must be Unix seconds or null.`);
  return new Date(value * 1000).toISOString();
}
function libraryUrl(value: unknown, label: string): string {
  let url: URL;
  try {
    url = new URL(text(value));
  } catch {
    throw new Error(`${label} must be an official Meta Ad Library URL.`);
  }
  if (
    url.protocol !== "https:" ||
    !["www.facebook.com", "facebook.com"].includes(url.hostname) ||
    !/^\/ads\/library\/?$/.test(url.pathname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error(`${label} must be an official Meta Ad Library URL.`);
  // Only public search parameters are retained, never opaque query credentials.
  const safe = new URL("https://www.facebook.com/ads/library/");
  for (const key of [
    "id", "active_status", "ad_type", "country", "q", "search_type",
    "media_type", "view_all_page_id", "is_targeted_country",
    "sort_data[mode]", "sort_data[direction]",
  ]) {
    const value = url.searchParams.get(key);
    if (value !== null) safe.searchParams.set(key, value.slice(0, 200));
  }
  return safe.href;
}
function excerpt(value: unknown, limit: number) {
  const raw = text(value).replace(/\s+/g, " ");
  return { value: raw.slice(0, limit), truncated: raw.length > limit };
}
function mediaFormat(value: unknown) {
  switch (text(value).toUpperCase()) {
    case "IMAGE": return { label: "Static image", styles: ["Static"] };
    case "VIDEO": return { label: "Video", styles: [] };
    case "CAROUSEL": return { label: "Carousel", styles: ["Carousel"] };
    case "DCO": return { label: "Dynamic creative", styles: [] };
    case "DPA": return { label: "Dynamic product ad", styles: [] };
    default: return { label: "Unknown media format", styles: [] };
  }
}
function profileUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value));
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !["www.facebook.com", "facebook.com", "www.instagram.com", "instagram.com"].includes(url.hostname))
      return null;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch { return null; }
}

/** Normalize only source-supported fields from an ordinary rendered-page capture. */
export function normalizeMetaLibraryCapture(
  input: unknown,
  brand: Brand,
): MetaLibraryImport {
  if (brand.name.toLowerCase() !== "valentte" ||
      brand.domain.toLowerCase().replace(/^www\./, "") !== "valentte.com")
    throw new Error("This importer is scoped to the verified Valentte advertiser.");
  const capture = object(input, "Capture");
  const observedAt = timestamp(capture.observedAt, "observedAt");
  const url = libraryUrl(capture.renderedUrl || capture.requestUrl || capture.source, "Capture source");
  const requestUrl = libraryUrl(capture.requestUrl || capture.renderedUrl || capture.source, "Requested source");
  if (!Array.isArray(capture.ads) || capture.ads.length > 10000)
    throw new Error("Capture ads must be an array of at most 10,000 records.");
  const records: Ad[] = [];
  let excludedAdvertiserRecords = 0;
  const ids = new Set<string>();
  for (const raw of capture.ads) {
    const row = object(raw, "Ad record");
    const page = nativeId(row.page_id, "page_id");
    if (page !== VALENTTE_META_PAGE_ID) {
      excludedAdvertiserRecords++;
      continue;
    }
    const snapshot = object(row.snapshot, "Ad snapshot");
    const snapshotPage = nativeId(snapshot.page_id, "snapshot.page_id");
    let partner: Ad["brandedContentPartner"];
    if (snapshotPage === page) {
      if (text(snapshot.page_name).toLowerCase() !== "valentte")
        throw new Error("Advertiser identity is inconsistent with the verified Valentte page.");
    } else {
      // A partnership card uses the creator as snapshot.page_id, while the
      // explicit branded_content relationship identifies the advertiser.
      const relationship = object(snapshot.branded_content, "Branded-content advertiser relationship");
      if (nativeId(relationship.page_id, "branded_content.page_id") !== page ||
          text(relationship.page_name).toLowerCase() !== "valentte" ||
          text(row.page_name).toLowerCase() !== "valentte" || !text(snapshot.page_name))
        throw new Error("Advertiser identity is inconsistent with the verified Valentte page.");
      partner = {
        pageId: snapshotPage,
        name: excerpt(snapshot.page_name, 120).value,
        profileUrl: profileUrl(snapshot.page_profile_uri),
      };
    }
    const id = nativeId(row.ad_archive_id, "ad_archive_id");
    if (ids.has(id)) continue;
    ids.add(id);
    if (typeof row.is_active !== "boolean")
      throw new Error("is_active must be a source-provided boolean.");
    const start = deliveryDate(row.start_date, "start_date");
    const rawStop = deliveryDate(row.end_date, "end_date");
    // An end_date in an active card does not prove that delivery has stopped.
    const stop = row.is_active ? undefined : rawStop;
    if (start && stop && stop < start)
      throw new Error("Delivery stop cannot precede delivery start.");
    const body = snapshot.body === null || snapshot.body === undefined
      ? {} : object(snapshot.body, "Ad copy");
    const copy = excerpt(body.text, 400);
    const title = excerpt(snapshot.title, 160).value;
    const media = mediaFormat(snapshot.display_format);
    const publishers = Array.isArray(row.publisher_platform)
      ? [...new Set(row.publisher_platform.filter((v): v is string =>
          typeof v === "string" && /^[A-Z_]{1,30}$/.test(v)))]
      : [];
    records.push({
      id: `meta-library:${brand.id}:${id}`,
      brandId: brand.id,
      brand: brand.name,
      platform: "Meta",
      category: brand.category,
      title: title || `Valentte ad ${id}`,
      copy: copy.value,
      copyTruncated: copy.truncated,
      angle: "Not analysed",
      audience: "Not inferred",
      format: media.label,
      creativeFormats: media.styles,
      contentSource: "paid",
      providerAdId: id,
      advertiserPageId: page,
      brandedContentPartner: partner,
      publisherPlatforms: publishers,
      observedAt,
      firstObservedAt: observedAt,
      deliveryStartAt: start,
      deliveryStopAt: stop,
      dateBasis: start ? "delivery" : "observed",
      publishedAt: start || observedAt,
      active: row.is_active,
      deliveryStatus: row.is_active ? "active" : "inactive",
      image: "",
      color: brand.color,
      // Numeric compatibility fields are explicitly not measurements.
      metricsAvailable: false,
      engagementRateBasis: "unavailable",
      engagementMetric: "Not supplied by Meta Ad Library",
      impressions: 0,
      engagements: 0,
      spend: null,
      conversions: null,
      revenue: null,
      owned: false,
      source: "public",
      sourceUrl: `https://www.facebook.com/ads/library/?id=${id}`,
    });
  }
  return {
    source: {
      url,
      requestUrl,
      observedAt,
      httpStatus: typeof capture.status === "number" && Number.isInteger(capture.status)
        && capture.status >= 100 && capture.status <= 599 ? capture.status : null,
    },
    ads: records,
    excludedAdvertiserRecords,
  };
}

/** Stable native IDs make repeated captures updates, without losing saved analysis. */
export function mergeMetaLibraryAds(existing: Ad[], incoming: Ad[]): Ad[] {
  const result = new Map<string, Ad>();
  for (const ad of [...existing, ...incoming]) {
    if (ad.source !== "public" || ad.platform !== "Meta" ||
        ad.advertiserPageId !== VALENTTE_META_PAGE_ID || !ad.providerAdId)
      throw new Error("Only verified Valentte Meta library records can be merged.");
    const key = `${ad.brandId}:${ad.providerAdId}`;
    const previous = result.get(key);
    if (!previous) {
      result.set(key, ad);
      continue;
    }
    const latest = (ad.observedAt || "") >= (previous.observedAt || "") ? ad : previous;
    const first = [previous.firstObservedAt || previous.observedAt, ad.firstObservedAt || ad.observedAt]
      .filter((date): date is string => Boolean(date)).sort()[0];
    result.set(key, {
      ...latest,
      firstObservedAt: first,
      analysis: previous.analysis || ad.analysis,
      creativeFormats: [...new Set([...(previous.creativeFormats || []), ...(ad.creativeFormats || [])])],
    });
  }
  return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildMetaLibrarySnapshot(
  brand: Brand,
  imports: MetaLibraryImport[],
  existing: Ad[] = [],
): MetaLibrarySnapshot {
  if (!imports.length) throw new Error("At least one captured source is required.");
  const ads = mergeMetaLibraryAds(existing, imports.flatMap((value) => value.ads));
  if (ads.some((ad) => ad.brandId !== brand.id))
    throw new Error("A library snapshot cannot include another workspace's records.");
  return {
    brandId: brand.id,
    brandName: brand.name,
    advertiserPageId: VALENTTE_META_PAGE_ID,
    observedAt: imports.map((value) => value.source.observedAt).sort().at(-1)!,
    sources: imports.map((value) => value.source),
    coverage: {
      uniqueAds: ads.length,
      activeAds: ads.filter((ad) => ad.active).length,
      excludedAdvertiserRecords: imports.reduce((sum, value) => sum + value.excludedAdvertiserRecords, 0),
    },
    metricCaveat: META_LIBRARY_METRIC_CAVEAT,
    ads,
  };
}
