import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { readBrand } from "./db.js";
import { syncGoogle, syncMeta, syncTikTok } from "./connectors/providers.js";
import { assertProxySupport } from "./connectors/http.js";
import {
  ConnectorError,
  providerConfig,
  requirements,
  sinceDate,
  type ConnectorEnv,
  type ConnectorOptions,
  type Provider,
} from "./connectors/types.js";

const providers: Provider[] = ["Meta", "TikTok", "Google"];
interface ConnectionRow {
  platform: Provider;
  account_id: string;
  brand_id: string;
  status: string;
  last_successful_sync_at: string | null;
  latest_metric_date: string | null;
  last_error: string | null;
  records: number;
}
export interface ConnectionStatus {
  platform: Provider;
  status:
    | "not_configured"
    | "ready"
    | "synced"
    | "error"
    | "syncing"
    | "blocked";
  missing: string[];
  lastSuccessfulSyncAt: string | null;
  latestMetricDate: string | null;
  lastError: string | null;
  records: number;
  scope: "owned_account";
  refreshMode: "manual" | "polling";
  connected: boolean;
  pollIntervalSeconds: number | null;
  metricDefinition: string;
  creativeClassification: string;
}
const inFlight = new WeakMap<DatabaseSync, Set<string>>();
export function ensureConnectionSchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS live_connections (
    platform TEXT NOT NULL, account_id TEXT NOT NULL, brand_id TEXT NOT NULL,
    status TEXT NOT NULL, last_successful_sync_at TEXT, latest_metric_date TEXT,
    last_error TEXT, records INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(platform, account_id)
  )`);
}
function hasTable(db: DatabaseSync) {
  return Boolean(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='live_connections'",
      )
      .get(),
  );
}
function interval(env: ConnectorEnv): number | null {
  const value = Number(env.EXTER_SYNC_INTERVAL_SECONDS || 300);
  return Number.isInteger(value) && value >= 60 && value <= 3600 ? value : null;
}
function rowFor(
  db: DatabaseSync,
  platform: Provider,
  accountId: string,
): ConnectionRow | undefined {
  return hasTable(db)
    ? (db
        .prepare(
          "SELECT * FROM live_connections WHERE platform=? AND account_id=?",
        )
        .get(platform, accountId) as ConnectionRow | undefined)
    : undefined;
}
function provider(value: unknown): Provider {
  const match = providers.find(
    (p) => p.toLowerCase() === String(value).toLowerCase(),
  );
  if (!match) throw new ConnectorError("Choose Meta, TikTok or Google.", 400);
  return match;
}
export function getConnectionStatuses(
  db: DatabaseSync,
  brandId: string,
  env: ConnectorEnv = process.env,
): ConnectionStatus[] {
  const brand = readBrand(db, brandId);
  if (!brand) throw new ConnectorError("Brand not found.", 404);
  return providers.map((platform) => {
    const missing = requirements[platform].filter((name) => !env[name]?.trim());
    let config;
    let configurationError: string | null = null;
    if (!missing.length) {
      try {
        config = providerConfig(platform, env);
      } catch (error) {
        configurationError = (error as Error).message;
      }
    }
    const row = config ? rowFor(db, platform, config.accountId) : undefined;
    const elsewhere = Boolean(
      row?.last_successful_sync_at && row.brand_id !== brandId,
    );
    const own = row?.brand_id === brandId ? row : undefined;
    const running = config
      ? inFlight.get(db)?.has(`${platform}:${config.accountId}`)
      : false;
    const poll = interval(env);
    return {
      platform,
      status: missing.length
        ? "not_configured"
        : configurationError || elsewhere
          ? "blocked"
          : running
            ? "syncing"
            : own?.status === "error"
              ? "error"
              : own?.last_successful_sync_at
                ? "synced"
                : "ready",
      missing,
      lastSuccessfulSyncAt: own?.last_successful_sync_at || null,
      latestMetricDate: own?.latest_metric_date || null,
      lastError:
        configurationError ||
        (elsewhere
          ? "This advertising account is bound to another workspace. Use the correct workspace or a separate authorised account."
          : own?.last_error) ||
        null,
      records: own?.records || 0,
      scope: "owned_account",
      refreshMode: poll ? "polling" : "manual",
      pollIntervalSeconds: poll,
      connected: Boolean(own?.last_successful_sync_at),
      metricDefinition:
        platform === "Meta"
          ? "Inline post engagement / impressions; purchases use one reported purchase action type."
          : platform === "TikTok"
            ? "Likes + comments + shares / impressions; conversions use the advertiser’s configured event."
            : "Google Ads engagements / impressions; search campaigns often have no engagement measurement. Conversions use configured primary actions.",
      creativeClassification:
        "Creative styles such as UGC, influencer, review and before/after require verified annotations; connectors do not infer them from media type.",
    };
  });
}
export async function syncConnection(
  db: DatabaseSync,
  platform: Provider,
  brandId: string,
  options: ConnectorOptions = {},
) {
  const env = options.env || process.env,
    config = providerConfig(platform, env),
    brand = readBrand(db, brandId);
  if (!brand) throw new ConnectorError("Brand not found.", 404);
  assertProxySupport(Boolean(options.fetch), env);
  ensureConnectionSchema(db);
  const old = rowFor(db, platform, config.accountId);
  if (old?.last_successful_sync_at && old.brand_id !== brand.id)
    throw new ConnectorError(
      "This advertising account is already bound to another workspace. No data was reassigned.",
      409,
    );
  const running = inFlight.get(db) || new Set<string>();
  inFlight.set(db, running);
  const key = `${platform}:${config.accountId}`;
  if (running.has(key))
    throw new ConnectorError(
      "A sync for this advertising account is already running.",
      409,
    );
  running.add(key);
  try {
    const fetcher = options.fetch || globalThis.fetch,
      now = options.now || new Date();
    const synced = await {
      Meta: syncMeta,
      TikTok: syncTikTok,
      Google: syncGoogle,
    }[platform](brand, config, fetcher, now);
    const uniqueAds = new Set(synced.ads.map((ad) => ad.providerAdId)).size;
    db.exec("BEGIN");
    try {
      // Replace only this provider's live reporting window. Imports and old history are retained.
      db.prepare(
        "DELETE FROM ads WHERE brand_id=? AND source='live' AND platform=? AND published_at>=?",
      ).run(brand.id, platform, `${sinceDate(now)}T00:00:00.000Z`);
      const insert = db.prepare(
        "INSERT INTO ads (id,brand_id,source,platform,published_at,data) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET published_at=excluded.published_at,data=excluded.data",
      );
      for (const ad of synced.ads)
        insert.run(
          ad.id,
          brand.id,
          "live",
          platform,
          `${ad.metricDate}T00:00:00.000Z`,
          JSON.stringify(ad),
        );
      const next = { ...brand, mode: "imported" };
      db.prepare("UPDATE brands SET data=? WHERE id=?").run(
        JSON.stringify(next),
        brand.id,
      );
      db.prepare("DELETE FROM shortlist WHERE brand_id=?").run(brand.id);
      db.prepare(
        `INSERT INTO live_connections VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(platform,account_id) DO UPDATE SET brand_id=excluded.brand_id,status=excluded.status,last_successful_sync_at=excluded.last_successful_sync_at,latest_metric_date=excluded.latest_metric_date,last_error=excluded.last_error,records=excluded.records`,
      ).run(
        platform,
        config.accountId,
        brand.id,
        "synced",
        synced.observedAt,
        synced.latestMetricDate,
        null,
        synced.ads.length,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return {
      platform,
      records: synced.ads.length,
      uniqueAds,
      lastSuccessfulSyncAt: synced.observedAt,
      latestMetricDate: synced.latestMetricDate,
      scope: "owned_account",
      message:
        "Authorised account reporting synced. Provider reporting latency still applies; this is not a public competitor conversion feed.",
    };
  } catch (error) {
    const safe =
      error instanceof ConnectorError
        ? error
        : new ConnectorError(
            "Sync failed; previous successful reporting data was preserved.",
          );
    db.prepare(
      `INSERT INTO live_connections VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(platform,account_id) DO UPDATE SET status=excluded.status,last_error=excluded.last_error`,
    ).run(
      platform,
      config.accountId,
      brand.id,
      "error",
      null,
      null,
      safe.message,
      0,
    );
    throw safe;
  } finally {
    running.delete(key);
  }
}
export function attachConnections(
  app: Express,
  db: DatabaseSync,
  options: ConnectorOptions = {},
) {
  ensureConnectionSchema(db);
  app.get("/api/connections", (req, res) => {
    try {
      if (typeof req.query.brandId !== "string")
        throw new ConnectorError("brandId is required.", 400);
      res.json({
        connections: getConnectionStatuses(
          db,
          req.query.brandId,
          options.env || process.env,
        ),
      });
    } catch (error) {
      const e =
        error instanceof ConnectorError
          ? error
          : new ConnectorError("Connection status is unavailable.");
      res.status(e.status).json({ error: e.message });
    }
  });
  app.post("/api/connections/:platform/sync", async (req, res) => {
    try {
      if (typeof req.body?.brandId !== "string")
        throw new ConnectorError("brandId is required.", 400);
      res.json(
        await syncConnection(
          db,
          provider(req.params.platform),
          req.body.brandId,
          options,
        ),
      );
    } catch (error) {
      const e =
        error instanceof ConnectorError
          ? error
          : new ConnectorError("Sync failed; no source data was replaced.");
      res.status(e.status).json({ error: e.message });
    }
  });
}
export function startConnectionPolling(
  db: DatabaseSync,
  options: ConnectorOptions = {},
) {
  const env = options.env || process.env,
    seconds = interval(env);
  if (!seconds) return () => {};
  let ticking = false;
  const timer = setInterval(async () => {
    if (ticking || !hasTable(db)) return;
    ticking = true;
    try {
      const rows = db
        .prepare(
          "SELECT platform,brand_id FROM live_connections WHERE last_successful_sync_at IS NOT NULL",
        )
        .all() as { platform: Provider; brand_id: string }[];
      for (const row of rows) {
        try {
          await syncConnection(db, row.platform, row.brand_id, options);
        } catch {
          /* sanitized failure retained for UI/MCP; no raw credentials in logs */
        }
      }
    } finally {
      ticking = false;
    }
  }, seconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
