import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { openDatabase, readJson } from "../server/db.js";
import type { Ad, Brand } from "../shared/types.js";
import { readBrandResearch, saveBrandResearch } from "../server/brand-research.js";
import { withMetaLibraryEvidence } from "../shared/public-library-research.js";
import {
  buildMetaLibrarySnapshot,
  normalizeMetaLibraryCapture,
  VALENTTE_META_PAGE_ID,
} from "../shared/meta-library.js";

const args = process.argv.slice(2);
const inputs: string[] = [];
let database = process.env.EXTER_DB_PATH || ".data/exter.db";
let output = "shared/cases/valentte-ads.json";
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--dry-run") dryRun = true;
  else if (["--input", "--db", "--output"].includes(arg)) {
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a path.`);
    if (arg === "--input") inputs.push(value);
    else if (arg === "--db") database = value;
    else output = value;
  } else throw new Error(`Unknown option: ${arg}`);
}
if (!inputs.length) throw new Error("Usage: node --import tsx scripts/import-meta-library.ts --input capture.json [--input another.json] [--dry-run] [--db path] [--output path]");
const captures = await Promise.all(inputs.map(async (path) => JSON.parse(await readFile(path, "utf8")) as unknown));
// Dry-run must not create files or modify the working database.
const db = dryRun ? null : openDatabase(database, false);
try {
  const existingBrands = db
    ? readJson<Brand>(db.prepare("SELECT data FROM brands").all()) : [];
  const brand: Brand = existingBrands.find((value) =>
    value.name.toLowerCase() === "valentte" &&
    value.domain.toLowerCase().replace(/^www\./, "") === "valentte.com") || {
      id: dryRun ? "valentte-dry-run" : randomUUID(),
      name: "Valentte",
      domain: "valentte.com",
      category: "Home fragrance & gifting",
      color: "#756d54",
      initials: "V",
      voice: [],
      competitors: [],
      mode: "imported",
      createdAt: new Date().toISOString(),
    };
  const existing = db ? readJson<Ad>(db.prepare(
    "SELECT data FROM ads WHERE brand_id=? AND source='public' AND platform='Meta'",
  ).all(brand.id)).filter((ad) => ad.advertiserPageId === VALENTTE_META_PAGE_ID) : [];
  const imports = captures.map((capture) => normalizeMetaLibraryCapture(capture, brand));
  const snapshot = buildMetaLibrarySnapshot(brand, imports, existing);
  if (db) {
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO brands (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data")
        .run(brand.id, JSON.stringify({ ...brand, mode: "imported" }));
      const upsert = db.prepare("INSERT INTO ads (id,brand_id,source,platform,published_at,data) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET published_at=excluded.published_at,data=excluded.data");
      for (const ad of snapshot.ads)
        upsert.run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(snapshot, null, 2) + "\n");
    const profile = readBrandResearch(db, brand.id);
    if (profile) {
      const research = withMetaLibraryEvidence(profile, snapshot);
      saveBrandResearch(db, research);
      // The published case is a dated snapshot; never relabel it as a live feed.
      if (output === "shared/cases/valentte-ads.json")
        await writeFile("shared/cases/valentte.json", JSON.stringify({ brand, research }, null, 2) + "\n");
    }
  }
  console.log(JSON.stringify({
    dryRun, brandId: brand.id, advertiserPageId: VALENTTE_META_PAGE_ID,
    ...snapshot.coverage, observedAt: snapshot.observedAt,
    sources: snapshot.sources, metricCaveat: snapshot.metricCaveat,
    ...(dryRun ? {} : { output }),
  }, null, 2));
} finally {
  db?.close();
}
