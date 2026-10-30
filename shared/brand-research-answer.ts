import type { BrandResearch } from "./brand-research";

/** Public evidence supports observed activity; missing engagement must not become a winner. */
export function answerBrandResearchQuestion(
  question: string,
  profile: BrandResearch,
) {
  const context = `${profile.brandName} · ${profile.category} · Public website research observed ${profile.observedAt}. `;
  let answer: string;
  const library = profile.adLibraryEvidence;
  const librarySummary = library?.records.length
    ? `${library.records.length} source-linked Meta ad-library records were collected in a bounded sample at ${library.capturedAt}; ${library.records.filter((ad) => ad.deliveryStatus === "active").length} were labelled active at capture. Source media labels: ${Object.entries(library.records.reduce<Record<string, number>>((counts, ad) => { counts[ad.format] = (counts[ad.format] || 0) + 1; return counts; }, {})).map(([format, count]) => `${format}: ${count}`).join(", ")}. This is observed use in the sample, not an exhaustive brand/category count or a performance ranking. `
    : "";
  let sourceUrls = profile.sources
    .filter((source) => source.status === "available")
    .slice(0, 3)
    .map((source) => source.url);
  if (
    /format|perform|conver|winning|works? best|best ad|real.?time|live market/i.test(
      question,
    )
  ) {
    answer = librarySummary
      ? librarySummary + "The library did not supply per-ad engagement counts and a usable denominator, so I cannot identify a winning ad format by engagement rate or claim real-time results. Dynamic creative is a source label, not proof of UGC, influencer or carousel style. "
      : "There are no verified ad-performance records in this research snapshot, so I cannot identify a winning ad format or claim real-time results. ";
    if (librarySummary) sourceUrls = [library!.queryUrl, ...library!.records.slice(0, 2).map((ad) => ad.sourceUrl!)];
    if (profile.proposedTests.length)
      answer += `Source-backed hypotheses to test: ${profile.proposedTests.map((test) => test.format).join("; ")}. `;
    answer +=
      "The website’s creator/UGC recruitment and product/review messaging are creative-direction evidence, not proof that those formats outperform competitors.";
  } else if (librarySummary && /ad.?library|show.*ads|list.*ads|ads.*(?:active|running)|(?:active|running).*ads|how many ads/i.test(question)) {
    answer = librarySummary + "Each saved record has a source link and available delivery start/end dates. Delivery dates are not necessarily the original post publication date. Missing engagement remains unavailable; ad longevity is a creative-use signal, not measured effectiveness.";
    sourceUrls = [library!.queryUrl, ...library!.records.slice(0, 2).map((ad) => ad.sourceUrl!)];
  } else if (/competitor|compare.*brand|other brands/i.test(question)) {
    sourceUrls = profile.competitorCandidates.map(
      (candidate) => candidate.sourceUrl,
    );
    answer = profile.competitorCandidates.length
      ? `Source-based candidate competitors: ${profile.competitorCandidates.map((c) => `${c.name} — ${c.summary}`).join("\n")}. These are analyst-selected category candidates, not a verified exhaustive competitor set or a performance ranking.`
      : "No source-checked competitor candidates are stored for this website research.";
  } else if (/creator|influencer|ugc/i.test(question)) {
    sourceUrls = [
      ...profile.sources
        .filter((source) => source.kind === "creator_programme")
        .map((source) => source.url),
      ...profile.creatorFeatures.map((creator) => creator.sourceUrl),
    ];
    answer = profile.creatorFeatures.length
      ? `The brand’s own website features ${profile.creatorFeatures.map((c) => c.handle).join(", ")}. That verifies a website feature only; it does not establish audience fit, paid-partnership terms or ad performance. Its creator programme provides a basis for testing creator-led content, not a winning-format claim.`
      : "No website-featured creator profiles were found in the available sources.";
  } else if (
    /brand|voice|website|position|category|review|message|offer/i.test(question)
  ) {
    answer = `Observed category: ${profile.category}. Website statements include: ${profile.facts
      .filter((fact) => fact.kind === "brand_claim")
      .slice(0, 3)
      .map((fact) => fact.value)
      .join(
        " ",
      )}. These are publisher-supplied claims, not independently verified product or campaign results. `;
    if (profile.analysis?.topic)
      answer += `Exter’s local model interpreted the topic as “${profile.analysis.topic}”; that interpretation remains separate from observed facts.`;
  } else return null;
  return {
    answer: context + answer,
    sources: [...new Set(sourceUrls)].slice(0, 3),
    mode: "rule-based" as const,
  };
}
