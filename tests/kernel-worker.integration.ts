// Only a dedicated disposable PostgreSQL database; all HTTP is a fixture adapter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { migrate } from "../server/infrastructure/database.js";
import { DiskKernelArtifactStore, KernelArtifactBrokerClient, createKernelArtifactRef } from "../server/kernel/artifacts.js";
import { enqueueKernelJob, readKernelJob, resumeKernelJob, cancelKernelJob } from "../server/kernel/jobs.js";
import { workKernelOnce, configuredKernelArtifactClient, ARTIFACT_STAGE_PIPELINE } from "../server/kernel/worker.js";

test("worker stages media in its own cache with fenced cancellation, pause and retry recovery", async t => {
  assert.ok(process.env.TEST_DATABASE_URL, "Use a dedicated disposable TEST_DATABASE_URL.");
  const connectionString = process.env.TEST_DATABASE_URL, schema = `kernel_worker_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString }), root = await mkdtemp(join(tmpdir(), "exter-worker-test-"));
  let pool: pg.Pool | undefined;
  const bytes = Buffer.from("worker media fixture"), sha256 = createHash("sha256").update(bytes).digest("hex");
  const ref = createKernelArtifactRef({ workspaceId: "worker-workspace", sha256, bytes: bytes.length, mimeType: "video/mp4" });
  try {
    await migrate(admin); await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString, options: `-c search_path=${schema},public` });
    await migrate(pool);
    const db = pool;
    const enqueue = (name: string, pipelineVersion = ARTIFACT_STAGE_PIPELINE) => enqueueKernelJob(db, { scope: { workspaceId: ref.workspaceId, platform: "meta", nativeAdId: "7000000000000000001" },
      artifact: ref, pipelineVersion, config: { stage: "stage-media" }, contextHash: createHash("sha256").update(name).digest("hex") });
    const store = (name: string) => new DiskKernelArtifactStore({ root: join(root, name) });
    const client = (cache: DiskKernelArtifactStore, fetcher: typeof fetch) => new KernelArtifactBrokerClient({ origin: "https://broker.example", token: "fixture-token-not-real-01234567890123456789", store: cache, fetch: fetcher });
    const response = () => new Response(bytes, { headers: { "Content-Type": ref.mimeType, "Content-Length": String(bytes.length), "X-Exter-Content-Sha256": sha256 } });

    await t.test("default configuration starts no kernel work and requires an explicit separate cache", () => {
      assert.equal(configuredKernelArtifactClient({}), null);
      assert.equal(configuredKernelArtifactClient({ EXTER_KERNEL_WORKER_ENABLED: "false", EXTER_ARTIFACT_BROKER_ORIGIN: "invalid" }), null);
      assert.throws(() => configuredKernelArtifactClient({ EXTER_KERNEL_WORKER_ENABLED: "true" }), /separate cache/);
    });
    await t.test("a successful staged job retains only portable refs and matching repeated work reuses the cache", async () => {
      let calls = 0;
      const cache = store("success"), transport = client(cache, async () => { calls++; return response(); });
      const queued = await enqueue("first");
      assert.equal(await workKernelOnce(db, transport), true);
      const saved = await readKernelJob(db, queued.id, ref.workspaceId);
      assert.equal(saved!.status, "complete"); assert.equal(saved!.result!.stage, "media-ready");
      assert.deepEqual(await readFile((await cache.load(ref))!.absolutePath), bytes);
      assert.ok(!JSON.stringify(saved).includes(root));
      assert.equal((await enqueue("first")).id, queued.id);
      assert.equal(await workKernelOnce(db, transport), false);
      await enqueue("different-context"); await workKernelOnce(db, transport);
      assert.equal(calls, 1, "verified cache reuse avoids a second transfer");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM cost_ledger")).rows[0].n, 0, "staging never reserves inference or calls a provider");
    });
    await t.test("unsupported pipeline jobs cannot accidentally dispatch an unimplemented extractor", async () => {
      const queued = await enqueue("unsupported", "exter-extracted-labels-v1");
      assert.equal(await workKernelOnce(db, client(store("unsupported"), async () => { throw new Error("must not call"); })), false);
      assert.equal((await readKernelJob(db, queued.id, ref.workspaceId))!.status, "queued");
      await cancelKernelJob(db, queued.id, ref.workspaceId);
    });
    await t.test("authentication failure pauses until explicit resume and does not poll the provider", async () => {
      const queued = await enqueue("authentication"); let calls = 0;
      const transport = client(store("authentication"), async () => ++calls === 1 ? new Response(null, { status: 401 }) : response());
      await workKernelOnce(db, transport);
      assert.equal((await readKernelJob(db, queued.id, ref.workspaceId))!.status, "paused");
      assert.equal(await workKernelOnce(db, transport), false); assert.equal(calls, 1);
      assert.equal(await resumeKernelJob(db, queued.id, ref.workspaceId), true);
      await workKernelOnce(db, transport);
      assert.equal((await readKernelJob(db, queued.id, ref.workspaceId))!.status, "complete");
    });
    await t.test("transient retries terminate after the bounded allowance", async () => {
      const queued = await enqueue("transient"); let calls = 0;
      const transport = client(store("transient"), async () => { calls++; return new Response(null, { status: 503 }); });
      for (let attempt = 0; attempt < 3; attempt++) {
        await db.query("UPDATE kernel_jobs SET available_at=now() WHERE id=$1", [queued.id]);
        await workKernelOnce(db, transport);
      }
      assert.equal(calls, 3);
      assert.equal((await readKernelJob(db, queued.id, ref.workspaceId))!.status, "failed");
      assert.equal(await workKernelOnce(db, transport), false);
    });
    await t.test("cancellation aborts an active transfer and stale work cannot complete", async () => {
      const queued = await enqueue("cancel"), cache = store("cancel");
      let started!: () => void, aborted = false;
      const ready = new Promise<void>(resolve => { started = resolve; });
      const transport = client(cache, async (_url, init) => {
        started();
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => { aborted = true; reject(new Error("fixture cancelled")); }, { once: true });
        });
      });
      const running = workKernelOnce(db, transport, { heartbeatMs: 10 });
      await ready; await cancelKernelJob(db, queued.id, ref.workspaceId); await running;
      assert.equal(aborted, true);
      assert.equal((await readKernelJob(db, queued.id, ref.workspaceId))!.status, "cancelled");
      assert.equal(await cache.load(ref), null);
    });
  } finally {
    await pool?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
    await rm(root, { recursive: true, force: true });
  }
});
