import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { load } from "cheerio";
import { openDatabase, readBrand } from "../server/db.js";
import { saveBrandResearch } from "../server/brand-research.js";
import { analyseLocally } from "../server/brain.js";
import type { Brand } from "../shared/types.js";
import type { BrandResearch } from "../shared/brand-research.js";
const base = process.env.EXTER_TEST_BASE_URL || "http://127.0.0.1:3000";
async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}
async function check(url: string) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    const html = response.ok ? await response.text() : "";
    return { status: response.status, html: html.slice(0, 2000000) };
  } catch {
    return { status: 0, html: "" };
  }
}
const brand = await post<Brand>("/api/brands", {
  name: "Valentte",
  domain: "valentte.com",
  category: "Home fragrance & gifting",
});
const profile = await post<BrandResearch>("/api/brand-research", {
  brandId: brand.id,
});
assert.equal(
  profile.analysisStatus,
  "complete",
  "Website text must be genuinely analysed by the local engine.",
);
const references = JSON.parse(
  await readFile("research/valentte-reference.json", "utf8"),
);
profile.competitorCandidates = references.competitors.map((c: any) => ({
  name: c.name,
  domain: c.domain,
  sourceUrl: c.sourceUrl,
  summary: c.summary,
  evidence: c.evidence,
  status: "candidate",
}));
profile.sources = profile.sources.filter(
  (source) =>
    !references.competitors.some((c: any) => c.sourceUrl === source.url),
);
for (const candidate of references.competitors)
  profile.sources.push({
    id: `competitor-${candidate.domain}`,
    url: candidate.sourceUrl,
    title: `${candidate.name} — official category positioning`,
    kind: "competitor_website",
    observedAt: candidate.observedAt,
    textExcerpt: candidate.evidence.slice(0, 3).join(" "),
    status: "available",
  });
profile.visualEvidence = [
  {
    sourceUrl: "https://valentte.com/",
    imagePath: "/images/valentte-home.webp",
    description:
      "A gift set styled at home, featured on Valentte’s website with @our_perfect_home_x. Website creative, not a verified social-ad record.",
    kind: "website_image",
  },
];
const input = profile.facts
  .filter((fact) => fact.sourceUrl === "https://valentte.com/")
  .map((fact) => fact.quote)
  .join("\n")
  .slice(0, 3500);
profile.analysis = (
  await analyseLocally({
    title: "Valentte — home fragrance, reed diffusers, candles and gifting",
    copy: input,
    brand: "Valentte",
    image: "/images/valentte-home.webp",
  })
).analysis;
assert.ok(
  profile.analysis.observedRelevance?.includes("Local visual concept:"),
);
const instagramUrl = "https://www.instagram.com/valentte_london/";
const libraryUrl =
  "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=GB&q=Valentte&search_type=keyword_unordered&media_type=all";
const [instagram, library] = await Promise.all([
  check(instagramUrl),
  check(libraryUrl),
]);
const now = new Date().toISOString();
const $ = load(instagram.html);
const ogTitle = $('meta[property="og:title"]').attr("content") || "";
const description = $('meta[property="og:description"]').attr("content") || "";
const profileAvailable =
  instagram.status === 200 && /valentte/i.test(ogTitle) && Boolean(description);
if (profileAvailable) {
  const counters = description.split(" - ")[0];
  profile.sources = profile.sources.filter(
    (source) => source.id !== "instagram-public-profile",
  );
  profile.facts = profile.facts.filter(
    (fact) => fact.label !== "Instagram public-profile footprint",
  );
  profile.sources.push({
    id: "instagram-public-profile",
    url: instagramUrl,
    title: "Valentte Instagram — public profile metadata only",
    kind: "website",
    observedAt: now,
    textExcerpt: description.slice(0, 220),
    status: "available",
  });
  profile.facts.push({
    label: "Instagram public-profile footprint",
    value: `${counters}. Rounded counters may lag; they do not describe individual ad performance.`,
    sourceUrl: instagramUrl,
    quote: counters,
    kind: "observed",
  });
}
profile.coverageChecks = [
  {
    label: "Valentte website and creator programmes",
    url: "https://valentte.com/",
    status: "Available",
    message:
      "Public website/programme content collected; local text-and-still-image inference completed.",
  },
  {
    label: "Official Instagram",
    url: instagramUrl,
    status: profileAvailable
      ? "Profile metadata only"
      : `Not available (HTTP ${instagram.status || "network failure"})`,
    message: profileAvailable
      ? "Public profile metadata was accessible. No individual post links, captions, likes or engagement rates were ingested."
      : "No current profile information could be established; earlier source snapshots, if any, retain their original dates.",
  },
  {
    label: "Meta Ad Library — Valentte search",
    url: libraryUrl,
    status:
      library.status === 403
        ? "Access blocked"
        : library.status === 200
          ? "Search page only"
          : `Not available (HTTP ${library.status || "network failure"})`,
    message: `HTTP ${library.status || "network failure"}. No structured ad records or performance metrics were obtained. Access restrictions were not bypassed; zero ingested records does not mean no active ads.`,
  },
];
profile.limitations = [
  ...new Set([
    ...profile.limitations,
    "Competitor candidates were selected from source-backed category overlap for this test, not automatically discovered or performance-validated.",
    "The initial visual model can confuse gift-set packaging with cosmetics; this unvalidated interpretation is a classification gap, not a verified product/ad-format label.",
    "Instagram profile counters do not identify which ad formats earn engagement or conversions.",
    "Zero ingested ad records does not establish that Valentte has no active ads.",
  ]),
];
// Publish short evidence excerpts and paraphrased findings rather than full page text.
profile.sources = profile.sources.map((source) => ({
  ...source,
  textExcerpt:
    source.kind === "website" && source.url === "https://valentte.com/"
      ? "The homepage presents home-fragrance/skincare ranges, bundle offers, UK manufacture, gifting and review claims. This is website research, not ad-performance data."
      : source.kind === "creator_programme"
        ? "The brand recruits creators and describes opportunities for UGC, product features, gifting or TikTok commission. These statements do not establish performance."
        : source.textExcerpt.slice(0, 500),
}));
profile.facts = profile.facts.map((fact) => {
  const text = fact.quote;
  let value = fact.value.slice(0, 180);
  let label = fact.label;
  if (label === "Website title") {
    label = "Website range (public title)";
    value = "Public title identifies skincare and home fragrance.";
  } else if (label === "Customer review displayed by the brand")
    value =
      "Selected review published on the brand website; not an independently collected or representative review sample.";
  else if (/manufacture in the UK.*Cheshire/i.test(text))
    value =
      "The brand claims UK manufacture, Cheshire jobs and affordable-luxury positioning.";
  else if (/kitchen table/i.test(text))
    value =
      "The founder narrative emphasises kitchen-table origins and building a business.";
  else if (/scent sample sets/i.test(text))
    value = "The site promotes scent discovery through samples and room mists.";
  else if (/save up to (\d+)%/i.test(text))
    value = `The page advertised savings up to ${text.match(/save up to (\d+)%/i)![1]}% at inspection; availability and terms may change.`;
  return {
    ...fact,
    label,
    value,
    quote: fact.quote.slice(0, 65) + (fact.quote.length > 65 ? "…" : ""),
  };
});
if (profile.analysis.keyMessage)
  profile.analysis.keyMessage = profile.analysis.keyMessage.slice(0, 250);
const db = openDatabase();
try {
  saveBrandResearch(db, profile);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM ads WHERE brand_id=?").get(brand.id)!
      .n,
    0,
  );
  const current = readBrand(db, brand.id)!;
  await mkdir("shared/cases", { recursive: true });
  await writeFile(
    "shared/cases/valentte.json",
    JSON.stringify({ brand: current, research: profile }, null, 2) + "\n",
  );
} finally {
  db.close();
}
console.log(
  JSON.stringify(
    {
      brand: brand.name,
      brandId: brand.id,
      category: profile.category,
      analysis: profile.analysisStatus,
      model: profile.analysis.model,
      sources: profile.sources.length,
      facts: profile.facts.length,
      creatorFeatures: profile.creatorFeatures.length,
      competitorCandidates: profile.competitorCandidates.map((c) => c.name),
      verifiedAdRecords: 0,
      adFormatWinner: "Not measurable from currently accessible sources",
      coverage: profile.coverageChecks.map((c) => ({
        source: c.label,
        status: c.status,
      })),
      observedAt: profile.observedAt,
    },
    null,
    2,
  ),
);
