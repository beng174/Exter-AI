import { readFile, stat, writeFile } from "node:fs/promises";
import { openDatabase, readJson } from "../server/db.js";
import { VideoAnalysisService, type VideoJobInput } from "../server/video/service.js";
import type { Ad } from "../shared/types.js";

const flags = new Map<string, string>();
const booleans = new Set<string>();
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === "--help") {
    console.log("Usage: npm run video:analyse -- --brand-id ID --ad-id ID [--capture /tmp/meta.json | --video-url HTTPS_URL] [--provider gemini|twelvelabs] [--mode agentic|static-high-fps-hook] [--force] [--download-only] [--output predictions.json] [--recover-interrupted]\nAn ad ID may be Exter's ID or its native library ID. Stored video is reused without a URL. --force makes a new inference and preserves history. Keep API credentials in GEMINI_API_KEY, never command arguments. No automatic batch billing.");
    process.exit(0);
  }
  if (["--force", "--download-only", "--recover-interrupted"].includes(flag)) { booleans.add(flag); continue; }
  if (!["--brand-id", "--ad-id", "--capture", "--video-url", "--provider", "--mode", "--output"].includes(flag)) throw new Error("Unknown video CLI option. Use --help.");
  const value = process.argv[++index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value.`);
  flags.set(flag, value);
}
const brandId = flags.get("--brand-id"), requestedAd = flags.get("--ad-id");
if (!brandId || !requestedAd) throw new Error("Provide --brand-id and --ad-id. Use --help.");
if (flags.has("--capture") && flags.has("--video-url")) throw new Error("Choose either a capture file or a video URL.");
const provider = flags.get("--provider") || "gemini", mode = flags.get("--mode") || "agentic";
if (!["gemini", "twelvelabs"].includes(provider) || !["agentic", "static-high-fps-hook"].includes(mode)) throw new Error("Unsupported video provider or mode.");
const db = openDatabase(undefined, false);
try {
  const ad = readJson<Ad>(db.prepare("SELECT data FROM ads WHERE brand_id=?").all(brandId)).find((row) => row.id === requestedAd || row.providerAdId === requestedAd);
  if (!ad) throw new Error("No matching source ad exists in this workspace.");
  let sourceVideoUrl = flags.get("--video-url");
  if (flags.has("--capture")) {
    const path = flags.get("--capture")!;
    const info = await stat(path);
    if (!info.isFile() || info.size > 40 * 1024 * 1024) throw new Error("Capture must be a regular JSON file below 40 MB.");
    const capture = JSON.parse(await readFile(path, "utf8"));
    const row = Array.isArray(capture.ads) ? capture.ads.find((item: any) => item.ad_archive_id === ad.providerAdId && item.page_id === ad.advertiserPageId) : null;
    if (!row) throw new Error("Capture does not contain the matching advertiser and source ad.");
    const assets = [...(Array.isArray(row.snapshot?.videos) ? row.snapshot.videos : []), ...(Array.isArray(row.snapshot?.cards) ? row.snapshot.cards : [])];
    sourceVideoUrl = assets.map((asset: any) => asset.video_hd_url || asset.video_sd_url).find((url: unknown) => typeof url === "string" && url.startsWith("https://"));
    if (!sourceVideoUrl) throw new Error("No video file was exposed in this captured ad. A grouped record may contain other media types.");
  }
  const service = new VideoAnalysisService(db);
  if (booleans.has("--recover-interrupted")) service.recoverInterruptedJobs();
  let exported: unknown;
  if (booleans.has("--download-only")) {
    const media = await service.storeMedia(brandId, ad.id, sourceVideoUrl);
    exported = { status: "video_stored_without_inference", adId: ad.id, mediaId: media.mediaId, sha256: media.sha256, bytes: media.bytes, mimeType: media.mimeType, durationSeconds: media.durationSeconds, storedAt: media.storedAt, assetSelection: "The first video file in the supplied source record; other grouped variants were not analysed." };
  } else {
    const queued = service.enqueue({ brandId, adId: ad.id, sourceVideoUrl, provider: provider as VideoJobInput["provider"], processingMode: mode as VideoJobInput["processingMode"], force: booleans.has("--force") });
    await service.idle();
    const job = service.job(brandId, queued.id)!;
    const predictions = job.errorCode === "not_implemented"
      ? [{ adId: ad.id, provider, model: job.model, status: "not_implemented" }]
      : service.history(brandId, ad.id).filter((run) => run.id === job.analysisId);
    exported = { provider, model: job.model, status: job.errorCode === "not_implemented" ? "not_implemented" : job.status, job, predictions };
    if (job.status !== "complete") process.exitCode = 1;
  }
  const body = JSON.stringify(exported, null, 2) + "\n";
  if (flags.has("--output")) await writeFile(flags.get("--output")!, body, { mode: 0o600 });
  console.log(body);
} finally { db.close(); }
