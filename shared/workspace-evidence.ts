import type { DemoGalleryCreative } from "./creative-gallery.js";

/** A snapshot summary, never a claim about today's delivery or complete coverage. */
export function workspaceEvidence(creatives: DemoGalleryCreative[], now = new Date()) {
  const valid = (value: string | null | undefined): value is string => Boolean(value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now.getTime());
  const dates = creatives.flatMap(ad => [ad.firstObservedAt, ad.observedAt].filter(valid)).sort();
  const lastCheck = dates.at(-1) || null;
  // Compare with the previous seven days of the latest stored check, not a stale
  // capture silently presented as this calendar week's activity.
  const end = lastCheck ? Date.parse(lastCheck) : null;
  const start = end === null ? null : end - 7 * 86400000;
  const inWindow = (date: string | null) => valid(date) && start !== null && Date.parse(date) > start && Date.parse(date) <= end!;
  const active = creatives.filter(ad => ad.deliveryStatus === "active" && valid(ad.observedAt));
  const startsKnown = creatives.filter(ad => valid(ad.deliveryStartAt));
  const stopped = creatives.filter(ad => ad.deliveryStatus === "inactive" && inWindow(ad.deliveryStopAt));
  return {
    collected: creatives, analysed: creatives.filter(ad => ad.analysis), active,
    activeKnown: creatives.filter(ad => ad.deliveryStatus && ad.deliveryStatus !== "unknown" && valid(ad.observedAt)).length,
    launched: startsKnown.filter(ad => inWindow(ad.deliveryStartAt)), stopped,
    startsKnown: startsKnown.length,
    stopsKnown: creatives.filter(ad => valid(ad.deliveryStopAt)).length,
    from: dates[0] || null, lastCheck,
    weekFrom: start === null ? null : new Date(start).toISOString(),
  };
}
