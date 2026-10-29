import type { DatabaseSync } from "node:sqlite";
import type { Ad, Brand, Creator, Dashboard, Review } from "../shared/types.js";
import { analyzeRecords } from "../shared/analytics.js";
import { readJson } from "./db.js";
import { hydrateAd } from "../shared/ad-records.js";
export { reportContent } from "../shared/analytics.js";

export function getAds(
  db: DatabaseSync,
  brand: Brand,
  platform = "all",
  range = 30,
): Ad[] {
  const since = new Date(Date.now() - range * 86400000).toISOString();
  const rows = db.prepare(
    `SELECT data FROM ads WHERE brand_id=? AND ((?='demo' AND source='sample') OR (?!='demo' AND source!='sample')) AND published_at>=? ${platform !== "all" ? "AND platform=?" : ""} ORDER BY published_at DESC`,
  );
  return readJson<Ad>(
    platform === "all"
      ? rows.all(brand.id, brand.mode, brand.mode, since)
      : rows.all(brand.id, brand.mode, brand.mode, since, platform),
  ).map(hydrateAd);
}
export function getCreators(db: DatabaseSync, brand: Brand): Creator[] {
  // There are no imported creator profiles yet. Never mix sample matches into live/imported workspaces.
  return brand.mode === "demo"
    ? readJson<Creator>(db.prepare("SELECT data FROM creators").all()).filter(
        (c) => c.category === brand.category,
      )
    : [];
}
export function dashboard(
  db: DatabaseSync,
  brand: Brand,
  platform = "all",
  range = 30,
  contentSource = "all",
): Dashboard {
  const ads = getAds(db, brand, platform, range).filter(
    (ad) =>
      contentSource === "all" || (ad.contentSource || "paid") === contentSource,
  );
  const creators = getCreators(db, brand);
  const reviews =
    brand.mode === "demo"
      ? readJson<Review>(
          db.prepare("SELECT data FROM reviews WHERE brand_id=?").all(brand.id),
        )
      : [];
  return analyzeRecords(brand, ads, creators, reviews, range);
}
