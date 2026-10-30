import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { openDatabase, readJson } from "../server/db.js";
import type { Ad, Brand } from "../shared/types.js";
import type { BrandResearch } from "../shared/brand-research.js";
import type { MetaLibrarySnapshot } from "../shared/meta-library.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--db" || !args[1])
  throw new Error("Usage: node --import tsx scripts/prepare-claude-db.ts --db path");
const path = resolve(args[1]);
const matches = (brand: Brand) => brand.name.toLowerCase() === "valentte" &&
  brand.domain.toLowerCase().replace(/^www\./, "") === "valentte.com";

async function prepare() {
// Read-only inspection avoids altering an existing Valentte workspace at all.
if (existsSync(path)) {
  const existing = new DatabaseSync(path, { readOnly: true });
  try {
    const table = existing.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='brands'").get();
    if (!table) throw new Error("The selected existing database is not an Exter database; it was not changed.");
    const brands = readJson<Brand>(existing.prepare("SELECT data FROM brands").all());
    if (brands.some(matches)) {
      console.log(JSON.stringify({ status: "existing_workspace_preserved", brand: "Valentte" }));
      return;
    }
  } finally { existing.close(); }
}
const saved = JSON.parse(await readFile(resolve(root, "shared/cases/valentte.json"), "utf8")) as { brand: Brand; research: BrandResearch };
const library = JSON.parse(await readFile(resolve(root, "shared/cases/valentte-ads.json"), "utf8")) as MetaLibrarySnapshot;
const evidence = saved.research.adLibraryEvidence;
const nativeIds = evidence?.records.map((ad) => ad.providerAdId).sort();
if (!matches(saved.brand) || !Array.isArray(library.ads) || !library.ads.length || library.ads.length > 10000 ||
    !evidence || evidence.advertiserPageId !== "172851066181411" ||
    evidence.capturedAt !== library.observedAt ||
    JSON.stringify(nativeIds) !== JSON.stringify(library.ads.map((ad) => ad.providerAdId).sort()) ||
    library.ads.some((ad) => ad.source !== "public" || ad.advertiserPageId !== "172851066181411" ||
      ad.metricsAvailable !== false || !ad.providerAdId || !/^\d{5,30}$/.test(ad.providerAdId) ||
      ad.sourceUrl !== `https://www.facebook.com/ads/library/?id=${ad.providerAdId}` ||
      !ad.observedAt || !Number.isFinite(Date.parse(ad.observedAt)) ||
      ad.publishedAt !== (ad.deliveryStartAt || ad.observedAt)))
  throw new Error("The saved Valentte case did not pass provenance checks; no case was imported.");
const db = openDatabase(path, false);
try {
  const collision = db.prepare("SELECT id FROM brands WHERE id=?").get(saved.brand.id);
  const brand: Brand = { ...saved.brand, id: collision ? randomUUID() : saved.brand.id, mode: "imported" };
  const rebind = (ad: Ad): Ad => ({ ...ad, brandId: brand.id, id: `meta-library:${brand.id}:${ad.providerAdId}` });
  const ads = library.ads.map(rebind);
  const research: BrandResearch = { ...saved.research, brandId: brand.id };
  if (research.adLibraryEvidence)
    research.adLibraryEvidence = { ...research.adLibraryEvidence, records: research.adLibraryEvidence.records.map(rebind) };
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO brands (id,data) VALUES (?,?)").run(brand.id, JSON.stringify(brand));
    const insert = db.prepare("INSERT INTO ads (id,brand_id,source,platform,published_at,data) VALUES (?,?,?,?,?,?)");
    for (const ad of ads) insert.run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
    db.exec("CREATE TABLE IF NOT EXISTS brand_research (brand_id TEXT PRIMARY KEY REFERENCES brands(id),data TEXT NOT NULL)");
    db.prepare("INSERT INTO brand_research (brand_id,data) VALUES (?,?)").run(brand.id, JSON.stringify(research));
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ status: "saved_case_added", brand: brand.name, ads: ads.length, snapshotAt: library.observedAt }));
} finally { db.close(); }
}
await prepare();
