import type { Ad, Brand, Dashboard, Platform } from "./types";
import type {
  FormatAnalysis,
  FormatMetric,
  FormatSourceStatus,
} from "./format-types";
import { analyzeFormats, selectFormatRecords } from "./formats";

export interface ResearchQuestion {
  question: string;
  brand: Brand;
  ads: Ad[];
  dashboard: Dashboard;
  platform?: string;
  range?: number;
  metric?: FormatMetric;
  sourceStatus?: FormatSourceStatus | null;
}
export interface ResearchAnswer {
  answer: string;
  sources: string[];
  mode: "rule-based";
  formatAnalysis?: FormatAnalysis;
  scope: {
    platform: string;
    range: number;
    category: string;
    metric: FormatMetric;
  };
}
function namedPlatforms(question: string): Platform[] {
  const result: Platform[] = [];
  if (/\bmeta\b/i.test(question)) result.push("Meta");
  if (/\bfacebook\b/i.test(question)) result.push("Facebook");
  if (/\binstagram\b/i.test(question)) result.push("Instagram");
  if (/\blinkedin\b/i.test(question)) result.push("LinkedIn");
  if (/\b(x|twitter)\b/i.test(question)) result.push("X");
  if (/\btik\s*tok\b/i.test(question)) result.push("TikTok");
  if (/\bgoogle\b/i.test(question)) result.push("Google");
  if (/\byoutube\b/i.test(question)) result.push("YouTube");
  return result;
}
export function asksAboutCreativeFormats(question: string): boolean {
  return (
    /\b(formats?|creative types?|ad types?|ugc|statics?|live photos?|carousels?|shopping ads?|search ads?|product demo|testimonials?)\b/i.test(
      question,
    ) ||
    /before\s*(?:and|&|\/|[-–])?\s*after/i.test(question) ||
    (/\b(influencer|review)s?\b/i.test(question) &&
      /\b(ads?|perform|convert|working|best)\b/i.test(question) &&
      !/\b(match|fit)\b/i.test(question))
  );
}
const display = (value: number) =>
  value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** Answers are deliberately scoped to known data; unsupported questions never receive a canned angle answer. */
export function answerResearchQuestion(
  input: ResearchQuestion,
): ResearchAnswer {
  const { question, brand, ads, dashboard } = input;
  const explicitPlatforms = namedPlatforms(question);
  const platform =
    explicitPlatforms.length === 1
      ? explicitPlatforms[0]
      : explicitPlatforms.length > 1
        ? "all"
        : input.platform || "all";
  const rangeMatch = question.match(/\blast\s+(7|30|90)\s+days\b/i);
  const range = rangeMatch ? Number(rangeMatch[1]) : (input.range ?? 30);
  const metric: FormatMetric =
    input.metric ||
    (/conversion\s*rate/i.test(question)
      ? "conversionRate"
      : /\b(cpa|convert|converts|converting|conversion|conversions|sales|purchase|purchases)\b|cost per (?:acquisition|conversion)/i.test(
            question,
          )
        ? "cpa"
        : "engagement");
  const contentSource = /\borganic\b/i.test(question)
    ? "organic"
    : /\bpaid\b/i.test(question)
      ? "paid"
      : "all";
  let records = selectFormatRecords(brand, ads, {
    platform,
    range,
    contentSource,
  });
  if (explicitPlatforms.length > 1)
    records = records.filter((ad) => explicitPlatforms.includes(ad.platform));
  const scope = {
    platform:
      explicitPlatforms.length > 1 ? explicitPlatforms.join(", ") : platform,
    range,
    category: brand.category,
    metric,
  };
  const context = `${brand.mode === "demo" ? "Sample-data answer" : "Dataset answer"} · ${brand.category} · ${range} days · ${scope.platform === "all" ? "all platforms" : scope.platform}. `;
  const reply = (
    answer: string,
    sources: string[] = [],
    formatAnalysis?: FormatAnalysis,
  ): ResearchAnswer => ({
    answer: context + answer,
    sources: [...new Set(sources)].slice(0, 30),
    mode: "rule-based",
    scope,
    ...(formatAnalysis ? { formatAnalysis } : {}),
  });
  const unsupportedWindow = question.match(/\blast\s+(\d+)\s+days\b/i);
  if (unsupportedWindow && ![7, 30, 90].includes(Number(unsupportedWindow[1])))
    return reply(
      "Choose a supported date window: the last 7, 30 or 90 days. I have not silently substituted another period.",
    );

  if (asksAboutCreativeFormats(question)) {
    const analysis = analyzeFormats(brand, records, {
      platform,
      range,
      metric,
      sourceStatus: input.sourceStatus,
    });
    const asksForNow=/\breal[ -]?time\b|\bright now\b|\blive (?:data|market|performance)\b|\btoday\b/i.test(question);
    const freshSource=Boolean(input.sourceStatus?.connected&&input.sourceStatus.lastSuccessfulSyncAt&&Date.now()-Date.parse(input.sourceStatus.lastSuccessfulSyncAt)<15*60*1000);
    if(asksForNow&&(!freshSource||analysis.sampleAds>0))return reply('I cannot establish which creative format is winning in the live market right now. No sufficiently recent verified monitoring source supports that claim. The available records are saved observations or fictional sample results, not real-time market findings. Ask for a comparison of the available dataset to inspect historical/sample performance. Public monitoring does not require a client advertising account.',[],analysis);
    if (explicitPlatforms.length > 1) {
      analysis.platforms = analysis.platforms.filter((item) =>
        explicitPlatforms.includes(item.platform),
      );
      analysis.formats = analysis.formats.filter((item) =>
        explicitPlatforms.includes(item.platform),
      );
    }
    if (!records.length)
      return reply(
        "There are no ad records for this category, platform and period. Connect an authorised data source or import labelled ad records before asking which creative format works best. No result has been invented.",
        [],
        analysis,
      );
    if (/\broas\b|return on ad spend/i.test(question))
      return reply(
        "ROAS-by-format is not available in this comparison. It requires comparable owned revenue, spend, currency and attribution definitions. Supported format rankings are engagement rate, reported CPA and conversions per measured owned impression; I have not substituted one for ROAS.",
        [],
        analysis,
      );
    const introductions = [
      "Creative-format performance, ranked separately on each platform:",
    ];
    const sourceIds: string[] = [];
    for (const group of analysis.platforms) {
      if (!group.winner) {
        introductions.push(
          `${group.platform}: ${group.missingMetric || "No ranked creative formats available."} ${group.unclassifiedAds ? `${group.unclassifiedAds} ads need creative-format labels.` : ""}`.trim(),
        );
        continue;
      }
      const rows = group.rankings
        .filter((row) => row.rank !== null)
        .slice(0, 3);
      const text = rows
        .map((row, index) => {
          sourceIds.push(...row.adIds.slice(0, 3));
          const result =
            metric === "engagement"
              ? `${row.engagementRate.toFixed(2)}% weighted engagement rate; ${display(row.measuredEngagements)} engagements / ${display(row.engagementDenominator)} ${row.engagementRateBasis}`
              : metric === "cpa"
                ? `${row.cpa!.toFixed(2)} reported CPA (spend units per conversion; currency unspecified)`
                : `${row.conversionRate!.toFixed(2)}% reported conversions per measured owned impression`;
          return `${index + 1}. ${row.name}: ${result}, ${row.ads} ad${row.ads === 1 ? "" : "s"}${row.limitedSample ? " — limited sample" : ""}`;
        })
        .join("\n");
      introductions.push(
        `${group.platform}\n${text}${group.unclassifiedAds ? `\n${group.unclassifiedAds} unclassified ads excluded from the format ranking.` : ""}`,
      );
    }
    introductions.push(
      metric === "engagement"
        ? "“Best” here means highest observed engagement rate in the available records, not best sales performance. Competitor conversions cannot be inferred from public engagement."
        : "Only reported, owned-account conversion records are used for conversion/CPA rankings. Compare compatible currencies, events and attribution windows; engagement is not a substitute for missing conversion evidence.",
    );
    introductions.push(
      "Formats can overlap (for example UGC + review). This is an observed comparison, not proof of causal or statistically significant lift.",
    );
    if (analysis.sampleAds)
      introductions.push(
        "These are fictional sample results, not real-time market findings.",
      );
    else if (!input.sourceStatus?.connected)
      introductions.push(
        "No verified continuous public monitoring source is connected to this analysis. These are saved/imported observations; client account access is not required for public research.",
      );
    else
      introductions.push(
        `Source last successful sync: ${input.sourceStatus.lastSuccessfulSyncAt || "not available"}. A connection alone does not guarantee zero-lag or complete market coverage.`,
      );
    return reply(introductions.join("\n\n"), sourceIds, analysis);
  }

  if (
    /\b(real[ -]?time|live|now|today)\b/i.test(question) &&
    !input.sourceStatus?.connected
  )
    return reply(
      "No verified live data connection is available. I can compare saved/imported records or sample records, but I cannot say what is working in the live market right now. Connect an approved public monitoring source first; client ad-account access is optional.",
    );
  if (!records.length)
    return reply(
      "This workspace has no ad records for the selected period. Import authorised campaign data to analyse angles and audiences. No live competitor discovery is connected.",
    );
  if (/\b(creator|influencer|match)s?\b/i.test(question)) {
    const creator = dashboard.creators[0];
    return creator
      ? reply(
          `${creator.name} (${creator.handle}) is the highest sample category-and-tone match at ${creator.match}%. ${creator.reason}`,
          [creator.id],
        )
      : reply(
          "No verified creator profiles are connected. Creator matching requires audience and brand-voice evidence; ad records alone are not enough.",
        );
  }
  if (/\b(review|sentiment|voice|customer)s?\b/i.test(question))
    return dashboard.reviews.length
      ? reply(
          `The ${dashboard.reviews.length} fictional sample reviews discuss ${[...new Set(dashboard.reviews.map((review) => review.theme))].join(", ")}. ${brand.name}'s sample voice is ${brand.voice.join(", ").toLowerCase()}. These are illustrative, not collected customer opinions.`,
          dashboard.reviews.slice(0, 3).map((review) => review.id),
        )
      : reply(
          "No customer reviews or verified brand-voice analysis are connected to this workspace. Importing ads does not provide review sentiment.",
        );
  if (
    /\b(convert|converts|converting|conversion|conversions|roas|sales|purchase)s?\b/i.test(
      question,
    )
  ) {
    const owned = records.filter((ad) => ad.owned && ad.conversions !== null);
    const conversions = owned.reduce((total, ad) => total + ad.conversions!, 0);
    return reply(
      `Competitor conversions are not available and cannot be inferred from engagement. ${owned.length ? `Your owned records contain ${display(conversions)} reported conversions.` : "No owned conversion records are available."} Ask “Which creative format has the lowest reported CPA?” for a format-level comparison where measured spend and conversions are available.`,
      owned.slice(0, 3).map((ad) => ad.id),
    );
  }
  if (/\b(competitor|brand|share)s?\b/i.test(question)) {
    const brands = new Map<string, number>();
    for (const record of records)
      brands.set(record.brand, (brands.get(record.brand) || 0) + 1);
    return reply(
      `Observed ad volume: ${[...brands].map(([name, count]) => `${name} ${count} ads (${((count / records.length) * 100).toFixed(1)}%)`).join("; ")}. This is share of the available records, not market share. Public conversion data is unavailable.`,
      records.slice(0, 3).map((ad) => ad.id),
    );
  }
  if (/\b(angle|angles|engagement|engagements|attention)\b/i.test(question)) {
    const groups = new Map<string, Ad[]>();
    for (const record of records)
      groups.set(record.angle, [...(groups.get(record.angle) || []), record]);
    const ranked = [...groups]
      .map(([name, ads]) => {
        const impressions = ads.reduce(
          (total, ad) => total + ad.impressions,
          0,
        );
        return {
          name,
          ads,
          rate: impressions
            ? (ads.reduce((total, ad) => total + ad.engagements, 0) /
                impressions) *
              100
            : 0,
        };
      })
      .sort((a, b) => b.rate - a.rate);
    const top = ranked[0];
    return reply(
      `${top.name} has the highest weighted engagement rate at ${top.rate.toFixed(2)}% across ${top.ads.length} ads. This is an engagement finding, not evidence of conversion lift. For UGC, static, influencer, review or other creative-style comparisons, ask which ad format performs best.`,
      top.ads.slice(0, 3).map((ad) => ad.id),
    );
  }
  return reply(
    "I can answer data-grounded questions about creative formats by platform, ad angles, competitors, owned conversions, reviews and creators. Your question does not clearly match one of those analyses; please specify what you want to compare. I have not substituted an ad-angle answer for another question.",
  );
}
