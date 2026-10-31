import { fork } from "node:child_process";
import { once } from "node:events";
// Dedicated disposable PostgreSQL database required. Never run against a production database.
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "../server/infrastructure/database.js";
import { budgetStatus, reserveCost } from "../server/infrastructure/budget.js";
import { enqueueCollection, claimJob, workOnce, schedule } from "../server/infrastructure/jobs.js";
import { collectMetaPage, MetaLibraryConnector } from "../server/connectors/meta-library.js";

test("Postgres budgets, idempotent scheduling, append-only observations and crash recovery", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString,"TEST_DATABASE_URL must point to a dedicated disposable test database.");
  const pool = new pg.Pool({ connectionString });
  try {
    await migrate(pool); await migrate(pool);
    assert.equal((await pool.query("SELECT extname FROM pg_extension WHERE extname='vector'")).rowCount,1);
    await pool.query("TRUNCATE schedule_slots,ad_observations,public_ads,collection_jobs,collection_runs,watchlists,cost_ledger CASCADE");
    await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10");
    const charges = await Promise.allSettled([reserveCost(pool,"inference","fixture",5),reserveCost(pool,"inference","fixture",5)]);
    assert.equal(charges.filter(r => r.status === "fulfilled").length,1,"parallel calls cannot overspend reservation cap");
    assert.equal((await budgetStatus(pool)).find(r => r.cost_type === "inference").used_gbp,5);
    await pool.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='inference'");
    await assert.rejects(reserveCost(pool,"inference","fixture",0),/Jobs paused/);
    await pool.query("INSERT INTO watchlists(id,workspace_id,page_ids) VALUES('watch-test','workspace-test','[\"12\"]')");
    await schedule(pool,new Date("2026-10-30T12:00:00Z"));
    await schedule(pool,new Date("2026-10-30T13:00:00Z"));
    assert.equal((await pool.query("SELECT * FROM collection_runs")).rowCount,1);
    const firstRun = (await pool.query("SELECT id FROM collection_runs")).rows[0].id;
    let calls = 0;
    const connector = new MetaLibraryConnector({ token: "test-only-token", fetch: async (target) => {
      calls++;
      const cursor = new URL(String(target)).searchParams.get("after");
      return Response.json({ data: [{ id: cursor ? "102" : "101", page_id: "12", eu_total_reach: cursor ? undefined : 1200, total_reach_by_location: cursor ? undefined : [{ country: "GB", reach: 600 }] }], ...(!cursor ? { paging: { next: "https://graph.facebook.com/unused?access_token=test-only-token", cursors: { after: "page-two" } } } : {}) });
    } });
    const claimed = await claimJob(pool,"worker-before-crash");
    assert.equal(claimed.id,firstRun);
    const firstPage = await collectMetaPage(pool,firstRun,connector,"worker-before-crash");
    assert.equal(firstPage.complete,false);
    assert.equal((await pool.query("SELECT cursor FROM collection_runs WHERE id=$1",[firstRun])).rows[0].cursor,"page-two");
    assert.equal(await claimJob(pool,"other-worker"),null,"unexpired lease cannot be stolen");
    // Simulate a killed worker after committing a page but before releasing its lease.
    await pool.query("UPDATE collection_jobs SET lease_until=now()-interval '1 second'");
    await workOnce(pool,connector);
    assert.equal(calls,2,"resumption starts at the saved cursor");
    assert.equal((await pool.query("SELECT status FROM collection_runs WHERE id=$1",[firstRun])).rows[0].status,"complete");
    assert.equal((await pool.query("SELECT * FROM public_ads")).rowCount,2);
    const secondRun = await enqueueCollection(pool,"watch-test");
    assert.notEqual(secondRun,firstRun);
    await workOnce(pool,connector); await workOnce(pool,connector);
    assert.equal((await pool.query("SELECT * FROM public_ads")).rowCount,2);
    assert.equal((await pool.query("SELECT * FROM ad_observations")).rowCount,4);
    const unknown = (await pool.query("SELECT reach FROM ad_observations WHERE native_id='102' LIMIT 1")).rows[0].reach;
    assert.deepEqual(unknown.eu,{ type: "unavailable", value: null });
    const observed = (await pool.query("SELECT reach FROM ad_observations WHERE native_id='101' LIMIT 1")).rows[0].reach;
    assert.deepEqual(observed.eu,{ type: "observed", value: 1200 });
    await collectMetaPage(pool,secondRun,connector);
    assert.equal((await pool.query("SELECT * FROM ad_observations")).rowCount,4,"replaying completed run cannot duplicate history");
    const thirdRun = await enqueueCollection(pool,"watch-test");
    const failing = new MetaLibraryConnector({ token: "test-only-token", fetch: async () => { throw new Error("private remote details"); } });
    await workOnce(pool,failing);
    const failed = (await pool.query("SELECT status,errors FROM collection_runs WHERE id=$1",[thirdRun])).rows[0];
    assert.equal(failed.status,"failed");
    assert.ok(!JSON.stringify(failed).includes("private remote details"));
    const killRun = await enqueueCollection(pool,"watch-test");
    const child = fork("tests/fixtures/meta-worker-crash.ts",[], { execArgv: ["--import","tsx"], env: { ...process.env, TEST_DATABASE_URL: connectionString }, stdio: ["ignore","ignore","ignore","ipc"] });
    try {
      const checkpoint = await Promise.race([
        once(child,"message").then(([message]) => message),
        once(child,"exit").then(() => { throw new Error("Fixture worker exited before checkpoint."); }),
        new Promise<never>((_resolve,reject) => { const timer = setTimeout(() => reject(new Error("Worker checkpoint timed out.")),15000); timer.unref(); }),
      ]);
      assert.equal(checkpoint.runId,killRun);
      assert.equal(checkpoint.checkpoint,true);
      const exited = once(child,"exit");
      child.kill("SIGKILL");
      const [,signal] = await exited;
      assert.equal(signal,"SIGKILL");
      assert.equal((await pool.query("SELECT cursor FROM collection_runs WHERE id=$1",[killRun])).rows[0].cursor,"page-two");
      // Advance the test lease instead of waiting two minutes of wall-clock time.
      await pool.query("UPDATE collection_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[killRun]);
      await workOnce(pool,connector);
      assert.equal((await pool.query("SELECT status FROM collection_runs WHERE id=$1",[killRun])).rows[0].status,"complete");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM ad_observations WHERE run_id=$1",[killRun])).rows[0].n,2);
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }
  } finally { await pool.end(); }
});
