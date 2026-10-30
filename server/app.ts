import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Ad, Brand, Creator, Report } from "../shared/types.js";
import { openDatabase, readBrand, readJson } from "./db.js";
import { CATEGORIES, PLATFORM_NAMES, CONTENT_PLATFORMS } from "./seed.js";
import { dashboard, getAds, getCreators, reportContent } from "./analysis.js";

import {
  analyzeFormats,
  formatReportSummary,
  normalizeCreativeFormats,
  classifyCreativeFormats,
} from "../shared/formats.js";
import { normalizeAdAnalysis } from "../shared/ad-intelligence.js";
import { answerBrandResearchQuestion } from "../shared/brand-research-answer.js";
import { answerResearchQuestion } from "../shared/research.js";
import { hydrateAd, coalesceObservations } from "../shared/ad-records.js";
import { attachConnections, getConnectionStatuses } from "./connections.js";
import { attachBrain } from "./brain.js";
import { attachBrandResearch, readBrandResearch } from "./brand-research.js";
import { attachPublicMonitor } from "./public-monitor.js";
import type { FormatMetric } from "../shared/format-types.js";

function formatMetric(value: unknown): FormatMetric {
  const metric = value ?? "engagement";
  if (!["engagement", "cpa", "conversionRate"].includes(String(metric)))
    throw new InputError("metric must be engagement, cpa or conversionRate.");
  return metric as FormatMetric;
}
function questionPlatform(question: string, fallback: string) {
  const named = [
    /\b(meta|facebook|instagram)\b/i.test(question) ? "Meta" : null,
    /\btik\s*tok\b/i.test(question) ? "TikTok" : null,
    /\b(google|youtube)\b/i.test(question) ? "Google" : null,
  ].filter(Boolean);
  return named.length === 1 ? named[0]! : named.length > 1 ? "all" : fallback;
}
function sourceContext(db: DatabaseSync, brandId: string, platform = "all") {
  const sources = getConnectionStatuses(db, brandId).filter(
    (source) => platform === "all" || source.platform === platform,
  );
  return {
    connected: sources.some((source) => source.status === "synced"),
    lastSuccessfulSyncAt:
      sources
        .map((source) => source.lastSuccessfulSyncAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
  };
}
class InputError extends Error {
  status = 400;
}
function text(
  value: unknown,
  label: string,
  max = 200,
  optional = false,
): string {
  if (optional && (value === undefined || value === null || value === ""))
    return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new InputError(
      `${label} must be a non-empty string of at most ${max} characters.`,
    );
  return value.trim();
}
function nonnegative(
  value: unknown,
  label: string,
  nullable = false,
): number | null {
  if (nullable && (value === undefined || value === null || value === ""))
    return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  )
    throw new InputError(`${label} must be a finite, non-negative number.`);
  return value;
}
function getBrand(db: DatabaseSync, id: unknown): Brand {
  const brand = readBrand(db, text(id, "brandId", 120));
  if (!brand) {
    const error = new InputError("Brand not found.");
    error.status = 404;
    throw error;
  }
  return brand;
}
function queryFilters(query: Record<string, unknown>) {
  const platform =
    query.platform === undefined ? "all" : String(query.platform);
  if (
    platform !== "all" &&
    !CONTENT_PLATFORMS.includes(platform as (typeof CONTENT_PLATFORMS)[number])
  )
    throw new InputError("platform must be all, Meta, TikTok or Google.");
  const range = Number(query.range ?? 30);
  if (![7, 30, 90].includes(range))
    throw new InputError("range must be 7, 30 or 90 days.");
  return { platform, range };
}
function parseImportRow(row: unknown, brand: Brand): Ad {
  if (!row || typeof row !== "object" || Array.isArray(row))
    throw new InputError("Each ad must be an object.");
  const r = row as Record<string, unknown>;
  const advertiser = text(r.brand, "brand", 80);
  const platform = text(r.platform, "platform") as Ad["platform"];
  if (!CONTENT_PLATFORMS.includes(platform))
    throw new InputError("Imported platform must be Meta, TikTok or Google.");
  if (r.owned !== undefined && typeof r.owned !== "boolean")
    throw new InputError("owned must be a boolean.");
  const owned = r.owned === true;
  if (owned && advertiser.toLowerCase() !== brand.name.toLowerCase())
    throw new InputError("Owned metrics must use the workspace brand name.");
  const conversions = nonnegative(r.conversions, "conversions", true);
  const spend = nonnegative(r.spend, "spend", true);
  const revenue = nonnegative(r.revenue, "revenue", true);
  if (!owned && (conversions !== null || spend !== null || revenue !== null))
    throw new InputError(
      "Competitor spend, revenue and conversions are not accepted. Only import these metrics for owned ads.",
    );
  const publishedAt = text(r.publishedAt, "publishedAt", 40);
  const parsedDate = new Date(publishedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(publishedAt) ||
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.getTime() > Date.now() + 300000 ||
    parsedDate.getUTCFullYear() < 2000 ||
    parsedDate.toISOString().slice(0, 10) !== publishedAt.slice(0, 10)
  )
    throw new InputError(
      "publishedAt must be a valid ISO date between 2000 and now.",
    );
  const impressions = nonnegative(r.impressions, "impressions")!;
  const engagements = nonnegative(r.engagements, "engagements")!;
  const sourceUrl = text(r.sourceUrl, "sourceUrl", 2000, true);
  if (sourceUrl) {
    let url: URL;
    try {
      url = new URL(sourceUrl);
    } catch {
      throw new InputError("sourceUrl must be an HTTP or HTTPS URL.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new InputError(
        "sourceUrl must be an HTTP or HTTPS URL without credentials.",
      );
  }
  let creativeFormats: string[];
  let analysis: Ad["analysis"];
  try {
    creativeFormats = normalizeCreativeFormats(r.creativeFormats);
    analysis = normalizeAdAnalysis(r.analysis);
  } catch (error) {
    throw new InputError((error as Error).message);
  }
  const currency = text(r.currency, "currency", 3, true).toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency))
    throw new InputError("currency must be an ISO three-letter code.");
  return {
    creativeFormats,
    analysis,
    contentSource: r.contentSource === "organic" ? "organic" : "paid",
    metricsAvailable: r.metricsAvailable !== false,
    engagementRateBasis: ["views", "followers", "unavailable"].includes(
      String(r.engagementRateBasis),
    )
      ? (r.engagementRateBasis as Ad["engagementRateBasis"])
      : "impressions",
    views: r.views === undefined ? undefined : nonnegative(r.views, "views")!,
    followers:
      r.followers === undefined
        ? undefined
        : nonnegative(r.followers, "followers")!,
    currency: currency || undefined,
    conversionEvent:
      text(r.conversionEvent, "conversionEvent", 120, true) || undefined,
    id: `import-${randomUUID()}`,
    brandId: brand.id,
    brand: advertiser,
    platform,
    category: brand.category,
    title: text(r.title, "title", 200),
    copy: text(r.copy, "copy", 4000, true),
    angle: text(r.angle, "angle", 100),
    audience: text(r.audience, "audience", 200),
    format: text(r.format, "format", 50, true) || "Imported ad",
    image: "",
    color: brand.color,
    active: true,
    publishedAt: parsedDate.toISOString(),
    impressions,
    engagements,
    spend,
    conversions,
    revenue,
    owned,
    source: "import",
    sourceUrl: sourceUrl || null,
  };
}
export function createApp(db: DatabaseSync = openDatabase()) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20mb" }));
  attachConnections(app, db);
  attachPublicMonitor(app, db);
  attachBrain(app, db);
  attachBrandResearch(app, db);
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      service: "exter-ai",
      liveFeeds: false,
      liveConnectorsImplemented: true,
      connectionStatusEndpoint: "/api/connections?brandId=YOUR_WORKSPACE",
    }),
  );
  app.get("/api/brands", (_req, res) =>
    res.json(
      readJson<Brand>(
        db.prepare("SELECT data FROM brands ORDER BY rowid").all(),
      ),
    ),
  );
  app.post("/api/brands", (req, res) => {
    const name = text(req.body?.name, "name", 80);
    const existing = readJson<Brand>(
      db.prepare("SELECT data FROM brands").all(),
    ).find((b) => b.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      res.json(existing);
      return;
    }
    const category = req.body?.category;
    if (!CATEGORIES.includes(category))
      throw new InputError("Choose a supported brand category.");
    let domain = text(req.body?.domain, "domain", 240, true);
    if (domain) {
      try {
        const url = new URL(
          domain.includes("://") ? domain : `https://${domain}`,
        );
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          !url.hostname.includes(".")
        )
          throw new Error();
        domain = url.hostname;
      } catch {
        throw new InputError("Enter a valid website domain.");
      }
    }
    const brand: Brand = {
      id: randomUUID(),
      name,
      domain,
      category,
      color: "#8fae95",
      initials: name.slice(0, 1).toUpperCase(),
      voice: [],
      competitors: [],
      mode: "imported",
      createdAt: new Date().toISOString(),
    };
    db.prepare("INSERT INTO brands VALUES (?, ?)").run(
      brand.id,
      JSON.stringify(brand),
    );
    res.status(201).json(brand);
  });
  app.get("/api/dashboard", (req, res) => {
    const brand = getBrand(db, req.query.brandId);
    const { platform, range } = queryFilters(req.query);
    res.json({
      ...dashboard(
        db,
        brand,
        platform,
        range,
        String(req.query.contentSource || "all"),
      ),
      sourceStatus: sourceContext(db, brand.id, platform),
    });
  });
  app.get("/api/formats", (req, res) => {
    const brand = getBrand(db, req.query.brandId);
    const { platform, range } = queryFilters(req.query);
    res.json(
      analyzeFormats(brand, getAds(db, brand, "all", range), {
        platform,
        range,
        metric: formatMetric(req.query.metric),
        contentSource: String(req.query.contentSource || "all"),
        sourceStatus: sourceContext(db, brand.id, platform),
      }),
    );
  });
  app.get("/api/ads/:id", (req, res) => {
    const brand = getBrand(db, req.query.brandId);
    const row = db
      .prepare("SELECT data FROM ads WHERE id=? AND brand_id=?")
      .get(req.params.id, brand.id) as { data: string } | undefined;
    if (!row) {
      res.status(404).json({ error: "Ad not found in this workspace." });
      return;
    }
    const ad = hydrateAd(JSON.parse(row.data));
    if ((brand.mode === "demo") !== (ad.source === "sample")) {
      res
        .status(404)
        .json({ error: "Ad is not part of the active workspace dataset." });
      return;
    }
    res.json(ad);
  });
  app.get("/api/ads", (req, res) => {
    const brand = getBrand(db, req.query.brandId),
      { platform, range } = queryFilters(req.query);
    let ads = coalesceObservations(getAds(db, brand, platform, range));
    if (req.query.contentSource && req.query.contentSource !== "all")
      ads = ads.filter(
        (ad) => (ad.contentSource || "paid") === req.query.contentSource,
      );
    if (req.query.creativeFormat && req.query.creativeFormat !== "all")
      ads = ads.filter((ad) =>
        classifyCreativeFormats(ad).includes(String(req.query.creativeFormat)),
      );
    const search = String(req.query.search || "")
      .toLowerCase()
      .slice(0, 200);
    if (search)
      ads = ads.filter((a) =>
        [a.title, a.brand, a.copy, a.angle, a.audience].some((s) =>
          s.toLowerCase().includes(search),
        ),
      );
    const angle = String(req.query.angle || "all");
    if (angle !== "all") ads = ads.filter((a) => a.angle === angle);
    const page = Math.max(1, Number(req.query.page || 1));
    if (!Number.isSafeInteger(page))
      throw new InputError("page must be a positive integer.");
    res.json({
      items: ads.slice((page - 1) * 12, page * 12),
      total: ads.length,
      page,
      pages: Math.ceil(ads.length / 12),
    });
  });
  app.get("/api/creators", (req, res) =>
    res.json(getCreators(db, getBrand(db, req.query.brandId))),
  );
  app.get("/api/shortlist", (req, res) => {
    const brand = getBrand(db, req.query.brandId);
    res.json({
      ids: db
        .prepare("SELECT creator_id FROM shortlist WHERE brand_id=?")
        .all(brand.id)
        .map((row) => row.creator_id),
    });
  });
  app.post("/api/shortlist", (req, res) => {
    const brand = getBrand(db, req.body?.brandId);
    const id = text(req.body?.creatorId, "creatorId", 120);
    if (!getCreators(db, brand).some((c) => c.id === id))
      throw new InputError("Creator is not available in this workspace.");
    if (
      db
        .prepare("SELECT 1 FROM shortlist WHERE brand_id=? AND creator_id=?")
        .get(brand.id, id)
    )
      db.prepare("DELETE FROM shortlist WHERE brand_id=? AND creator_id=?").run(
        brand.id,
        id,
      );
    else db.prepare("INSERT INTO shortlist VALUES (?, ?)").run(brand.id, id);
    res.json({
      ids: db
        .prepare("SELECT creator_id FROM shortlist WHERE brand_id=?")
        .all(brand.id)
        .map((row) => row.creator_id),
    });
  });
  app.post("/api/import", (req, res) => {
    const brand = getBrand(db, req.body?.brandId);
    if (
      !Array.isArray(req.body?.ads) ||
      req.body.ads.length === 0 ||
      req.body.ads.length > 10000
    )
      throw new InputError("ads must contain between 1 and 10,000 records.");
    const ads: Ad[] = req.body.ads.map((row: unknown) =>
      parseImportRow(row, brand),
    );
    const knownNames = [
      ...new Set([
        ...getAds(db, { ...brand, mode: "imported" }, "all", 90).map(
          (a) => a.brand,
        ),
        ...ads.map((a) => a.brand),
      ]),
    ];
    const nextBrand = {
      ...brand,
      mode: "imported",
      competitors: knownNames.filter(
        (n) => n.toLowerCase() !== brand.name.toLowerCase(),
      ),
    };
    db.exec("BEGIN");
    try {
      const insert = db.prepare("INSERT INTO ads VALUES (?, ?, ?, ?, ?, ?)");
      for (const ad of ads)
        insert.run(
          ad.id,
          ad.brandId,
          ad.source,
          ad.platform,
          ad.publishedAt,
          JSON.stringify(ad),
        );
      db.prepare("UPDATE brands SET data=? WHERE id=?").run(
        JSON.stringify(nextBrand),
        brand.id,
      );
      db.prepare("DELETE FROM shortlist WHERE brand_id=?").run(brand.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.status(201).json({ imported: ads.length });
  });
  app.get("/api/reports", (req, res) => {
    const brand = getBrand(db, req.query.brandId);
    res.json(
      readJson<Report>(
        db
          .prepare(
            "SELECT data FROM reports WHERE brand_id=? ORDER BY created_at DESC",
          )
          .all(brand.id),
      ),
    );
  });
  app.post("/api/reports", (req, res) => {
    const brand = getBrand(db, req.body?.brandId);
    const report: Report = {
      id: randomUUID(),
      brandId: brand.id,
      title: `${brand.name} · Intelligence brief`,
      createdAt: new Date().toISOString(),
      content:
        reportContent(dashboard(db, brand)) +
        formatReportSummary(
          analyzeFormats(brand, getAds(db, brand, "all", 30), { range: 30 }),
        ),
      mode: brand.mode,
    };
    db.prepare("INSERT INTO reports VALUES (?, ?, ?, ?)").run(
      report.id,
      brand.id,
      report.createdAt,
      JSON.stringify(report),
    );
    res.status(201).json(report);
  });
  app.get("/api/reports/:id/download", (req, res) => {
    const row = db
      .prepare("SELECT data FROM reports WHERE id=?")
      .get(req.params.id) as { data: string } | undefined;
    if (!row) {
      res.status(404).json({ error: "Report not found." });
      return;
    }
    const report: Report = JSON.parse(row.data);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="exter-brief-${report.id}.md"`,
    );
    res.type("text/markdown").send(report.content);
  });
  app.post("/api/ask", (req, res) => {
    const brand = getBrand(db, req.body?.brandId);
    const question = text(req.body?.question, "question", 2000);
    const { platform, range } = queryFilters({
      platform: req.body?.platform,
      range: req.body?.range,
    });
    const data = dashboard(db, brand, platform, range);
    const profile = readBrandResearch(db, brand.id);
    if (!data.metrics.engagementRateAvailable && profile) {
      const answer = answerBrandResearchQuestion(question, profile);
      if (answer) {
        res.json(answer);
        return;
      }
    }
    res.json(
      answerResearchQuestion({
        question,
        brand,
        ads: getAds(db, brand, "all", 90),
        dashboard: data,
        platform,
        range,
        metric:
          req.body?.metric === undefined
            ? undefined
            : formatMetric(req.body.metric),
        sourceStatus: sourceContext(
          db,
          brand.id,
          questionPlatform(question, platform),
        ),
      }),
    );
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const e = error as { status?: number; type?: string; message?: string };
      if (error instanceof InputError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (e.type === "entity.parse.failed") {
        res.status(400).json({ error: "Invalid JSON request body." });
        return;
      }
      if (e.type === "entity.too.large") {
        res.status(413).json({ error: "Request exceeds the 20 MB limit." });
        return;
      }
      console.error("API error:", error);
      res.status(500).json({ error: "Unexpected server error." });
    },
  );
  return app;
}
