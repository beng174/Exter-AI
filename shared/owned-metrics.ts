/** CA-01/CA-02. All formulas and thresholds come from the creative analytics spec. */
export type OwnedPlatform = "Meta" | "TikTok";
export interface OwnedDay {
  platform: OwnedPlatform;
  accountId: string;
  adId: string;
  day: string;
  currency: string;
  attribution: string;
  conversionEvent: string;
  pulledAt: string;
  adName: string | null;
  adSetName: string | null;
  campaignName: string | null;
  assetIds: string[];
  spend: number | null;
  impressions: number | null;
  linkClicks: number | null;
  earlyViews: number | null;
  longerViews: number | null;
  videoStarts: number | null;
  retention25: number | null;
  retention50: number | null;
  retention75: number | null;
  retention95: number | null;
  retention100: number | null;
  averageWatchTime: number | null;
  frequency: number | null;
  purchases: number | null;
  purchaseValue: number | null;
}
export type MetricField = { [K in keyof OwnedDay]: OwnedDay[K] extends number | null ? K : never }[keyof OwnedDay];
export type MetricName = "Spend" | "CPM" | "Link CTR" | "Hook rate" | "Hold rate" | "Retention 25%" | "Retention 50%" | "Retention 75%" | "Retention 95%" | "Retention 100%" | "Average watch time" | "Frequency" | "Purchases" | "CPA" | "ROAS" | "CVR";
export interface OwnedMetric { value: number | null; status: "available" | "too early" | "unavailable"; rowsUsed: number; rowsExcluded: number }
export const MINIMUM_SAMPLE = { impressions: 1000, earlyViews: 300, purchases: 10 } as const;
const cohort = (row: OwnedDay) => JSON.stringify([row.platform,row.accountId,row.currency,row.attribution,row.conversionEvent]);
export function latestOwnedDays(rows: OwnedDay[]): OwnedDay[] {
  const latest = new Map<string, OwnedDay>();
  for (const row of rows) {
    const key = JSON.stringify([cohort(row),row.adId,row.day]);
    if (!latest.has(key) || Date.parse(row.pulledAt) > Date.parse(latest.get(key)!.pulledAt)) latest.set(key,row);
  }
  return [...latest.values()];
}
/** Never combine accounts, platforms, currencies, events or attribution settings. */
export function ownedMetrics(input: OwnedDay[]): Record<MetricName, OwnedMetric> {
  const rows = latestOwnedDays(input);
  if (new Set(rows.map(cohort)).size > 1) throw new Error("Select one account, platform, currency, attribution setting and conversion event.");
  const sum = (values: OwnedDay[], key: MetricField) => values.reduce((total,row)=>total+(row[key] ?? 0),0);
  function measure(numerator: MetricField, denominator?: MetricField, scale=1, minimum?: [MetricField,number]): OwnedMetric {
    const eligible = rows.filter(row => row[numerator] !== null && (!denominator || row[denominator] !== null) && (!minimum || row[minimum[0]] !== null));
    const base = { rowsUsed: eligible.length, rowsExcluded: rows.length-eligible.length };
    if (!eligible.length) return { ...base, value:null,status:"unavailable" };
    if (minimum && sum(eligible,minimum[0]) < minimum[1]) return { ...base,value:null,status:"too early" };
    const divisor = denominator ? sum(eligible,denominator) : 1;
    if (!divisor) return { ...base,value:null,status:"unavailable" };
    return { ...base,value:sum(eligible,numerator)/divisor*scale,status:"available" };
  }
  // Daily frequency and average watch time cannot be summed or re-averaged into
  // an account-period metric. Preserve the provider's figure on a single row.
  function reported(key: MetricField): OwnedMetric {
    return rows.length === 1 && rows[0][key] !== null
      ? {value:rows[0][key],status:"available",rowsUsed:1,rowsExcluded:0}
      : {value:null,status:"unavailable",rowsUsed:0,rowsExcluded:rows.length};
  }
  return {
    Spend:measure("spend"), CPM:measure("spend","impressions",1000),
    "Link CTR":measure("linkClicks","impressions",1,["impressions",MINIMUM_SAMPLE.impressions]),
    "Hook rate":measure("earlyViews","impressions",1,["impressions",MINIMUM_SAMPLE.impressions]),
    "Hold rate":measure("longerViews","earlyViews",1,["earlyViews",MINIMUM_SAMPLE.earlyViews]),
    "Retention 25%":measure("retention25","videoStarts"),"Retention 50%":measure("retention50","videoStarts"),
    "Retention 75%":measure("retention75","videoStarts"),"Retention 95%":measure("retention95","videoStarts"),"Retention 100%":measure("retention100","videoStarts"),
    "Average watch time":reported("averageWatchTime"), Frequency:reported("frequency"), Purchases:measure("purchases"),
    CPA:measure("spend","purchases",1,["purchases",MINIMUM_SAMPLE.purchases]),
    ROAS:measure("purchaseValue","spend",1,["purchases",MINIMUM_SAMPLE.purchases]), CVR:measure("purchases","linkClicks"),
  };
}
/** Account benchmark uses every creative in the same inclusive date window. */
export function ownedBenchmark(rows: OwnedDay[], selection: Pick<OwnedDay,"platform"|"accountId"|"currency"|"attribution"|"conversionEvent"> & {from:string;to:string}) {
  const key = JSON.stringify([selection.platform,selection.accountId,selection.currency,selection.attribution,selection.conversionEvent]);
  return ownedMetrics(rows.filter(row=>cohort(row)===key && row.day>=selection.from && row.day<=selection.to));
}
