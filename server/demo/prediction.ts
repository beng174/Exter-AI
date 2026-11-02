import type { DemoPredictionPreview } from "../../shared/brand-demo.js";
import type { Ad } from "../../shared/types.js";

const DAY_MS = 86_400_000;
const HISTORY_DEFINITION = "Only source-linked public-ad collection captures with valid firstObservedAt and observedAt timestamps are included. Observed span is the elapsed time between those captures, not verified continuous delivery, spend, sales or profitability. Published and advertiser delivery dates are excluded.";

function captureTime(value: string | undefined, now: number): number | null {
  // Collection records store timestamp instants, rather than ambiguous calendar dates.
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now ? time : null;
}

function publicAdSource(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const publicHosts = ["facebook.com", "instagram.com", "tiktok.com", "youtube.com", "youtu.be", "linkedin.com", "x.com", "twitter.com", "adstransparency.google.com"];
  if (!publicHosts.some(domain => host === domain || host.endsWith(`.${domain}`))) return null;
  // Public ad IDs/video IDs are useful references; tracking and signed parameters are not.
  for (const key of [...url.searchParams.keys()]) if (!["id", "v"].includes(key)) url.searchParams.delete(key);
  url.hash = "";
  return url.href;
}

/**
 * Read-only preview. Capture history can describe observations, but there is no
 * trained outcome model or advertiser performance data from which to predict.
 */
export function buildPredictionPreview(ads: Ad[], now = new Date()): DemoPredictionPreview {
  if (!Number.isFinite(now.getTime())) throw new Error("The collection-history reference time is invalid.");
  const captures = new Map<string, { adId: string; sourceUrl: string; first: number; last: number }>();
  for (const ad of ads) {
    if (ad.source !== "public" && ad.source !== "live") continue;
    const sourceUrl = publicAdSource(ad.sourceUrl);
    const first = captureTime(ad.firstObservedAt, now.getTime());
    const last = captureTime(ad.observedAt, now.getTime());
    if (!sourceUrl || first === null || last === null || first > last) continue;
    const existing = captures.get(ad.id);
    if (existing && existing.sourceUrl !== sourceUrl) continue;
    captures.set(ad.id, { adId: ad.id, sourceUrl, first: Math.min(existing?.first ?? first, first), last: Math.max(existing?.last ?? last, last) });
  }
  const observations: DemoPredictionPreview["observations"] = [...captures.values()]
    .sort((a, b) => b.last - a.last || a.adId.localeCompare(b.adId))
    .map(capture => {
      const firstObservedAt = new Date(capture.first).toISOString();
      const lastObservedAt = new Date(capture.last).toISOString();
      return {
        adId: capture.adId, sourceUrl: capture.sourceUrl, firstObservedAt, lastObservedAt,
        // Endpoints do not retain the number of intervening collection runs.
        observationCount: null,
        observedSpanDays: (capture.last - capture.first) / DAY_MS,
        source: "stored-public-captures" as const, continuousDeliveryConfirmed: false as const,
        evidence: [{ kind: "ad" as const, adId: capture.adId, sourceUrl: capture.sourceUrl, field: "firstObservedAt,observedAt",
          observedAt: lastObservedAt, quote: `Stored public-ad collection capture endpoints: ${firstObservedAt} to ${lastObservedAt}. This does not establish uninterrupted ad delivery.` }],
      };
    });
  const times = observations.flatMap(value => [value.firstObservedAt, value.lastObservedAt]).sort();
  return {
    label: "Future proven-ad likelihood", status: "preview", message: "Trains as collection history builds.",
    probability: null, trainingStatus: "not-trained",
    history: { eligibleAds: observations.length, repeatedlyObservedAds: observations.filter(value => value.observedSpanDays > 0).length,
      firstObservedAt: times[0] ?? null, lastObservedAt: times.at(-1) ?? null, definition: HISTORY_DEFINITION },
    observations,
    limitations: [
      "No prediction model has been trained or validated; no likelihood, performance forecast or probability is available.",
      "Repeat capture endpoints show that a source-linked ad was observed at those times. Gaps and continuous delivery are unknown, and repeat observation does not prove an ad performed well.",
      "Stored endpoint history does not retain the number of collection runs. observationCount remains unknown, including when first and last endpoints are equal.",
      "Missing, invalid, future-dated or inverted capture history, fictional samples and records without a supported public source link are excluded. Advertiser start dates and publication dates never substitute for collection history.",
    ],
  };
}
