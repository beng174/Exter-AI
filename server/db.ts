import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { seedData } from "./seed.js";
import type { Brand } from "../shared/types.js";

export function openDatabase(
  path = process.env.EXTER_DB_PATH || ".data/exter.db",
  seed = true,
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS brands (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ads (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id), source TEXT NOT NULL, platform TEXT NOT NULL, published_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ads_workspace ON ads(brand_id, source, platform, published_at);
    CREATE TABLE IF NOT EXISTS creators (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id), created_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shortlist (brand_id TEXT NOT NULL REFERENCES brands(id), creator_id TEXT NOT NULL REFERENCES creators(id), PRIMARY KEY(brand_id, creator_id));
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  if (
    seed &&
    !db.prepare("SELECT value FROM metadata WHERE key='seeded'").get()
  ) {
    const samples = seedData();
    db.exec("BEGIN");
    try {
      const insertBrand = db.prepare("INSERT INTO brands VALUES (?, ?)");
      const insertAd = db.prepare("INSERT INTO ads VALUES (?, ?, ?, ?, ?, ?)");
      const insertCreator = db.prepare("INSERT INTO creators VALUES (?, ?)");
      const insertReview = db.prepare("INSERT INTO reviews VALUES (?, ?, ?)");
      for (const b of samples.brands) insertBrand.run(b.id, JSON.stringify(b));
      for (const ad of samples.ads)
        insertAd.run(
          ad.id,
          ad.brandId,
          ad.source,
          ad.platform,
          ad.publishedAt,
          JSON.stringify(ad),
        );
      for (const c of samples.creators)
        insertCreator.run(c.id, JSON.stringify(c));
      for (const r of samples.reviews)
        insertReview.run(r.id, r.brandId, JSON.stringify(r));
      db.prepare("INSERT INTO metadata VALUES (?, ?)").run(
        "seeded",
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  return db;
}
export function readBrand(db: DatabaseSync, id: string): Brand | undefined {
  const row = db.prepare("SELECT data FROM brands WHERE id=?").get(id) as
    | { data: string }
    | undefined;
  return row ? JSON.parse(row.data) : undefined;
}
export function readJson<T>(rows: unknown[]): T[] {
  return rows.map((row) => JSON.parse((row as { data: string }).data));
}
