import type { Ad } from "./types.js";

export interface OwnedOutcomeRow {
  adId: string; nativeId: string; title: string; sourceUrl: string | null;
  conversions: number; spend: number | null; revenue: number | null; cpa: number | null; roas: number | null;
}
export interface OwnedOutcomeCohort {
  id: string; platform: string; currency: string; conversionEvent: string; date: string;
  rows: OwnedOutcomeRow[]; conversions: number; spend: number | null; cpa: number | null;
  comparable: boolean;
}
export interface OwnedOutcomeEvidence {
  status: "available" | "unavailable";
  cohorts: OwnedOutcomeCohort[]; measuredAds: number; publicAds: number; excludedRecords: number;
}
const measured = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: string | undefined) => typeof value === "string" ? value.trim() : "";
const day = (ad: Ad) => /^\d{4}-\d{2}-\d{2}$/.test(ad.metricDate || "") && Number.isFinite(Date.parse(`${ad.metricDate}T00:00:00Z`)) && new Date(`${ad.metricDate}T00:00:00Z`).toISOString().slice(0,10) === ad.metricDate ? ad.metricDate! : "";

/** Only authorised owned records can establish outcomes. Reads never infer a
 * sale from public engagement, a score, an ad's age or its creative labels.
 * Comparisons partition by platform, date, currency and conversion definition.
 * Repeated snapshots of one native ad on one reporting day are never summed.
 */
export function ownedOutcomes(ads: Ad[]): OwnedOutcomeEvidence {
  const real = ads.filter(ad => ad.source !== "sample");
  const eligible = real.filter(ad => ad.owned && ["import", "live"].includes(ad.source) && ad.metricsAvailable !== false && measured(ad.conversions));
  const latest = new Map<string, Ad>();
  for (const ad of eligible) {
    const key = JSON.stringify([ad.platform, ad.providerAdId || ad.id, day(ad), text(ad.currency).toUpperCase(), text(ad.conversionEvent)]);
    const previous = latest.get(key);
    if (!previous || (ad.observedAt || ad.publishedAt || "") >= (previous.observedAt || previous.publishedAt || "")) latest.set(key, ad);
  }
  const cohorts = new Map<string, OwnedOutcomeCohort>();
  for (const ad of latest.values()) {
    const currency = text(ad.currency).toUpperCase(), conversionEvent = text(ad.conversionEvent), date = day(ad);
    // A missing reporting day cannot make separate observations comparable.
    const id = JSON.stringify([ad.platform,currency,conversionEvent,date,...(!date ? [ad.id] : [])]);
    let cohort = cohorts.get(id);
    if (!cohort) { cohort = { id, platform: ad.platform, currency, conversionEvent, date, rows: [], conversions: 0, spend: null, cpa: null, comparable: Boolean(/^[A-Z]{3}$/.test(currency) && conversionEvent && date) }; cohorts.set(id,cohort); }
    const spend = measured(ad.spend) ? ad.spend : null, revenue = measured(ad.revenue) ? ad.revenue : null;
    cohort.rows.push({ adId:ad.id,nativeId:ad.providerAdId || ad.id,title:ad.title || `Ad ${ad.providerAdId || ad.id}`,sourceUrl:ad.sourceUrl || null,
      conversions:ad.conversions!,spend,revenue,cpa:spend!==null && ad.conversions!>0 ? spend/ad.conversions! : null,roas:spend!==null && spend>0 && revenue!==null ? revenue/spend : null });
  }
  for(const cohort of cohorts.values()) {
    cohort.conversions=cohort.rows.reduce((n,r)=>n+r.conversions,0);
    const matched=cohort.rows.filter(r=>r.spend!==null), conversions=matched.reduce((n,r)=>n+r.conversions,0);
    cohort.spend=matched.length ? matched.reduce((n,r)=>n+r.spend!,0) : null;
    cohort.cpa=cohort.spend!==null && conversions>0 ? cohort.spend/conversions : null;
    cohort.rows.sort((a,b)=>b.conversions-a.conversions || a.adId.localeCompare(b.adId));
  }
  return {status:cohorts.size ? "available" : "unavailable",cohorts:[...cohorts.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.platform.localeCompare(b.platform)||a.id.localeCompare(b.id)),
    measuredAds:new Set([...latest.values()].map(ad=>`${ad.platform}:${ad.providerAdId || ad.id}`)).size,
    publicAds:new Set(real.filter(ad=>ad.source==="public" || !ad.owned).map(ad=>`${ad.platform}:${ad.providerAdId || ad.id}`)).size,
    excludedRecords:real.length-eligible.length };
}
