import { metaStatus } from "./connectors/meta-library.js";
import { queueAnalysis } from "./brain.js";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { Ad, Platform } from "../shared/types.js";
import { readBrand } from "./db.js";
import { assertProxySupport } from "./connectors/http.js";

class PublicError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Fetcher = typeof fetch;
const providers = [
  {
    platform: "TikTok",
    method: "Public oEmbed URL collection",
    status: "available",
    coverage:
      "Submitted public video URLs; no client ad-account permission. Engagement counts and active dates are not returned by oEmbed.",
  },
  {
    platform: "YouTube",
    method: "Public oEmbed URL collection",
    status: "available",
    coverage:
      "Submitted public video URLs; no client permission. Public Data API / licensed discovery requires service access for broad category monitoring.",
  },
  {
    platform: "X",
    method: "Public oEmbed URL collection",
    status: "available",
    coverage:
      "Submitted public post URLs when the publisher exposes an embed; unavailable/deleted/protected posts can fail.",
  },
  ...["Instagram", "Facebook", "LinkedIn"].map((platform) => ({
    platform,
    method: "Approved public / licensed source required",
    status: "provider_required",
    coverage:
      "No client account permission is needed for public competitor research. Exter needs an approved public-data connector or authorised public export; none is connected.",
  })),
  {
    platform: "Meta",
    method: "Public ad-library browser capture and native-ID import",
    status: "bounded_capture_available",
    coverage:
      "A repeatable normal-browser collector captured real Valentte ads without client credentials. Collection is an on-request CLI workflow with a bounded initial batch; broad discovery and continuous polling are not connected. Engagement counts are unavailable in the tested library records.",
  },
  {
    platform: "Google",
    method: "Ad transparency / licensed source required",
    status: "provider_required",
    coverage:
      "Public competitor ads are separate from private Google Ads reporting. No transparency collection connector is connected.",
  },
];
function publicTarget(raw: unknown): {
  platform: Platform;
  sourceUrl: string;
  endpoint: URL;
} {
  if (typeof raw !== "string" || raw.length > 2000)
    throw new PublicError("Provide a public post URL.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublicError("Provide a valid HTTPS public post URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new PublicError("Only ordinary HTTPS social post URLs are accepted.");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "tiktok.com" && /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname))
    return {
      platform: "TikTok",
      sourceUrl: `https://www.tiktok.com${url.pathname}`,
      endpoint: new URL(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com${url.pathname}`)}`,
      ),
    };
  if (["youtube.com", "youtu.be"].includes(host)) {
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v") ||
          url.pathname.match(/^\/shorts\/([\w-]+)/)?.[1];
    if (!id || !/^[-\w]{11}$/.test(id))
      throw new PublicError(
        "YouTube requires a public watch, Shorts or youtu.be video URL.",
      );
    const sourceUrl = `https://www.youtube.com/watch?v=${id}`;
    return {
      platform: "YouTube",
      sourceUrl,
      endpoint: new URL(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`,
      ),
    };
  }
  if (
    ["x.com", "twitter.com"].includes(host) &&
    /^\/[^/]+\/status\/\d+\/?$/.test(url.pathname)
  ) {
    const sourceUrl = `https://x.com${url.pathname}`;
    return {
      platform: "X",
      sourceUrl,
      endpoint: new URL(
        `https://publish.x.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(`https://twitter.com${url.pathname}`)}`,
      ),
    };
  }
  throw new PublicError(
    "Direct public URL collection currently supports full TikTok video, YouTube video and X post URLs. Instagram, Facebook and LinkedIn require an approved public-data source or public-content import; no client account access is required.",
    409,
  );
}
const plain = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
export function attachPublicMonitor(
  app: Express,
  db: DatabaseSync,
  options: { fetch?: Fetcher; analyse?: boolean } = {},
) {
  app.get("/api/public/sources", (_req, res) =>
    res.json({
      scope: "public_competitor_and_category",
      clientAccountRequired: false,
      providers: providers.map(provider => provider.platform === "Meta" ? { ...provider, method: "Meta Ad Library API and browser media capture", ...metaStatus() } : provider),
      disclosure:
        "Submitted public URLs are collected only on request. Broad discovery and ongoing category polling are not connected. No claim to read every post or to know public competitor conversions.",
    }),
  );
  app.post("/api/public/collect", async (req, res) => {
    try {
      const brand =
        typeof req.body?.brandId === "string"
          ? readBrand(db, req.body.brandId)
          : null;
      if (!brand)
        throw new PublicError("Choose an existing brand workspace.", 404);
      if (
        !Array.isArray(req.body.urls) ||
        !req.body.urls.length ||
        req.body.urls.length > 25
      )
        throw new PublicError("Provide between 1 and 25 public post URLs.");
      if (
        req.body.contentSource !== undefined &&
        !["paid", "organic"].includes(req.body.contentSource)
      )
        throw new PublicError("contentSource must be paid or organic.");
      const targets = req.body.urls.map(publicTarget);
      assertProxySupport(Boolean(options.fetch), process.env);
      const now = new Date().toISOString(),
        ads: Ad[] = [];
      for (const target of targets) {
        const response = await (options.fetch || fetch)(target.endpoint, {
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
          headers: { Accept: "application/json" },
        });
        if (!response.ok)
          throw new PublicError(
            `The public ${target.platform} embed is unavailable (HTTP ${response.status}). No account credentials are requested and no partial batch was saved.`,
            502,
          );
        const contentLength = Number(
          response.headers.get("content-length") || 0,
        );
        if (contentLength > 1000000)
          throw new PublicError(
            "Public embed response exceeds the size limit.",
            502,
          );
        const bodyText = await response.text();
        if (bodyText.length > 1000000)
          throw new PublicError(
            "Public embed response exceeds the size limit.",
            502,
          );
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(bodyText);
        } catch {
          throw new PublicError(
            "Public source returned an unsupported response; no records were saved.",
            502,
          );
        }
        let thumbnail = "";
        try {
          const t = new URL(String(body.thumbnail_url || ""));
          if (
            t.protocol === "https:" &&
            ["i.ytimg.com", "img.youtube.com"].includes(t.hostname) &&
            !t.username &&
            !t.password &&
            !t.port
          )
            thumbnail = t.href;
        } catch {}
        const title = plain(body.title, 200) || plain(body.html, 200);
        if (!title)
          throw new PublicError(
            "Public source did not return usable post metadata.",
            502,
          );
        // oEmbed exposes neither impression/engagement counts nor a reliable active date.
        // Zeros are storage placeholders only; availability flags keep them out of rankings.
        ads.push({
          id: `public:${createHash("sha256")
            .update(brand.id + target.sourceUrl)
            .digest("hex")
            .slice(0, 32)}`,
          brandId: brand.id,
          brand:
            plain(req.body.advertiser, 80) ||
            plain(body.author_name, 80) ||
            "Public creator",
          platform: target.platform,
          category: brand.category,
          title,
          copy: plain(body.title || body.html, 4000),
          angle: "Not analysed",
          audience: "Not inferred",
          format: target.platform === "X" ? "Public post" : "Video",
          creativeFormats: [],
          contentSource: req.body.contentSource || "organic",
          image: thumbnail,
          color: brand.color,
          active: false,
          deliveryStatus: "unknown",
          publishedAt: now,
          dateBasis: "observed",
          observedAt: now,
          impressions: 0,
          engagements: 0,
          metricsAvailable: false,
          engagementRateBasis: "unavailable",
          spend: null,
          conversions: null,
          revenue: null,
          owned: false,
          source: "public",
          sourceUrl: target.sourceUrl,
        });
      }
      db.exec("BEGIN");
      try {
        const put = db.prepare(
          "INSERT INTO ads VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,published_at=excluded.published_at",
        );
        for (const ad of ads) {
          const prior = db
            .prepare("SELECT data FROM ads WHERE id=?")
            .get(ad.id) as { data: string } | undefined;
          if (prior) {
            const old = JSON.parse(prior.data) as Ad;
            ad.publishedAt = old.publishedAt;
            ad.analysis = old.analysis;
            ad.creativeFormats = old.creativeFormats || [];
          }
          put.run(
            ad.id,
            brand.id,
            "public",
            ad.platform,
            now,
            JSON.stringify(ad),
          );
        }
        db.prepare("UPDATE brands SET data=? WHERE id=?").run(
          JSON.stringify({
            ...brand,
            mode: "imported",
            competitors: [
              ...new Set([
                ...brand.competitors,
                ...ads
                  .map((ad) => ad.brand)
                  .filter((name) => name !== brand.name),
              ]),
            ],
          }),
          brand.id,
        );
        db.prepare("DELETE FROM shortlist WHERE brand_id=?").run(brand.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      let analysisJob = null;
      try {
        if (options.analyse !== false)
          analysisJob = queueAnalysis(db, brand.id);
      } catch {}
      res
        .status(201)
        .json({
          analysisJob,
          collected: ads.length,
          clientAccountRequired: false,
          observedAt: now,
          message:
            "Public source metadata collected. Engagement metrics, visual analysis, active dates and creative-format annotations are unavailable until a supported source supplies them; no performance was invented.",
        });
    } catch (error) {
      const e = error as { status?: number; message?: string };
      res
        .status(e.status || 502)
        .json({
          error:
            error instanceof PublicError
              ? error.message
              : e.status === 409
                ? e.message
                : "Public collection failed; the previous dataset was preserved. The source may restrict embeds or be unreachable.",
        });
    }
  });
}
