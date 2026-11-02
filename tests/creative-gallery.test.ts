import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import source from "../shared/cases/valentte-ads.json";
import caseData from "../shared/cases/valentte.json";
import type { Ad, Brand } from "../shared/types.js";
import type { VideoAnalysisResult } from "../shared/video-analysis.js";
import type { ImageAnalysisResult } from "../shared/image-analysis.js";
import { filterGalleryCreatives } from "../shared/creative-gallery.js";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { VideoAnalysisService } from "../server/video/service.js";
import { LocalVideoMediaStore } from "../server/video/media.js";
import { ImageAnalysisService } from "../server/image/service.js";
import { LocalImageMediaStore } from "../server/image/media.js";
import { CreativeGalleryService, attachCreativeGallery } from "../server/demo/gallery.js";
import { reconcileValentteWorkspace, workspaceAds } from "../server/demo/reconcile.js";

const run = promisify(execFile);
const field = <T extends string | boolean>(value: T) => ({ value, confidence: 0.1, timestamps: [{ startSeconds: 0, endSeconds: 1 }] });
const still = <T extends string | boolean>(value: T) => ({ value, confidence: 0.1, imageIndices: [1] });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "exter-gallery-"));
  const db = openDatabase(":memory:", false);
  const brand = { ...(caseData.brand as Brand), id: "valentte", mode: "imported" as const };
  const legacy = { ...brand, id: "original-paid-workspace" };
  const unrelated = { ...brand, id: "other-advertiser", name: "Other Advertiser", domain: "other.example" };
  for (const value of [brand, legacy, unrelated]) db.prepare("INSERT INTO brands VALUES (?,?)").run(value.id, JSON.stringify(value));
  const videoPath = join(root, "fixture-source.mp4"), imagePath = join(root, "fixture-source.png");
  await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:size=64x48:rate=10", "-t", "2", "-threads", "1", "-filter_threads", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", videoPath], { timeout: 15000 });
  await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=teal:size=64x48:rate=1", "-frames:v", "1", "-threads", "1", "-filter_threads", "1", "-y", imagePath], { timeout: 15000 });
  const videoBytes = await readFile(videoPath), imageBytes = await readFile(imagePath);
  let downloads = 0;
  const videoStore = new LocalVideoMediaStore({ root, allowedHosts: ["fixture.fbcdn.net"], resolve: async () => [{ address: "8.8.8.8", family: 4 }], fetch: async () => { downloads++; return new Response(new Uint8Array(videoBytes), { headers: { "Content-Type": "video/mp4" } }); } });
  const imageStore = new LocalImageMediaStore({ root, allowedHosts: ["fixture.fbcdn.net"], resolve: async () => [{ address: "8.8.8.8", family: 4 }], fetch: async () => { downloads++; return new Response(new Uint8Array(imageBytes), { headers: { "Content-Type": "image/png" } }); } });
  const video = new VideoAnalysisService(db, { mediaStore: videoStore });
  const images = new ImageAnalysisService(db, { mediaStore: imageStore });
  const originals = source.ads as Ad[];
  const chosenVideos = [...originals.filter(ad => ad.format === "Video"), originals.find(ad => ad.format === "Dynamic creative")!].slice(0, 12);
  const chosenImages = originals.filter(ad => ad.format === "Static image").slice(0, 2);
  const paid: string[] = [];
  let firstOriginalAd: Ad | undefined;
  for (const [index, original] of [...chosenVideos, ...chosenImages].entries()) {
    const ad: Ad = { ...original, id: `immutable-original-${index}`, brandId: legacy.id, publishedAt: "2020-01-01T00:00:00Z", observedAt: "2026-11-01T00:00:00Z", firstObservedAt: "2026-10-25T00:00:00Z", deliveryStartAt: "2026-10-01T00:00:00Z", active: true };
    db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
    firstOriginalAd ||= ad;
    if (index < 12) {
      const media = await video.storeMedia(ad.brandId, ad.id, "https://fixture.fbcdn.net/source.mp4");
      const result = { id: `paid-video-${index}`, adId: ad.id, brandId: ad.brandId, mediaId: media.mediaId, mediaSha256: media.sha256, createdAt: "2026-11-01T01:00:00Z", promptVersion: "exter-native-video-v2", coverage: { durationSeconds: 2 }, fields: {
        hook: field("A bright gift for the home"), hook_type: field("offer-led"), format: field("studio"), angle: field("gifting"), offer_type: field("bundle"), offer_explanation: field("Gift bundle"), keyClaims: [{ ...field("UK's best fragrance"), claim_type: ["superlative"], may_need_substantiation_asa: true }], spokenTranscript: [field("A bright gift for the home")], onScreenText: [field("GIFT BUNDLE")], cta: field("Shop now"), creatorEvidence: [], personTalkingToCamera: field(false),
      }, accounting: { rawResponse: { privateDebugMarker: "PROVIDER_RAW_MUST_NOT_APPEAR_IN_CLIENT" } } } as unknown as VideoAnalysisResult;
      const json = JSON.stringify(result); paid.push(json);
      db.prepare("INSERT INTO video_analysis_runs VALUES (?,?,?,?,?)").run(result.id, ad.brandId, ad.id, result.createdAt, json);
    } else {
      const media = await images.storeMedia(ad.brandId, ad.id, ["https://fixture.fbcdn.net/source.png"], "image");
      const result = { id: `paid-image-${index}`, adId: ad.id, brandId: ad.brandId, mediaId: media.mediaId, mediaSha256: media.sha256, processingMode: "image", createdAt: "2026-11-01T01:00:00Z", promptVersion: "exter-still-creative-v2", fields: {
        format: still("static"), hook: still("Gift bundle"), hook_type: still("offer-led"), headline: still("Gift bundle"), angle: still("gifting"), angle_explanation: still("A fragrance gift"), offer_type: still("bundle"), keyClaims: [], onScreenText: [still("GIFT BUNDLE")], offer: still("Bundle"), cta: still("Shop now"),
      }, accounting: { rawResponse: { privateDebugMarker: "PROVIDER_RAW_MUST_NOT_APPEAR_IN_CLIENT" } } } as unknown as ImageAnalysisResult;
      const json = JSON.stringify(result); paid.push(json);
      db.prepare("INSERT INTO image_analysis_runs VALUES (?,?,?,?,?)").run(result.id, ad.brandId, ad.id, result.createdAt, json);
    }
  }
  const retainedBefore = (db.prepare("SELECT data FROM video_media ORDER BY id").all() as { data: string }[]).map(row => row.data);
  reconcileValentteWorkspace(db);
  const gallery = new CreativeGalleryService(db, { video, images, mediaRoot: root });
  return { db, root, brand, legacy, unrelated, video, images, gallery, paid, retainedBefore, videoBytes, imageBytes, firstOriginalAd: firstOriginalAd!, downloadCount: () => downloads,
    async close() { db.close(); await rm(root, { recursive: true, force: true }); } };
}

test("gallery links all 58 observed ads to 14 immutable original paid media/analyses across verified aliases", async () => {
  const f = await fixture();
  try {
    const before = f.db.prepare("SELECT total_changes() AS n").get();
    const downloads = f.downloadCount();
    const list = await f.gallery.list("valentte");
    assert.equal(list.collectedAdsCount, 58); assert.equal(list.creatives.length, 58);
    assert.equal(list.analysedAdsCount, 14); assert.equal(list.storedMediaCount, 14);
    assert.equal(list.creatives.filter(ad => ad.analysis?.mediaKind === "video").length, 12);
    assert.equal(list.creatives.filter(ad => ad.analysis?.mediaKind === "image").length, 2);
    assert.equal(list.creatives.filter(ad => ad.mediaStatus === "not-stored").length, 44);
    assert.ok(list.creatives.every(ad => ad.brandId === "valentte" && ad.sourceUrl === `https://www.facebook.com/ads/library/?id=${ad.nativeId}`));
    assert.equal(list.dateRange.to, "2026-11-01T00:00:00.000Z");
    assert.ok(list.creatives.some(ad => ad.partnershipAttribution?.name));
    const linked = list.creatives.find(ad => ad.nativeId === f.firstOriginalAd.providerAdId)!;
    const throughAlias = await f.gallery.list(f.legacy.id);
    assert.equal(throughAlias.brand.id, "valentte"); assert.equal(throughAlias.collectedAdsCount, 58);
    assert.equal(linked.analysis?.id, "paid-video-0"); assert.equal(linked.daysRunning, 31);
    assert.equal(linked.daysRunningAsOf, "2026-11-01T00:00:00.000Z");
    assert.match(linked.daysRunningBasis!, /Continuous delivery.*unverified/);
    assert.ok(linked.thumbnailUrl?.endsWith("/poster")); assert.ok(linked.videoUrl?.includes(encodeURIComponent(linked.adId)));
    assert.equal(linked.durationSeconds, 2); assert.equal(linked.ugc, false);
    const wire = JSON.stringify(list);
    assert.ok(!wire.includes("absolutePath") && !wire.includes(f.root) && !wire.includes("rawResponse") && !wire.includes("PROVIDER_RAW_MUST_NOT_APPEAR_IN_CLIENT"));
    assert.ok(!wire.includes("immutable-original-"), "client identifiers are canonical, never the original scope");
    assert.equal(f.downloadCount(), downloads, "reads do not download sources or call paid providers");
    assert.deepEqual(f.db.prepare("SELECT total_changes() AS n").get(), before, "gallery GET projection makes no database writes");
    assert.deepEqual((f.db.prepare("SELECT data FROM video_media ORDER BY id").all() as { data: string }[]).map(row => row.data), f.retainedBefore);
    const saved = [...f.db.prepare("SELECT data FROM video_analysis_runs").all(), ...f.db.prepare("SELECT data FROM image_analysis_runs").all()] as { data: string }[];
    assert.deepEqual(saved.map(row => row.data).sort(), [...f.paid].sort());
    assert.equal((await f.gallery.list(f.unrelated.id)).collectedAdsCount, 0, "unrelated advertisers cannot inherit Valentte media");
    assert.equal(filterGalleryCreatives(list.creatives, { search: "bright gift", hookType: "offer-led", ugc: "no", mediaKind: "video" }).length, 12);
    assert.equal(filterGalleryCreatives(list.creatives, { search: "GIFT BUNDLE", offerType: "bundle" }).length, 14);
    assert.equal(filterGalleryCreatives(list.creatives, { ugc: "unknown" }).length, 44);
    assert.equal(filterGalleryCreatives(list.creatives, { format: "static" }).length, 2);
    assert.equal(filterGalleryCreatives(list.creatives, { ugc: "all" }).length, 58);
  } finally { await f.close(); }
});

test("authenticated media supports byte ranges and cached real posters, with immutable scopes and carousel slides", async () => {
  const f = await fixture();
  const app = express(); app.use(basicAuth({ EXTER_ADMIN_USER: "gallery-fixture", EXTER_ADMIN_PASSWORD: "fixture-only" }));
  const service = attachCreativeGallery(app, f.db, { video: f.video, images: f.images, mediaRoot: f.root });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Basic ${Buffer.from("gallery-fixture:fixture-only").toString("base64")}` };
  try {
    const list = await service.list("valentte"), selected = list.creatives.find(ad => ad.videoUrl)!;
    const original = list.creatives.find(ad => ad.nativeId === f.firstOriginalAd.providerAdId)!;
    const originalScopePath = `/api/brands/${f.legacy.id}/demo/creatives/${encodeURIComponent(f.firstOriginalAd.id)}/video`;
    const nativeScopePath = `/api/brands/valentte/demo/creatives/${original.nativeId}/video`;
    for (const alias of [originalScopePath, nativeScopePath]) {
      const result = await fetch(base + alias, { headers: { ...headers, Range: "bytes=0-31" } });
      assert.equal(result.status, 206); assert.deepEqual(Buffer.from(await result.arrayBuffer()), f.videoBytes.subarray(0, 32));
    }
    assert.equal((await fetch(base + selected.videoUrl)).status, 401);
    const response = await fetch(base + selected.videoUrl, { headers: { ...headers, Range: "bytes=0-31" } });
    assert.equal(response.status, 206); assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.match(response.headers.get("content-range")!, /^bytes 0-31\/\d+$/); assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.videoBytes.subarray(0, 32));
    const invalid = await fetch(base + selected.videoUrl, { headers: { ...headers, Range: "bytes=999999999-" } }); assert.equal(invalid.status, 416);
    const poster = await fetch(base + selected.thumbnailUrl, { headers }); assert.equal(poster.status, 200); assert.match(poster.headers.get("content-type")!, /image\/jpeg/);
    const frame = Buffer.from(await poster.arrayBuffer()); assert.deepEqual([...frame.subarray(0, 3)], [255, 216, 255]);
    const path = await service.posterFile("valentte", selected.adId), firstStat = await stat(path);
    const second = await service.posterFile("valentte", selected.adId); assert.equal(second, path); assert.equal((await stat(path)).mtimeMs, firstStat.mtimeMs, "poster extraction is reused rather than rerun");
    assert.deepEqual(await readFile((await service.videoFile("valentte", selected.adId)).absolutePath), f.videoBytes);
    const image = list.creatives.find(ad => ad.mediaKind === "image" && ad.mediaAvailable)!;
    const picture = await fetch(base + image.imageUrls[0], { headers }); assert.equal(picture.status, 200); assert.deepEqual(Buffer.from(await picture.arrayBuffer()), f.imageBytes);
    const cross = selected.videoUrl!.replace("/valentte/", `/${f.unrelated.id}/`);
    assert.equal((await fetch(base + cross, { headers })).status, 404);
    assert.equal((await fetch(`${base}/api/brands/valentte/demo/creatives?ugc=unsupported`, { headers })).status, 400);
    const searched = await fetch(`${base}/api/brands/valentte/demo/creatives?mediaKind=video&search=bright%20gift`, { headers }); assert.equal(searched.status, 200); assert.equal((await searched.json()).creatives.length, 12);
    assert.equal((await fetch(base + selected.videoUrl, { method: "HEAD", headers })).status, 200);
    // A retained two-slide creative stays one ad and exposes each ordered image.
    const unanalysed = workspaceAds(f.db, "valentte").find(ad => !list.creatives.find(item => item.adId === ad.id)?.analysis)!;
    await f.images.storeMedia("valentte", unanalysed.id, ["https://fixture.fbcdn.net/one.png", "https://fixture.fbcdn.net/two.png"], "carousel");
    const updated = (await service.list("valentte")).creatives.find(ad => ad.adId === unanalysed.id)!;
    assert.equal(updated.mediaKind, "carousel"); assert.equal(updated.imageUrls.length, 2);
    assert.equal((await fetch(base + updated.imageUrls[1], { headers })).status, 200);
    assert.equal((await fetch(base + updated.imageUrls[1].replace(/1$/, "2"), { headers })).status, 404);
    await writeFile(path, "damaged poster");
    const repaired = await service.posterFile("valentte", selected.adId); assert.deepEqual([...(await readFile(repaired)).subarray(0, 3)], [255, 216, 255]);
    // An unexpected replacement cannot inherit an already cached verification.
    const originalVideo = await service.videoFile("valentte", selected.adId);
    await writeFile(originalVideo.absolutePath, "corrupted retained video");
    const damaged = await fetch(base + selected.videoUrl, { headers }); assert.equal(damaged.status, 404);
    const afterDamage = (await service.list("valentte")).creatives.find(ad => ad.adId === selected.adId)!;
    assert.equal(afterDamage.mediaStatus, "unavailable"); assert.equal(afterDamage.videoUrl, null); assert.ok(afterDamage.analysis);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await f.close(); }
});
