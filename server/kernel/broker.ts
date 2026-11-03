import { createHash, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import type { StoredVideo } from "../video/types.js";
import type { StoredImageCreative } from "../../shared/image-analysis.js";
import { resolveDemoBrandId, workspaceAd, workspaceAdAliases } from "../demo/reconcile.js";
import { createKernelArtifactRef, validateKernelArtifactRef, type KernelArtifactRef } from "./artifacts.js";

type Environment = Record<string, string | undefined>;
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const digest = (value: string) => createHash("sha256").update(value).digest();
const key = (artifactId: string) => `kernel-artifact-export:${artifactId}`;

export function artifactBrokerConfiguration(env: Environment = process.env) {
  const token = env.EXTER_ARTIFACT_BROKER_TOKEN;
  const workspaces = (env.EXTER_ARTIFACT_BROKER_WORKSPACES || "").split(",").map(value => value.trim()).filter(Boolean);
  const configured = Boolean(token && /^[A-Za-z0-9_-]{32,256}$/.test(token) && workspaces.length && workspaces.length <= 50 && workspaces.every(identifier));
  return { configured, workspaces: new Set(configured ? workspaces : []) };
}

export class KernelBrokerError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
interface Source {
  brandId: string;
  adId: string;
  mediaId: string;
  kind: "video" | "image" | "carousel";
  imageIndex?: number;
}
interface ExportRecord {
  ref: KernelArtifactRef;
  scope: { workspaceId: string; platform: "meta" | "tiktok"; nativeAdId: string };
  source: Source;
}
interface BrokerOptions {
  video: () => { storedMedia(brandId: string, adId: string, mediaId: string): Promise<StoredVideo | null> };
  images: () => { storedMedia(brandId: string, adId: string, mediaId: string): Promise<StoredImageCreative | null> };
}

/** Explicitly registers existing retained media. Never downloads or normalises a file. */
export class KernelMediaBroker {
  constructor(private readonly db: DatabaseSync, private readonly options: BrokerOptions) {}

  private async sourceFile(source: Source) {
    if (source.kind === "video") return this.options.video().storedMedia(source.brandId, source.adId, source.mediaId);
    const creative = await this.options.images().storedMedia(source.brandId, source.adId, source.mediaId);
    if (!creative || creative.kind !== source.kind || !Number.isSafeInteger(source.imageIndex)) return null;
    return creative.images[source.imageIndex!];
  }

  async register(input: { workspaceId: string; adId: string; kind: "video" | "image" | "carousel"; mediaId?: string; imageIndex?: number }): Promise<ExportRecord> {
    if (!identifier(input.workspaceId) || !identifier(input.adId) || !["video", "image", "carousel"].includes(input.kind) ||
      input.mediaId !== undefined && !/^[a-f0-9]{64}$/.test(input.mediaId) ||
      input.imageIndex !== undefined && (!Number.isSafeInteger(input.imageIndex) || input.imageIndex < 0 || input.imageIndex > 9) ||
      input.kind === "video" && input.imageIndex !== undefined || input.kind === "image" && (input.imageIndex ?? 0) !== 0)
      throw new KernelBrokerError("Choose an existing retained creative and valid slide index.");
    const workspaceId = resolveDemoBrandId(this.db, input.workspaceId), ad = workspaceAd(this.db, workspaceId, input.adId);
    if (!ad || ad.source === "sample" || !["Meta", "TikTok"].includes(ad.platform))
      throw new KernelBrokerError("A real Meta or TikTok ad is required in this workspace.", 404);
    const platform = ad.platform === "Meta" ? "meta" : "tiktok";
    const aliases = workspaceAdAliases(this.db, workspaceId, input.adId);
    for (const alias of aliases) {
      if (!/^\d{1,40}$/.test(alias.nativeId)) continue;
      const table = input.kind === "video" ? "video_media" : "image_media";
      if (!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
      const rows = this.db.prepare(`SELECT id FROM ${table} WHERE brand_id=? AND ad_id=? ORDER BY rowid DESC`).all(alias.brandId, alias.adId) as { id: string }[];
      for (const row of rows) {
        if (input.mediaId && row.id !== input.mediaId) continue;
        const source: Source = { brandId: alias.brandId, adId: alias.adId, mediaId: row.id, kind: input.kind,
          ...(input.kind === "video" ? {} : { imageIndex: input.imageIndex ?? 0 }) };
        let file;
        try { file = await this.sourceFile(source); } catch { continue; }
        if (!file) continue;
        const ref = createKernelArtifactRef({ workspaceId, sha256: file.sha256, bytes: file.bytes, mimeType: file.mimeType });
        const record: ExportRecord = { ref, scope: { workspaceId, platform, nativeAdId: alias.nativeId }, source };
        // Immutable source linkage is local; PostgreSQL jobs contain only the portable ref.
        this.db.prepare("INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING").run(key(ref.artifactId), JSON.stringify(record));
        return record;
      }
    }
    throw new KernelBrokerError("No verified retained file exists for this creative. Prepare its media first.", 404);
  }

  async resolve(workspaceId: string, artifactId: string) {
    if (!identifier(workspaceId) || !/^[a-f0-9]{64}$/.test(artifactId)) throw new KernelBrokerError("Artifact not found.", 404);
    const row = this.db.prepare("SELECT value FROM metadata WHERE key=?").get(key(artifactId)) as { value: string } | undefined;
    if (!row || row.value.length > 5000) throw new KernelBrokerError("Artifact not found.", 404);
    let record: ExportRecord;
    try {
      record = JSON.parse(row.value);
      const ref = validateKernelArtifactRef(record.ref);
      if (ref.workspaceId !== workspaceId || ref.artifactId !== artifactId || record.scope.workspaceId !== workspaceId ||
        !["meta", "tiktok"].includes(record.scope.platform) || !/^\d{1,40}$/.test(record.scope.nativeAdId)) throw new Error();
      const ad = workspaceAd(this.db, workspaceId, record.scope.nativeAdId);
      if (!ad || ad.source === "sample" || ad.platform.toLowerCase() !== record.scope.platform ||
        !workspaceAdAliases(this.db, workspaceId, record.scope.nativeAdId).some(alias => alias.brandId === record.source.brandId && alias.adId === record.source.adId && alias.nativeId === record.scope.nativeAdId)) throw new Error();
    } catch { throw new KernelBrokerError("Artifact not found in this workspace.", 404); }
    let file;
    try { file = await this.sourceFile(record.source); } catch { throw new KernelBrokerError("Retained artifact could not be verified.", 409); }
    if (!file || file.sha256 !== record.ref.sha256 || file.bytes !== record.ref.bytes || file.mimeType !== record.ref.mimeType)
      throw new KernelBrokerError("Retained artifact could not be verified.", 409);
    return { ref: record.ref, absolutePath: file.absolutePath };
  }
}

/** This exact machine route has its own authentication; it grants no app access. */
export function attachKernelArtifactDownload(app: Express, broker: KernelMediaBroker, env: Environment = process.env) {
  app.all("/api/kernel/artifacts/:workspaceId/:artifactId", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const configuration = artifactBrokerConfiguration(env), supplied = req.get("X-Exter-Artifact-Token") || "";
    if (!configuration.configured || !timingSafeEqual(digest(supplied), digest(env.EXTER_ARTIFACT_BROKER_TOKEN || ""))) {
      res.status(401).json({ error: "Artifact service authentication required." }); return;
    }
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); res.status(405).json({ error: "Use GET for artifact retrieval." }); return; }
    if (!configuration.workspaces.has(String(req.params.workspaceId))) { res.status(404).json({ error: "Artifact not found." }); return; }
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const saved = await broker.resolve(String(req.params.workspaceId), String(req.params.artifactId));
      handle = await open(saved.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== saved.ref.bytes) throw new KernelBrokerError("Retained artifact could not be verified.", 409);
      res.setHeader("Content-Type", saved.ref.mimeType);
      res.setHeader("Content-Length", saved.ref.bytes);
      res.setHeader("X-Exter-Content-Sha256", saved.ref.sha256);
      await pipeline(handle.createReadStream({ autoClose: false }), res);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) res.status(error instanceof KernelBrokerError ? error.status : 503).json({ error: error instanceof KernelBrokerError ? error.message : "Artifact retrieval is unavailable." });
      else res.destroy();
    } finally { await handle?.close().catch(() => {}); }
  });
}
