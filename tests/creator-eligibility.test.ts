import { test } from "node:test";
import assert from "node:assert/strict";
import { creatorEligibility, creatorEligibilitySummary } from "../shared/creator-eligibility.js";
import type { CreatorCandidate, CreatorPublicProfile } from "../shared/creator-research.js";

const observedAt = "2026-11-03T00:00:00.000Z";
function candidate(followers: number | null): Pick<CreatorCandidate, "platform" | "handle" | "profileUrl" | "profile"> {
  const url = "https://www.instagram.com/observed_creator/";
  return { platform: "instagram", handle: "observed_creator", profileUrl: url, profile: { platform: "instagram", handle: "observed_creator", displayName: "Observed creator", profileUrl: url, sourceUrl: url, evidenceUrl: url, bio: null, followers, following: null, postsCount: null, country: null, category: null, observedAt, recentPosts: [],
    evidence: [{ field: "followers", value: followers, evidenceUrl: url, observedAt }] } };
}

test("Instagram recommendation threshold is strictly above 40,000 observed followers", () => {
  for (const followers of [0, 39999, 40000]) {
    const result = creatorEligibility(candidate(followers));
    assert.equal(result.status, "excluded");
    assert.equal(result.reason, "followers-at-or-below-minimum");
    assert.equal(result.followers, followers);
  }
  const result = creatorEligibility(candidate(40001));
  assert.equal(result.status, "eligible");
  assert.equal(result.followers, 40001);
  assert.equal(result.observedAt, observedAt);
  assert.equal(result.evidenceUrl, "https://www.instagram.com/observed_creator/");
  assert.equal(creatorEligibility(candidate(null)).status, "unverified");
  for (const followers of [NaN, Infinity, -1, 40000.5]) {
    const unsafe = candidate(followers); unsafe.profile!.evidence = [];
    assert.equal(creatorEligibility(unsafe).status, "unverified");
    assert.equal(creatorEligibility(unsafe).followers, null);
  }
});

test("Meta credits, TikTok counts, unmatched identities and invalid source dates cannot qualify", () => {
  assert.equal(creatorEligibility({ platform: "meta", handle: null, profileUrl: "https://www.facebook.com/example/", profile: null }).reason, "profile-unavailable");
  const tiktok = candidate(90000); tiktok.platform = "tiktok"; tiktok.profile!.platform = "tiktok";
  assert.equal(creatorEligibility(tiktok).reason, "instagram-required");
  const mismatchedPlatform = candidate(90000); mismatchedPlatform.profile!.platform = "tiktok";
  assert.equal(creatorEligibility(mismatchedPlatform).status, "excluded");
  for (const patch of [
    { evidenceUrl: "https://example.com/observed_creator/" },
    { sourceUrl: "https://www.instagram.com/someone_else/" },
    { profileUrl: "https://www.instagram.com/p/postid/" },
    { observedAt: "" },
    { observedAt: "2026-02-31T00:00:00Z" },
    { evidence: [{ field: "followers", value: 100000, evidenceUrl: "https://www.instagram.com/observed_creator/", observedAt }] },
    { evidence: [{ field: "followers", value: 90000, evidenceUrl: "https://www.instagram.com/observed_creator/", observedAt: "2026-11-02T00:00:00Z" }] },
  ] satisfies Partial<CreatorPublicProfile>[]) {
    const value = candidate(90000); Object.assign(value.profile!, patch);
    assert.equal(creatorEligibility(value).status, "unverified");
  }
  const mismatch = candidate(90000); mismatch.handle = "somebody_else";
  assert.equal(creatorEligibility(mismatch).reason, "source-unverified");
});

test("eligibility coverage separates excluded counts from unavailable profile evidence without fabrication", () => {
  const summary = creatorEligibilitySummary([candidate(40001), candidate(39999), candidate(40000), candidate(null), { platform: "meta", handle: null, profileUrl: null, profile: null }]);
  assert.deepEqual({ eligible: summary.eligibleCount, excluded: summary.excludedCount, unverified: summary.unverifiedCount, total: summary.observedCount }, { eligible: 1, excluded: 2, unverified: 2, total: 5 });
  assert.equal(summary.reasonCounts["followers-at-or-below-minimum"], 2);
  assert.equal(summary.minFollowersExclusive, 40000);
});
