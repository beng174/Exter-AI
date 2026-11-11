import {workerClaimGate,clearWorkerFailures} from "../infrastructure/worker-recovery.js";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { validateKernelArtifactRef, type KernelArtifactRef } from "./artifacts.js";

export interface KernelJobScope { workspaceId: string; platform: "meta" | "tiktok"; nativeAdId: string }
export interface KernelJobInput {
  scope: KernelJobScope;
  artifact: KernelArtifactRef;
  pipelineVersion: string;
  config: Record<string, unknown>;
  contextHash: string;
  maxAttempts?: number;
}
export interface KernelJobLease { id: string; owner: string; token: number }
export type KernelFailure = "transient" | "authentication" | "permission" | "budget" | "invalid" | "uncertain_paid";
export type KernelJobStatus = "queued" | "running" | "paused" | "review_required" | "complete" | "failed" | "cancelled";
export interface KernelJob {
  id: string;
  scope: KernelJobScope;
  artifact: KernelArtifactRef;
  pipelineVersion: string;
  config: Record<string, unknown>;
  contextHash: string;
  status: KernelJobStatus;
  checkpoint: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  retryCount: number;
  maxAttempts: number;
  errorCode: string | null;
  paidDispatchInFlight: boolean;
  lease: KernelJobLease | null;
}
export class KernelJobError extends Error {
  constructor(public readonly code: "invalid" | "lease_lost" | "dispatch_blocked" | "budget_paused", message: string) { super(message); }
}
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const identifier = (value: unknown): value is string => typeof value === "string" && ID.test(value);

function boundedObject(value: unknown): Record<string, unknown> {
  function visit(item: unknown, depth: number): void {
    if (depth > 8) throw new KernelJobError("invalid", "Job metadata exceeds its nesting bound.");
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item === "string" && item.length <= 4000 && !/[\u0000]/.test(item)) return;
    if (!item || typeof item !== "object" || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(item)))
      throw new KernelJobError("invalid", "Job metadata must be bounded JSON.");
    const entries = Object.entries(item);
    if (entries.length > 256) throw new KernelJobError("invalid", "Job metadata exceeds its item bound.");
    for (const [key, child] of entries) {
      const name = key.replace(/[^a-z0-9]/ig, "").toLowerCase();
      if (key.length > 100 || ["proto", "constructor", "prototype", "apikey", "accesstoken", "clientsecret", "password", "credential", "credentials", "authorization", "secret", "token", "cookie", "absolutepath", "relativepath", "localpath", "sourceurl"].includes(name))
        throw new KernelJobError("invalid", "Job metadata contains an unsupported field.");
      visit(child, depth + 1);
    }
  }
  if (!value || Array.isArray(value) || typeof value !== "object") throw new KernelJobError("invalid", "Job metadata must be an object.");
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > 24000) throw new KernelJobError("invalid", "Job metadata exceeds its byte bound.");
  return value as Record<string, unknown>;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, stable(item)])) : value;
}
function validateInput(input: KernelJobInput) {
  const scope = input.scope;
  if (!scope || !identifier(scope.workspaceId) || !["meta", "tiktok"].includes(scope.platform) || typeof scope.nativeAdId !== "string" || !/^\d{1,40}$/.test(scope.nativeAdId) ||
    !identifier(input.pipelineVersion) || typeof input.contextHash !== "string" || !HASH.test(input.contextHash) || !Number.isSafeInteger(input.maxAttempts ?? 3) || (input.maxAttempts ?? 3) < 1 || (input.maxAttempts ?? 3) > 10)
    throw new KernelJobError("invalid", "Choose a canonical ad scope and valid pipeline configuration.");
  validateKernelArtifactRef(input.artifact);
  if (input.artifact.workspaceId !== scope.workspaceId) throw new KernelJobError("invalid", "Artifact scope does not match the job workspace.");
  boundedObject(input.config);
}
function validateLease(lease: KernelJobLease) {
  if (!lease || typeof lease.id !== "string" || !UUID.test(lease.id) || !identifier(lease.owner) || !Number.isSafeInteger(lease.token) || lease.token < 1)
    throw new KernelJobError("invalid", "Invalid worker lease.");
}
function leaseDuration(milliseconds = 120000) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1000 || milliseconds > 600000)
    throw new KernelJobError("invalid", "Lease duration must be between one second and ten minutes.");
  return milliseconds;
}
function fromRow(row: Record<string, any>): KernelJob {
  return { id: row.id, scope: { workspaceId: row.workspace_id, platform: row.platform, nativeAdId: row.native_ad_id }, artifact: row.artifact,
    pipelineVersion: row.pipeline_version, config: row.config, contextHash: row.context_hash, status: row.status, checkpoint: row.checkpoint,
    result: row.result, attempts: row.attempts, retryCount: row.retry_count, maxAttempts: row.max_attempts, errorCode: row.error_code,
    paidDispatchInFlight: row.paid_dispatch_in_flight, lease: row.lease_owner ? { id: row.id, owner: row.lease_owner, token: row.lease_token } : null };
}
const FENCE = "id=$1 AND status='running' AND lease_owner=$2 AND lease_token=$3 AND lease_until>clock_timestamp()";
const fenceValues = (lease: KernelJobLease) => [lease.id, lease.owner, lease.token];

/** Same scoped media, ad context, pipeline and configuration always resolve to one job. */
export function kernelJobIdempotencyKey(input: KernelJobInput): string {
  validateInput(input);
  return createHash("sha256").update(JSON.stringify(stable({ scope: { workspaceId: input.scope.workspaceId, platform: input.scope.platform, nativeAdId: input.scope.nativeAdId }, media: { sha256: input.artifact.sha256, bytes: input.artifact.bytes, mimeType: input.artifact.mimeType },
    pipelineVersion: input.pipelineVersion, config: input.config, contextHash: input.contextHash }))).digest("hex");
}
export async function enqueueKernelJob(pool: pg.Pool, input: KernelJobInput): Promise<KernelJob> {
  const key = kernelJobIdempotencyKey(input);
  const result = await pool.query(`INSERT INTO kernel_jobs(id,workspace_id,platform,native_ad_id,idempotency_key,artifact,pipeline_version,config,context_hash,max_attempts)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING *`,
    [randomUUID(), input.scope.workspaceId, input.scope.platform, input.scope.nativeAdId, key, JSON.stringify(input.artifact), input.pipelineVersion, JSON.stringify(input.config), input.contextHash, input.maxAttempts ?? 3]);
  return fromRow(result.rows[0]);
}
/** Workspace scope is required even for reads; IDs alone do not grant access. */
export async function readKernelJob(pool: pg.Pool, id: string, workspaceId: string): Promise<KernelJob | null> {
  if (typeof id !== "string" || !UUID.test(id) || !identifier(workspaceId)) return null;
  const result = await pool.query("SELECT * FROM kernel_jobs WHERE id=$1 AND workspace_id=$2", [id, workspaceId]);
  return result.rowCount ? fromRow(result.rows[0]) : null;
}
export async function claimKernelJob(pool: pg.Pool, owner: string, options: { leaseMs?: number; pipelineVersions?: string[] } = {}): Promise<KernelJob | null> {
  if (!identifier(owner) || options.pipelineVersions && (!Array.isArray(options.pipelineVersions) || !options.pipelineVersions.length || options.pipelineVersions.length > 20 || options.pipelineVersions.some(version => !identifier(version))))
    throw new KernelJobError("invalid", "Choose a worker owner and bounded supported pipeline versions.");
  const milliseconds = leaseDuration(options.leaseMs), client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Any expired paid dispatch is uncertain, including a process killed after send.
    const uncertain = await client.query(`UPDATE kernel_jobs SET status='review_required',error_code='uncertain_paid',lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp()
      WHERE status='running' AND lease_until<=clock_timestamp() AND paid_dispatch_in_flight RETURNING id`);
    if (uncertain.rowCount) await client.query("UPDATE kernel_dispatches SET state='uncertain',finished_at=clock_timestamp() WHERE job_id=ANY($1::uuid[]) AND state='in_flight'", [uncertain.rows.map(row => row.id)]);
    // Killed extraction attempts count toward the same bounded retry allowance.
    await client.query(`UPDATE kernel_jobs SET retry_count=retry_count+1,status=CASE WHEN retry_count+1>=max_attempts THEN 'failed' ELSE 'queued' END,
      error_code=CASE WHEN retry_count+1>=max_attempts THEN 'attempts_exhausted' ELSE 'transient' END,
      lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp(),finished_at=CASE WHEN retry_count+1>=max_attempts THEN clock_timestamp() ELSE NULL END,
      available_at=clock_timestamp()+(least(60000,1000*power(2,least(retry_count,6))) * interval '1 millisecond')
      WHERE status='running' AND lease_until<=clock_timestamp() AND NOT paid_dispatch_in_flight`);
    const result = await client.query(`UPDATE kernel_jobs SET status='running',lease_owner=$1,lease_token=lease_token+1,
      lease_until=clock_timestamp()+($2 * interval '1 millisecond'),attempts=attempts+1,error_code=NULL,updated_at=clock_timestamp()
      WHERE id=(SELECT id FROM kernel_jobs WHERE ${workerClaimGate('kernel','kernel_jobs.id')} AND status='queued' AND available_at<=clock_timestamp()
        AND ($3::text[] IS NULL OR pipeline_version=ANY($3::text[])) ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [owner, milliseconds, options.pipelineVersions ?? null]);
    await client.query("COMMIT");
    return result.rowCount ? fromRow(result.rows[0]) : null;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function heartbeatKernelJob(pool: pg.Pool, lease: KernelJobLease, leaseMs = 120000): Promise<boolean> {
  validateLease(lease);
  return Boolean((await pool.query(`UPDATE kernel_jobs SET lease_until=clock_timestamp()+($4 * interval '1 millisecond'),updated_at=clock_timestamp() WHERE ${FENCE}`, [...fenceValues(lease), leaseDuration(leaseMs)])).rowCount);
}
export async function checkpointKernelJob(pool: pg.Pool, lease: KernelJobLease, checkpoint: Record<string, unknown>): Promise<boolean> {
  validateLease(lease); boundedObject(checkpoint);
  return Boolean((await pool.query(`UPDATE kernel_jobs SET checkpoint=$4,updated_at=clock_timestamp() WHERE ${FENCE}`, [...fenceValues(lease), JSON.stringify(checkpoint)])).rowCount);
}
export async function completeKernelJob(pool: pg.Pool, lease: KernelJobLease, result: Record<string, unknown> = {}): Promise<boolean> {
  validateLease(lease); boundedObject(result);
  return Boolean((await pool.query(`UPDATE kernel_jobs SET status='complete',result=$4,error_code=NULL,lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp(),finished_at=clock_timestamp()
    WHERE ${FENCE} AND NOT paid_dispatch_in_flight`, [...fenceValues(lease), JSON.stringify(result)])).rowCount);
}
export async function failKernelJob(pool: pg.Pool, lease: KernelJobLease, failure: KernelFailure, options: { backoffMs?: number } = {}): Promise<boolean> {
  validateLease(lease);
  if (!["transient", "authentication", "permission", "budget", "invalid", "uncertain_paid"].includes(failure) || options.backoffMs !== undefined && (!Number.isSafeInteger(options.backoffMs) || options.backoffMs < 0 || options.backoffMs > 3600000))
    throw new KernelJobError("invalid", "Invalid controlled failure or retry delay.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(`SELECT * FROM kernel_jobs WHERE ${FENCE} FOR UPDATE`, fenceValues(lease));
    if (!selected.rowCount) { await client.query("COMMIT"); return false; }
    const row = selected.rows[0], uncertain = row.paid_dispatch_in_flight || failure === "uncertain_paid", retries = row.retry_count + (failure === "transient" ? 1 : 0);
    const status = uncertain ? "review_required" : ["authentication", "permission", "budget"].includes(failure) ? "paused" : failure === "transient" && retries < row.max_attempts ? "queued" : "failed";
    const code = uncertain ? "uncertain_paid" : failure === "transient" && status === "failed" ? "attempts_exhausted" : failure;
    const backoff = options.backoffMs ?? Math.min(60000, 1000 * 2 ** Math.min(retries - 1, 6));
    const changed = await client.query(`UPDATE kernel_jobs SET status=$2,error_code=$3,retry_count=$4,available_at=clock_timestamp()+($5 * interval '1 millisecond'),
      lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp(),finished_at=CASE WHEN $2='failed' THEN clock_timestamp() ELSE NULL END
      WHERE id=$1 AND status='running' AND lease_owner=$6 AND lease_token=$7 AND lease_until>clock_timestamp()`, [lease.id, status, code, retries, Math.max(0, backoff), lease.owner, lease.token]);
    if (!changed.rowCount) { await client.query("ROLLBACK"); return false; }
    if (uncertain) await client.query("UPDATE kernel_dispatches SET state='uncertain',finished_at=clock_timestamp() WHERE job_id=$1 AND state='in_flight'", [lease.id]);
    await client.query("COMMIT"); return true;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function cancelKernelJob(pool: pg.Pool, id: string, workspaceId: string): Promise<boolean> {
  if (typeof id !== "string" || !UUID.test(id) || !identifier(workspaceId)) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`UPDATE kernel_jobs SET status=CASE WHEN paid_dispatch_in_flight THEN 'review_required' ELSE 'cancelled' END,
      error_code=CASE WHEN paid_dispatch_in_flight THEN 'uncertain_paid' ELSE 'cancelled' END,
      lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp(),finished_at=clock_timestamp()
      WHERE id=$1 AND workspace_id=$2 AND status IN ('queued','running','paused') RETURNING paid_dispatch_in_flight`, [id, workspaceId]);
    if (result.rows[0]?.paid_dispatch_in_flight) await client.query("UPDATE kernel_dispatches SET state='uncertain',finished_at=clock_timestamp() WHERE job_id=$1 AND state='in_flight'", [id]);
    await client.query("COMMIT"); return Boolean(result.rowCount);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
/** Explicit operator resume only. Review-required paid work cannot be replayed here. */
export async function resumeKernelJob(pool: pg.Pool, id: string, workspaceId: string): Promise<boolean> {
  if (typeof id !== "string" || !UUID.test(id) || !identifier(workspaceId)) return false;
  const client=await pool.connect();try{
    await client.query("BEGIN");
    const resumed=await client.query(`UPDATE kernel_jobs SET status='queued',error_code=NULL,retry_count=0,available_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=$1 AND workspace_id=$2 AND status='paused' AND NOT paid_dispatch_in_flight RETURNING id`,[id,workspaceId]);
    if(resumed.rowCount)await clearWorkerFailures(client,"kernel",[id]);await client.query("COMMIT");return Boolean(resumed.rowCount);
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export async function beginKernelPaidDispatch(pool: pg.Pool, lease: KernelJobLease, input: { requestKey: string; reservationId: string }): Promise<void> {
  validateLease(lease);
  if (!identifier(input.requestKey) || !identifier(input.reservationId)) throw new KernelJobError("invalid", "Invalid paid request identity.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const job = await client.query(`SELECT id,paid_dispatch_in_flight FROM kernel_jobs WHERE ${FENCE} FOR UPDATE`, fenceValues(lease));
    if (!job.rowCount) throw new KernelJobError("lease_lost", "Worker lease is no longer valid.");
    if (job.rows[0].paid_dispatch_in_flight) throw new KernelJobError("dispatch_blocked", "A paid request is already in flight and cannot be replayed.");
    // Follow the budget lock order used by reserve/settle. The hold is already in
    // used_gbp, so it must not be added twice when checking a retry.
    const setting = await client.query("SELECT monthly_budget_gbp::float8 AS budget FROM budget_settings WHERE cost_type='inference' FOR UPDATE");
    const used = await client.query("SELECT COALESCE(sum(cost_gbp),0)::float8 AS used FROM cost_ledger WHERE cost_type='inference' AND created_at >= date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");
    const budget = setting.rows[0]?.budget ?? 0;
    if (budget <= 0 || used.rows[0].used > budget * 0.9) throw new KernelJobError("budget_paused", "Inference budget no longer permits dispatch of the reserved request.");
    const reservation = await client.query(`SELECT id FROM cost_ledger WHERE id=$1 AND cost_type='inference' AND provider='gemini' AND status='reserved' AND cost_gbp>0
      AND created_at >= date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FOR UPDATE`, [input.reservationId]);
    if (!reservation.rowCount) throw new KernelJobError("dispatch_blocked", "A valid existing inference reservation is required.");
    const previous = await client.query("SELECT state,reservation_id FROM kernel_dispatches WHERE job_id=$1 AND request_key=$2 FOR UPDATE", [lease.id, input.requestKey]);
    if (previous.rowCount && (previous.rows[0].state !== "rejected" || previous.rows[0].reservation_id !== input.reservationId))
      throw new KernelJobError("dispatch_blocked", "Completed or uncertain paid work cannot be replayed or assigned a new hold.");
    await client.query(`INSERT INTO kernel_dispatches(job_id,request_key,reservation_id,state) VALUES($1,$2,$3,'in_flight')
      ON CONFLICT(job_id,request_key) DO UPDATE SET state='in_flight',attempts=kernel_dispatches.attempts+1,started_at=clock_timestamp(),finished_at=NULL`, [lease.id, input.requestKey, input.reservationId]);
    // Recheck after waiting for any budget/dispatch locks. PostgreSQL now() is
    // transaction-stable and would authorise an expired lease after a long wait.
    const authorised = await client.query(`UPDATE kernel_jobs SET paid_dispatch_in_flight=true,updated_at=clock_timestamp() WHERE ${FENCE}`, fenceValues(lease));
    if (!authorised.rowCount) throw new KernelJobError("lease_lost", "Worker lease expired before paid dispatch could be authorised.");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function finishKernelPaidDispatch(pool: pg.Pool, lease: KernelJobLease, input: { requestKey: string; outcome: "rejected" | "completed" }): Promise<boolean> {
  validateLease(lease);
  if (!identifier(input.requestKey) || !["rejected", "completed"].includes(input.outcome)) throw new KernelJobError("invalid", "Invalid paid request disposition.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const job = await client.query(`SELECT id FROM kernel_jobs WHERE ${FENCE} FOR UPDATE`, fenceValues(lease));
    if (!job.rowCount) { await client.query("COMMIT"); return false; }
    const result = await client.query("UPDATE kernel_dispatches SET state=$3,finished_at=clock_timestamp() WHERE job_id=$1 AND request_key=$2 AND state='in_flight'", [lease.id, input.requestKey, input.outcome]);
    if (result.rowCount) {
      const changed = await client.query(`UPDATE kernel_jobs SET paid_dispatch_in_flight=false,updated_at=clock_timestamp() WHERE ${FENCE}`, fenceValues(lease));
      if (!changed.rowCount) { await client.query("ROLLBACK"); return false; }
    }
    await client.query("COMMIT"); return Boolean(result.rowCount);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
