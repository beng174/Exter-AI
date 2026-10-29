import type { Brand } from "../../shared/types.js";
import { providerJson } from "./http.js";
import {
  ConnectorError,
  liveRecord,
  reportDate,
  safeNumber,
  sinceDate,
  type FetchLike,
  type LiveAd,
  type ProviderConfig,
  type SyncResult,
} from "./types.js";

const MAX_RECORDS = 100000;
function result(ads: LiveAd[], now: Date): SyncResult {
  if (ads.length > MAX_RECORDS)
    throw new ConnectorError(
      "This sync exceeds 100,000 ad-day records. Narrow the reporting scope before retrying; no partial data was saved.",
    );
  const unique = new Map(ads.map((ad) => [ad.id, ad]));
  const records = [...unique.values()];
  return {
    ads: records,
    latestMetricDate:
      records
        .map((ad) => ad.metricDate)
        .sort()
        .at(-1) || null,
    observedAt: now.toISOString(),
  };
}
function actionValue(actions: unknown, names: string[]): number | null {
  if (!Array.isArray(actions)) return null;
  for (const name of names) {
    const action = actions.find(
      (item: unknown) =>
        !!item &&
        typeof item === "object" &&
        (item as any).action_type === name,
    );
    if (action) return safeNumber(action.value, name, true);
  }
  return null;
}
async function metaPages(
  fetcher: FetchLike,
  url: URL,
  token: string,
): Promise<any[]> {
  const rows: any[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 500; page++) {
    const body = await providerJson(
      fetcher,
      url,
      { headers: { Authorization: `Bearer ${token}` } },
      "graph.facebook.com",
    );
    if (body.error || !Array.isArray(body.data))
      throw new ConnectorError(
        "Meta returned an API error or unexpected schema. Check reporting permissions; no records were saved.",
      );
    rows.push(...body.data);
    if (rows.length > MAX_RECORDS)
      throw new ConnectorError(
        "Meta reporting exceeds the 100,000-record sync limit; no partial records were saved.",
      );
    if (!body.paging?.next) return rows;
    const cursor = body.paging?.cursors?.after;
    if (typeof cursor !== "string" || !cursor || seen.has(cursor))
      throw new ConnectorError(
        "Meta returned an invalid pagination cursor; no partial records were saved.",
      );
    seen.add(cursor);
    // Reconstruct the next URL from our fixed host; never use paging.next.
    url.searchParams.set("after", cursor);
  }
  throw new ConnectorError(
    "Meta pagination did not finish within the sync limit; no partial records were saved.",
  );
}
export async function syncMeta(
  brand: Brand,
  config: ProviderConfig,
  fetcher: FetchLike,
  now: Date,
): Promise<SyncResult> {
  const base = `https://graph.facebook.com/${config.apiVersion}/act_${config.accountId}`;
  const metadataUrl = new URL(`${base}/ads`);
  metadataUrl.searchParams.set(
    "fields",
    "id,name,created_time,creative{id,body,object_story_spec}",
  );
  metadataUrl.searchParams.set("limit", "500");
  const metadata = await metaPages(fetcher, metadataUrl, config.accessToken);
  const byId = new Map(metadata.map((row) => [String(row.id), row]));
  const insights = new URL(`${base}/insights`);
  insights.searchParams.set("level", "ad");
  insights.searchParams.set(
    "fields",
    "ad_id,ad_name,date_start,date_stop,impressions,inline_post_engagement,spend,actions,action_values,account_currency",
  );
  insights.searchParams.set("time_increment", "1");
  insights.searchParams.set(
    "time_range",
    JSON.stringify({
      since: sinceDate(now),
      until: now.toISOString().slice(0, 10),
    }),
  );
  insights.searchParams.set("limit", "500");
  const rows = await metaPages(fetcher, insights, config.accessToken);
  const ads = rows.map((row) => {
    const ad = byId.get(String(row.ad_id));
    const story = ad?.creative?.object_story_spec;
    const media = story?.video_data
      ? "Video"
      : story?.link_data?.child_attachments?.length
        ? "Carousel"
        : story?.link_data?.image_hash || story?.photo_data
          ? "Image"
          : "Unclassified";
    return liveRecord(
      brand,
      config,
      {
        id: String(row.ad_id || ""),
        day: row.date_start,
        title: row.ad_name || ad?.name || `Meta ad ${row.ad_id}`,
        copy: ad?.creative?.body,
        media,
        createdAt: ad?.created_time,
        impressions: row.impressions,
        engagements: row.inline_post_engagement ?? 0,
        spend: row.spend,
        conversions: actionValue(row.actions, [
          "omni_purchase",
          "purchase",
          "offsite_conversion.fb_pixel_purchase",
        ]),
        revenue: actionValue(row.action_values, [
          "omni_purchase",
          "purchase",
          "offsite_conversion.fb_pixel_purchase",
        ]),
        currency: row.account_currency,
        conversionEvent: "Purchases (reported attribution window)",
      },
      now,
    );
  });
  return result(ads, now);
}
async function tiktokPages(
  fetcher: FetchLike,
  url: URL,
  token: string,
): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 1; page <= 200; page++) {
    url.searchParams.set("page", String(page));
    const body = await providerJson(
      fetcher,
      url,
      { headers: { "Access-Token": token } },
      "business-api.tiktok.com",
    );
    if (body.code !== 0 || !body.data || !Array.isArray(body.data.list))
      throw new ConnectorError(
        "TikTok returned an API error or unexpected schema. Check advertiser reporting permissions; no records were saved.",
      );
    rows.push(...body.data.list);
    if (rows.length > MAX_RECORDS)
      throw new ConnectorError(
        "TikTok reporting exceeds the 100,000-record sync limit; no partial records were saved.",
      );
    const pages = Number(body.data.page_info?.total_page ?? 1);
    if (!Number.isSafeInteger(pages) || pages < 0)
      throw new ConnectorError("TikTok returned invalid pagination metadata.");
    if (page >= pages) return rows;
  }
  throw new ConnectorError(
    "TikTok pagination did not finish within the sync limit; no partial records were saved.",
  );
}
export async function syncTikTok(
  brand: Brand,
  config: ProviderConfig,
  fetcher: FetchLike,
  now: Date,
): Promise<SyncResult> {
  const metadataUrl = new URL(
    "https://business-api.tiktok.com/open_api/v1.3/ad/get/",
  );
  metadataUrl.searchParams.set("advertiser_id", config.accountId);
  metadataUrl.searchParams.set("page_size", "1000");
  const metadata = await tiktokPages(fetcher, metadataUrl, config.accessToken),
    byId = new Map(metadata.map((row) => [String(row.ad_id), row]));
  const report = new URL(
    "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/",
  );
  for (const [key, value] of Object.entries({
    advertiser_id: config.accountId,
    report_type: "BASIC",
    data_level: "AUCTION_AD",
    dimensions: JSON.stringify(["ad_id", "stat_time_day"]),
    metrics: JSON.stringify([
      "impressions",
      "spend",
      "conversion",
      "likes",
      "comments",
      "shares",
    ]),
    start_date: sinceDate(now),
    end_date: now.toISOString().slice(0, 10),
    page_size: "1000",
  }))
    report.searchParams.set(key, value);
  const rows = await tiktokPages(fetcher, report, config.accessToken);
  const ads = rows.map((row) => {
    const dimensions = row.dimensions || {},
      metrics = row.metrics || {},
      ad = byId.get(String(dimensions.ad_id));
    const engagements = ["likes", "comments", "shares"].reduce(
      (sum, key) => sum + safeNumber(metrics[key], `TikTok ${key}`)!,
      0,
    );
    return liveRecord(
      brand,
      config,
      {
        id: String(dimensions.ad_id || ""),
        day: dimensions.stat_time_day,
        title: ad?.ad_name || `TikTok ad ${dimensions.ad_id}`,
        copy: ad?.ad_text,
        media: ad?.ad_format?.includes("VIDEO")
          ? "Video"
          : ad?.ad_format?.includes("IMAGE")
            ? "Image"
            : "Unclassified",
        createdAt:
          typeof ad?.create_time === "number"
            ? new Date(ad.create_time * 1000).toISOString()
            : undefined,
        impressions: metrics.impressions,
        engagements,
        spend: metrics.spend,
        conversions: metrics.conversion,
        conversionEvent: "TikTok configured conversion event",
      },
      now,
    );
  });
  return result(ads, now);
}
export async function syncGoogle(
  brand: Brand,
  config: ProviderConfig,
  fetcher: FetchLike,
  now: Date,
): Promise<SyncResult> {
  const url = new URL(
    `https://googleads.googleapis.com/${config.apiVersion}/customers/${config.accountId}/googleAds:searchStream`,
  );
  const query = `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, segments.date, customer.currency_code, metrics.impressions, metrics.engagements, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM ad_group_ad WHERE segments.date BETWEEN '${sinceDate(now)}' AND '${now.toISOString().slice(0, 10)}'`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.accessToken}`,
    "developer-token": config.developerToken!,
    "Content-Type": "application/json",
  };
  if (config.loginCustomerId)
    headers["login-customer-id"] = config.loginCustomerId;
  const chunks = await providerJson(
    fetcher,
    url,
    { method: "POST", headers, body: JSON.stringify({ query }) },
    "googleads.googleapis.com",
  );
  if (!Array.isArray(chunks))
    throw new ConnectorError(
      "Google Ads returned an API error or unexpected streaming schema; no records were saved.",
    );
  const rows: any[] = [];
  for (const chunk of chunks) {
    if (chunk.error || !Array.isArray(chunk.results))
      throw new ConnectorError(
        "Google Ads returned an incomplete reporting stream; no records were saved.",
      );
    rows.push(...chunk.results);
    if (rows.length > MAX_RECORDS)
      throw new ConnectorError(
        "Google Ads reporting exceeds the 100,000-record sync limit; no partial records were saved.",
      );
  }
  const ads = rows.map((row) => {
    const ad = row.adGroupAd?.ad || {},
      metrics = row.metrics || {},
      kind = String(ad.type || "");
    const media = kind.includes("SEARCH")
      ? "Search"
      : kind.includes("SHOPPING")
        ? "Shopping"
        : kind.includes("DISPLAY")
          ? "Display"
          : kind.includes("IMAGE")
            ? "Image"
            : kind.includes("VIDEO")
              ? "Video"
              : "Unclassified";
    return liveRecord(
      brand,
      config,
      {
        id: String(ad.id || ""),
        day: row.segments?.date,
        title: ad.name || `${media} ad ${ad.id}`,
        media,
        impressions: metrics.impressions,
        engagements: metrics.engagements ?? 0,
        spend:
          safeNumber(metrics.costMicros, "Google cost_micros", true) === null
            ? null
            : Number(metrics.costMicros) / 1e6,
        conversions: metrics.conversions,
        revenue: metrics.conversionsValue,
        currency: row.customer?.currencyCode,
        conversionEvent: "Google Ads primary conversion actions",
      },
      now,
    );
  });
  return result(ads, now);
}
