import { test } from "node:test";
import assert from "node:assert/strict";
import type { Ad, Brand, Dashboard } from "../shared/types";
import {
  analyzeFormats,
  annotateSampleAd,
  classifyCreativeFormats,
  normalizeCreativeFormats,
} from "../shared/formats";
import { answerResearchQuestion } from "../shared/research";
import { analyzeRecords } from "../shared/analytics";

const brand: Brand = {
  id: "test",
  name: "Test",
  category: "Beauty & skincare",
  domain: "test.example",
  color: "#333",
  initials: "T",
  voice: [],
  competitors: ["Other"],
  mode: "imported",
  createdAt: new Date().toISOString(),
};
const row = (
  id: string,
  platform: Ad["platform"],
  tags: string[],
  overrides: Partial<Ad> = {},
): Ad =>
  ({
    id,
    brandId: brand.id,
    brand: "Other",
    platform,
    category: brand.category,
    title: "Test creative",
    copy: "",
    angle: "Ingredient spotlight",
    audience: "Routine builders",
    format: "Video",
    creativeFormats: tags,
    image: "",
    color: "#333",
    active: true,
    publishedAt: new Date(Date.now() - 86400000).toISOString(),
    impressions: 1000,
    engagements: 100,
    conversions: null,
    spend: null,
    revenue: null,
    owned: false,
    source: "import",
    sourceUrl: null,
    ...overrides,
  }) as Ad;
const ads = [
  row("m-ugc", "Meta", ["UGC"], { engagements: 160 }),
  row("m-static", "Meta", ["Static"], { engagements: 70 }),
  row("t-influencer", "TikTok", ["Influencer"], { engagements: 210 }),
  row("t-ugc", "TikTok", ["UGC"], { engagements: 140 }),
  row("g-search", "Google", ["Search / text"], { engagements: 30 }),
  row("g-shopping", "Google", ["Shopping"], { engagements: 60 }),
];
function dashboard(records = ads): Dashboard {
  return analyzeRecords(brand, records, [], [], 30);
}

test("creative formats are explicitly annotated multi-label styles, distinct from media and angle", () => {
  assert.deepEqual(
    normalizeCreativeFormats([
      "ugc",
      "User-generated content",
      "before and after",
      "reviews",
      "live-photo",
      "invented-style",
    ]),
    ["UGC", "Before & after", "Reviews & testimonials", "Live photo"],
  );
  assert.deepEqual(classifyCreativeFormats(row("generic-video", "Meta", [])), [
    "Unclassified",
  ]);
  assert.deepEqual(
    classifyCreativeFormats(row("image", "Meta", [], { format: "Image" })),
    ["Static"],
  );
  assert.deepEqual(
    classifyCreativeFormats(row("explicit", "Meta", ["UGC", "reviews"])),
    ["UGC", "Reviews & testimonials"],
  );
});

test("format comparison ranks separate platform winners with correct weighted rates", () => {
  const result = analyzeFormats(brand, ads);
  assert.equal(result.totalAds, 6);
  assert.equal(result.classifiedAds, 6);
  assert.deepEqual(
    result.platforms.map((platform) => [
      platform.platform,
      platform.winner?.name,
    ]),
    [
      ["Meta", "UGC"],
      ["TikTok", "Influencer"],
      ["Google", "Shopping"],
    ],
  );
  assert.equal(result.platforms[0].winner?.engagementRate, 16);
  const weighted = analyzeFormats(brand, [
    row("small", "Meta", ["UGC"], { impressions: 100, engagements: 50 }),
    row("large", "Meta", ["UGC"], { impressions: 9900, engagements: 50 }),
  ]);
  assert.equal(weighted.platforms[0].winner?.engagementRate, 1);
  assert.equal(result.dataMode, "imported");
  assert.ok(
    result.notes.some((note) => note.includes("different metric definitions")),
  );
});

test("coverage excludes unclassified records from winners and discloses multi-label overlap", () => {
  const result = analyzeFormats(brand, [
    row("multi", "Meta", ["UGC", "Reviews & testimonials"]),
    row("unknown", "Meta", [], { engagements: 999 }),
  ]);
  assert.equal(result.totalAds, 2);
  assert.equal(result.classifiedAds, 1);
  assert.equal(result.unclassifiedAds, 1);
  assert.equal(result.formats.filter((group) => group.rank !== null).length, 2);
  assert.notEqual(result.platforms[0].winner?.name, "Unclassified");
  assert.ok(result.notes.some((note) => note.includes("overlap")));
  assert.ok(result.formats.every((group) => group.limitedSample));
});

test("creative format scope filters date, workspace, category, mode and platform", () => {
  const records = [
    ...ads,
    row("wrong-category", "Meta", ["Static"], {
      category: "Fashion",
      engagements: 900,
    }),
    row("wrong-workspace", "Meta", ["Static"], {
      brandId: "elsewhere",
      engagements: 900,
    }),
    row("sample-leak", "Meta", ["Static"], {
      source: "sample",
      engagements: 900,
    }),
    row("expired", "Meta", ["Static"], {
      publishedAt: new Date(Date.now() - 100 * 86400000).toISOString(),
      engagements: 900,
    }),
  ];
  const result = analyzeFormats(brand, records, { platform: "Meta", range: 7 });
  assert.equal(result.totalAds, 2);
  assert.equal(result.platforms.length, 1);
  assert.equal(result.platforms[0].winner?.name, "UGC");
  assert.equal(result.sampleAds, 0);
});

test("CPA pairs owned spend and conversions; competitor metrics cannot affect conversion winners", () => {
  const records = [
    row("owned-ugc", "Meta", ["UGC"], {
      brand: brand.name,
      owned: true,
      conversions: 10,
      spend: 100,
    }),
    row("owned-static", "Meta", ["Static"], {
      brand: brand.name,
      owned: true,
      conversions: 20,
      spend: 400,
    }),
    row("unpaired", "Meta", ["UGC"], {
      brand: brand.name,
      owned: true,
      conversions: 90,
      spend: null,
    }),
    row("competitor", "Meta", ["Influencer"], { conversions: 500, spend: 1 }),
  ];
  const cpa = analyzeFormats(brand, records, {
    metric: "cpa",
    platform: "Meta",
  });
  assert.equal(cpa.platforms[0].winner?.name, "UGC");
  assert.equal(cpa.platforms[0].winner?.cpa, 10);
  assert.equal(cpa.platforms[0].winner?.conversions, 100);
  assert.equal(
    cpa.formats.find((group) => group.name === "Influencer")?.conversions,
    null,
  );
  assert.equal(
    cpa.formats.find((group) => group.name === "Influencer")?.rank,
    null,
  );
  const rate = analyzeFormats(brand, records, {
    metric: "conversionRate",
    platform: "Meta",
  });
  assert.equal(rate.platforms[0].winner?.conversionRate, 5);
  assert.equal(rate.platforms[0].winner?.ownedImpressions, 2000);
});

test("missing or zero owned conversion evidence never falls back to an engagement winner", () => {
  const empty = analyzeFormats(brand, ads, { metric: "cpa" });
  assert.ok(empty.platforms.every((platform) => platform.winner === null));
  assert.ok(empty.platforms[0].missingMetric?.includes("owned conversion"));
  const zero = analyzeFormats(
    brand,
    [row("zero", "Meta", ["UGC"], { owned: true, conversions: 0, spend: 10 })],
    { metric: "cpa" },
  );
  assert.equal(zero.platforms[0].winner, null);
  assert.equal(zero.formats[0].cpa, null);
});

test("sample annotations are deterministic, multi-platform and never applied to imports", () => {
  const sample = row("sample-a", "Meta", [], { source: "sample" });
  assert.deepEqual(annotateSampleAd(sample), annotateSampleAd(sample));
  assert.notDeepEqual(classifyCreativeFormats(annotateSampleAd(sample)), [
    "Unclassified",
  ]);
  assert.equal(annotateSampleAd(row("import", "Meta", [])).format, "Video");
  assert.deepEqual(
    classifyCreativeFormats(annotateSampleAd(row("import", "Meta", []))),
    ["Unclassified"],
  );
  const result = analyzeFormats({ ...brand, mode: "demo" }, [
    annotateSampleAd(sample),
  ]);
  assert.equal(result.dataMode, "sample");
  assert.ok(result.notes.some((note) => note.includes("fictional")));
});

test("format questions answer formats by each platform, not a generic ad angle", () => {
  const result = answerResearchQuestion({
    question:
      "Which ad format is working best in my category on Meta, TikTok and Google?",
    brand,
    ads,
    dashboard: dashboard(),
  });
  assert.ok(result.answer.includes("Meta\n1. UGC"));
  assert.ok(result.answer.includes("TikTok\n1. Influencer"));
  assert.ok(result.answer.includes("Google\n1. Shopping"));
  assert.ok(result.answer.includes("Beauty & skincare"));
  assert.ok(!result.answer.includes("Ingredient spotlight has the highest"));
  assert.ok(result.sources.includes("m-ugc"));
  assert.ok(result.formatAnalysis);
});

test("explicit platform and date in a question override UI scope without cross-platform leakage", () => {
  const result = answerResearchQuestion({
    question: "Which ad format works best on Google in the last 7 days?",
    brand,
    ads,
    dashboard: dashboard(),
    platform: "Meta",
    range: 90,
  });
  assert.equal(result.scope.platform, "Google");
  assert.equal(result.scope.range, 7);
  assert.ok(result.sources.every((id) => id.startsWith("g-")));
  assert.equal(result.formatAnalysis?.platforms.length, 1);
  assert.equal(result.formatAnalysis?.platforms[0].winner?.name, "Shopping");
});

test("format conversion questions report missing evidence rather than saying engagement converts", () => {
  const result = answerResearchQuestion({
    question: "Which UGC format is converting best on Meta?",
    brand,
    ads,
    dashboard: dashboard(),
  });
  assert.equal(result.scope.metric, "cpa");
  assert.equal(result.formatAnalysis?.platforms[0].winner, null);
  assert.ok(result.answer.includes("No comparable owned conversion"));
  assert.ok(result.answer.includes("engagement is not a substitute"));
});

test("research states sample/live limitations and refuses unsupported questions or ROAS", () => {
  const sampleBrand = { ...brand, mode: "demo" as const };
  const sampleAds = ads.map((ad) => ({ ...ad, source: "sample" as const }));
  const result = answerResearchQuestion({
    question: "Which ad format works best right now?",
    brand: sampleBrand,
    ads: sampleAds,
    dashboard: analyzeRecords(sampleBrand, sampleAds, [], []),
  });
  assert.ok(
    result.answer.includes(
      "fictional sample results, not real-time market findings",
    ),
  );
  assert.ok(result.answer.includes("cannot establish"));
  assert.ok(!result.answer.includes("1. UGC:"));
  const unsupported = answerResearchQuestion({
    question: "How will the stock market move?",
    brand,
    ads,
    dashboard: dashboard(),
  });
  assert.ok(unsupported.answer.includes("does not clearly match"));
  const live = answerResearchQuestion({
    question: "What is live today?",
    brand,
    ads,
    dashboard: dashboard(),
  });
  assert.ok(live.answer.includes("No verified live data connection"));
  const roas = answerResearchQuestion({
    question: "Which format has best ROAS?",
    brand,
    ads,
    dashboard: dashboard(),
  });
  assert.ok(roas.answer.includes("ROAS-by-format is not available"));
});

test("daily live observations sum metrics while counting distinct creatives and use report dates", () => {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const records = [
    row("ad-day-1", "Meta", ["UGC"], {
      source: "live",
      providerAdId: "provider-1",
      metricDate: today,
      observedAt: new Date().toISOString(),
      publishedAt: "2020-01-01T00:00:00Z",
      impressions: 1000,
      engagements: 100,
    }),
    row("ad-day-2", "Meta", ["UGC"], {
      source: "live",
      providerAdId: "provider-1",
      metricDate: yesterday,
      publishedAt: "2020-01-01T00:00:00Z",
      impressions: 2000,
      engagements: 100,
    }),
  ];
  const result = analyzeFormats(brand, records, {
    range: 7,
    platform: "Meta",
    sourceStatus: {
      connected: true,
      lastSuccessfulSyncAt: new Date().toISOString(),
    },
  });
  assert.equal(result.totalAds, 1);
  assert.equal(result.totalObservations, 2);
  assert.equal(result.platforms[0].winner?.ads, 1);
  assert.equal(result.platforms[0].winner?.observations, 2);
  assert.equal(result.platforms[0].winner?.impressions, 3000);
  assert.equal(result.platforms[0].winner?.engagementRate, (200 / 3000) * 100);
  assert.equal(result.dataMode, "live");
  assert.ok(result.lastObservedAt);
});

test("public view-based engagement uses its declared denominator, not unavailable impressions", () => {
  const records = [
    row("public-ugc", "Instagram", ["UGC"], {
      source: "public",
      impressions: 0,
      views: 100,
      engagements: 20,
      owned: false,
      conversions: null,
      spend: null,
      engagementRateBasis: "views",
    }),
    row("public-static", "Instagram", ["Static"], {
      source: "public",
      impressions: 0,
      views: 1000,
      engagements: 30,
      owned: false,
      conversions: null,
      spend: null,
      engagementRateBasis: "views",
    }),
  ];
  const result = analyzeFormats(brand, records, { platform: "Instagram" });
  assert.equal(result.platforms[0].winner?.name, "UGC");
  assert.equal(result.platforms[0].winner?.engagementRate, 20);
  assert.equal(result.platforms[0].winner?.engagementRateBasis, "views");
  const missing = analyzeFormats(
    brand,
    [{ ...records[0], metricsAvailable: false }],
    { platform: "Instagram" },
  );
  assert.equal(missing.platforms[0].winner, null);
});
test("incompatible public denominator bases and private currencies cannot produce a best-format ranking", () => {
  const mixed = [
    row("views", "Meta", ["UGC"], { views: 100, engagementRateBasis: "views" }),
    row("impressions", "Meta", ["Static"]),
  ];
  assert.equal(
    analyzeFormats(brand, mixed, { platform: "Meta" }).platforms[0].winner,
    null,
  );
  const privateRows = [
    row("gbp", "Meta", ["UGC"], {
      owned: true,
      conversions: 10,
      spend: 100,
      currency: "GBP",
    }),
    row("usd", "Meta", ["Static"], {
      owned: true,
      conversions: 10,
      spend: 100,
      currency: "USD",
    }),
  ];
  const result = analyzeFormats(brand, privateRows, {
    platform: "Meta",
    metric: "cpa",
  });
  assert.equal(result.platforms[0].winner, null);
  assert.match(result.platforms[0].missingMetric!, /Currencies/);
});
