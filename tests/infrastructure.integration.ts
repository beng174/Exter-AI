import { fork } from "node:child_process";
import { once } from "node:events";
// Dedicated disposable PostgreSQL database required. Never run against a production database.
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { basicAuth } from "../server/auth.js";
import { migrate } from "../server/infrastructure/database.js";
import { attachBudgetRoutes } from "../server/infrastructure/api.js";
import { budgetStatus, reserveCost, settleGeminiCost } from "../server/infrastructure/budget.js";
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
    const unknownAttempt = await reserveCost(pool,"inference","gemini",1);
    const pending = (await pool.query("SELECT cost_gbp::float8,cost_basis,status FROM cost_ledger WHERE id=$1",[unknownAttempt])).rows[0];
    assert.deepEqual(pending,{ cost_gbp: 1,cost_basis: "estimated",status: "reserved" },"a failed or unknown provider attempt retains its full reserve");
    assert.equal((await budgetStatus(pool)).find(r => r.cost_type === "inference").used_gbp,6,"unknown attempts count against the cap");
    await settleGeminiCost(unknownAttempt,0.25,pool);
    assert.deepEqual((await pool.query("SELECT cost_gbp::float8,cost_basis,status FROM cost_ledger WHERE id=$1",[unknownAttempt])).rows[0],{ cost_gbp: 0.25,cost_basis: "estimated",status: "settled" });
    assert.equal((await budgetStatus(pool)).find(r => r.cost_type === "inference").used_gbp,5.25);
    const repeated = await Promise.allSettled([settleGeminiCost(unknownAttempt,0.1,pool),settleGeminiCost(unknownAttempt,0.2,pool)]);
    assert.equal(repeated.filter(result => result.status === "rejected").length,2,"a reservation can be settled only once, including concurrent repeats");
    assert.equal((await budgetStatus(pool)).find(r => r.cost_type === "inference").used_gbp,5.25);
    const largerAttempt = await reserveCost(pool,"inference","gemini",0.5);
    await settleGeminiCost(largerAttempt,0.75,pool);
    assert.equal((await pool.query("SELECT cost_gbp::float8 FROM cost_ledger WHERE id=$1",[largerAttempt])).rows[0].cost_gbp,0.75,"an estimate above its reservation records the full larger charge");
    assert.equal((await budgetStatus(pool)).find(r => r.cost_type === "inference").used_gbp,6);
    const failedAttempt = await reserveCost(pool,"inference","gemini",0.2);
    await assert.rejects(settleGeminiCost(failedAttempt,NaN,pool),/Invalid inference cost/);
    assert.deepEqual((await pool.query("SELECT cost_gbp::float8,status FROM cost_ledger WHERE id=$1",[failedAttempt])).rows[0],{ cost_gbp: 0.2,status: "reserved" },"a failed attempt with unknown usage cannot release its reserved charge");
    assert.equal((await budgetStatus(pool)).find(r => r.cost_type === "inference").used_gbp,6.2);
    await assert.rejects(reserveCost(pool,"inference","gemini",3.01),/Jobs paused/,"the next reservation accounts for settled and unknown charges");
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

test("authenticated budget settings persist in PostgreSQL and immediately govern reservations", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString,"TEST_DATABASE_URL must point to a dedicated disposable test database.");
  const pool = new pg.Pool({ connectionString });
  const oldReserve = process.env.GEMINI_REQUEST_RESERVE_GBP;
  let server: ReturnType<typeof createServer> | undefined;
  try {
    await migrate(pool);
    await pool.query("TRUNCATE cost_ledger");
    await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10");
    process.env.GEMINI_REQUEST_RESERVE_GBP = "0.1";
    const app = express();
    app.use(basicAuth({ EXTER_ADMIN_USER: "budget-integration", EXTER_ADMIN_PASSWORD: "test-only-password" }));
    app.use(express.json());
    attachBudgetRoutes(app,() => pool);
    server = createServer(app);
    await new Promise<void>(resolve => server!.listen(0,"127.0.0.1",resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = { authorization: `Basic ${Buffer.from("budget-integration:test-only-password").toString("base64")}`,"Content-Type": "application/json" };
    const update = (type: string,amount: number,authenticated = true) => fetch(`${base}/api/budgets/${type}`,{ method: "PUT",headers: authenticated ? headers : { "Content-Type": "application/json" },body: JSON.stringify({ monthly_budget_gbp: amount }) });
    assert.equal((await fetch(`${base}/api/budgets`)).status,401);
    assert.equal((await update("inference",999,false)).status,401);
    assert.equal((await pool.query("SELECT monthly_budget_gbp::float8 AS budget FROM budget_settings WHERE cost_type='inference'")).rows[0].budget,10);
    assert.equal((await update("inference",2.35)).status,200);
    assert.equal((await update("data_providers",21.43)).status,200);
    const saved = await (await fetch(`${base}/api/budgets`,{ headers })).json();
    assert.equal(saved.budgets.find((row: { cost_type: string }) => row.cost_type === "inference").monthly_budget_gbp,2.35);
    assert.equal(saved.budgets.find((row: { cost_type: string }) => row.cost_type === "data_providers").monthly_budget_gbp,21.43);
    const reserved = await reserveCost(pool,"inference","gemini",2.1);
    await assert.rejects(reserveCost(pool,"inference","gemini",0.02),/Jobs paused/);
    const paused = await (await fetch(`${base}/api/budgets`,{ headers })).json();
    assert.equal(paused.budgets.find((row: { cost_type: string }) => row.cost_type === "inference").pause_reason,"next_request_would_exceed");
    assert.equal((await update("inference",0.001)).status,400);
    assert.equal((await pool.query("SELECT monthly_budget_gbp::float8 AS budget FROM budget_settings WHERE cost_type='inference'")).rows[0].budget,2.35,"invalid settings do not change the stored cap");
    assert.equal((await update("inference",0)).status,200);
    await assert.rejects(reserveCost(pool,"inference","gemini",0.01),/Jobs paused/);
    const disabled = await (await fetch(`${base}/api/budgets`,{ headers })).json();
    const inference = disabled.budgets.find((row: { cost_type: string }) => row.cost_type === "inference");
    assert.equal(inference.pause_reason,"budget_unset");
    assert.equal(inference.used_gbp,2.1,"lowering the cap does not erase spend or outstanding reservations");
    assert.equal((await pool.query("SELECT status FROM cost_ledger WHERE id=$1",[reserved])).rows[0].status,"reserved");
  } finally {
    if (server?.listening) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (oldReserve === undefined) delete process.env.GEMINI_REQUEST_RESERVE_GBP; else process.env.GEMINI_REQUEST_RESERVE_GBP = oldReserve;
    await pool.end();
  }
});
