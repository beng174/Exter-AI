import pg from "pg";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
export const DATABASE_CONNECT_TIMEOUT_MS = 10_000;
export const MIGRATION_DEADLINE_MS = 90_000;
export type MigrationPhase = "read_schema" | "connect" | "begin" | "check_receipt" | "advisory_lock" | "public_schema" | "kernel_schema" | "owned_schema" | "record_receipt" | "commit";
export type MigrationCode = "database_unavailable" | "migration_deadline" | "migration_lock_timeout" | "migration_statement_timeout" | "migration_deadlock" | "migration_permission_denied" | "migration_failed";
export class MigrationError extends Error {
  constructor(public code: MigrationCode, public phase: MigrationPhase, public sqlstate: string | null = null) {
    super(`Database initialisation failed [${code}; phase=${phase}${sqlstate ? `; SQLSTATE=${sqlstate}` : ""}].`);
    this.name = "MigrationError";
  }
  get retryable() { return ["database_unavailable", "migration_lock_timeout", "migration_deadlock"].includes(this.code); }
}
interface MigrationScript { phase: "public_schema" | "kernel_schema" | "owned_schema"; sql: string }
export interface MigrationOptions {
  skipApplied?: boolean;
  timeoutMs?: number;
  lockTimeoutMs?: number;
  statementTimeoutMs?: number;
  maxConnectionAttempts?: number;
  onProgress?: (phase: MigrationPhase) => void;
  onRetry?: (error: MigrationError) => void;
  /** Fixture injection only; production always reads the three versioned SQL files. */
  readScripts?: () => Promise<MigrationScript[]>;
}
let pool: pg.Pool | undefined;
export function infrastructureDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for durable collection and budget controls.");
  return pool ||= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS });
}
async function readScripts(): Promise<MigrationScript[]> {
  const files = [["public_schema", "./schema.sql"], ["kernel_schema", "../kernel/schema.sql"], ["owned_schema", "../owned/schema.sql"]] as const;
  return Promise.all(files.map(async ([phase, path]) => ({ phase, sql: await readFile(new URL(path, import.meta.url), "utf8") })));
}
function controlledFailure(error: unknown, phase: MigrationPhase): MigrationError {
  if (error instanceof MigrationError) return error;
  const raw = (error as { code?: unknown } | null)?.code;
  const sqlstate = typeof raw === "string" && /^[0-9A-Z]{5}$/.test(raw) ? raw : null;
  const code: MigrationCode = raw === "55P03" ? "migration_lock_timeout" : raw === "57014" ? "migration_statement_timeout" : raw === "40P01" ? "migration_deadlock" : raw === "42501" ? "migration_permission_denied" : phase === "connect" && !sqlstate?.startsWith("28") ? "database_unavailable" : "migration_failed";
  return new MigrationError(code, phase, sqlstate);
}
/** Explicit calls replay safe repairs. Startup may skip a transactionally recorded SQL fingerprint. */
export async function migrate(pool: pg.Pool, options: MigrationOptions = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? MIGRATION_DEADLINE_MS);
  let phase: MigrationPhase = "read_schema", client: pg.PoolClient | undefined, failed = false, abandoned = false;
  async function bounded<T>(step: MigrationPhase, operation: () => Promise<T>): Promise<T> {
    phase = step; options.onProgress?.(step);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new MigrationError("migration_deadline", step);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new MigrationError("migration_deadline", step)), remaining); })]); }
    finally { clearTimeout(timer); }
  }
  const query = (step: MigrationPhase, text: string, values?: string[]) => {
    const config: pg.QueryConfig & { query_timeout: number } = { text, values, query_timeout: Math.max(1, deadline - Date.now() + 1000) };
    return bounded(step, () => client!.query(config));
  };
  try {
    const scripts = await bounded("read_schema", options.readScripts ?? readScripts);
    const checksum = createHash("sha256").update(JSON.stringify(scripts)).digest("hex");
    await bounded("connect", async () => {
      const acquired = await pool.connect();
      if (abandoned) { acquired.release(true); throw new MigrationError("migration_deadline", "connect"); }
      client = acquired;
    });
    await query("begin", "BEGIN");
    await query("begin", "SELECT set_config('lock_timeout',$1,true),set_config('statement_timeout',$2,true)", [`${options.lockTimeoutMs ?? 5000}ms`, `${options.statementTimeoutMs ?? 60000}ms`]);
    const alreadyApplied = async () => {
      const relation = await query("check_receipt", "SELECT to_regclass(format('%I.exter_schema_migrations',current_schema())) AS receipt_table");
      if (!relation.rows[0]?.receipt_table) return false;
      return Boolean((await query("check_receipt", "SELECT checksum FROM exter_schema_migrations WHERE checksum=$1", [checksum])).rowCount);
    };
    // Avoid an advisory/DDL lock entirely on an unchanged restart, even during collection.
    if (options.skipApplied && await alreadyApplied()) { await query("commit", "COMMIT"); return { status: "current" as const, checksum }; }
    await query("advisory_lock", "SELECT pg_advisory_xact_lock(1742026)");
    // A concurrent service may have applied this revision while we waited.
    if (options.skipApplied && await alreadyApplied()) { await query("commit", "COMMIT"); return { status: "current" as const, checksum }; }
    for (const script of scripts) await query(script.phase, script.sql);
    await query("record_receipt", "CREATE TABLE IF NOT EXISTS exter_schema_migrations(checksum text PRIMARY KEY CHECK(checksum ~ '^[a-f0-9]{64}$'),applied_at timestamptz NOT NULL DEFAULT now())");
    await query("record_receipt", "INSERT INTO exter_schema_migrations(checksum) VALUES($1) ON CONFLICT DO NOTHING", [checksum]);
    await query("commit", "COMMIT");
    return { status: "applied" as const, checksum };
  } catch (error) { failed = true; throw controlledFailure(error, phase); }
  finally {
    abandoned = true;
    // Destroy this connection on failure. This rolls back server work, including a
    // query still running after a client deadline; never return it to the pool.
    client?.release(failed);
  }
}
export async function initialiseInfrastructure(pool: pg.Pool, options: MigrationOptions = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? MIGRATION_DEADLINE_MS);
  let connectionFailures = 0;
  for (;;) {
    try { return await migrate(pool, { ...options, skipApplied: true, timeoutMs: Math.max(1, deadline - Date.now()) }); }
    catch (error) {
      if (!(error instanceof MigrationError) || !error.retryable || Date.now() >= deadline) throw error;
      if (error.code === "database_unavailable" && ++connectionFailures >= (options.maxConnectionAttempts ?? 2)) throw error;
      options.onRetry?.(error);
      await delay(Math.min(500, Math.max(1, deadline - Date.now())));
    }
  }
}
export function migrationDiagnostic(error: unknown): string {
  return error instanceof MigrationError ? error.message : "Database initialisation failed [migration_failed].";
}
