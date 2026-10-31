import { randomUUID } from "node:crypto";
import type pg from "pg";
import { collectMetaPage, MetaLibraryConnector, metaStatus } from "../connectors/meta-library.js";
export async function enqueueCollection(pool: pg.Pool, watchlistId: string, day?: string) {
  const client = await pool.connect();
  const id = randomUUID();
  try {
    await client.query("BEGIN");
    // Serialize scheduler/manual work for this watchlist, preserving the daily slot on restart.
    const watchlist = await client.query("SELECT id,page_ids,search_terms,countries FROM watchlists WHERE id=$1 AND enabled FOR UPDATE", [watchlistId]);
    if (!watchlist.rowCount) throw new Error("Watchlist is missing or disabled.");
    if (day) {
      const slot = await client.query("SELECT run_id FROM schedule_slots WHERE watchlist_id=$1 AND day=$2", [watchlistId,day]);
      if (slot.rowCount) { await client.query("COMMIT"); return slot.rows[0].run_id as string; }
    }
    const active = await client.query("SELECT id FROM collection_runs WHERE watchlist_id=$1 AND status IN ('queued','running','paused','not_connected') LIMIT 1", [watchlistId]);
    if (active.rowCount) { await client.query("COMMIT"); return active.rows[0].id as string; }
    await client.query("INSERT INTO collection_runs(id,watchlist_id,config) VALUES($1,$2,$3)", [id,watchlistId,JSON.stringify(watchlist.rows[0])]);
    await client.query("INSERT INTO collection_jobs(id) VALUES($1)", [id]);
    if (day) await client.query("INSERT INTO schedule_slots VALUES($1,$2,$3)", [watchlistId,day,id]);
    await client.query("COMMIT"); return id;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function claimJob(pool: pg.Pool, owner: string) {
  const result = await pool.query(`UPDATE collection_jobs SET status='running',lease_owner=$1,lease_until=now()+interval '2 minutes',attempts=attempts+1
    WHERE id=(SELECT id FROM collection_jobs WHERE status IN ('queued','running') AND available_at<=now()
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [owner]);
  return result.rows[0] ?? null;
}
export async function workOnce(pool: pg.Pool, connector?: MetaLibraryConnector) {
  const owner = randomUUID();
  const job = await claimJob(pool,owner);
  if (!job) return false;
  let done = false, backoffMs = 0;
  try {
    if (!connector && metaStatus().status === "not_connected") throw new Error("Meta not connected");
    const result = await collectMetaPage(pool,job.id,connector,owner);
    done = result.complete; backoffMs = result.backoffMs;
  } catch (error) {
    // Only controlled messages enter persistent status; driver/provider errors can contain secrets.
    const message = error instanceof Error && error.message.startsWith("Jobs paused:") ? error.message
      : error instanceof Error && error.message === "Meta not connected" ? "Meta not connected"
      : "Meta collection failed. Check approval, network access and watchlist configuration; saved pages are retained.";
    const state = message.startsWith("Jobs paused:") ? "paused" : message === "Meta not connected" ? "not_connected" : "failed";
    await pool.query("UPDATE collection_runs SET status=$2,errors=$3 WHERE id=$1 AND EXISTS(SELECT 1 FROM collection_jobs WHERE id=$1 AND lease_owner=$4)", [job.id,state,JSON.stringify([{ message }]),owner]);
    backoffMs = Math.min(3600000,60000 * 2 ** Math.min(job.attempts - 1,6));
  }
  await pool.query("UPDATE collection_jobs SET status=$3,available_at=now()+($4 * interval '1 millisecond'),lease_until=NULL,lease_owner=NULL WHERE id=$1 AND lease_owner=$2", [job.id,owner,done ? "complete" : "queued",backoffMs]);
  return true;
}
export async function schedule(pool: pg.Pool, now = new Date()) {
  const watchlists = await pool.query("SELECT id FROM watchlists WHERE enabled ORDER BY id");
  for (const row of watchlists.rows) await enqueueCollection(pool,row.id,now.toISOString().slice(0,10));
}
