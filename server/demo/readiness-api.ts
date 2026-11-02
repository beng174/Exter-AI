import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { readBrand, } from "../db.js";
import { readBrandResearch } from "../brand-research.js";
import type { CreativeGalleryService } from "./gallery.js";
import type { CreatorResearchService } from "../creators/service.js";
import type { DemoCollectionService } from "./collection.js";
import { hostedValentteResearchState, isValentteBrand, resolveDemoBrandId } from "./reconcile.js";

/** Pure verification: reports persisted evidence and verified disk availability.
 * Opening or downloading this report never starts collection or paid inference. */
export function attachDemoReadiness(app: Express, db: DatabaseSync) {
  app.get("/api/demo-readiness", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (typeof req.query.brandId !== "string" || req.query.brandId.length > 300) {
      res.status(400).json({ error: "Choose a brand workspace." }); return;
    }
    const brand = readBrand(db, resolveDemoBrandId(db, req.query.brandId));
    if (!brand || brand.mode === "demo") { res.status(404).json({ error: "Real brand workspace not found." }); return; }
    try {
      const gallery = await (app.locals.creativeGallery as CreativeGalleryService).list(brand.id);
      const creators = (app.locals.creatorResearch as CreatorResearchService).snapshot(brand.id);
      const research = readBrandResearch(db, brand.id);
      const competitors = isValentteBrand(brand) ? (app.locals.demoCollection as DemoCollectionService).snapshot(brand.id).competitors : [];
      const analysed = gallery.creatives.filter(ad => ad.analysis);
      const stored = gallery.creatives.filter(ad => ad.mediaAvailable);
      const countKinds = (ads: typeof gallery.creatives) => ads.reduce((counts, ad) => { counts[ad.mediaKind]++; return counts; }, { video: 0, image: 0, carousel: 0, unknown: 0 });
      const distinctFormats = new Set(analysed.flatMap(ad => ad.creativeFormat ? [ad.creativeFormat] : []));
      const page = (view: string) => `/?view=${view}&brandId=${encodeURIComponent(brand.id)}`;
      const checkedAt = new Date().toISOString();
      const revision = /^[a-f0-9]{7,40}$/.test(process.env.RENDER_GIT_COMMIT || "") ? process.env.RENDER_GIT_COMMIT : null;
      const result = {
        checkedAt, deploymentCommit: revision, brand: gallery.brand,
        pages: {
          overview: { url: page("overview"), adsCollected: gallery.collectedAdsCount, adsAnalysed: analysed.length, formatCounts: gallery.mediaCounts, observedDateRange: gallery.dateRange },
          contentLibrary: { url: page("ads"), ads: gallery.collectedAdsCount, mediaVerifiedOnDisk: stored.length, analysed: analysed.length, storedFormats: countKinds(stored) },
          formats: { url: page("formats"), labelledFormats: distinctFormats.size, analysedAdsWithCanonicalFormat: analysed.filter(ad => ad.creativeFormat).length },
          brandResearch: { url: page("brand"), available: Boolean(research), sources: research?.sources.filter(source => source.status === "available").length || 0, observedAt: research?.observedAt || null, hostedRefresh: isValentteBrand(brand) ? hostedValentteResearchState(db) : null },
          creators: { url: page("creators"), attributedCreators: creators.seeds.length, attributedAds: new Set(creators.seeds.flatMap(seed => seed.seedEvidence.map(evidence => evidence.providerAdId || evidence.adId))).size, savedCandidates: creators.totalCandidates },
          competitors: { url: page("competitors"), brands: competitors.map(item => ({ name: item.name, brandId: item.brandId, adsCollected: item.collectedCount, mediaStored: item.storedCount, adsAnalysed: item.analysedCount, status: item.status, message: item.lastRun?.message || null })) },
          clientReport: { url: `/demo/${encodeURIComponent(brand.id)}`, ads: gallery.collectedAdsCount, mediaVerifiedOnDisk: stored.length, analyses: analysed.length },
        },
        limitations: ["Counts reflect this deployment's saved records and verified retained media at the check time.", "Browser playback, visual layout and external Meta links require a separate browser check; these counts do not claim those checks passed.", "Missing media, analyses, public metrics and source history remain unavailable; they are never replaced by invented values."],
      };
      if (req.query.download === "1") {
        const lines = [`# ${brand.name} deployment verification`, `Checked: ${checkedAt}`, `Deployment commit: ${revision || "not supplied by host"}`, "", ...Object.entries(result.pages).flatMap(([name, values]) => [`## ${name}`, "", "```json", JSON.stringify(values, null, 2), "```", ""]), ...result.limitations.map(value => `- ${value}`)];
        res.setHeader("Content-Disposition", 'attachment; filename="exter-demo-verification.md"');
        res.type("text/markdown").send(lines.join("\n"));
      } else res.json(result);
    } catch { res.status(503).json({ error: "Saved evidence verification could not finish. Source records were preserved." }); }
  });
}
