import { randomUUID } from "node:crypto";
import type pg from "pg";
import { infrastructureDatabase } from "./database.js";
export type CostType = "inference" | "data_providers";
export async function budgetStatus(pool: pg.Pool) {
  const result = await pool.query(`SELECT b.cost_type,b.monthly_budget_gbp::float8,
    COALESCE(sum(l.cost_gbp),0)::float8 AS used_gbp,
    COALESCE(sum(l.cost_gbp),0) >= b.monthly_budget_gbp*0.9 AS paused
    FROM budget_settings b LEFT JOIN cost_ledger l ON l.cost_type=b.cost_type
    AND l.created_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    GROUP BY b.cost_type,b.monthly_budget_gbp ORDER BY b.cost_type`);
  const reserve = Number(process.env.GEMINI_REQUEST_RESERVE_GBP);
  return result.rows.map(row => ({ ...row, paused: row.paused || (row.cost_type === "inference" && Number.isFinite(reserve) && reserve > 0 && row.used_gbp + reserve > row.monthly_budget_gbp * 0.9) }));
}
/** Reserve before each provider HTTP attempt. Unknown/failed charges remain reserved conservatively. */
export async function reserveCost(pool: pg.Pool, type: CostType, provider: string, amount: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid provider cost configuration.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const setting = await client.query("SELECT monthly_budget_gbp::float8 AS budget FROM budget_settings WHERE cost_type=$1 FOR UPDATE", [type]);
    const used = await client.query("SELECT COALESCE(sum(cost_gbp),0)::float8 AS used FROM cost_ledger WHERE cost_type=$1 AND created_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'", [type]);
    const budget = setting.rows[0]?.budget ?? 0;
    if (used.rows[0].used >= budget * 0.9 || used.rows[0].used + amount > budget * 0.9)
      throw new Error(`Jobs paused: ${type} monthly budget is unset or its 90% threshold would be reached.`);
    const id = randomUUID();
    await client.query("INSERT INTO cost_ledger(id,cost_type,provider,cost_gbp,cost_basis) VALUES($1,$2,$3,$4,'estimated')", [id,type,provider,amount]);
    await client.query("COMMIT");
    return id;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function guardedGeminiCall() {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") throw new Error("Paid inference requires DATABASE_URL and a configured budget.");
    return;
  }
  const cost = Number(process.env.GEMINI_REQUEST_RESERVE_GBP);
  if (!Number.isFinite(cost) || cost <= 0) throw new Error("Set a conservative GEMINI_REQUEST_RESERVE_GBP before paid inference.");
  await reserveCost(infrastructureDatabase(), "inference", "gemini", cost);
}
