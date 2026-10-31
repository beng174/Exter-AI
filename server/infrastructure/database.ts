import pg from "pg";
import { readFile } from "node:fs/promises";
let pool: pg.Pool | undefined;
export function infrastructureDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for durable collection and budget controls.");
  return pool ||= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
}
export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1742026)");
    await client.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
