import type { DatabaseSync } from "node:sqlite";
import type { Brand } from "../../shared/types.js";

/** The two explicitly requested brands, without sample ads, metrics or analyses. */
export function ensureRequestedDemoWorkspaces(db: DatabaseSync) {
  const brands = (db.prepare("SELECT data FROM brands").all() as { data: string }[]).map(row => JSON.parse(row.data) as Brand);
  for (const identity of [{ id: "ion8", name: "ION8", domain: "ion8.co.uk", category: "Wellness" as const }, { id: "valentte", name: "Valentte", domain: "valentte.com", category: "Home fragrance & gifting" as const }]) {
    if (brands.some(brand => brand.domain.toLowerCase().replace(/^www\./, "") === identity.domain && brand.mode === "imported")) continue;
    if (brands.some(brand => brand.id === identity.id)) continue;
    const brand: Brand = { ...identity, color: "#0C1F96", initials: identity.id === "ion8" ? "I8" : "V", voice: [], competitors: [], mode: "imported", createdAt: new Date().toISOString() };
    db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  }
  const ion8 = (db.prepare("SELECT data FROM brands").all() as { data: string }[]).map(row => JSON.parse(row.data) as Brand).find(brand => brand.domain.toLowerCase().replace(/^www\./, "") === "ion8.co.uk" && brand.mode === "imported");
  if (!ion8) return;
  db.exec("CREATE TABLE IF NOT EXISTS brand_demo_website (brand_id TEXT PRIMARY KEY REFERENCES brands(id),data TEXT NOT NULL)");
  if (db.prepare("SELECT 1 FROM brand_demo_website WHERE brand_id=?").get(ion8.id)) return;
  // Observed from the publisher's homepage through ordinary verified HTTPS.
  const fetchedAt = "2026-11-02T01:03:15.532Z";
  db.prepare("INSERT INTO brand_demo_website VALUES (?,?)").run(ion8.id, JSON.stringify({ status: "available", url: "https://www.ion8.co.uk/", fetchedAt, title: "ION8", excerpts: ["Totally leakproof", "Open with one touch", "Built to move", "Sustainable Materials"].map(quote => ({ kind: "website", sourceUrl: "https://www.ion8.co.uk/", quote, field: "homepage heading", observedAt: fetchedAt })), limitations: ["Bounded publisher homepage headings observed on 2 November 2026. These are advertiser statements, not independently verified product facts.", "No Ion8 ad collection, creative analysis, audience metrics or performance figures are supplied by this website evidence."] }));
}
