import type {
  Ad,
  Angle,
  Brand,
  Competitor,
  Creator,
  Dashboard,
  Review,
  TrendPoint,
} from "./types.js";

const sum = (ads: Ad[], key: "impressions" | "engagements") =>
  ads.reduce((n, a) => n + a[key], 0);
const percent = (n: number, d: number) => (d ? (n / d) * 100 : 0);
function performanceGroups(ads: Ad[], field: "angle" | "audience"): Angle[] {
  const groups = new Map<string, Ad[]>();
  for (const ad of ads) {
    const existing = groups.get(ad[field]);
    if (existing) existing.push(ad);
    else groups.set(ad[field], [ad]);
  }
  return [...groups]
    .map(([name, rows]) => {
      const owned = rows.filter((ad) => ad.owned && ad.conversions !== null);
      const conversions = owned.length
        ? owned.reduce((total, ad) => total + ad.conversions!, 0)
        : null;
      // CPA only pairs spend with conversions from the same owned records.
      const measured = owned.filter((ad) => ad.spend !== null);
      const measuredConversions = measured.reduce(
        (total, ad) => total + ad.conversions!,
        0,
      );
      const measuredSpend = measured.reduce(
        (total, ad) => total + ad.spend!,
        0,
      );
      return {
        name,
        ads: rows.length,
        impressions: sum(rows, "impressions"),
        engagements: sum(rows, "engagements"),
        engagementRate: percent(
          sum(rows, "engagements"),
          sum(rows, "impressions"),
        ),
        share: percent(rows.length, ads.length),
        conversions,
        cpa: measuredConversions ? measuredSpend / measuredConversions : null,
      };
    })
    .sort((a, b) => b.engagementRate - a.engagementRate);
}
/** Aggregate prefiltered records without requiring a database or network. */
export function analyzeRecords(
  brand: Brand,
  ads: Ad[],
  creators: Creator[],
  reviews: Review[],
  range = 30,
): Dashboard {
  const impressions = sum(ads, "impressions");
  const engagements = sum(ads, "engagements");
  const brandGroups = new Map<string, Ad[]>();
  for (const ad of ads) {
    const existing = brandGroups.get(ad.brand);
    if (existing) existing.push(ad);
    else brandGroups.set(ad.brand, [ad]);
  }
  const angles = performanceGroups(ads, "angle");
  const audiencePerformance = performanceGroups(ads, "audience");
  const colors = ["#d78c9b", "#aaa2c7", "#deae79", "#8cae9a"];
  const competitors: Competitor[] = [...brandGroups]
    .map(([name, rows], i) => {
      const topAngle =
        [...new Set(rows.map((a) => a.angle))]
          .map((angle) => ({
            angle,
            value: rows
              .filter((a) => a.angle === angle)
              .reduce((n, a) => n + a.engagements, 0),
          }))
          .sort((a, b) => b.value - a.value)[0]?.angle || "No data";
      return {
        name,
        color: colors[i % 4],
        initials: name.slice(0, 1),
        ads: rows.length,
        engagementRate: percent(
          sum(rows, "engagements"),
          sum(rows, "impressions"),
        ),
        share: percent(rows.length, ads.length),
        topAngle,
        owned: rows.some((a) => a.owned),
      };
    })
    .sort((a, b) => Number(b.owned) - Number(a.owned) || b.ads - a.ads);
  const trend: TrendPoint[] = [];
  const competitorCount = new Set(
    ads.filter((ad) => !ad.owned).map((ad) => ad.brand),
  ).size;
  const days = range;
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const rows = ads.filter((a) => a.publishedAt.startsWith(date));
    const own = rows.filter((a) => a.owned),
      other = rows.filter((a) => !a.owned);
    trend.push({
      date,
      label: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      brand: sum(own, "engagements"),
      competitors: competitorCount
        ? sum(other, "engagements") / competitorCount
        : 0,
    });
  }
  const ownedMeasured = ads.filter((a) => a.owned && a.conversions !== null);
  const spendRows = ads.filter((a) => a.owned && a.spend !== null);
  const prefix =
    brand.mode === "demo"
      ? "In this sample dataset"
      : "In your imported dataset";
  const insights = !ads.length
    ? [
        {
          title: "Your next insight starts with data",
          text: "Import authorised ad performance records to compare creative angles and audiences. Competitor discovery and live feeds are not connected.",
          kind: "opportunity",
        },
      ]
    : [
        {
          title: `${angles[0]?.name} leads engagement`,
          text: `${prefix}, this angle has a ${angles[0]?.engagementRate.toFixed(1)}% engagement rate across ${angles[0]?.ads} ads. Test it with owned campaign data before drawing conversion conclusions.`,
          kind: "opportunity",
        },
        {
          title: "Engagement is a signal, not a sale",
          text: "Competitor conversion and spend data are unavailable. Conversion metrics shown here apply only to records marked as your own brand.",
          kind: "context",
        },
        {
          title: creators.length
            ? `${creators.length} creator profiles to explore`
            : "Connect the creator context",
          text: creators.length
            ? "These fictional profiles share your sample category and voice. Match scores illustrate a transparent category-and-tone fit, not verified audience overlap."
            : "No verified creator profiles are connected to this workspace. Importing ads does not establish creator fit.",
          kind: "creator",
        },
      ];
  return {
    brand,
    metrics: {
      ads: ads.length,
      brands: brandGroups.size,
      impressions,
      engagements,
      engagementRate: percent(engagements, impressions),
      creators: creators.length,
      conversions: ownedMeasured.length
        ? ownedMeasured.reduce((n, a) => n + a.conversions!, 0)
        : null,
      spend: spendRows.length
        ? spendRows.reduce((n, a) => n + a.spend!, 0)
        : null,
    },
    angles,
    audiencePerformance,
    competitors,
    trend,
    ads: [...ads]
      .sort(
        (a, b) =>
          percent(b.engagements, b.impressions) -
          percent(a.engagements, a.impressions),
      )
      .slice(0, 8),
    creators,
    reviews,
    updatedAt:
      ads
        .map((a) => a.publishedAt)
        .sort()
        .at(-1) || brand.createdAt,
    mode: brand.mode,
    sampleCount: brand.mode === "demo" ? ads.length : 0,
    insights,
  };
}
export function reportContent(data: Dashboard) {
  const top = data.angles[0];
  const ownedAngle = [...data.angles]
    .filter((angle) => angle.cpa !== null)
    .sort((a, b) => a.cpa! - b.cpa!)[0];
  const ownedAudience = [...(data.audiencePerformance || [])]
    .filter((audience) => audience.cpa !== null)
    .sort((a, b) => a.cpa! - b.cpa!)[0];
  const ownedSection =
    ownedAngle || ownedAudience
      ? `\n\n## Reported owned conversion evidence\n${ownedAngle ? `Lowest reported angle CPA: ${ownedAngle.name}, ${ownedAngle.cpa!.toFixed(2)} spend units per conversion.` : ""}\n${ownedAudience ? `Lowest reported audience CPA: ${ownedAudience.name}, ${ownedAudience.cpa!.toFixed(2)} spend units per conversion.` : ""}\nCPA uses only owned records with both spend and conversion counts. Currency and attribution definitions must be aligned before comparing performance. These observations are not predictions.`
      : "";
  return `# ${data.brand.name} — Competitive intelligence brief\n\nGenerated: ${new Date().toISOString()}\nData mode: ${data.mode === "demo" ? "FICTIONAL SAMPLE DATA — not live intelligence" : "USER-IMPORTED DATA — not a live feed"}\n\n## Coverage\n${data.metrics.ads.toLocaleString("en-GB")} ads across ${data.metrics.brands} brands in the last 30 days.\n${data.metrics.impressions.toLocaleString("en-GB")} impressions; ${data.metrics.engagements.toLocaleString("en-GB")} engagements; ${data.metrics.engagementRate.toFixed(2)}% weighted engagement rate.\n\n## Leading angle\n${top ? `${top.name}: ${top.engagementRate.toFixed(2)}% engagement rate across ${top.ads} ads.` : "No ad records available."}\nThis is an engagement ranking, not a conversion ranking. Competitor conversion performance cannot be inferred from public engagement.\n\n${ownedSection}\n\n## Competitive landscape\n${data.competitors.map((c) => `- ${c.name}: ${c.ads} ads, ${c.engagementRate.toFixed(2)}% engagement rate, ${c.share.toFixed(1)}% of observed ads.`).join("\n") || "No competitor data available."}\n\n## Customer voice\n${data.reviews.length ? data.reviews.map((r) => `- ${r.theme}: “${r.text}” (${r.source})`).join("\n") : "No customer reviews connected. Ad data does not establish customer sentiment."}\n\n## Creator shortlist candidates\n${data.creators.map((c) => `- ${c.name} (${c.handle}): ${c.reason}`).join("\n") || "No verified creator profiles connected."}\n\n## Measurement and next steps\nConnect authorised Meta, TikTok and Google data before using this as live intelligence. Imports are supplied by the workspace user; source URLs are not independently verified. Owned conversion counts only: ${data.metrics.conversions ?? "unavailable"}. Treat this rule-based brief as a research aid. Validate hypotheses with measured first-party conversion tests.\n`;
}
