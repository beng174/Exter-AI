// Disposable PostgreSQL only. HTTP is limited to a loopback fixture broker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import pg from "pg";
import source from "../shared/cases/valentte-ads.json";
import caseData from "../shared/cases/valentte.json";
import type { Ad, Brand } from "../shared/types.js";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { migrate } from "../server/infrastructure/database.js";
import { reconcileValentteWorkspace, resolveDemoBrandId } from "../server/demo/reconcile.js";
import { VideoAnalysisService } from "../server/video/service.js";
import { LocalVideoMediaStore } from "../server/video/media.js";
import { KernelMediaBroker, attachKernelArtifactDownload } from "../server/kernel/broker.js";
import { attachKernelJobs } from "../server/kernel/jobs-api.js";
import { DiskKernelArtifactStore, KernelArtifactBrokerClient } from "../server/kernel/artifacts.js";
import { workKernelOnce } from "../server/kernel/worker.js";

test("authenticated HTTP enqueue transfers a real retained alias file through the broker into the isolated worker cache", async () => {
  assert.ok(process.env.TEST_DATABASE_URL, "Use a dedicated disposable TEST_DATABASE_URL.");
  const connectionString = process.env.TEST_DATABASE_URL, schema = `kernel_http_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString }), root = await mkdtemp(join(tmpdir(), "exter-kernel-http-"));
  const db = openDatabase(":memory:", false);
  let pool: pg.Pool | undefined, server: ReturnType<typeof createServer> | undefined;
  const token = "fixture-broker-token-012345678901234567890123456789";
  const previous = { token: process.env.EXTER_ARTIFACT_BROKER_TOKEN, workspaces: process.env.EXTER_ARTIFACT_BROKER_WORKSPACES };
  process.env.EXTER_ARTIFACT_BROKER_TOKEN = token;
  process.env.EXTER_ARTIFACT_BROKER_WORKSPACES = "valentte";
  try {
    await migrate(admin);
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString, options: `-c search_path=${schema},public` });
    await migrate(pool);
    const legacy = { ...(caseData.brand as Brand), mode: "imported" as const };
    for (const brand of [{ ...legacy, id: "valentte" }, legacy])
      db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
    const ad = { ...(source.ads[0] as Ad), brandId: legacy.id };
    db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
    const bytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42kernel-http-fixture")]);
    let downloads = 0, probes = 0, inference = 0, normalisation = 0;
    const mediaStore = new LocalVideoMediaStore({ root: join(root, "web-retained-media"), allowedHosts: ["media.example"],
      resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      fetch: async () => { downloads++; return new Response(bytes, { headers: { "Content-Type": "video/mp4" } }); },
      probe: async () => { probes++; return { hasVideo: true, durationSeconds: 8 }; },
    });
    const videos = new VideoAnalysisService(db, { mediaStore,
      analyserFactory: () => { inference++; throw new Error("Staging must not infer"); },
      normalizeMedia: async () => { normalisation++; throw new Error("Staging must not normalise"); },
    });
    const retained = await mediaStore.store({ brandId: ad.brandId, adId: ad.id, sourceUrl: "https://media.example/video.mp4" });
    db.prepare("INSERT INTO video_media VALUES (?,?,?,?)").run(retained.mediaId, ad.brandId, ad.id, JSON.stringify(retained));
    reconcileValentteWorkspace(db);
    downloads = 0; probes = 0;
    const broker = new KernelMediaBroker(db, { video: () => videos, images: () => ({ storedMedia: async () => null }) });
    const app = express();
    attachKernelArtifactDownload(app, broker);
    app.use(basicAuth({ EXTER_ADMIN_USER: "kernel-fixture", EXTER_ADMIN_PASSWORD: "fixture-only-password" }));
    app.use(express.json());
    attachKernelJobs(app, broker, id => resolveDemoBrandId(db, id), () => pool!);
    server = createServer(app);
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = { Authorization: `Basic ${Buffer.from("kernel-fixture:fixture-only-password").toString("base64")}`, "Content-Type": "application/json" };
    const input = { workspaceId: legacy.id, adId: ad.providerAdId!, kind: "video" };
    const queuedResponse = await fetch(base + "/api/kernel/jobs", { method: "POST", headers, body: JSON.stringify(input) });
    assert.equal(queuedResponse.status, 202);
    const queued = await queuedResponse.json();
    assert.equal(queued.status, "queued");
    assert.equal(queued.scope.workspaceId, "valentte");
    assert.equal(queued.scope.nativeAdId, ad.providerAdId);
    assert.equal(queued.artifact.sha256, retained.sha256);

    const cache = new DiskKernelArtifactStore({ root: join(root, "worker-private-cache") });
    let transfers = 0;
    const client = new KernelArtifactBrokerClient({ origin: "https://broker.example", token, store: cache,
      fetch: async (target, init) => {
        const url = new URL(String(target));
        assert.equal(url.origin, "https://broker.example");
        assert.equal(init?.redirect, "error");
        assert.equal(new Headers(init?.headers).has("Authorization"), false);
        transfers++;
        // Bridge this fixed fixture origin to the actual authenticated loopback broker.
        return fetch(base + url.pathname, init);
      },
    });
    assert.equal(await workKernelOnce(pool, client), true);
    const completedResponse = await fetch(`${base}/api/kernel/jobs/${queued.id}?workspaceId=${encodeURIComponent(legacy.id)}`, { headers });
    assert.equal(completedResponse.status, 200);
    const complete = await completedResponse.json();
    assert.equal(complete.status, "complete");
    assert.equal(complete.result.stage, "media-ready");
    assert.deepEqual(complete.result.artifact, queued.artifact);
    const stored = await cache.load(complete.result.artifact);
    assert.ok(stored);
    assert.notEqual(stored.absolutePath, retained.absolutePath);
    assert.deepEqual(await readFile(stored.absolutePath), bytes);
    assert.equal(transfers, 1);

    const repeatedResponse = await fetch(base + "/api/kernel/jobs", { method: "POST", headers, body: JSON.stringify({ ...input, workspaceId: "valentte" }) });
    assert.equal(repeatedResponse.status, 202);
    const repeated = await repeatedResponse.json();
    assert.equal(repeated.id, queued.id);
    assert.equal(repeated.status, "complete");
    assert.equal(await workKernelOnce(pool, client), false);
    assert.equal((await fetch(`${base}/api/kernel/jobs/${queued.id}?workspaceId=unrelated`, { headers })).status, 404);
    for (const value of [queued, complete, repeated]) {
      const serialised = JSON.stringify(value);
      assert.equal(serialised.includes(root), false);
      assert.equal(serialised.includes(token), false);
      assert.equal(serialised.includes("absolutePath"), false);
      assert.equal(serialised.includes("sourceUrl"), false);
    }
    assert.deepEqual({ downloads, probes, normalisation, inference }, { downloads: 0, probes: 0, normalisation: 0, inference: 0 });
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM cost_ledger")).rows[0].n, 0);
  } finally {
    if (server?.listening) await new Promise<void>(resolve => server!.close(() => resolve()));
    db.close();
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await rm(root, { recursive: true, force: true });
    if (previous.token === undefined) delete process.env.EXTER_ARTIFACT_BROKER_TOKEN; else process.env.EXTER_ARTIFACT_BROKER_TOKEN = previous.token;
    if (previous.workspaces === undefined) delete process.env.EXTER_ARTIFACT_BROKER_WORKSPACES; else process.env.EXTER_ARTIFACT_BROKER_WORKSPACES = previous.workspaces;
  }
});
