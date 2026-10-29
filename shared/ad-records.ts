import type { Ad } from "./types";
import { annotateSampleAd } from "./formats";
import { sampleAdAnalysis } from "./ad-intelligence";

export function hydrateAd(ad: Ad): Ad {
  if (ad.source !== "sample") return ad;
  const annotated = annotateSampleAd(ad);
  return {
    ...annotated,
    contentSource:
      ad.contentSource ||
      (parseInt(ad.id.split("-").at(-1) || "0") % 3 === 0 ? "organic" : "paid"),
    analysis: ad.analysis || sampleAdAnalysis(annotated),
  };
}
export function creativeIdentity(ad: Ad): string {
  return ad.source === "live" && ad.providerAdId
    ? `${ad.platform}:${ad.providerAdId}`
    : ad.id;
}
export function metricDate(ad: Ad): string {
  return (
    ad.metricDate ||
    (ad.dateBasis === "observed" && ad.observedAt
      ? ad.observedAt
      : ad.publishedAt
    ).slice(0, 10)
  );
}
export function uniqueCreatives(ads: Ad[]): number {
  return new Set(ads.map(creativeIdentity)).size;
}
export function coalesceObservations(ads: Ad[]): Ad[] {
  const groups = new Map<string, Ad[]>();
  for (const ad of ads) {
    const key = creativeIdentity(ad);
    const list = groups.get(key);
    if (list) list.push(ad);
    else groups.set(key, [ad]);
  }
  return [...groups.values()].map((rows) => {
    if (rows.length === 1) return rows[0];
    const latest = [...rows].sort((a, b) =>
      (b.observedAt || b.publishedAt).localeCompare(
        a.observedAt || a.publishedAt,
      ),
    )[0];
    function nullableTotal(key: "conversions" | "spend" | "revenue") {
      const measured = rows.filter((a) => a.owned && a[key] !== null);
      return measured.length
        ? measured.reduce((sum, a) => sum + a[key]!, 0)
        : null;
    }
    return {
      ...latest,
      impressions: rows.reduce((sum, a) => sum + a.impressions, 0),
      engagements: rows.reduce((sum, a) => sum + a.engagements, 0),
      conversions: nullableTotal("conversions"),
      spend: nullableTotal("spend"),
      revenue: nullableTotal("revenue"),
    };
  });
}
