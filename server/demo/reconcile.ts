import type { DatabaseSync } from "node:sqlite";
import source from "../../shared/cases/valentte-ads.json";
import caseData from "../../shared/cases/valentte.json";
import type { Ad, Brand } from "../../shared/types.js";
import type { BrandResearch } from "../../shared/brand-research.js";
import type { VideoAnalysisResult } from "../../shared/video-analysis.js";
import type { ImageAnalysisResult } from "../../shared/image-analysis.js";
import { readBrandResearch, researchBrand, saveBrandResearch, type BrandResearchOptions } from "../brand-research.js";

export const VALENTTE_ADVERTISER_PAGE_ID = "172851066181411";
const RECONCILIATION_KEY = "valentte-demo-reconciliation-v1";
const RESEARCH_KEY = "valentte-demo-website-refresh-v1";
const nativeIdPattern = /^\d{5,30}$/;

function parse<T>(data: string): T | null { try { return JSON.parse(data) as T; } catch { return null; } }
function allBrands(db: DatabaseSync): Brand[] {
  return (db.prepare("SELECT data FROM brands ORDER BY rowid").all() as { data: string }[])
    .flatMap(row => { const brand = parse<Brand>(row.data); return brand && typeof brand.id === "string" ? [brand] : []; });
}
export function isValentteBrand(brand: Brand | undefined | null): brand is Brand {
  return !!brand && typeof brand.name === "string" && typeof brand.domain === "string" &&
    brand.name.trim().toLowerCase() === "valentte" && brand.domain.trim().toLowerCase().replace(/^www\./, "").replace(/\/$/, "") === "valentte.com";
}
function valentteAliases(db: DatabaseSync): Brand[] {
  return allBrands(db).filter(brand => isValentteBrand(brand) && brand.mode === "imported");
}
/** A stable existing UI identifier wins. Original alias records remain on disk. */
export function canonicalValentteBrand(db: DatabaseSync): Brand | undefined {
  const brands = valentteAliases(db);
  return brands.find(brand => brand.id === "valentte") || brands[0];
}
export function resolveDemoBrandId(db: DatabaseSync, brandId: string): string {
  const brand = allBrands(db).find(value => value.id === brandId), canonical = canonicalValentteBrand(db);
  if (canonical && ((!brand && brandId === "valentte") || isValentteBrand(brand))) return canonical.id;
  return brandId;
}
/** Only the duplicate Valentte identity is collapsed; unrelated workspaces are preserved. */
export function canonicalWorkspaceBrands(db: DatabaseSync): Brand[] {
  const brands = allBrands(db), canonical = canonicalValentteBrand(db);
  return canonical ? brands.filter(brand => !isValentteBrand(brand) || brand.id === canonical.id) : brands;
}
export function workspaceBrandIds(db: DatabaseSync, brandId: string): string[] {
  const resolved = resolveDemoBrandId(db, brandId), canonical = canonicalValentteBrand(db);
  return canonical && resolved === canonical.id ? [canonical.id, ...valentteAliases(db).filter(brand => brand.id !== canonical.id).map(brand => brand.id)] : [resolved];
}

function sourceNativeId(ad: Ad): string | null {
  if (ad.source !== "public" || ad.platform !== "Meta" || ad.advertiserPageId !== VALENTTE_ADVERTISER_PAGE_ID || !ad.sourceUrl) return null;
  try {
    const url = new URL(ad.sourceUrl), id = url.searchParams.get("id");
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["facebook.com", "www.facebook.com"].includes(url.hostname) ||
        !/^\/ads\/library\/?$/.test(url.pathname) || !id || !nativeIdPattern.test(id)) return null;
    return !ad.providerAdId || ad.providerAdId === id ? id : null;
  } catch { return null; }
}
interface StoredAd { brandId: string; adId: string; ad: Ad; persisted: boolean }
function storedAds(db: DatabaseSync, brandIds: string[], clause = "", values: string[] = []): StoredAd[] {
  if (!brandIds.length) return [];
  const allowed = new Set(brandIds);
  return (db.prepare(`SELECT id,brand_id,data FROM ads WHERE brand_id IN (${brandIds.map(()=>"?").join(",")}) ${clause} ORDER BY rowid`).all(...brandIds,...values) as { id: string; brand_id: string; data: string }[]).flatMap(row => {
    if (!allowed.has(row.brand_id)) return [];
    const ad = parse<Ad>(row.data);
    return ad && ad.id === row.id && ad.brandId === row.brand_id ? [{ brandId: row.brand_id, adId: row.id, ad, persisted: true }] : [];
  });
}
function nativeRows(db: DatabaseSync, brandIds: string[], nativeId: string): StoredAd[] {
  return storedAds(db,brandIds,`AND (CASE WHEN json_valid(data) THEN json_extract(data,'$.providerAdId') END=? OR CASE WHEN json_valid(data) THEN json_extract(data,'$.sourceUrl') END LIKE ?)`,[nativeId,`%id=${nativeId}%`])
    .filter(row=>sourceNativeId(row.ad)===nativeId);
}
function instant(value: unknown): number | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}
function representative(rows: StoredAd[], canonicalId: string): StoredAd {
  return [...rows].sort((a, b) => Number(b.persisted && b.brandId === canonicalId) - Number(a.persisted && a.brandId === canonicalId) ||
    Number(b.persisted) - Number(a.persisted) ||
    Number(Boolean(b.ad.videoAnalysis || b.ad.videoMediaId)) - Number(Boolean(a.ad.videoAnalysis || a.ad.videoMediaId)))[0];
}
function projectedAd(rows: StoredAd[], canonical: Brand): Ad {
  const preferred = representative(rows, canonical.id);
  const latest = [...rows].sort((a, b) => (instant(b.ad.observedAt) ?? 0) - (instant(a.ad.observedAt) ?? 0))[0].ad;
  const nativeId = sourceNativeId(preferred.ad)!;
  const observed = rows.map(row => row.ad.observedAt).filter((value): value is string => instant(value) !== null).sort((a,b) => Date.parse(a) - Date.parse(b));
  const first = rows.flatMap(row => [row.ad.firstObservedAt, row.ad.observedAt]).filter((value): value is string => instant(value) !== null).sort((a,b) => Date.parse(a) - Date.parse(b))[0];
  return { ...preferred.ad, id: preferred.brandId === canonical.id ? preferred.adId : `meta-library:${canonical.id}:${nativeId}`,
    brandId: canonical.id, brand: canonical.name, providerAdId: nativeId, advertiserPageId: VALENTTE_ADVERTISER_PAGE_ID,
    sourceUrl: `https://www.facebook.com/ads/library/?id=${nativeId}`,
    ...(first ? { firstObservedAt: first } : {}), ...(observed.length ? { observedAt: observed.at(-1)! } : {}),
    active: latest.active, deliveryStatus: latest.deliveryStatus,
    deliveryStartAt: latest.deliveryStartAt, deliveryStopAt: latest.active ? undefined : latest.deliveryStopAt,
    metricsAvailable: false, engagementRateBasis: "unavailable",
    ...(preferred.ad.brandedContentPartner ? {} : latest.brandedContentPartner ? { brandedContentPartner: latest.brandedContentPartner } : {}),
  };
}
/** All observed ads, without publication-date filtering. No paid work or writes. */
export function workspaceAds(db: DatabaseSync, brandId: string): Ad[] {
  const ids = workspaceBrandIds(db, brandId), canonical = canonicalValentteBrand(db), resolved = resolveDemoBrandId(db, brandId);
  const rows = storedAds(db, ids);
  if (!canonical || resolved !== canonical.id) return rows.map(row => row.ad);
  const groups = new Map<string, StoredAd[]>();
  const other: Ad[] = [];
  for (const row of rows) {
    const nativeId = sourceNativeId(row.ad);
    if (nativeId) groups.set(nativeId, [...(groups.get(nativeId) || []), row]);
    else if (row.brandId === canonical.id && !(row.ad.source === "public" && row.ad.platform === "Meta")) other.push(row.ad);
  }
  return [...groups.values()].map(group => projectedAd(group, canonical)).concat(other).sort((a,b) => a.id.localeCompare(b.id));
}
export function workspaceAd(db: DatabaseSync, brandId: string, adId: string): Ad | null {
  const ids=workspaceBrandIds(db,brandId),canonical=canonicalValentteBrand(db),resolved=resolveDemoBrandId(db,brandId);
  const original=storedAds(db,ids,"AND id=?",[adId])[0];
  if (!canonical || resolved!==canonical.id)
    return original?.ad || storedAds(db,ids,"AND CASE WHEN json_valid(data) THEN json_extract(data,'$.providerAdId') END=?",[adId])[0]?.ad || null;
  const nativeId=original ? sourceNativeId(original.ad) : nativeIdPattern.test(adId) ? adId : null;
  if (nativeId) { const rows=nativeRows(db,ids,nativeId);return rows.length ? projectedAd(rows,canonical) : null; }
  return original?.brandId===canonical.id && !(original.ad.source==="public"&&original.ad.platform==="Meta") ? original.ad : null;
}
export interface WorkspaceAdAlias { brandId: string; adId: string; nativeId: string }
/** Original scopes are required to verify immutable media manifests and histories. */
export function workspaceAdAliases(db: DatabaseSync, brandId: string, adId: string): WorkspaceAdAlias[] {
  const ad = workspaceAd(db, brandId, adId);
  if (!ad) return [];
  const canonical = canonicalValentteBrand(db), resolved = resolveDemoBrandId(db, brandId);
  if (!canonical || resolved !== canonical.id) return [{ brandId: ad.brandId, adId: ad.id, nativeId: ad.providerAdId || ad.id }];
  const nativeId = sourceNativeId(ad);
  if (!nativeId) return [{ brandId: ad.brandId, adId: ad.id, nativeId: ad.providerAdId || ad.id }];
  return nativeRows(db, workspaceBrandIds(db, brandId),nativeId)
    .sort((a,b) => Number(b.brandId === canonical.id && b.adId === ad.id) - Number(a.brandId === canonical.id && a.adId === ad.id))
    .map(row => ({ brandId: row.brandId, adId: row.adId, nativeId }));
}
function tableExists(db: DatabaseSync, table: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
}
type Analysis = VideoAnalysisResult | ImageAnalysisResult;
function savedAnalysis<T extends Analysis>(value: T | null | undefined, ref: WorkspaceAdAlias, id = value?.id): value is T {
  return !!value && typeof value.id === "string" && value.id === id && value.brandId === ref.brandId && value.adId === ref.adId && typeof value.mediaId === "string" &&
    instant(value.createdAt) !== null && !!value.fields?.format && !!value.fields.angle && Array.isArray(value.fields.keyClaims) && Array.isArray(value.fields.onScreenText);
}
function analysisRows<T extends Analysis>(db: DatabaseSync, table: "video_analysis_runs" | "image_analysis_runs", refs: WorkspaceAdAlias[]): T[] {
  if (!tableExists(db, table)) return [];
  const values: T[] = [];
  for (const ref of refs) {
    const rows = db.prepare(`SELECT id,data FROM ${table} WHERE brand_id=? AND ad_id=?`).all(ref.brandId, ref.adId) as { id: string; data: string }[];
    for (const row of rows) {
      const value = parse<T>(row.data);
      if (savedAnalysis(value,ref,row.id)) values.push(value);
    }
  }
  return [...new Map(values.map(value => [value.id,value])).values()].sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}
export interface LinkedWorkspaceAnalysis {
  analysis: VideoAnalysisResult | ImageAnalysisResult;
  brandId: string;
  adId: string;
  mediaKind: "video" | "image" | "carousel";
}
export function linkedWorkspaceAnalyses(db: DatabaseSync, brandId: string, adId: string): LinkedWorkspaceAnalysis[] {
  const refs = workspaceAdAliases(db, brandId, adId);
  const embedded = refs.flatMap(ref => {
    const row = db.prepare("SELECT data FROM ads WHERE brand_id=? AND id=?").get(ref.brandId,ref.adId) as { data: string } | undefined;
    const value = row && parse<Ad>(row.data)?.videoAnalysis;
    return savedAnalysis(value,ref) ? [value] : [];
  });
  const videos = [...new Map([...analysisRows<VideoAnalysisResult>(db, "video_analysis_runs", refs), ...embedded].map(value => [value.id,value])).values()];
  return [
    ...videos.map(analysis => ({ analysis, brandId: analysis.brandId, adId: analysis.adId, mediaKind: "video" as const })),
    ...analysisRows<ImageAnalysisResult>(db, "image_analysis_runs", refs).filter(analysis => ["image","carousel"].includes(analysis.processingMode)).map(analysis => ({ analysis, brandId: analysis.brandId, adId: analysis.adId, mediaKind: analysis.processingMode })),
  ].sort((a,b) => Date.parse(b.analysis.createdAt) - Date.parse(a.analysis.createdAt) || b.analysis.id.localeCompare(a.analysis.id));
}

export interface ValentteReconciliationStatus {
  canonicalBrandId: string;
  aliasBrandIds: string[];
  verifiedCaseAds: number;
  collectedAds: number;
  newlyImportedAds: number;
  updatedAds: number;
  analysedAds: number;
  videoAnalyses: number;
  imageAnalyses: number;
  carouselAnalyses: number;
  attributedAds: number;
  attributedCreators: number;
  websiteResearchAvailable: boolean;
  sourceCapturedAt: string;
  reconciledAt: string;
}
/** Reversible source import. Paid outputs, job rows and media manifests are never rewritten. */
export function reconcileValentteWorkspace(db: DatabaseSync): ValentteReconciliationStatus {
  const originals = source.ads as Ad[];
  if (!originals.length || originals.some(ad => !sourceNativeId(ad)) || new Set(originals.map(ad => ad.providerAdId)).size !== originals.length)
    throw new Error("The verified Valentte capture failed its advertiser and native-ID checks; no records were imported.");
  let imported = 0, updated = 0;
  db.exec("SAVEPOINT exter_valentte_reconcile");
  try {
    let canonical = canonicalValentteBrand(db);
    if (!canonical) {
      const existing = allBrands(db), preferredId = existing.some(brand => brand.id === "valentte") ? `valentte-verified-${VALENTTE_ADVERTISER_PAGE_ID}` : "valentte";
      canonical = { ...(caseData.brand as Brand), id: preferredId, mode: "imported", color: "#0C1F96" };
      db.prepare("INSERT INTO brands VALUES (?,?)").run(canonical.id, JSON.stringify(canonical));
    }
    const rows = storedAds(db, workspaceBrandIds(db, canonical.id));
    const grouped = new Map<string, StoredAd[]>();
    for (const ad of originals) grouped.set(ad.providerAdId!, [{ brandId: ad.brandId, adId: ad.id, ad, persisted: false }]);
    for (const row of rows) { const id = sourceNativeId(row.ad); if (id) grouped.set(id, [...(grouped.get(id) || []), row]); }
    const insert = db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)");
    const update = db.prepare("UPDATE ads SET published_at=?,data=? WHERE id=? AND brand_id=?");
    for (const [nativeId, group] of grouped) {
      const current = group.filter(row => row.persisted && row.brandId === canonical!.id);
      const prior = current.length ? representative(current, canonical.id) : undefined;
      const preferredGroup = prior ? [prior, ...group.filter(row => row !== prior)] : group;
      const projected = projectedAd(preferredGroup, canonical);
      const ad: Ad = { ...projected, id: prior?.adId || `meta-library:${canonical.id}:${nativeId}`, brandId: canonical.id,
        // A source-only copy must not pretend that alias-scoped media or analyses were moved.
        ...(!prior ? { videoMediaId: undefined, videoAnalysis: undefined } : {}),
      };
      const json = JSON.stringify(ad);
      if (!prior) { insert.run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, json); imported++; }
      else if (JSON.stringify(prior.ad) !== json) { update.run(ad.publishedAt,json,ad.id,ad.brandId); updated++; }
    }
    if (!readBrandResearch(db, canonical.id)) {
      const saved = workspaceBrandIds(db, canonical.id).flatMap(id => { const value = readBrandResearch(db,id); return value ? [value] : []; });
      const captured = [...saved, caseData.research as unknown as BrandResearch].filter(value => value.domain?.toLowerCase().replace(/^www\./, "") === "valentte.com")
        .sort((a,b) => (instant(b.observedAt) ?? 0) - (instant(a.observedAt) ?? 0))[0];
      if (captured) {
        const scopedAds = new Map(workspaceAds(db,canonical.id).flatMap(ad => ad.providerAdId ? [[ad.providerAdId,ad] as const] : []));
        saveBrandResearch(db, { ...captured, brandId: canonical.id, brandName: canonical.name,
          ...(captured.adLibraryEvidence ? { adLibraryEvidence: { ...captured.adLibraryEvidence, records: captured.adLibraryEvidence.records.map(ad => {
            const nativeId = sourceNativeId(ad), scoped = nativeId && scopedAds.get(nativeId);
            return scoped ? { ...ad, id: scoped.id, brandId: canonical!.id, brand: canonical!.name } : ad;
          }) } } : {}),
        });
      }
    }
    db.exec("RELEASE exter_valentte_reconcile");
  } catch (error) { db.exec("ROLLBACK TO exter_valentte_reconcile; RELEASE exter_valentte_reconcile"); throw error; }
  const status = valentteReconciliationStatus(db, { newlyImportedAds: imported, updatedAds: updated });
  db.prepare("INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(RECONCILIATION_KEY, JSON.stringify(status));
  return status;
}
export function valentteReconciliationStatus(db: DatabaseSync, changes = { newlyImportedAds: 0, updatedAds: 0 }): ValentteReconciliationStatus {
  const canonical = canonicalValentteBrand(db);
  if (!canonical) throw new Error("The Valentte workspace has not been imported.");
  const ads = workspaceAds(db, canonical.id).filter(ad => sourceNativeId(ad)), counts = { video: 0, image: 0, carousel: 0 };
  for (const ad of ads) {
    const latest = linkedWorkspaceAnalyses(db, canonical.id, ad.id)[0];
    if (latest) counts[latest.mediaKind]++;
  }
  return { canonicalBrandId: canonical.id, aliasBrandIds: workspaceBrandIds(db, canonical.id), verifiedCaseAds: (source.ads as Ad[]).length,
    collectedAds: ads.length, ...changes, analysedAds: counts.video + counts.image + counts.carousel,
    videoAnalyses: counts.video, imageAnalyses: counts.image, carouselAnalyses: counts.carousel,
    attributedAds: ads.filter(ad => ad.brandedContentPartner).length,
    attributedCreators: new Set(ads.flatMap(ad => ad.brandedContentPartner ? [ad.brandedContentPartner.pageId] : [])).size,
    websiteResearchAvailable: Boolean(readBrandResearch(db, canonical.id)), sourceCapturedAt: source.observedAt, reconciledAt: new Date().toISOString() };
}

export interface HostedResearchState { status: "not-started" | "running" | "complete" | "failed"; brandId: string; startedAt?: string; finishedAt?: string; error?: string; attempts?: number; recoveredInterruptedAttempt?: boolean }
const activeResearch = new WeakMap<DatabaseSync,Promise<HostedResearchState>>();
export function hostedValentteResearchState(db: DatabaseSync): HostedResearchState {
  const row = db.prepare("SELECT value FROM metadata WHERE key=?").get(RESEARCH_KEY) as { value: string } | undefined;
  const state = row && parse<HostedResearchState>(row.value);
  return state || { status: "not-started", brandId: canonicalValentteBrand(db)?.id || "valentte" };
}
/** Call explicitly from the hosted startup controller, never a GET handler. */
export async function startHostedValentteResearch(db: DatabaseSync, options: BrandResearchOptions & {
  env?: Record<string,string|undefined>;
  research?: typeof researchBrand;
} = {}): Promise<HostedResearchState> {
  const env = options.env || process.env;
  if (env.NODE_ENV !== "production" || !(env.RENDER === "true" || env.RENDER_SERVICE_ID)) return hostedValentteResearchState(db);
  const active = activeResearch.get(db);
  if (active) return active;
  const previous = hostedValentteResearchState(db);
  if (previous.status === "complete") return previous;
  const canonical = canonicalValentteBrand(db);
  if (!canonical) throw new Error("Import the Valentte source records before website research.");
  const save = (state: HostedResearchState) => { db.prepare("INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(RESEARCH_KEY,JSON.stringify(state)); return state; };
  const running = save({ status: "running", brandId: canonical.id, startedAt: new Date().toISOString(), attempts: (previous.attempts || 0) + 1,
    ...(previous.status === "running" ? { recoveredInterruptedAttempt: true } : {}) });
  const operation = Promise.resolve().then(async () => {
    try {
      await (options.research || researchBrand)(db,canonical.id,options);
      return save({ ...running, status: "complete" as const, finishedAt: new Date().toISOString() });
    } catch {
      return save({ ...running, status: "failed" as const, finishedAt: new Date().toISOString(), error: "Website research could not finish. Earlier captured website evidence was preserved; refresh it from the authenticated app." });
    }
  });
  activeResearch.set(db,operation);
  try { return await operation; }
  finally { if (activeResearch.get(db) === operation) activeResearch.delete(db); }
}
