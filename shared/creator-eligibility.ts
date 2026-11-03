import type { CreatorCandidate, CreatorEligibility, CreatorEligibilitySummary } from "./creator-research.js";

export const CREATOR_MIN_INSTAGRAM_FOLLOWERS_EXCLUSIVE = 40000 as const;

function instagramProfile(raw: unknown, handle: string): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || url.username || url.password || !["instagram.com", "www.instagram.com"].includes(url.hostname)) return null;
    if (url.pathname.toLowerCase().replace(/\/$/, "") !== `/${handle}`) return null;
    return `https://www.instagram.com/${handle}/`;
  } catch { return null; }
}
function observedDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw)) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw.slice(0, 10) ? parsed.toISOString() : null;
}

/** Eligibility uses only dated public Instagram observations. A Meta credit,
 * cached metric projection or a model fit cannot establish a follower count. */
export function creatorEligibility(candidate: Pick<CreatorCandidate, "platform" | "profile" | "handle" | "profileUrl">): CreatorEligibility {
  const profile = candidate.profile;
  const followers = typeof profile?.followers === "number" && Number.isSafeInteger(profile.followers) && profile.followers >= 0 ? profile.followers : null;
  const observedAt = observedDate(profile?.observedAt);
  const result = (status: CreatorEligibility["status"], reason: CreatorEligibility["reason"], evidenceUrl: string | null = null): CreatorEligibility => ({ status, reason, followers, observedAt, evidenceUrl });
  if (!profile) return result("unverified", "profile-unavailable");
  if (candidate.platform !== "instagram" || profile.platform !== "instagram") return result("excluded", "instagram-required");
  const handle = typeof profile.handle === "string" ? profile.handle.replace(/^@/, "").toLowerCase() : "";
  if (!/^[a-z0-9._]{1,30}$/.test(handle) || ["p", "reel", "reels", "accounts", "explore", "stories", "direct"].includes(handle)) return result("unverified", "source-unverified");
  const evidenceUrl = instagramProfile(profile.evidenceUrl, handle);
  if (!evidenceUrl || !instagramProfile(profile.profileUrl, handle) || !instagramProfile(profile.sourceUrl, handle) ||
      (candidate.profileUrl !== null && !instagramProfile(candidate.profileUrl, handle)) ||
      (candidate.handle !== null && (typeof candidate.handle !== "string" || candidate.handle.replace(/^@/, "").toLowerCase() !== handle))) return result("unverified", "source-unverified");
  if (profile.evidence !== undefined && (!Array.isArray(profile.evidence) || profile.evidence.some(item => !item || typeof item !== "object"))) return result("unverified", "source-unverified");
  const countEvidence = profile.evidence?.filter(item => item.field === "followers") || [];
  if (countEvidence.some(item => item.value !== followers || !instagramProfile(item.evidenceUrl, handle) || observedDate(item.observedAt) !== observedAt)) return result("unverified", "source-unverified");
  if (!observedAt) return result("unverified", "observation-date-unavailable", evidenceUrl);
  if (followers === null) return result("unverified", "followers-unavailable", evidenceUrl);
  if (followers <= CREATOR_MIN_INSTAGRAM_FOLLOWERS_EXCLUSIVE) return result("excluded", "followers-at-or-below-minimum", evidenceUrl);
  return result("eligible", "eligible", evidenceUrl);
}

export function creatorEligibilitySummary(candidates: Pick<CreatorCandidate, "platform" | "profile" | "handle" | "profileUrl">[]): CreatorEligibilitySummary {
  const summary: CreatorEligibilitySummary = { platform: "instagram", minFollowersExclusive: CREATOR_MIN_INSTAGRAM_FOLLOWERS_EXCLUSIVE, eligibleCount: 0, excludedCount: 0, unverifiedCount: 0, observedCount: candidates.length, reasonCounts: {} };
  for (const candidate of candidates) {
    const eligibility = creatorEligibility(candidate);
    if (eligibility.status === "eligible") summary.eligibleCount++;
    else if (eligibility.status === "excluded") summary.excludedCount++;
    else summary.unverifiedCount++;
    summary.reasonCounts[eligibility.reason] = (summary.reasonCounts[eligibility.reason] || 0) + 1;
  }
  return summary;
}
