import type { Ad, Brand } from "../../shared/types.js";

export type Provider = "Meta" | "TikTok" | "Google";
export type ConnectorEnv = Record<string, string | undefined>;
export type FetchLike = typeof fetch;
export interface LiveAd extends Ad {
  source: "live";
  providerAdId: string;
  metricDate: string;
  observedAt: string;
  dateBasis: "report" | "creative";
  creativeFormats: string[];
  currency?: string;
  conversionEvent?: string;
}
export interface ProviderConfig {
  platform: Provider;
  accountId: string;
  accessToken: string;
  developerToken?: string;
  loginCustomerId?: string;
  apiVersion: string;
}
export interface SyncResult {
  ads: LiveAd[];
  latestMetricDate: string | null;
  observedAt: string;
}
export interface ConnectorOptions {
  fetch?: FetchLike;
  env?: ConnectorEnv;
  now?: Date;
}
export class ConnectorError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export const requirements: Record<Provider, string[]> = {
  Meta: ["EXTER_META_ACCESS_TOKEN", "EXTER_META_AD_ACCOUNT_ID"],
  TikTok: ["EXTER_TIKTOK_ACCESS_TOKEN", "EXTER_TIKTOK_ADVERTISER_ID"],
  Google: [
    "EXTER_GOOGLE_ACCESS_TOKEN",
    "EXTER_GOOGLE_DEVELOPER_TOKEN",
    "EXTER_GOOGLE_CUSTOMER_ID",
    "EXTER_GOOGLE_API_VERSION",
  ],
};
export function providerConfig(
  platform: Provider,
  env: ConnectorEnv,
): ProviderConfig {
  const missing = requirements[platform].filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new ConnectorError(
      `Configure ${missing.join(", ")} in environment settings before syncing ${platform}.`,
      409,
    );
  const prefix = `EXTER_${platform.toUpperCase()}`;
  const accountId = String(
    env[
      platform === "Meta"
        ? `${prefix}_AD_ACCOUNT_ID`
        : platform === "TikTok"
          ? `${prefix}_ADVERTISER_ID`
          : `${prefix}_CUSTOMER_ID`
    ],
  )
    .replace(/^act_/, "")
    .replace(/-/g, "");
  if (!/^\d{2,30}$/.test(accountId))
    throw new ConnectorError(
      `${platform} account ID must contain only digits (Google hyphens are accepted).`,
      409,
    );
  const apiVersion =
    platform === "Meta"
      ? env.EXTER_META_GRAPH_VERSION || "v23.0"
      : platform === "Google"
        ? env.EXTER_GOOGLE_API_VERSION!
        : "v1.3";
  if (platform === "Meta" && !/^v\d+\.0$/.test(apiVersion))
    throw new ConnectorError(
      "EXTER_META_GRAPH_VERSION must use the form v23.0.",
      409,
    );
  if (platform === "Google" && !/^v\d+$/.test(apiVersion))
    throw new ConnectorError(
      "EXTER_GOOGLE_API_VERSION must be a currently supported version such as v23.",
      409,
    );
  const loginCustomerId = env.EXTER_GOOGLE_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
  if (loginCustomerId && !/^\d{2,30}$/.test(loginCustomerId))
    throw new ConnectorError(
      "Google manager customer ID must contain only digits.",
      409,
    );
  return {
    platform,
    accountId,
    apiVersion,
    accessToken: env[`${prefix}_ACCESS_TOKEN`]!,
    developerToken: env.EXTER_GOOGLE_DEVELOPER_TOKEN,
    loginCustomerId,
  };
}
export const sinceDate = (now: Date) =>
  new Date(now.getTime() - 89 * 86400000).toISOString().slice(0, 10);
export function safeNumber(
  value: unknown,
  field: string,
  nullable = false,
): number | null {
  if (nullable && (value === null || value === undefined || value === ""))
    return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER)
    throw new ConnectorError(
      `Provider returned an invalid ${field} value; no records were saved.`,
    );
  return n;
}
export function reportDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(value)
  )
    throw new ConnectorError("Provider returned an invalid reporting date.");
  const day = value.slice(0, 10),
    date = new Date(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw new ConnectorError("Provider returned an invalid reporting date.");
  return day;
}
export function liveRecord(
  brand: Brand,
  config: ProviderConfig,
  input: {
    id: string;
    day: string;
    title: string;
    copy?: string;
    media?: string;
    createdAt?: string;
    impressions: unknown;
    engagements: unknown;
    spend?: unknown;
    conversions?: unknown;
    revenue?: unknown;
    currency?: string;
    conversionEvent?: string;
  },
  now: Date,
): LiveAd {
  const day = reportDate(input.day);
  if (day > now.toISOString().slice(0, 10))
    throw new ConnectorError("Provider returned a future metric date.");
  if (!input.id || input.id.length > 200)
    throw new ConnectorError("Provider returned an invalid ad identifier.");
  const creation = input.createdAt ? new Date(input.createdAt) : null;
  const validCreation = creation && Number.isFinite(creation.getTime());
  return {
    id: `live:${config.platform}:${config.accountId}:${brand.id}:${input.id}:${day}`,
    providerAdId: `${config.platform}:${config.accountId}:${input.id}`,
    brandId: brand.id,
    brand: brand.name,
    platform: config.platform,
    category: brand.category,
    title: input.title.slice(0, 200) || `Ad ${input.id}`,
    copy: (input.copy || "").slice(0, 4000),
    angle: "Unclassified",
    audience: "Account reporting — audience not supplied",
    format: input.media || "Unclassified",
    creativeFormats:
      config.platform === "Google" && input.media === "Search"
        ? ["Search / text"]
        : config.platform === "Google" && input.media === "Shopping"
          ? ["Shopping"]
          : config.platform === "Google" && input.media === "Video"
            ? ["Video"]
            : config.platform === "Google" && input.media === "Display"
              ? ["Display"]
              : input.media === "Image"
                ? ["Static"]
                : input.media === "Carousel"
                  ? ["Carousel"]
                  : [],
    image: "",
    color: brand.color,
    active: true,
    publishedAt: validCreation
      ? creation.toISOString()
      : `${day}T00:00:00.000Z`,
    metricDate: day,
    dateBasis: validCreation ? "creative" : "report",
    deliveryStatus: "unknown",
    observedAt: now.toISOString(),
    impressions: safeNumber(input.impressions, "impressions")!,
    engagements: safeNumber(input.engagements, "engagements")!,
    spend: safeNumber(input.spend, "spend", true),
    conversions: safeNumber(input.conversions, "conversions", true),
    revenue: safeNumber(input.revenue, "revenue", true),
    owned: true,
    source: "live",
    sourceUrl: null,
    engagementMetric:
      config.platform === "Meta"
        ? "inline_post_engagement"
        : config.platform === "TikTok"
          ? "likes + comments + shares"
          : "reported Google engagements (not clicks)",
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.conversionEvent
      ? { conversionEvent: input.conversionEvent }
      : {}),
  };
}
