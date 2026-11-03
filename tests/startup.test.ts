import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { openDatabase } from "../server/db.js";
import { saveBrandResearch } from "../server/brand-research.js";
import caseData from "../shared/cases/valentte.json";
import captured from "../shared/cases/valentte-ads.json";
import type { BrandResearch } from "../shared/brand-research.js";

const repository = fileURLToPath(new URL("..", import.meta.url));
const fixtureAuth = `Basic ${Buffer.from("startup-fixture:startup-fixture-only").toString("base64")}`;

async function availablePort() {
  const socket = createServer();
  await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

function preparedDatabase(path: string) {
  const db = openDatabase(path, false);
  db.prepare("INSERT INTO metadata VALUES ('seeded',?)").run("startup-fixture");
  return db;
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise<void>(resolve => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await Promise.race([ended, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await ended; }
}

async function productionFixture(setup?: (path: string) => unknown) {
  const root = mkdtempSync(join(tmpdir(), "exter-startup-"));
  const path = join(root, "workspace.db");
  const initial = preparedDatabase(path); initial.close();
  const setupResult = setup?.(path);
  const port = await availablePort();
  const networkLog = join(root, "outbound-attempts.txt");
  const guard = join(root, "network-guard.mjs");
  // No source/model fetch can leave this isolated fixture, including under the
  // previous automatic-startup implementation that this test guards against.
  writeFileSync(guard, `import {appendFileSync} from "node:fs";
globalThis.fetch = async () => { appendFileSync(${JSON.stringify(networkLog)}, "attempt\\n"); throw new Error("Startup fixture blocks outbound fetches."); };
`);
  const env = { ...process.env };
  for (const name of ["DATABASE_URL", "GEMINI_API_KEY", "META_ACCESS_TOKEN", "APIFY_TOKEN", "YOUTUBE_API_KEY", "GEMINI_REQUEST_RESERVE_GBP"])
    delete env[name];
  Object.assign(env, {
    NODE_ENV: "production", RENDER: "true", RENDER_SERVICE_ID: "startup-fixture",
    EXTER_ADMIN_USER: "startup-fixture", EXTER_ADMIN_PASSWORD: "startup-fixture-only",
    PORT: String(port), EXTER_DB_PATH: path, EXTER_BACKUPS_ENABLED: "false",
    MEDIA_STORAGE_TYPE: "disk", MEDIA_STORAGE_PATH: join(root, "media"),
    CHROMIUM_PATH: join(root, "no-chromium-in-startup-fixture"),
  });
  const child = spawn(process.execPath, ["--import", guard, "--import", "tsx", "server/index.ts"], {
    cwd: repository, env, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout?.on("data", chunk => { stdout = (stdout + String(chunk)).slice(-16000); });
  child.stderr?.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-16000); });
  let spawnFailure: Error | null = null;
  child.on("error", error => { spawnFailure = error; });
  const base = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 20000;
    while (!stdout.includes("Exter AI available on port")) {
      if (spawnFailure) throw spawnFailure;
      assert.equal(child.exitCode, null, "Production entrypoint exited before opening its HTTP listener.");
      assert.equal(child.signalCode, null, "Production entrypoint was killed before opening its HTTP listener.");
      assert.ok(Date.now() < deadline, "Production entrypoint did not open its HTTP listener within the fixture deadline.");
      await delay(25);
    }
    return {
      root, path, child, setupResult, networkLog, stdout: () => stdout, stderr: () => stderr,
      get: (route: string, authenticated = true) => fetch(base + route, {
        headers: authenticated ? { authorization: fixtureAuth } : {}, signal: AbortSignal.timeout(5000),
      }),
      close: async () => { await stop(child); rmSync(root, { recursive: true, force: true }); },
    };
  } catch (error) { await stop(child); rmSync(root, { recursive: true, force: true }); throw error; }
}

test("the actual Render production entrypoint serves saved evidence without starting browsers, model fetches or automatic research", { timeout: 30000 }, async t => {
  const fixture = await productionFixture(path => {
    const db = new DatabaseSync(path);
    try {
      db.prepare("INSERT INTO metadata VALUES (?,?)").run("valentte-demo-website-refresh-v1", JSON.stringify({
        status: "running", brandId: "valentte", startedAt: "2026-11-03T00:00:00.000Z", attempts: 1,
      }));
    } finally { db.close(); }
  });
  try {
    assert.equal((await fixture.get("/api/health", false)).status, 401);
    const health = await fixture.get("/api/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).demoReconciliation, "complete");
    const ads = await fixture.get("/api/ads?brandId=valentte");
    assert.equal(ads.status, 200);
    const evidence = await ads.json();
    assert.equal(evidence.total, 58);
    assert.ok(evidence.items.every((ad: { source: string }) => ad.source === "public"));
    await delay(250);
    assert.equal((await fixture.get("/api/health")).status, 200, "The process remains responsive after startup tasks could have dispatched.");
    const db = new DatabaseSync(fixture.path, { readOnly: true });
    try {
      assert.equal(db.prepare("SELECT count(*) AS n FROM demo_competitor_runs").get()!.n, 0);
      const saved = db.prepare("SELECT value FROM metadata WHERE key='valentte-demo-website-refresh-v1'").get();
      const research = JSON.parse(String(saved!.value));
      assert.equal(research.status, "failed", "A stale running refresh is marked interrupted, never relaunched at boot.");
      assert.equal(research.attempts, 1, "Boot does not create another research attempt.");
      assert.equal(research.recoveredInterruptedAttempt, true);
    } finally { db.close(); }
    assert.equal(existsSync(fixture.networkLog), false, "Boot must not dispatch any website or model fetch.");
    if (process.platform === "linux") {
      const status = readFileSync(`/proc/${fixture.child.pid}/status`, "utf8");
      const maps = readFileSync(`/proc/${fixture.child.pid}/maps`, "utf8");
      assert.doesNotMatch(maps, /onnxruntime_binding|libonnxruntime|onnxruntime_providers/, "Production boot must not load native local model sessions.");
      const rss = Number(/^VmRSS:\s+(\d+) kB$/m.exec(status)?.[1]);
      if (Number.isFinite(rss)) t.diagnostic(`Production-entrypoint RSS after serving saved evidence: ${Math.round(rss / 1024)} MiB (diagnostic only).`);
    }
  } finally { await fixture.close(); }
});

test("legacy optional research preparation failure leaves the production server available and preserves original records", { timeout: 30000 }, async () => {
  const fixture = await productionFixture(path => {
    const db = new DatabaseSync(path);
    try {
      for (const brand of [caseData.brand, { ...caseData.brand, id: "valentte" }])
        db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
      const ad = captured.ads[0];
      const originalAd = JSON.stringify(ad);
      db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(ad.id, ad.brandId, ad.source, ad.platform, ad.publishedAt, originalAd);
      const legacy = { ...caseData.research, brandId: caseData.brand.id, observedAt: "2026-11-03T00:00:00.000Z",
        adLibraryEvidence: { observedAt: "2026-10-30T00:00:00.000Z" } };
      saveBrandResearch(db, legacy as unknown as BrandResearch);
      return { originalAd, originalResearch: JSON.stringify(legacy), adId: ad.id };
    } finally { db.close(); }
  });
  try {
    const health = await fixture.get("/api/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).demoReconciliation, "unavailable");
    await delay(250);
    assert.equal((await fixture.get("/api/health")).status, 200);
    const db = new DatabaseSync(fixture.path, { readOnly: true });
    try {
      const original = fixture.setupResult as { originalAd: string; originalResearch: string; adId: string };
      assert.equal(db.prepare("SELECT data FROM ads WHERE id=?").get(original.adId)!.data, original.originalAd);
      assert.equal(db.prepare("SELECT data FROM brand_research WHERE brand_id=?").get(caseData.brand.id)!.data, original.originalResearch);
      assert.equal(db.prepare("SELECT count(*) AS n FROM ads").get()!.n, 1, "Failed preparation rolls its partial import back.");
    } finally { db.close(); }
    assert.equal(existsSync(fixture.networkLog), false);
    assert.doesNotMatch(fixture.stderr(), /Cannot read properties|\.map|TypeError/, "Only a sanitised preparation status should be logged.");
  } finally { await fixture.close(); }
});
