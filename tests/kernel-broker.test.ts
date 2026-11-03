import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import source from "../shared/cases/valentte-ads.json";
import caseData from "../shared/cases/valentte.json";
import type { Ad, Brand } from "../shared/types.js";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { createApp } from "../server/app.js";
import { LocalVideoMediaStore } from "../server/video/media.js";
import { LocalImageMediaStore } from "../server/image/media.js";
import { VideoAnalysisService } from "../server/video/service.js";
import { ImageAnalysisService } from "../server/image/service.js";
import { reconcileValentteWorkspace } from "../server/demo/reconcile.js";
import { artifactBrokerConfiguration, attachKernelArtifactDownload, KernelMediaBroker } from "../server/kernel/broker.js";

const token = "fixture-broker-" + "x".repeat(40);
const admin = { EXTER_ADMIN_USER: "kernel-fixture", EXTER_ADMIN_PASSWORD: "fixture-only-password" };
const configured = { EXTER_ARTIFACT_BROKER_TOKEN: token, EXTER_ARTIFACT_BROKER_WORKSPACES: "valentte" };
const machineHeaders = { "X-Exter-Artifact-Token": token };
const adminHeaders = { Authorization: `Basic ${Buffer.from(`${admin.EXTER_ADMIN_USER}:${admin.EXTER_ADMIN_PASSWORD}`).toString("base64")}` };
const videoBytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42fixture-retained-video")]);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU6sAAAAASUVORK5CYII=", "base64");

async function retainedFixture() {
  const root = await mkdtemp(join(tmpdir(), "exter-kernel-broker-")), db = openDatabase(":memory:", false);
  const aliasBrand = { ...(caseData.brand as Brand), mode: "imported" as const };
  const canonical = { ...aliasBrand, id: "valentte" };
  for (const brand of [canonical, aliasBrand]) db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
  const ads = (source.ads as Ad[]).slice(0, 3).map(ad => ({ ...ad, brandId: aliasBrand.id }));
  for (const ad of ads) db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, JSON.stringify(ad));
  const calls = { downloads: 0, probes: 0, normalisation: 0, inference: 0 };
  const videos = new VideoAnalysisService(db, {
    mediaStore: new LocalVideoMediaStore({ root: join(root, "web-retained-media"), allowedHosts: ["media.example"],
      resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      fetch: async () => { calls.downloads++; return new Response(videoBytes, { headers: { "Content-Type": "video/mp4" } }); },
      probe: async () => { calls.probes++; return { hasVideo: true, durationSeconds: 12 }; },
    }),
    analyserFactory: () => { calls.inference++; throw new Error("Broker must not infer"); },
    normalizeMedia: async () => { calls.normalisation++; throw new Error("Broker must not normalise"); },
  });
  const images = new ImageAnalysisService(db, {
    mediaStore: new LocalImageMediaStore({ root: join(root, "web-retained-media"), allowedHosts: ["media.example"],
      resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      fetch: async target => { calls.downloads++; return new Response(String(target).endsWith("two.png") ? Buffer.concat([png, Buffer.from([0])]) : png, { headers: { "Content-Type": "image/png" } }); },
      probe: async () => { calls.probes++; return { width: 1, height: 1 }; },
    }),
    analyserFactory: () => { calls.inference++; throw new Error("Broker must not infer"); },
  });
  const video = await videos.mediaStore.store({ brandId: aliasBrand.id, adId: ads[0].id, sourceUrl: "https://media.example/video.mp4" });
  db.prepare("INSERT INTO video_media VALUES (?,?,?,?)").run(video.mediaId, aliasBrand.id, ads[0].id, JSON.stringify(video));
  const carousel = await images.storeMedia(aliasBrand.id, ads[1].id, ["https://media.example/one.png", "https://media.example/two.png"], "carousel");
  const image = await images.storeMedia(aliasBrand.id, ads[2].id, ["https://media.example/one.png"], "image");
  reconcileValentteWorkspace(db);
  Object.assign(calls, { downloads: 0, probes: 0, normalisation: 0, inference: 0 });
  const broker = new KernelMediaBroker(db, { video: () => videos, images: () => images });
  return { root, db, ads, aliasBrand, video, image, carousel, videos, images, broker, calls,
    close: async () => { db.close(); await rm(root, { recursive: true, force: true }); } };
}
async function withServer(app: express.Express, run: (base: string) => Promise<void>) {
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
function standalone(broker: KernelMediaBroker, env: Record<string, string | undefined> = configured) {
  const app = express();
  attachKernelArtifactDownload(app, broker, env);
  app.use(basicAuth(admin));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/kernel/status", (_req, res) => res.json({ enabled: false }));
  return app;
}
function noWork(calls: Awaited<ReturnType<typeof retainedFixture>>["calls"]) {
  assert.deepEqual(calls, { downloads: 0, probes: 0, normalisation: 0, inference: 0 });
}

test("broker registers verified legacy Valentte video under canonical workspace without downloading or inference", async () => {
  const f = await retainedFixture();
  try {
    const record = await f.broker.register({ workspaceId: "valentte", adId: f.ads[0].providerAdId!, kind: "video" });
    assert.deepEqual(record.scope, { workspaceId: "valentte", platform: "meta", nativeAdId: f.ads[0].providerAdId });
    assert.equal(record.source.brandId, f.aliasBrand.id);
    assert.equal(record.ref.sha256, f.video.sha256);
    assert.equal(record.ref.bytes, videoBytes.length);
    assert.equal(record.ref.workspaceId, "valentte");
    assert.equal(JSON.stringify(record).includes(f.root), false);
    assert.equal(JSON.stringify(record).includes("absolutePath"), false);
    const alias = await f.broker.register({ workspaceId: f.aliasBrand.id, adId: f.ads[0].id, kind: "video" });
    assert.deepEqual(alias.ref, record.ref);
    assert.equal((await f.broker.resolve("valentte", record.ref.artifactId)).absolutePath, f.video.absolutePath);
    await assert.rejects(f.broker.resolve(f.aliasBrand.id, record.ref.artifactId), /not found/);
    await assert.rejects(f.broker.register({ workspaceId: "unrelated", adId: f.ads[0].id, kind: "video" }), /real Meta or TikTok/);
    noWork(f.calls);
  } finally { await f.close(); }
});

test("broker uses individual image hashes for static ads and every carousel slide", async () => {
  const f = await retainedFixture();
  try {
    const first = await f.broker.register({ workspaceId: "valentte", adId: f.ads[1].providerAdId!, kind: "carousel", imageIndex: 0 });
    const second = await f.broker.register({ workspaceId: "valentte", adId: f.ads[1].providerAdId!, kind: "carousel", imageIndex: 1 });
    assert.equal(first.ref.sha256, f.carousel.images[0].sha256);
    assert.equal(second.ref.sha256, f.carousel.images[1].sha256);
    assert.notEqual(first.ref.sha256, f.carousel.sha256);
    assert.notEqual(second.ref.artifactId, first.ref.artifactId);
    assert.equal(second.ref.bytes, png.length + 1);
    const image = await f.broker.register({ workspaceId: "valentte", adId: f.ads[2].providerAdId!, kind: "image" });
    assert.equal(image.ref.sha256, f.image.images[0].sha256);
    assert.equal((await f.broker.resolve("valentte", second.ref.artifactId)).absolutePath, f.carousel.images[1].absolutePath);
    await withServer(standalone(f.broker), async base => {
      for (const [record, expected] of [[first, png], [second, Buffer.concat([png, Buffer.from([0])])], [image, png]] as const) {
        const response = await fetch(`${base}/api/kernel/artifacts/valentte/${record.ref.artifactId}`, { headers: machineHeaders });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "image/png");
        assert.equal(response.headers.get("x-exter-content-sha256"), record.ref.sha256);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
      }
    });
    await assert.rejects(f.broker.register({ workspaceId: "valentte", adId: f.ads[1].providerAdId!, kind: "carousel", imageIndex: 2 }), /No verified/);
    await assert.rejects(f.broker.register({ workspaceId: "valentte", adId: f.ads[2].providerAdId!, kind: "image", imageIndex: 1 }), /valid slide/);
    noWork(f.calls);
  } finally { await f.close(); }
});

test("machine token permits only exact GET artifact download, with workspace allowlist and isolated BasicAuth", async () => {
  const f = await retainedFixture();
  try {
    const record = await f.broker.register({ workspaceId: "valentte", adId: f.ads[0].providerAdId!, kind: "video" });
    const path = `/api/kernel/artifacts/valentte/${record.ref.artifactId}`;
    await withServer(standalone(f.broker), async base => {
      const response = await fetch(base + path, { headers: machineHeaders });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-length"), String(videoBytes.length));
      assert.equal(response.headers.get("x-exter-content-sha256"), f.video.sha256);
      assert.match(response.headers.get("cache-control") || "", /private.*no-store/);
      assert.equal(response.headers.get("content-type"), "video/mp4");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), videoBytes);
      for (const headers of [new Headers(), new Headers(adminHeaders), new Headers({ "X-Exter-Artifact-Token": "wrong-fixture-token" })]) {
        assert.equal((await fetch(base + path, { headers })).status, 401);
      }
      for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
        const denied = await fetch(base + path, { method, headers: machineHeaders });
        assert.equal(denied.status, 405);
        assert.equal(denied.headers.get("allow"), "GET");
      }
      assert.equal((await fetch(base + path.replace("/valentte/", "/unrelated/"), { headers: machineHeaders })).status, 404);
      for (const other of ["/api/health", "/api/kernel/status", "/api/kernel/artifacts-other/valentte/id", path + "/extra"]) {
        assert.equal((await fetch(base + other, { headers: machineHeaders })).status, 401);
      }
      assert.equal((await fetch(base + "/api/health", { headers: adminHeaders })).status, 200);
    });
    noWork(f.calls);
  } finally { await f.close(); }
});

test("unconfigured broker never grants machine access even with otherwise correct token or admin credentials", async () => {
  const f = await retainedFixture();
  try {
    assert.equal(artifactBrokerConfiguration({}).configured, false);
    assert.equal(artifactBrokerConfiguration({ ...configured, EXTER_ARTIFACT_BROKER_WORKSPACES: "" }).configured, false);
    assert.equal(artifactBrokerConfiguration({ ...configured, EXTER_ARTIFACT_BROKER_TOKEN: "short" }).configured, false);
    await withServer(standalone(f.broker, {}), async base => {
      const response = await fetch(`${base}/api/kernel/artifacts/valentte/${"0".repeat(64)}`, { headers: { ...adminHeaders, ...machineHeaders } });
      assert.equal(response.status, 401);
      const json = await response.text();
      assert.equal(json.includes(token), false);
      assert.equal(json.includes(f.root), false);
    });
  } finally { await f.close(); }
});

test("broker returns controlled integrity errors for changed hashes and lengths without exposing files or credentials", async () => {
  const f = await retainedFixture();
  try {
    const record = await f.broker.register({ workspaceId: "valentte", adId: f.ads[0].providerAdId!, kind: "video" });
    await withServer(standalone(f.broker), async base => {
      const path = `/api/kernel/artifacts/valentte/${record.ref.artifactId}`;
      for (const bytes of [Buffer.alloc(videoBytes.length, 0), Buffer.from("truncated")]) {
        await writeFile(f.video.absolutePath, bytes);
        const response = await fetch(base + path, { headers: machineHeaders });
        assert.equal(response.status, 409);
        const text = await response.text();
        assert.equal(text.includes(f.root), false);
        assert.equal(text.includes(token), false);
        assert.deepEqual(JSON.parse(text), { error: "Retained artifact could not be verified." });
      }
    });
    noWork(f.calls);
  } finally { await f.close(); }
});

test("actual app mounts machine artifact route before BasicAuth while all normal routes retain web authentication", async () => {
  const f = await retainedFixture();
  const replacements = { ...admin, ...configured }, old = Object.fromEntries(Object.keys(replacements).map(key => [key, process.env[key]]));
  Object.assign(process.env, replacements);
  try {
    const record = await f.broker.register({ workspaceId: "valentte", adId: f.ads[0].providerAdId!, kind: "video" });
    const app = createApp(f.db);
    app.locals.videoAnalysis = f.videos;
    app.locals.geminiSmoke.images = f.images;
    await withServer(app, async base => {
      const download = await fetch(`${base}/api/kernel/artifacts/valentte/${record.ref.artifactId}`, { headers: machineHeaders });
      assert.equal(download.status, 200);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), videoBytes);
      assert.equal((await fetch(base + "/api/health", { headers: machineHeaders })).status, 401);
      assert.equal((await fetch(base + "/api/kernel/status", { headers: machineHeaders })).status, 401);
      assert.equal((await fetch(base + "/api/kernel/status", { headers: adminHeaders })).status, 200);
      assert.equal((await fetch(`${base}/api/kernel/artifacts/valentte/${record.ref.artifactId}/extra`, { headers: machineHeaders })).status, 401);
      const request = { workspaceId: "valentte", adId: f.ads[0].providerAdId!, kind: "video" };
      const jsonHeaders = { ...adminHeaders, "Content-Type": "application/json" };
      assert.equal((await fetch(base + "/api/kernel/jobs", { method: "POST", headers: machineHeaders })).status, 401);
      assert.equal((await fetch(base + "/api/kernel/jobs", { method: "POST", headers: { ...jsonHeaders, Origin: "https://foreign.example" }, body: JSON.stringify(request) })).status, 403);
      assert.equal((await fetch(base + "/api/kernel/jobs", { method: "POST", headers: { ...adminHeaders, "Content-Type": "text/plain" }, body: JSON.stringify(request) })).status, 415);
      for (const extra of [{ absolutePath: "/private/worker-input.mp4" }, { sourceUrl: "https://untrusted.example/video.mp4" }, { pipelineVersion: "exter-extracted-labels-v1" }]) {
        assert.equal((await fetch(base + "/api/kernel/jobs", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...request, ...extra }) })).status, 400);
      }
      // Missing broker scope rejects before touching PostgreSQL or registering another export.
      delete process.env.EXTER_ARTIFACT_BROKER_WORKSPACES;
      const unavailable = await fetch(base + "/api/kernel/jobs", { method: "POST", headers: jsonHeaders, body: JSON.stringify(request) });
      assert.equal(unavailable.status, 409);
      const unavailableBody = await unavailable.text();
      assert.equal(unavailableBody.includes(f.root), false);
      assert.equal(unavailableBody.includes(token), false);
    });
    noWork(f.calls);
  } finally {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await f.close();
  }
});
