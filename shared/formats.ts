import type { Ad, Brand, Platform } from "./types";
import type {
  FormatAnalysis,
  FormatMetric,
  FormatPerformance,
  FormatSourceStatus,
} from "./format-types";

export const CREATIVE_FORMATS = [
  "UGC",
  "Influencer",
  "Static",
  "Before & after",
  "Live photo",
  "Reviews & testimonials",
  "Product demo",
  "Carousel",
  "Search / text",
  "Shopping",
  "Display",
  "Video",
] as const;
export const PLATFORM_CREATIVE_FORMATS: Record<Platform, readonly string[]> = {
  Instagram: [
    "UGC",
    "Influencer",
    "Static",
    "Before & after",
    "Live photo",
    "Reviews & testimonials",
    "Product demo",
    "Carousel",
  ],
  Facebook: [
    "UGC",
    "Influencer",
    "Static",
    "Before & after",
    "Live photo",
    "Reviews & testimonials",
    "Product demo",
    "Carousel",
  ],
  LinkedIn: [
    "Influencer",
    "Static",
    "Reviews & testimonials",
    "Product demo",
    "Carousel",
    "Video",
  ],
  X: [
    "Influencer",
    "Static",
    "Reviews & testimonials",
    "Product demo",
    "Video",
  ],
  YouTube: [
    "UGC",
    "Influencer",
    "Before & after",
    "Reviews & testimonials",
    "Product demo",
    "Video",
  ],
  Meta: [
    "UGC",
    "Influencer",
    "Static",
    "Before & after",
    "Live photo",
    "Reviews & testimonials",
    "Product demo",
    "Carousel",
  ],
  TikTok: [
    "UGC",
    "Influencer",
    "Before & after",
    "Reviews & testimonials",
    "Product demo",
    "Carousel",
  ],
  Google: [
    "Search / text",
    "Shopping",
    "Display",
    "Video",
    "Static",
    "Product demo",
    "Reviews & testimonials",
  ],
};
type AnnotatedAd = Ad & { creativeFormats?: string[]; observedAt?: string };
const key = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_–—/-]+/g, " ")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ");
const aliases: Record<string, string> = {
  ugc: "UGC",
  "user generated content": "UGC",
  "user generated": "UGC",
  influencer: "Influencer",
  influencers: "Influencer",
  "influencer led": "Influencer",
  "creator led": "Influencer",
  static: "Static",
  "static image": "Static",
  image: "Static",
  images: "Static",
  "before and after": "Before & after",
  "before after": "Before & after",
  "live photo": "Live photo",
  "live photos": "Live photo",
  livephoto: "Live photo",
  cinemagraph: "Live photo",
  review: "Reviews & testimonials",
  reviews: "Reviews & testimonials",
  testimonial: "Reviews & testimonials",
  testimonials: "Reviews & testimonials",
  "reviews and testimonials": "Reviews & testimonials",
  "review testimonial": "Reviews & testimonials",
  "reviews testimonials": "Reviews & testimonials",
  "product demo": "Product demo",
  "product demonstration": "Product demo",
  demo: "Product demo",
  tutorial: "Product demo",
  carousel: "Carousel",
  carousels: "Carousel",
  search: "Search / text",
  text: "Search / text",
  "search text": "Search / text",
  "text ad": "Search / text",
  "responsive search ad": "Search / text",
  rsa: "Search / text",
  shopping: "Shopping",
  "shopping ad": "Shopping",
  "product shopping": "Shopping",
  display: "Display",
  "display ad": "Display",
  "responsive display ad": "Display",
  video: "Video",
  "video ad": "Video",
};
for (const label of CREATIVE_FORMATS) aliases[key(label)] = label;

/** Explicit annotations only. Unknown labels stay unclassified instead of being guessed. */
export function normalizeCreativeFormats(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map((v) => aliases[key(v)])
        .filter(Boolean),
    ),
  ];
}
export function classifyCreativeFormats(ad: Ad): string[] {
  const explicit = normalizeCreativeFormats(
    (ad as AnnotatedAd).creativeFormats,
  );
  if (explicit.length) return explicit;
  // An image is observably static; video alone does not establish UGC, influencer or a review.
  return /^(image|static|static image)$/i.test(ad.format.trim())
    ? ["Static"]
    : ["Unclassified"];
}
export function annotateSampleAd(ad: Ad): Ad {
  if (
    String(ad.source) !== "sample" ||
    normalizeCreativeFormats((ad as AnnotatedAd).creativeFormats).length
  )
    return ad;
  let hash = 2166136261;
  for (const char of `${ad.id}:${ad.category}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const choices = PLATFORM_CREATIVE_FORMATS[ad.platform];
  const tags = [choices[hash % choices.length]];
  if (hash % 7 === 0 && !tags.includes("Reviews & testimonials"))
    tags.push("Reviews & testimonials");
  return { ...ad, creativeFormats: tags } as Ad;
}

export interface FormatOptions {
  platform?: string;
  contentSource?: string;
  range?: number;
  metric?: FormatMetric;
  sourceStatus?: FormatSourceStatus | null;
}
export function selectFormatRecords(
  brand: Brand,
  ads: Ad[],
  opts: FormatOptions = {},
): Ad[] {
  const cutoff = Date.now() - (opts.range ?? 30) * 86400000;
  return ads.filter(
    (ad) =>
      ad.brandId === brand.id &&
      ad.category === brand.category &&
      (!opts.contentSource ||
        opts.contentSource === "all" ||
        (ad.contentSource || "paid") === opts.contentSource) &&
      (brand.mode === "demo"
        ? String(ad.source) === "sample"
        : String(ad.source) !== "sample") &&
      (!opts.platform ||
        opts.platform === "all" ||
        ad.platform === opts.platform) &&
      Number.isFinite(metricTime(ad)) &&
      metricTime(ad) >=
        (ad.metricDate ? new Date(cutoff).setUTCHours(0, 0, 0, 0) : cutoff) &&
      metricTime(ad) <= Date.now() + 300000,
  );
}
const metricTime = (ad: Ad) =>
  Date.parse(
    ad.metricDate
      ? `${ad.metricDate}T00:00:00Z`
      : ad.dateBasis === "observed" && ad.observedAt
        ? ad.observedAt
        : ad.publishedAt,
  );
const identity = (ad: Ad) =>
  ad.providerAdId ? `${ad.platform}:${ad.providerAdId}` : ad.id;
const countAds = (ads: Ad[]) => new Set(ads.map(identity)).size;
const sum = (ads: Ad[], field: "impressions" | "engagements") =>
  ads.reduce((total, ad) => total + ad[field], 0);
const percent = (numerator: number, denominator: number) =>
  denominator ? (numerator / denominator) * 100 : 0;

/** Rankings are calculated separately on each platform; multi-label groups can overlap. */
export function analyzeFormats(
  brand: Brand,
  allAds: Ad[],
  opts: FormatOptions = {},
): FormatAnalysis {
  const metric = opts.metric ?? "engagement";
  const ads = selectFormatRecords(brand, allAds, opts);
  const selectedPlatforms: Platform[] =
    opts.platform && opts.platform !== "all"
      ? [opts.platform as Platform]
      : [
          ...new Set<Platform>([
            "Meta",
            "TikTok",
            "Google",
            ...ads.map((ad) => ad.platform),
          ]),
        ];
  const platforms = selectedPlatforms.map((platform) => {
    const records = ads.filter((ad) => ad.platform === platform);
    const relevant = records.filter((ad) => ad.metricsAvailable !== false);
    const bases = new Set(
      relevant
        .map((ad) => ad.engagementRateBasis || "impressions")
        .filter((b) => b !== "unavailable"),
    );
    const currencies = new Set(
      records
        .filter(
          (ad) => ad.owned && ad.spend !== null && ad.conversions !== null,
        )
        .map((ad) => ad.currency)
        .filter(Boolean),
    );
    const events = new Set(
      records
        .filter((ad) => ad.owned && ad.conversions !== null)
        .map((ad) => ad.conversionEvent)
        .filter(Boolean),
    );
    const incompatible =
      metric === "engagement" && bases.size > 1
        ? "Engagement denominator bases differ (views, followers or impressions); do not rank these formats together."
        : metric !== "engagement" && (currencies.size > 1 || events.size > 1)
          ? "Currencies or conversion-event definitions differ; a valid conversion ranking requires compatible records."
          : null;
    const groups = new Map<string, Ad[]>();
    for (const ad of records)
      for (const name of classifyCreativeFormats(ad)) {
        const rows = groups.get(name) || [];
        rows.push(ad);
        groups.set(name, rows);
      }
    const rankings: FormatPerformance[] = [...groups].map(([name, rows]) => {
      const owned = rows.filter((ad) => ad.owned && ad.conversions !== null);
      const measured = owned.filter((ad) => ad.spend !== null);
      const conversions = owned.length
        ? owned.reduce((total, ad) => total + ad.conversions!, 0)
        : null;
      const matchedConversions = measured.reduce(
        (total, ad) => total + ad.conversions!,
        0,
      );
      const spend = measured.length
        ? measured.reduce((total, ad) => total + ad.spend!, 0)
        : null;
      const ownedImpressions = sum(owned, "impressions");
      const impressions = sum(rows, "impressions");
      const engagements = sum(rows, "engagements");
      const measuredRows = rows.filter(
        (ad) =>
          ad.metricsAvailable !== false &&
          (ad.engagementRateBasis || "impressions") !== "unavailable",
      );
      const denominator = measuredRows.reduce(
        (n, ad) =>
          n +
          ((ad.engagementRateBasis === "views"
            ? ad.views
            : ad.engagementRateBasis === "followers"
              ? ad.followers
              : ad.impressions) || 0),
        0,
      );
      const measuredEngagements = sum(measuredRows, "engagements");
      const basis =
        [
          ...new Set(
            measuredRows.map((ad) => ad.engagementRateBasis || "impressions"),
          ),
        ].join(" / ") || "unavailable";
      return {
        name,
        platform,
        ads: countAds(rows),
        observations: rows.length,
        impressions,
        engagements,
        engagementRate: percent(measuredEngagements, denominator),
        engagementDenominator: denominator,
        engagementRateBasis: basis,
        measuredEngagements,
        ownedImpressions,
        conversions,
        spend,
        cpa:
          spend !== null && matchedConversions > 0
            ? spend / matchedConversions
            : null,
        conversionRate:
          conversions !== null && ownedImpressions > 0
            ? percent(conversions, ownedImpressions)
            : null,
        adIds: rows.map((ad) => ad.id),
        rank: null,
        limitedSample: countAds(rows) < 3,
      };
    });
    const value = (row: FormatPerformance): number | null =>
      incompatible
        ? null
        : metric === "engagement"
          ? row.engagementDenominator > 0 && row.measuredEngagements > 0
            ? row.engagementRate
            : null
          : metric === "cpa"
            ? row.cpa
            : row.conversionRate;
    rankings.sort((a, b) => {
      if (a.name === "Unclassified") return 1;
      if (b.name === "Unclassified") return -1;
      const av = value(a),
        bv = value(b);
      if (av === null) return bv === null ? a.name.localeCompare(b.name) : 1;
      if (bv === null) return -1;
      return (
        (metric === "cpa" ? av - bv : bv - av) ||
        b.ads - a.ads ||
        a.name.localeCompare(b.name)
      );
    });
    let position = 0;
    for (const row of rankings)
      if (row.name !== "Unclassified" && value(row) !== null)
        row.rank = ++position;
    const winner = rankings.find((row) => row.rank === 1) || null;
    const classifiedIds = new Set(
      records
        .filter((ad) => !classifyCreativeFormats(ad).includes("Unclassified"))
        .map(identity),
    );
    const unclassifiedAds = new Set(
      records
        .filter(
          (ad) =>
            classifyCreativeFormats(ad).includes("Unclassified") &&
            !classifiedIds.has(identity(ad)),
        )
        .map(identity),
    ).size;
    return {
      platform,
      ads: countAds(records),
      observations: records.length,
      classifiedAds: classifiedIds.size,
      unclassifiedAds,
      rankings,
      winner,
      missingMetric:
        incompatible ||
        (winner
          ? null
          : !records.length
            ? "No ads in the selected period."
            : !position && metric !== "engagement"
              ? "No comparable owned conversion records for annotated creative formats."
              : "Creative formats have not been annotated, or no measurable engagement denominators are available."),
    };
  });
  const sampleAds = countAds(
    ads.filter((ad) => String(ad.source) === "sample"),
  );
  const importedAds = countAds(
    ads.filter((ad) => ["import", "public"].includes(String(ad.source))),
  );
  const liveAds = countAds(ads.filter((ad) => String(ad.source) === "live"));
  const unclassifiedAds = platforms.reduce(
    (total, platform) => total + platform.unclassifiedAds,
    0,
  );
  const notes = [
    "Creative formats are multi-label: UGC can also be a review or before-and-after creative. Group totals can overlap.",
    "Rankings describe the available records, not the whole category or a causal lift. Platforms have different metric definitions; do not compare their engagement rates as one leaderboard.",
    "Conversions and CPA use owned-account records only. Conversion rate means reported conversions per measured owned impression, not click-to-conversion rate. CPA requires matching spend and conversions on the same records; currency and attribution window must be comparable.",
    "Groups with fewer than three ads have limited samples; no statistical-significance claim is made.",
    "Daily reporting observations are summed for performance. Ads are counted by distinct provider ad ID where supplied, not by the number of daily rows.",
  ];
  if (sampleAds)
    notes.unshift(
      "Sample data only: these figures are fictional and do not establish what works in the live market.",
    );
  if (!opts.sourceStatus?.connected)
    notes.push(
      "No verified live source connection was supplied. Importing or refreshing records is not live monitoring.",
    );
  if (unclassifiedAds)
    notes.push(
      `${unclassifiedAds} ads are unclassified; no creative style was guessed from generic video media or copy.`,
    );
  const sources = [sampleAds > 0, importedAds > 0, liveAds > 0].filter(
    Boolean,
  ).length;
  return {
    brandId: brand.id,
    category: brand.category,
    range: opts.range ?? 30,
    platform: opts.platform || "all",
    metric,
    totalAds: countAds(ads),
    totalObservations: ads.length,
    classifiedAds: countAds(ads) - unclassifiedAds,
    unclassifiedAds,
    sampleAds,
    importedAds,
    liveAds,
    dataMode: !ads.length
      ? "empty"
      : sources > 1
        ? "mixed"
        : sampleAds
          ? "sample"
          : liveAds
            ? "live"
            : "imported",
    generatedAt: new Date().toISOString(),
    lastObservedAt:
      ads
        .map((ad) => (ad as AnnotatedAd).observedAt)
        .filter(
          (date): date is string =>
            Boolean(date) && Number.isFinite(Date.parse(date!)),
        )
        .sort()
        .at(-1) || null,
    sourceStatus: opts.sourceStatus || null,
    platforms,
    formats: platforms.flatMap((platform) => platform.rankings),
    notes,
  };
}

export function formatReportSummary(analysis:FormatAnalysis):string {return "\n\n## Creative formats by platform\nCategory: "+analysis.category+". Period: "+analysis.range+" days. Metric: "+analysis.metric+".\n"+analysis.platforms.map(platform=>platform.winner?`- ${platform.platform}: ${platform.winner.name}; ${platform.winner.engagementRate.toFixed(2)}% engagements / ${platform.winner.engagementRateBasis}, ${platform.winner.ads} creatives. Source IDs: ${platform.winner.adIds.slice(0,3).join(', ')}.`:`- ${platform.platform}: ${platform.missingMetric||'No comparable records.'}`).join('\n')+"\nCreative styles may overlap; rankings describe available observations, not guaranteed live performance or causal lift.\n";}
