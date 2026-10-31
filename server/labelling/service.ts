import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { readBrand } from "../db.js";
import { ensureVideoTables, type VideoAnalysisService } from "../video/service.js";
import type { Ad } from "../../shared/types.js";
import { LABELLING_GUIDE_VERSION, LABELLING_SCHEMA_VERSION, validateHumanCreativeLabels, type BlindLabellingAd, type HumanCreativeReview, type LabellingSession } from "../../shared/labelling.js";

export class LabellingError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export interface LabellingOptions {
  video?: Pick<VideoAnalysisService, "storeMedia" | "storedMedia">;
  now?: () => Date;
}
type SessionRecord = LabellingSession & { sourceUrl: string };
const safeHttps = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 20000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};
const text = (value: unknown, name: string, max = 300): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new LabellingError(`Provide a valid ${name}.`);
  return value.trim();
};

/** Human review has a separate, explicit source-only projection. Never serialize the stored Ad. */
export class LabellingService {
  private readonly now: () => Date;
  constructor(readonly db: DatabaseSync, readonly options: LabellingOptions = {}) {
    this.now = options.now || (() => new Date());
    ensureVideoTables(db);
    db.exec(`CREATE TABLE IF NOT EXISTS labelling_sessions (
      id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),ad_id TEXT NOT NULL REFERENCES ads(id),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS human_creative_labels (
      id TEXT PRIMARY KEY REFERENCES labelling_sessions(id),brand_id TEXT NOT NULL REFERENCES brands(id),ad_id TEXT NOT NULL REFERENCES ads(id),labelled_at TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS human_creative_labels_workspace ON human_creative_labels(brand_id,ad_id,labelled_at);`);
  }
  private workspace(value: unknown) {
    const brandId = text(value, "workspace identifier");
    if (!readBrand(this.db, brandId)) throw new LabellingError("Workspace not found.", 404);
    return brandId;
  }
  private ad(brandId: string, value: unknown): Ad {
    const adId = text(value, "ad identifier");
    const row = this.db.prepare("SELECT data FROM ads WHERE brand_id=? AND id=? AND source!='sample'").get(brandId, adId) as { data: string } | undefined;
    if (!row) throw new LabellingError("Real source ad not found in this workspace.", 404);
    const ad = JSON.parse(row.data) as Ad;
    if (ad.source === "sample" || !safeHttps(ad.sourceUrl)) throw new LabellingError("Use a real ad with its original HTTPS source link.");
    return ad;
  }
  private storedReference(brandId: string, adId: string) {
    const row = this.db.prepare("SELECT data FROM video_media WHERE brand_id=? AND ad_id=? ORDER BY rowid DESC LIMIT 1").get(brandId, adId) as { data: string } | undefined;
    if (!row) return null;
    const media = JSON.parse(row.data);
    return typeof media.mediaId === "string" && /^[a-f0-9]{64}$/.test(media.mediaId) && typeof media.sha256 === "string" && /^[a-f0-9]{64}$/.test(media.sha256)
      ? { mediaId: media.mediaId as string, sha256: media.sha256 as string } : null;
  }
  private project(ad: Ad): BlindLabellingAd {
    const storedVideo = this.storedReference(ad.brandId, ad.id);
    // These are source container labels, not inferred creative classifications.
    // Historical public-library records only carry Video/Static image in format.
    // Dynamic creative can contain either and must never default to its thumbnail.
    const mediaType = (ad.mediaType || "").trim().toLowerCase();
    const sourceFormat = ad.source === "public" ? (ad.format || "").trim().toLowerCase() : "";
    const creativeKind: BlindLabellingAd["creativeKind"] = storedVideo || ad.videoMediaId || /^video(?:\/|$)/.test(mediaType) || sourceFormat === "video"
      ? "video" : /^(?:image(?:\/.+)?|photo|static image)$/.test(mediaType)
      ? "image" : sourceFormat === "static image" ? "image" : "unknown";
    const count = this.db.prepare("SELECT count(*) AS n FROM human_creative_labels WHERE brand_id=? AND ad_id=?").get(ad.brandId, ad.id) as { n: number };
    return {
      id: ad.id, brandId: ad.brandId, advertiser: ad.brand, platform: ad.platform, copy: ad.copy || "",
      sourceUrl: safeHttps(ad.sourceUrl), imageUrl: safeHttps(ad.image),
      creativeKind, isVideo: creativeKind === "video",
      partnershipAttribution: ad.source === "public" && ad.advertiserPageId && ad.brandedContentPartner ? ad.brandedContentPartner.name : null,
      storedVideo, completedReviews: count.n,
    };
  }
  queue(workspace: unknown, offset = 0, limit = 50) {
    const brandId = this.workspace(workspace);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200)
      throw new LabellingError("Choose a valid queue page.");
    const all = (this.db.prepare("SELECT data FROM ads WHERE brand_id=? AND source!='sample' ORDER BY id").all(brandId) as { data: string }[])
      .map(row => JSON.parse(row.data) as Ad).filter(ad => ad.source !== "sample" && safeHttps(ad.sourceUrl));
    return { schemaVersion: LABELLING_SCHEMA_VERSION, guideVersion: LABELLING_GUIDE_VERSION, guideStatus: "draft_for_review",
      items: all.slice(offset, offset + limit).map(ad => this.project(ad)), total: all.length, offset, limit };
  }
  async storeVideo(input: { brandId?: unknown; adId?: unknown; sourceVideoUrl?: unknown }) {
    const brandId = this.workspace(input.brandId);
    const ad = this.ad(brandId, input.adId);
    if (!this.options.video) throw new LabellingError("Video storage is unavailable.", 503);
    if (input.sourceVideoUrl !== undefined && (typeof input.sourceVideoUrl !== "string" || input.sourceVideoUrl.length > 10000))
      throw new LabellingError("Provide an approved HTTPS video URL.");
    // The existing media store validates hosts, public addresses, file type and duration.
    // Source download URLs remain in memory and are not returned by this API.
    try { await this.options.video.storeMedia(brandId, ad.id, input.sourceVideoUrl as string | undefined); }
    catch { throw new LabellingError("Video could not be retained. Check the hosted media configuration and a current approved source URL.", 409); }
    return this.project(this.ad(brandId, ad.id));
  }
  async start(input: { brandId?: unknown; adId?: unknown; labeller?: unknown }) {
    const brandId = this.workspace(input.brandId);
    const ad = this.ad(brandId, input.adId);
    const labeller = text(input.labeller, "labeller name", 120);
    const item = this.project(ad);
    if (item.creativeKind === "unknown") throw new LabellingError("The source does not establish the complete creative type. Dynamic creatives cannot be reviewed from a thumbnail. Retain the actual video or refresh source metadata to confirm a still image before labelling.", 409);
    if (item.creativeKind === "image" && !item.imageUrl) throw new LabellingError("The original creative is unavailable. Retain the video or provide its source image before labelling.", 409);
    let media = null;
    if (item.isVideo) {
      if (!item.storedVideo || !this.options.video) throw new LabellingError("Store the video on the hosted disk before starting a review.", 409);
      try { media = await this.options.video.storedMedia(brandId, ad.id, item.storedVideo.mediaId); }
      catch { throw new LabellingError("Stored video integrity could not be verified. Store it again before labelling.", 409); }
      if (!media || media.sha256 !== item.storedVideo.sha256) throw new LabellingError("Stored video is unavailable or changed. Store it again before labelling.", 409);
    }
    const session: SessionRecord = { id: randomUUID(), brandId, adId: ad.id, labeller, startedAt: this.now().toISOString(),
      mediaSha256: media?.sha256 || null, mediaId: media?.mediaId || null,
      guideVersion: LABELLING_GUIDE_VERSION, schemaVersion: LABELLING_SCHEMA_VERSION, sourceUrl: item.sourceUrl! };
    this.db.prepare("INSERT INTO labelling_sessions VALUES (?,?,?,?)").run(session.id, brandId, ad.id, JSON.stringify(session));
    // Deliberately return only the source projection, not prior human or model labels.
    return { session, ad: item };
  }
  submit(workspace: unknown, sessionId: unknown, input: { labels?: unknown; notes?: unknown }): HumanCreativeReview {
    const brandId = this.workspace(workspace);
    const id = text(sessionId, "review session identifier");
    const row = this.db.prepare("SELECT data FROM labelling_sessions WHERE id=? AND brand_id=?").get(id, brandId) as { data: string } | undefined;
    if (!row) throw new LabellingError("Review session not found in this workspace.", 404);
    if (this.db.prepare("SELECT id FROM human_creative_labels WHERE id=?").get(id)) throw new LabellingError("This review was already saved. Start a new review to record another judgement.", 409);
    let labels;
    try { labels = validateHumanCreativeLabels(input.labels); }
    catch (error) { throw new LabellingError((error as Error).message); }
    if (input.notes !== undefined && (typeof input.notes !== "string" || input.notes.length > 4000)) throw new LabellingError("Keep notes within 4,000 characters.");
    const session = JSON.parse(row.data) as SessionRecord;
    const now = this.now();
    const review: HumanCreativeReview = { ...session, labelledAt: now.toISOString(), elapsedSeconds: Math.max(0, Math.round((now.getTime() - Date.parse(session.startedAt)) / 1000)),
      labels, notes: typeof input.notes === "string" ? input.notes.trim() : "" };
    this.db.prepare("INSERT INTO human_creative_labels VALUES (?,?,?,?,?)").run(id, brandId, session.adId, review.labelledAt, JSON.stringify(review));
    return review;
  }
  export(workspace: unknown) {
    const brandId = this.workspace(workspace);
    const labels = (this.db.prepare("SELECT data FROM human_creative_labels WHERE brand_id=? ORDER BY labelled_at,rowid").all(brandId) as { data: string }[]).map(row => JSON.parse(row.data) as HumanCreativeReview);
    return { schemaVersion: LABELLING_SCHEMA_VERSION, guideVersion: LABELLING_GUIDE_VERSION, guideStatus: "draft_for_review",
      exportedAt: this.now().toISOString(), timingDefinition: "Server wall-clock seconds from starting the review to saving; includes pauses.",
      identityDefinition: "Video reviews bind the exact retained video SHA-256. Static reviews bind the source URL; static image bytes are not retained or hashed by this tool.", labels };
  }
}
