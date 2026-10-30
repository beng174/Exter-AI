import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { readBrand } from "./db.js";
import { analyseLocally, type BrainContentInput } from "./brain.js";
import { assertProxySupport } from "./connectors/http.js";
import type { Brand } from "../shared/types.js";
import type { AdAnalysis } from "../shared/ad-intelligence.js";
import type {
  BrandResearch,
  BrandResearchFact,
  BrandResearchSource,
} from "../shared/brand-research.js";

const MAX_BYTES = 2 * 1024 * 1024;
type DnsResolver = (
  hostname: string,
) => Promise<{ address: string; family: number }[]>;
export interface BrandResearchOptions {
  fetch?: typeof fetch;
  resolve?: DnsResolver;
  analyse?: (input: BrainContentInput) => Promise<{ analysis: AdAnalysis }>;
}
class ResearchError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const clean = (value: string, max = 1500) =>
  value
    .replace(/[\s\u00a0]+/g, " ")
    .trim()
    .slice(0, max);
function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    )
      return false;
    if (
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    )
      return false;
    return true;
  }
  // Accept global-unicast IPv6 only. Loopback, mapped IPv4, link-local and ULA are rejected.
  if (family === 6)
    return /^[23][0-9a-f]{0,3}:/i.test(address) && !/^2001:db8:/i.test(address);
  return false;
}
const nativeResolve: DnsResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });
async function safeUrl(
  raw: string,
  domain: string,
  resolver: DnsResolver,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ResearchError("The saved website domain is invalid.");
  }
  const host = url.hostname.toLowerCase();
  const base = domain.toLowerCase().replace(/^www\./, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    isIP(host) ||
    (host !== base && host !== `www.${base}`) ||
    !base.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|invalid)$/.test(host)
  )
    throw new ResearchError(
      "Brand research accepts only the saved public website over HTTPS. Local/private hosts, credentials and unrelated redirects are not allowed.",
    );
  const addresses = await resolver(host).catch(() => {
    throw new ResearchError("The saved website could not be resolved.", 502);
  });
  if (
    !addresses.length ||
    addresses.some((entry) => !publicAddress(entry.address))
  )
    throw new ResearchError(
      "The saved website resolves to a private, local or unsupported address.",
    );
  url.hash = "";
  return url;
}
async function readBounded(response: Response): Promise<string> {
  const size = Number(response.headers.get("content-length") || 0);
  if (size > MAX_BYTES)
    throw new ResearchError("Website response exceeds the 2 MB limit.", 413);
  const type = response.headers.get("content-type");
  if (type && !/text\/html|application\/xhtml\+xml/i.test(type))
    throw new ResearchError("The saved website did not return HTML.", 502);
  if (!response.body) return "";
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new ResearchError(
          "Website response exceeds the 2 MB limit.",
          413,
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
async function fetchPage(
  raw: string,
  domain: string,
  options: BrandResearchOptions,
): Promise<{ url: string; html: string }> {
  let url = await safeUrl(raw, domain, options.resolve || nativeResolve);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await (options.fetch || fetch)(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3)
        throw new ResearchError(
          "The website returned an unsupported redirect.",
          502,
        );
      url = await safeUrl(
        new URL(location, url).href,
        domain,
        options.resolve || nativeResolve,
      );
      continue;
    }
    if (!response.ok)
      throw new ResearchError(
        `The public website is unavailable (HTTP ${response.status}); no research was replaced.`,
        502,
      );
    return { url: url.href, html: await readBounded(response) };
  }
  throw new ResearchError("The website returned too many redirects.", 502);
}
interface Extracted {
  title: string;
  description: string;
  headings: string[];
  blocks: string[];
  excerpt: string;
  socialProfiles: BrandResearch["socialProfiles"];
  creatorFeatures: BrandResearch["creatorFeatures"];
  programmeUrls: string[];
  reviews: string[];
}
function extract(html: string, url: string, brand: Brand): Extracted {
  const $ = load(html),
    title = clean($("title").first().text(), 300),
    description = clean(
      $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        "",
      1000,
    );
  const socialProfiles: BrandResearch["socialProfiles"] = [],
    creatorFeatures: BrandResearch["creatorFeatures"] = [],
    programmeUrls: string[] = [];
  const brandToken = brand.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const socialHosts: Record<string, string> = {
    "instagram.com": "Instagram",
    "facebook.com": "Facebook",
    "tiktok.com": "TikTok",
    "youtube.com": "YouTube",
    "x.com": "X",
    "twitter.com": "X",
    "linkedin.com": "LinkedIn",
  };
  $("a[href]").each((_index, element) => {
    let link: URL;
    try {
      link = new URL($(element).attr("href") || "", url);
    } catch {
      return;
    }
    if (
      link.protocol !== "https:" ||
      link.username ||
      link.password ||
      link.port
    )
      return;
    const host = link.hostname.replace(/^www\./, "").toLowerCase();
    link.hash = "";
    if (
      host === new URL(url).hostname.replace(/^www\./, "") &&
      /ambassador|creator|influencer/i.test(link.pathname)
    ) {
      link.search = "";
      programmeUrls.push(link.href);
    }
    const platform = socialHosts[host];
    if (!platform) return;
    if (
      /^\/(?:p|reel|reels|watch|tr|share|sharer|intent)\b/i.test(
        link.pathname,
      ) ||
      /\/status\/|\/video\//i.test(link.pathname)
    )
      return;
    link.search = "";
    const slug = link.pathname.replace(/^\/+|\/+$/g, "");
    if (!slug) return;
    const headerFooter =
      $(element).closest('header,footer,[role="banner"],[role="contentinfo"]')
        .length > 0;
    const matchingBrand =
      brandToken.length > 2 &&
      slug
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .includes(brandToken);
    if (headerFooter || matchingBrand) {
      socialProfiles.push({ platform, url: link.href });
      return;
    }
    const text = clean($(element).text(), 200);
    const section = clean($(element).closest("section").text(), 1000);
    if (
      platform === "Instagram" &&
      !slug.includes("/") &&
      (text.includes("@" + slug) ||
        /real homes|our community|featured creators/i.test(section))
    )
      creatorFeatures.push({
        handle: "@" + slug,
        url: link.href,
        sourceUrl: url,
        relationship: "featured_on_brand_website",
      });
  });
  const root = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body");
  root
    .find(
      'script,style,noscript,template,svg,form,input,button,nav,header,footer,dialog,[role="dialog"],[role="navigation"],[class*="modal"],[class*="menu"],[class*="navigation"]',
    )
    .remove();
  const headings = root
    .find("h1,h2,h3")
    .map((_i, element) => clean($(element).text(), 180))
    .get()
    .filter(Boolean);
  const reviews = root
    .find(
      '[itemprop="reviewBody"],.review-text,.review-content,.pdp-review-card__text,[class*="review"][class*="text"]',
    )
    .map((_i, element) => clean($(element).text(), 700))
    .get()
    .filter((text) => text.length >= 40)
    .slice(0, 3);
  const values = root
    .find('p,li,blockquote,h1,h2,h3,[class*="trust"],[class*="usp"]')
    .map((_i, element) => clean($(element).text(), 1300))
    .get();
  const unique = [...new Set(values)].filter(
    (value) =>
      value.length >= 20 &&
      !/privacy policy|cookie consent|klarna|clearpay|terms.*conditions|password|captcha|javascript|late fees/i.test(
        value,
      ),
  );
  const relevance = (value: string) =>
    (
      value.match(
        /fragrance|diffuser|candle|gifting|gift box|manufactur|made in|luxur|affordable|believ|creator|ugc|scent|our story|handmade/gi,
      ) || []
    ).length;
  const blocks = unique
    .map((value, index) => ({ value, index, score: relevance(value) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 14)
    .map((item) => item.value);
  const excerpt = clean(
    [title, description, ...headings.slice(0, 12), ...blocks]
      .filter(Boolean)
      .join("\n"),
    6000,
  );
  const dedupe = <T>(items: T[], key: (item: T) => string) => [
    ...new Map(items.map((item) => [key(item), item])).values(),
  ];
  return {
    title,
    description,
    headings,
    blocks,
    excerpt,
    socialProfiles: dedupe(socialProfiles, (item) => item.url),
    creatorFeatures: dedupe(creatorFeatures, (item) => item.url),
    programmeUrls: [...new Set(programmeUrls)].slice(0, 2),
    reviews,
  };
}
function source(
  url: string,
  data: Extracted,
  kind: BrandResearchSource["kind"],
  observedAt: string,
): BrandResearchSource {
  return {
    id: createHash("sha256").update(url).digest("hex").slice(0, 16),
    url,
    title: data.title || new URL(url).hostname,
    kind,
    observedAt,
    textExcerpt: data.excerpt,
    status: "available",
  };
}
function inferCategory(excerpt: string, fallback: string) {
  return /home fragrance|reed diffusers?|scented candles?/i.test(excerpt)
    ? "Home fragrance & gifting"
    : fallback;
}
export function saveBrandResearch(db: DatabaseSync, research: BrandResearch) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS brand_research (brand_id TEXT PRIMARY KEY REFERENCES brands(id),data TEXT NOT NULL)",
  );
  db.prepare(
    "INSERT INTO brand_research VALUES (?,?) ON CONFLICT(brand_id) DO UPDATE SET data=excluded.data",
  ).run(research.brandId, JSON.stringify(research));
  return research;
}
export function readBrandResearch(
  db: DatabaseSync,
  brandId: string,
): BrandResearch | null {
  if (
    !db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='brand_research'",
      )
      .get()
  )
    return null;
  const row = db
    .prepare("SELECT data FROM brand_research WHERE brand_id=?")
    .get(brandId) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}
export async function researchBrand(
  db: DatabaseSync,
  brandId: string,
  options: BrandResearchOptions = {},
): Promise<BrandResearch> {
  const brand = readBrand(db, brandId);
  if (!brand) throw new ResearchError("Brand workspace not found.", 404);
  const previous = readBrandResearch(db, brandId);
  if (!brand.domain)
    throw new ResearchError(
      "Save a public website domain for this brand before researching it.",
    );
  assertProxySupport(Boolean(options.fetch), process.env);
  const homepage = await fetchPage(
      `https://${brand.domain}/`,
      brand.domain,
      options,
    ),
    data = extract(homepage.html, homepage.url, brand),
    observedAt = new Date().toISOString();
  if (
    /just a moment|attention required|access denied|robot check|verify (?:you are|you're) human/i.test(
      data.title,
    )
  )
    throw new ResearchError(
      "The public website returned an access challenge. It was not treated as brand research.",
      502,
    );
  if (!data.excerpt || data.excerpt.length < 40)
    throw new ResearchError(
      "The website did not expose enough public text to research. It may require JavaScript or restrict automated access.",
      502,
    );
  const external = (url: string) => {
    try {
      return (
        new URL(url).hostname.replace(/^www\./, "").toLowerCase() !==
        brand.domain.replace(/^www\./, "").toLowerCase()
      );
    } catch {
      return false;
    }
  };
  const retainedSources =
    previous?.sources.filter((item) => external(item.url)) || [];
  const sources = [source(homepage.url, data, "website", observedAt)],
    programmeData: Extracted[] = [];
  for (const url of data.programmeUrls) {
    try {
      const page = await fetchPage(url, brand.domain, options),
        parsed = extract(page.html, page.url, brand);
      sources.push(source(page.url, parsed, "creator_programme", observedAt));
      programmeData.push(parsed);
    } catch {
      sources.push({
        id: createHash("sha256").update(url).digest("hex").slice(0, 16),
        url,
        title: "Creator programme page",
        kind: "creator_programme",
        observedAt,
        textExcerpt: "",
        status: "unavailable",
      });
    }
  }
  const facts: BrandResearchFact[] = [
    {
      label: "Website title",
      value: data.title,
      quote: data.title,
      sourceUrl: homepage.url,
      kind: "observed",
    },
  ];
  if (data.description)
    facts.push({
      label: "Website description",
      value: data.description,
      quote: data.description,
      sourceUrl: homepage.url,
      kind: "brand_claim",
    });
  for (const quote of data.blocks.slice(0, 5))
    facts.push({
      label: "Website positioning / product claim",
      value: quote,
      quote,
      sourceUrl: homepage.url,
      kind: "brand_claim",
    });
  for (const quote of data.reviews)
    facts.push({
      label: "Customer review displayed by the brand",
      value: quote,
      quote,
      sourceUrl: homepage.url,
      kind: "brand_claim",
    });
  programmeData.forEach((parsed, index) => {
    for (const quote of parsed.blocks
      .filter((text) =>
        /ugc|commission|creators?|tik\s*tok|gifting|everyday/i.test(text),
      )
      .slice(0, 3))
      facts.push({
        label: "Creator-programme statement",
        value: quote,
        quote,
        sourceUrl:
          sources.filter(
            (item) =>
              item.kind === "creator_programme" && item.status === "available",
          )[index]?.url || homepage.url,
        kind: "brand_claim",
      });
  });
  let analysis: AdAnalysis | null = null,
    analysisStatus: BrandResearch["analysisStatus"] = "analysis_unavailable";
  const localVisual =
    previous?.visualEvidence
      ?.map((item) => item.imagePath)
      .find((path) =>
        /^\/images\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(path),
      ) || "";
  try {
    const result = await (options.analyse || analyseLocally)({
      title: data.title,
      copy: clean([data.description, ...data.blocks].join("\n"), 3500),
      brand: brand.name,
      image: localVisual,
      creativeFormats: [],
    });
    analysis = result.analysis;
    analysisStatus = "complete";
  } catch {}
  const proposedTests: BrandResearch["proposedTests"] = [];
  const creatorSources = sources.filter(
    (item) => item.kind === "creator_programme" && item.status === "available",
  );
  if (
    creatorSources.some((item) =>
      /ugc|creators?|tik\s*tok/i.test(item.textExcerpt),
    )
  )
    proposedTests.push({
      format: "UGC / creator-led",
      hypothesis:
        "Test an everyday-use creator demonstration grounded in the brand’s stated creator direction. This is a creative hypothesis, not an observed performance winner.",
      evidenceSourceUrls: creatorSources.map((item) => item.url),
      status: "hypothesis",
    });
  if (data.reviews.length)
    proposedTests.push({
      format: "Reviews & testimonials",
      hypothesis:
        "Test a permission-cleared customer-review execution using a specific product experience. Website reviews establish message material, not conversion effectiveness.",
      evidenceSourceUrls: [homepage.url],
      status: "hypothesis",
    });
  if (/bundle|save|offer|discount/i.test(data.excerpt))
    proposedTests.push({
      format: "Static / carousel offer",
      hypothesis:
        "Test a clear product-bundle or value proposition using only verified current offer terms. Website offer presence does not establish that this format performs best.",
      evidenceSourceUrls: [homepage.url],
      status: "hypothesis",
    });
  const limitations = [
    previous?.adLibraryEvidence?.records.length
      ? "Website research and a separate bounded Meta ad-library sample are stored. Website refresh does not refresh the ad-library capture."
      : "This is website and creator-programme research, not a paid-ad or organic social-post crawl.",
    "Website claims and displayed reviews are publisher-supplied and were not independently verified.",
    "No social-ad engagement, impressions, spend or conversions were collected; no best-performing format can be established.",
    "Creator profiles are linked from the brand website, not independently verified audience or performance matches.",
    "Model interpretations describe supplied website text; they are not measured audience facts.",
  ];
  if (analysisStatus === "analysis_unavailable")
    limitations.push(
      "Local model analysis is unavailable. Source facts were preserved; check model runtime/cache before retrying.",
    );
  if (retainedSources.length)
    limitations.push(
      "Previously curated external source entries were not re-fetched during this website refresh; their original observation timestamps were retained.",
    );
  const retainedFacts =
    previous?.facts.filter((item) => external(item.sourceUrl)) || [];
  const retainedTests =
    previous?.proposedTests.filter((item) =>
      item.evidenceSourceUrls.some(external),
    ) || [];
  const result: BrandResearch = {
    ...previous,
    brandId: brand.id,
    brandName: brand.name,
    domain: brand.domain,
    category: inferCategory(data.excerpt, brand.category),
    observedAt,
    sources: [...sources, ...retainedSources],
    facts: [...facts, ...retainedFacts],
    analysis,
    analysisStatus,
    analysisError:
      analysisStatus === "complete"
        ? null
        : "Local inference was unavailable. Source facts were preserved; check the model runtime/cache before retrying.",
    socialProfiles: data.socialProfiles,
    creatorFeatures: data.creatorFeatures,
    competitorCandidates: previous?.competitorCandidates || [],
    limitations,
    proposedTests: [...proposedTests, ...retainedTests],
    ...(previous?.visualEvidence
      ? { visualEvidence: previous.visualEvidence }
      : {}),
  };
  return saveBrandResearch(db, result);
}
export function attachBrandResearch(
  app: Express,
  db: DatabaseSync,
  options: BrandResearchOptions = {},
) {
  app.get("/api/brand-research", (req, res) => {
    try {
      if (typeof req.query.brandId !== "string")
        throw new ResearchError("brandId is required.");
      if (!readBrand(db, req.query.brandId))
        throw new ResearchError("Brand workspace not found.", 404);
      res.json(readBrandResearch(db, req.query.brandId));
    } catch (error) {
      const e = error as ResearchError;
      res
        .status(e.status || 500)
        .json({
          error:
            e instanceof ResearchError
              ? e.message
              : "Saved brand research is unavailable.",
        });
    }
  });
  app.post("/api/brand-research", async (req, res) => {
    try {
      if (typeof req.body?.brandId !== "string")
        throw new ResearchError("brandId is required.");
      if (req.body.url !== undefined || req.body.domain !== undefined)
        throw new ResearchError(
          "Research uses the saved brand domain; URL overrides are not accepted.",
        );
      res.status(201).json(await researchBrand(db, req.body.brandId, options));
    } catch (error) {
      const e = error as ResearchError;
      res
        .status(e.status || 502)
        .json({
          error:
            e instanceof ResearchError
              ? e.message
              : "Public website research failed; previous saved research was preserved.",
        });
    }
  });
}
