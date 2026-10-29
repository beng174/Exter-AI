import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Ad, Brand, Creator, Report } from "../shared/types.js";
import { openDatabase, readBrand, readJson } from "./db.js";
import { CATEGORIES, PLATFORM_NAMES } from "./seed.js";
import { dashboard, getAds, getCreators, reportContent } from "./analysis.js";

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
    !PLATFORM_NAMES.includes(platform as (typeof PLATFORM_NAMES)[number])
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
  if (!PLATFORM_NAMES.includes(platform))
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
  return {
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
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", service: "exter-ai", liveFeeds: false }),
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
    res.json(dashboard(db, brand, platform, range));
  });
  app.get("/api/ads", (req, res) => {
    const brand = getBrand(db, req.query.brandId),
      { platform, range } = queryFilters(req.query);
    let ads = getAds(db, brand, platform, range);
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
      content: reportContent(dashboard(db, brand)),
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
    const context = `${brand.mode === "demo" ? "Sample-data answer" : "Imported-data answer"} · ${range} days · ${platform === "all" ? "all platforms" : platform}. `;
    let answer: string;
    if (!data.metrics.ads)
      answer =
        "This workspace has no ad records for the selected period. Import authorised campaign data to analyse angles and audiences. No live competitor discovery is connected.";
    else if (/convert|conversion|roas|sales|purchase/i.test(question))
      answer = `Competitor conversions are not available and cannot be inferred from engagement. ${data.metrics.conversions === null ? "No owned conversion records are available." : `Your owned records contain ${data.metrics.conversions} conversions${data.metrics.spend === null ? "" : ` against ${data.metrics.spend.toFixed(2)} in reported spend (currency not supplied)`}.`} The leading engagement angle is ${data.angles[0]?.name}; validate it with your own conversion tests.`;
    else if (/creator|influencer|match/i.test(question))
      answer = data.creators.length
        ? `${data.creators[0].name} (${data.creators[0].handle}) is the highest sample category-and-tone match at ${data.creators[0].match}%. ${data.creators[0].reason}`
        : "No verified creator profiles are connected. Creator matching requires audience and brand-voice evidence; ad records alone are not enough.";
    else if (/review|sentiment|voice|customer/i.test(question))
      answer = data.reviews.length
        ? `The ${data.reviews.length} fictional sample reviews discuss ${[...new Set(data.reviews.map((r) => r.theme))].join(", ")}. ${brand.name}'s sample voice is ${brand.voice.join(", ").toLowerCase()}. These are illustrative, not collected customer opinions.`
        : "No customer reviews or verified brand-voice analysis are connected to this workspace. Importing ads does not provide review sentiment.";
    else if (/competitor|brand|share/i.test(question))
      answer = `Observed ad volume: ${data.competitors.map((c) => `${c.name} ${c.ads} ads (${c.share.toFixed(1)}%)`).join("; ")}. This is share of the available records, not market share. Public conversion data is unavailable.`;
    else
      answer = `${data.angles[0]?.name} has the highest weighted engagement rate at ${data.angles[0]?.engagementRate.toFixed(2)}% across ${data.angles[0]?.ads} ads. The dataset contains ${data.metrics.ads} ads, ${data.metrics.impressions.toLocaleString("en-GB")} impressions and ${data.metrics.engagements.toLocaleString("en-GB")} engagements. This is an engagement finding, not evidence of conversion lift.`;
    res.json({
      answer: context + answer,
      sources: data.ads.slice(0, 3).map((a) => a.id),
      mode: "rule-based",
    });
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
