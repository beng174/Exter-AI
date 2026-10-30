import type { BrandResearch } from "./brand-research";
import type { MetaLibrarySnapshot } from "./meta-library";

/** Attach a separately dated library capture without redating website evidence. */
export function withMetaLibraryEvidence(
  profile: BrandResearch,
  snapshot: MetaLibrarySnapshot,
): BrandResearch {
  if (profile.brandId !== snapshot.brandId)
    throw new Error("Ad-library evidence belongs to another workspace.");
  const queryUrl = snapshot.sources.find((source) => new URL(source.requestUrl).searchParams.get("active_status") === "active")?.requestUrl || snapshot.sources[0]?.requestUrl;
  if (!queryUrl || !snapshot.ads.length) return profile;
  const limitations = profile.limitations.filter((text) =>
    !/zero ingested|no.*ad records|not a paid-ad or organic social-post crawl/i.test(text),
  );
  return {
    ...profile,
    adLibraryEvidence: {
      source: "Meta Ad Library",
      queryUrl,
      capturedAt: snapshot.observedAt,
      advertiserPageId: snapshot.advertiserPageId,
      advertiserName: snapshot.brandName,
      completeness: "bounded_sample",
      records: snapshot.ads,
      limitations: [snapshot.metricCaveat,
        "Only the initial result batches were captured. Sample format counts and active status describe this capture, not the complete market or a current delivery check.",
        "DCO is the library's dynamic-creative label. Creator origin and content style need separate evidence; video is not automatically UGC.",
      ],
    },
    coverageChecks: [
      ...(profile.coverageChecks || []).filter((check) => !/Meta Ad Library/i.test(check.label)),
      {
        label: "Meta Ad Library — rendered public advertiser search",
        url: queryUrl,
        status: "Public ad sample collected",
        message: `${snapshot.ads.length} distinct source-linked records, ${snapshot.coverage.activeAds} labelled active at capture ${snapshot.observedAt}. An ordinary browser rendered real records; the previous HTTP-only 403 conclusion was insufficient. Engagement counts and denominator were not supplied.`,
      },
    ],
    limitations: [...new Set([...limitations,
      "A bounded public Meta ad-library sample was collected separately from website research. It contains creative/delivery evidence without engagement counts or a usable rate denominator.",
      "Website and ad-library captures have independent observation dates; this saved case is not a continuous monitoring feed.",
    ])],
  };
}
