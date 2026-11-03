// Disposable TEST_DATABASE_URL only. Each test owns an isolated schema.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { migrate } from "../server/infrastructure/database.js";
import { reserveCost } from "../server/infrastructure/budget.js";
import { createKernelArtifactRef } from "../server/kernel/artifacts.js";
import { enqueueKernelJob, claimKernelJob, heartbeatKernelJob, checkpointKernelJob, completeKernelJob, failKernelJob,
  cancelKernelJob, resumeKernelJob, readKernelJob, kernelJobIdempotencyKey, beginKernelPaidDispatch, finishKernelPaidDispatch, type KernelJobInput } from "../server/kernel/jobs.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const input = (overrides: Partial<KernelJobInput> = {}): KernelJobInput => ({
  scope: { workspaceId: "workspace-test", platform: "meta", nativeAdId: "7000000000000000001" },
  artifact: createKernelArtifactRef({ workspaceId: "workspace-test", sha256: hash("fixture-media"), bytes: 13, mimeType: "video/mp4" }),
  pipelineVersion: "kernel-artifact-v1", config: { normalise: { width: 640, fps: 3 } }, contextHash: hash("ad-copy-v1"), ...overrides,
});

test("kernel jobs preserve scope, leases, cancellation, bounded retries and uncertain paid work", async t => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must point to a dedicated disposable test database.");
  const schema = `kernel_queue_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString });
  let pool: pg.Pool | undefined;
  try {
    // Install vector in the ordinary schema before creating our disposable schema.
    await migrate(admin);
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString, options: `-c search_path=${schema},public` });
    await migrate(pool); await migrate(pool);
    await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10");
    const db = pool;
    const clear = () => db.query("TRUNCATE kernel_dispatches,kernel_jobs,cost_ledger CASCADE");

    await t.test("canonical IDs, scope and stable configuration dedupe concurrent enqueue without paths or secrets", async () => {
      const [first, second] = await Promise.all([enqueueKernelJob(db, input()), enqueueKernelJob(db, input({ config: { normalise: { fps: 3, width: 640 } } }))]);
      assert.equal(first.id, second.id);
      assert.equal(first.scope.nativeAdId, "7000000000000000001");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM kernel_jobs")).rows[0].n, 1);
      assert.equal(await readKernelJob(db, first.id, "different-workspace"), null);
      assert.equal(await cancelKernelJob(db, first.id, "different-workspace"), false);
      assert.notEqual(kernelJobIdempotencyKey(input()), kernelJobIdempotencyKey(input({ contextHash: hash("changed-copy") })));
      assert.throws(() => kernelJobIdempotencyKey(input({ scope: { ...input().scope, nativeAdId: "7000000000000000001.0" } })), /canonical/);
      assert.throws(() => kernelJobIdempotencyKey(input({ scope: { ...input().scope, nativeAdId: 123 as never } })), /canonical/);
      assert.throws(() => kernelJobIdempotencyKey(input({ artifact: createKernelArtifactRef({ ...input().artifact, workspaceId: "different-workspace" }) })), /scope/);
      for (const config of [{ accessToken: "test-private" }, { absolutePath: "/var/data/media/file" }, { nested: { client_secret: "test-private" } }])
        assert.throws(() => kernelJobIdempotencyKey(input({ config })), /unsupported/);
      assert.throws(() => kernelJobIdempotencyKey(input({ artifact: { ...input().artifact, absolutePath: "/var/data/private" } as never })), /metadata/);
      await clear();
    });

    await t.test("claim fencing survives reused owners, checkpoints, lease expiry and cancellation", async () => {
      const queued = await enqueueKernelJob(db, input());
      const claims = await Promise.all([claimKernelJob(db, "same-owner"), claimKernelJob(db, "other-owner")]);
      assert.equal(claims.filter(Boolean).length, 1);
      const first = claims.find(Boolean)!;
      assert.equal(await checkpointKernelJob(db, first.lease!, { stage: "artifact-verified", sha256: first.artifact.sha256 }), true);
      assert.equal(await heartbeatKernelJob(db, first.lease!), true);
      await db.query("UPDATE kernel_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [queued.id]);
      assert.equal(await claimKernelJob(db, "same-owner"), null, "expired attempts enter bounded backoff");
      await db.query("UPDATE kernel_jobs SET available_at=now() WHERE id=$1", [queued.id]);
      const reclaimed = await claimKernelJob(db, first.lease!.owner);
      assert.ok(reclaimed);
      assert.equal(reclaimed.lease!.token, first.lease!.token + 1, "claim token fences even a reused owner name");
      assert.deepEqual(reclaimed.checkpoint, { stage: "artifact-verified", sha256: first.artifact.sha256 });
      assert.equal(await checkpointKernelJob(db, first.lease!, { stage: "stale" }), false);
      assert.equal(await heartbeatKernelJob(db, first.lease!), false);
      assert.equal(await completeKernelJob(db, first.lease!), false);
      assert.equal(await cancelKernelJob(db, queued.id, queued.scope.workspaceId), true);
      assert.equal(await completeKernelJob(db, reclaimed.lease!), false, "a cancelled lease cannot publish a result");
      assert.equal((await readKernelJob(db, queued.id, queued.scope.workspaceId))!.status, "cancelled");
      assert.equal(await claimKernelJob(db, "another-owner"), null);
      await clear();
    });

    await t.test("permission and budget failures stay paused until explicit scoped resume", async () => {
      for (const failure of ["authentication", "permission", "budget"] as const) {
        const queued = await enqueueKernelJob(db, input());
        const claimed = await claimKernelJob(db, "pause-worker");
        assert.equal(await failKernelJob(db, claimed!.lease!, failure), true);
        assert.equal((await readKernelJob(db, queued.id, queued.scope.workspaceId))!.status, "paused");
        assert.equal(await claimKernelJob(db, "polling-worker"), null);
        assert.equal(await resumeKernelJob(db, queued.id, "another-workspace"), false);
        assert.equal(await resumeKernelJob(db, queued.id, queued.scope.workspaceId), true);
        const resumed = await claimKernelJob(db, "pause-worker");
        assert.equal(resumed!.attempts, 2, "manual resume retains the attempt audit");
        assert.equal(await completeKernelJob(db, resumed!.lease!, { stage: "done" }), true);
        await clear();
      }
    });

    await t.test("transient retries stop at their allowance and unsupported pipeline versions stay queued", async () => {
      await enqueueKernelJob(db, input({ maxAttempts: 2 }));
      assert.equal(await claimKernelJob(db, "old-worker", { pipelineVersions: ["another-pipeline-v1"] }), null);
      const first = await claimKernelJob(db, "retry-worker", { pipelineVersions: ["kernel-artifact-v1"] });
      assert.equal(await failKernelJob(db, first!.lease!, "transient", { backoffMs: 0 }), true);
      const second = await claimKernelJob(db, "retry-worker");
      assert.equal(second!.attempts, 2);
      assert.equal(await failKernelJob(db, second!.lease!, "transient", { backoffMs: 0 }), true);
      assert.equal(await claimKernelJob(db, "retry-worker"), null);
      const failed = await readKernelJob(db, first!.id, first!.scope.workspaceId);
      assert.equal(failed!.status, "failed");
      assert.equal(failed!.errorCode, "attempts_exhausted");
      assert.equal(failed!.retryCount, 2);
      await clear();
    });

    await t.test("confirmed rejected paid calls reuse one hold; completed request identities never replay", async () => {
      await enqueueKernelJob(db, input());
      const claimed = (await claimKernelJob(db, "paid-worker"))!;
      await assert.rejects(beginKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", reservationId: "missing-hold" }), /reservation/);
      const reservationId = await reserveCost(db, "inference", "gemini", 0.1);
      await beginKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", reservationId });
      assert.equal(await completeKernelJob(db, claimed.lease!), false, "in-flight paid work cannot become complete");
      assert.equal(await finishKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", outcome: "rejected" }), true);
      await beginKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", reservationId });
      assert.equal((await db.query("SELECT count(*)::int AS n FROM cost_ledger")).rows[0].n, 1, "retry creates no new hold");
      assert.equal((await db.query("SELECT attempts FROM kernel_dispatches")).rows[0].attempts, 2);
      assert.equal(await finishKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", outcome: "completed" }), true);
      await assert.rejects(beginKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", reservationId }), /cannot be replayed/);
      assert.equal(await completeKernelJob(db, claimed.lease!, { dispatch: "labels-v1" }), true);
      await clear();
    });

    await t.test("paid dispatch rechecks lowered budgets and refuses stale prior-month holds", async () => {
      await enqueueKernelJob(db, input());
      const claimed = (await claimKernelJob(db, "budget-worker"))!;
      const reservationId = await reserveCost(db, "inference", "gemini", 0.1);
      await db.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='inference'");
      await assert.rejects(beginKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", reservationId }), /budget/);
      await db.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='inference'");
      await db.query("UPDATE cost_ledger SET created_at=date_trunc('month',now())-interval '1 day' WHERE id=$1", [reservationId]);
      await assert.rejects(beginKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", reservationId }), /reservation/);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM kernel_dispatches")).rows[0].n, 0);
      assert.equal((await readKernelJob(db, claimed.id, claimed.scope.workspaceId))!.paidDispatchInFlight, false);
      await clear();
    });

    await t.test("waiting for a budget lock cannot authorise paid dispatch after the lease expires", async () => {
      await enqueueKernelJob(db, input());
      const reservationId = await reserveCost(db, "inference", "gemini", 0.1);
      const blocker = await db.connect();
      let released = false;
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT monthly_budget_gbp FROM budget_settings WHERE cost_type='inference' FOR UPDATE");
        const claimed = (await claimKernelJob(db, "blocked-budget-worker", { leaseMs: 1000 }))!;
        const pending = beginKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", reservationId }).then(
          () => ({ accepted: true, error: null }), error => ({ accepted: false, error: error as Error }));
        await new Promise(resolve => setTimeout(resolve, 1100));
        await blocker.query("COMMIT"); released = true;
        const outcome = await pending;
        assert.equal(outcome.accepted, false);
        assert.match(outcome.error!.message, /lease expired/);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM kernel_dispatches")).rows[0].n, 0, "failed authorisation rolls back its attempt row");
        assert.equal((await readKernelJob(db, claimed.id, claimed.scope.workspaceId))!.paidDispatchInFlight, false);
      } finally {
        if (!released) await blocker.query("ROLLBACK");
        blocker.release();
      }
      await clear();
    });

    await t.test("a killed or cancelled worker retains uncertain paid holds and requires review", async () => {
      for (const disposition of ["lease-expired", "cancelled"] as const) {
        const queued = await enqueueKernelJob(db, input());
        const claimed = (await claimKernelJob(db, "uncertain-worker"))!;
        const reservationId = await reserveCost(db, "inference", "gemini", 0.2);
        await beginKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", reservationId });
        if (disposition === "lease-expired") {
          await db.query("UPDATE kernel_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [queued.id]);
          assert.equal(await claimKernelJob(db, "replacement-worker"), null);
        } else assert.equal(await cancelKernelJob(db, queued.id, queued.scope.workspaceId), true);
        const reviewed = await readKernelJob(db, queued.id, queued.scope.workspaceId);
        assert.equal(reviewed!.status, "review_required");
        assert.equal(reviewed!.errorCode, "uncertain_paid");
        assert.equal(await resumeKernelJob(db, queued.id, queued.scope.workspaceId), false);
        assert.equal(await finishKernelPaidDispatch(db, claimed.lease!, { requestKey: "labels-v1", outcome: "completed" }), false);
        assert.equal((await db.query("SELECT state FROM kernel_dispatches")).rows[0].state, "uncertain");
        assert.deepEqual((await db.query("SELECT status,cost_gbp::float8 FROM cost_ledger")).rows[0], { status: "reserved", cost_gbp: 0.2 });
        await clear();
      }
    });
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
