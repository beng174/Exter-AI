import type { BrandResearch } from "./brand-research";

/** Website research can support hypotheses, never a substitute for missing ad results. */
export function answerBrandResearchQuestion(
  question: string,
  profile: BrandResearch,
) {
  const context = `${profile.brandName} · ${profile.category} · Public website research observed ${profile.observedAt}. `;
  let answer: string;
  let sourceUrls = profile.sources
    .filter((source) => source.status === "available")
    .slice(0, 3)
    .map((source) => source.url);
  if (
    /format|perform|conver|winning|works? best|best ad|real.?time|live market/i.test(
      question,
    )
  ) {
    answer =
      "There are no verified ad-performance records in this research snapshot, so I cannot identify a winning ad format or claim real-time results. ";
    if (profile.proposedTests.length)
      answer += `Source-backed hypotheses to test: ${profile.proposedTests.map((test) => test.format).join("; ")}. `;
    answer +=
      "The website’s creator/UGC recruitment and product/review messaging are creative-direction evidence, not proof that those formats outperform competitors.";
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
