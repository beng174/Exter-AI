import { randomUUID } from "node:crypto";
import type pg from "pg";
import { infrastructureDatabase } from "./database.js";
export type CostType = "inference" | "data_providers";
export type BudgetPauseReason = "budget_unset" | "threshold_reached" | "reserve_not_configured" | "next_request_would_exceed";
export async function budgetStatus(pool: pg.Pool) {
  const result = await pool.query(`SELECT b.cost_type,b.monthly_budget_gbp::float8,
    COALESCE(sum(l.cost_gbp),0)::float8 AS used_gbp,
    COALESCE(sum(l.cost_gbp),0) >= b.monthly_budget_gbp*0.9 AS paused
    FROM budget_settings b LEFT JOIN cost_ledger l ON l.cost_type=b.cost_type
    AND l.created_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    GROUP BY b.cost_type,b.monthly_budget_gbp ORDER BY b.cost_type`);
  const reserve = Number(process.env.GEMINI_REQUEST_RESERVE_GBP);
  return result.rows.map(row => {
    const threshold = row.monthly_budget_gbp * 0.9;
    let pauseReason: BudgetPauseReason | null = null;
    if (row.monthly_budget_gbp <= 0) pauseReason = "budget_unset";
    else if (row.used_gbp >= threshold) pauseReason = "threshold_reached";
    else if (row.cost_type === "inference" && (!Number.isFinite(reserve) || reserve <= 0)) pauseReason = "reserve_not_configured";
    else if (row.cost_type === "inference" && row.used_gbp + reserve > threshold) pauseReason = "next_request_would_exceed";
    return {
      ...row,
      paused: pauseReason !== null,
      pause_reason: pauseReason,
      threshold_gbp: threshold,
      remaining_gbp: Math.max(0, threshold - row.used_gbp),
      request_reserve_gbp: row.cost_type === "inference" && Number.isFinite(reserve) && reserve > 0 ? reserve : null,
    };
  });
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
export interface GeminiReservation { reservationId: string; reservedGbp: number }
export async function guardedGeminiCall(): Promise<GeminiReservation | undefined> {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") throw new Error("Paid inference requires DATABASE_URL and a configured budget.");
    return;
  }
  const cost = Number(process.env.GEMINI_REQUEST_RESERVE_GBP);
  if (!Number.isFinite(cost) || cost <= 0) throw new Error("Set a conservative GEMINI_REQUEST_RESERVE_GBP before paid inference.");
  return { reservationId: await reserveCost(infrastructureDatabase(), "inference", "gemini", cost), reservedGbp: cost };
}

/** Settle only known token-based estimates. Failed/unknown attempts retain their full reserve. */
export async function settleGeminiCost(reservationId: string, estimatedGbp: number, pool: pg.Pool = infrastructureDatabase()) {
  if (!reservationId || !Number.isFinite(estimatedGbp) || estimatedGbp < 0)
    throw new Error("Invalid inference cost estimate.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Match reserveCost's lock, so settlement and new reservations see a consistent ledger.
    await client.query("SELECT monthly_budget_gbp FROM budget_settings WHERE cost_type='inference' FOR UPDATE");
    const result = await client.query(`UPDATE cost_ledger SET cost_gbp=$2,cost_basis='estimated',status='settled'
      WHERE id=$1 AND cost_type='inference' AND provider='gemini' AND status='reserved' RETURNING id`, [reservationId,estimatedGbp]);
    if (result.rowCount !== 1) throw new Error("Inference cost reservation could not be settled.");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
