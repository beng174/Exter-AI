import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type pg from "pg";
import { basicAuth } from "../server/auth.js";
import { attachBudgetRoutes } from "../server/infrastructure/api.js";
import { budgetStatus, settleGeminiCost } from "../server/infrastructure/budget.js";

test("budget status distinguishes unset caps, threshold, reserve configuration and next-call pauses", async () => {
  const oldReserve = process.env.GEMINI_REQUEST_RESERVE_GBP;
  const rows = [
    { cost_type: "inference", monthly_budget_gbp: 10, used_gbp: 8, paused: false },
    { cost_type: "data_providers", monthly_budget_gbp: 10, used_gbp: 1, paused: false },
  ];
  const pool = { query: async () => ({ rows }) } as unknown as pg.Pool;
  try {
    process.env.GEMINI_REQUEST_RESERVE_GBP = "1";
    let result = await budgetStatus(pool);
    assert.equal(result[0].paused,false,"a reserve that exactly fits the safety threshold can run");
    assert.equal(result[0].remaining_gbp,1);
    assert.equal(result[0].threshold_gbp,9);
    rows[0].used_gbp = 8.01;
    result = await budgetStatus(pool);
    assert.equal(result[0].pause_reason,"next_request_would_exceed");
    rows[0].used_gbp = 9;
    result = await budgetStatus(pool);
    assert.equal(result[0].pause_reason,"threshold_reached");
    rows[0].used_gbp = 0;
    delete process.env.GEMINI_REQUEST_RESERVE_GBP;
    result = await budgetStatus(pool);
    assert.equal(result[0].pause_reason,"reserve_not_configured");
    assert.equal(result[1].paused,false,"a missing Gemini reserve does not pause data providers");
    rows[1].monthly_budget_gbp = 0;
    result = await budgetStatus(pool);
    assert.equal(result[1].pause_reason,"budget_unset");
  } finally {
    if (oldReserve === undefined) delete process.env.GEMINI_REQUEST_RESERVE_GBP; else process.env.GEMINI_REQUEST_RESERVE_GBP = oldReserve;
  }
});

test("budget endpoints require authentication, persist both caps and reject invalid monetary values", async () => {
  const caps = new Map([["inference",0],["data_providers",0]]);
  let fail = false;
  const pool = { query: async (sql: string, values?: unknown[]) => {
    if (fail) throw new Error("private connection details");
    if (sql.startsWith("INSERT INTO budget_settings")) { caps.set(String(values![0]),Number(values![1])); return { rowCount: 1, rows: [] }; }
    return { rows: [...caps].map(([cost_type,monthly_budget_gbp]) => ({ cost_type,monthly_budget_gbp,used_gbp: 0,paused: monthly_budget_gbp === 0 })) };
  } } as unknown as pg.Pool;
  const app = express();
  app.use(basicAuth({ EXTER_ADMIN_USER: "budget-test", EXTER_ADMIN_PASSWORD: "test-only-password" }));
  app.use(express.json());
  attachBudgetRoutes(app,() => pool);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Basic ${Buffer.from("budget-test:test-only-password").toString("base64")}`, "Content-Type": "application/json" };
  try {
    assert.equal((await fetch(`${base}/api/budgets`)).status,401);
    assert.equal((await fetch(`${base}/api/budgets/inference`,{ method: "PUT",body: JSON.stringify({ monthly_budget_gbp: 12 }),headers: { "Content-Type": "application/json" } })).status,401);
    const initial = await fetch(`${base}/api/budgets`,{ headers });
    assert.equal(initial.status,200);
    const initialData = await initial.json();
    assert.equal(initialData.currency,"GBP");
    assert.equal(initialData.timezone,"UTC");
    assert.equal(initialData.pause_threshold,0.9);
    assert.equal(initialData.budgets.length,2);
    for (const type of ["inference","data_providers"]) {
      const response = await fetch(`${base}/api/budgets/${type}`,{ method: "PUT",headers,body: JSON.stringify({ monthly_budget_gbp: 10.07 }) });
      assert.equal(response.status,200);
      assert.equal((await response.json()).budget.monthly_budget_gbp,10.07);
      assert.equal(caps.get(type),10.07);
    }
    for (const value of [-1,0.001,"10",null,{},Number.MAX_VALUE]) {
      const response = await fetch(`${base}/api/budgets/inference`,{ method: "PUT",headers,body: JSON.stringify({ monthly_budget_gbp: value }) });
      assert.equal(response.status,400,`invalid amount ${JSON.stringify(value)}`);
    }
    assert.equal((await fetch(`${base}/api/budgets/unknown`,{ method: "PUT",headers,body: JSON.stringify({ monthly_budget_gbp: 10 }) })).status,400);
    const zero = await fetch(`${base}/api/budgets/inference`,{ method: "PUT",headers,body: JSON.stringify({ monthly_budget_gbp: 0 }) });
    assert.equal((await zero.json()).budget.pause_reason,"budget_unset");
    fail = true;
    const unavailable = await fetch(`${base}/api/budgets`,{ headers });
    assert.equal(unavailable.status,503);
    assert.ok(!(await unavailable.text()).includes("private connection details"));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("known Gemini estimates settle under the budget lock and preserve larger charges", async () => {
  const queries: string[] = [];
  let settledAmount: unknown;
  const client = {
    query: async (sql: string,values?: unknown[]) => {
      queries.push(sql);
      if (sql.startsWith("UPDATE cost_ledger")) { settledAmount = values![1]; return { rowCount: 1,rows: [{ id: values![0] }] }; }
      return { rowCount: 1,rows: [] };
    },
    release: () => {},
  };
  const pool = { connect: async () => client } as unknown as pg.Pool;
  await settleGeminiCost("reserved-test-attempt",1.25,pool);
  assert.equal(settledAmount,1.25);
  assert.match(queries[1],/FOR UPDATE/);
  assert.match(queries[2],/status='settled'/);
  assert.equal(queries.at(-1),"COMMIT");
  await assert.rejects(settleGeminiCost("reserved-test-attempt",NaN,pool),/Invalid inference cost/);
  await assert.rejects(settleGeminiCost("reserved-test-attempt",-1,pool),/Invalid inference cost/);
});
