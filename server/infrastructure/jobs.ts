import { randomUUID } from "node:crypto";
import type pg from "pg";
import { collectMetaPage, MetaCollectionError, MetaLibraryConnector, metaStatus } from "../connectors/meta-library.js";
const MAX_PAGE_ATTEMPTS = 5;
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
    const active = await client.query("SELECT id,status FROM collection_runs WHERE watchlist_id=$1 AND status IN ('queued','running','paused','not_connected') ORDER BY started_at LIMIT 1 FOR UPDATE", [watchlistId]);
    if (active.rowCount) {
      const run = active.rows[0];
      // Only an explicit operator request resumes blocked work. Scheduling does
      // not establish that credentials, permissions or budgets were corrected.
      if (!day && ["paused","not_connected"].includes(run.status)) {
        const resumed = await client.query(`UPDATE collection_jobs SET status='queued',attempts=0,available_at=now(),lease_owner=NULL,lease_until=NULL
          WHERE id=$1 AND (lease_until IS NULL OR lease_until<=now()) RETURNING id`, [run.id]);
        if (resumed.rowCount)
          await client.query("UPDATE collection_runs SET status='queued',errors='[]',finished_at=NULL WHERE id=$1", [run.id]);
      }
      if (day) await client.query("INSERT INTO schedule_slots VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [watchlistId,day,run.id]);
      await client.query("COMMIT"); return run.id as string;
    }
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
  let state = "queued", backoffMs = 0, resetAttempts = false, errorMessage: string | null = null;
  try {
    const run = (await pool.query("SELECT status FROM collection_runs WHERE id=$1", [job.id])).rows[0];
    if (run?.status === "complete") { state = "complete"; resetAttempts = true; }
    else if (run && ["paused","not_connected","failed"].includes(run.status)) {
      // Reconcile jobs left queued by the earlier implementation without
      // treating an upgrade/restart as permission to resume blocked work.
      state = run.status;
    }
    else if (job.attempts > MAX_PAGE_ATTEMPTS) {
      // A crash on the final attempt must not create an unbounded sixth request.
      state = "failed";
      errorMessage = "Meta collection reached its retry limit. Saved pages are retained; start a new collection explicitly.";
    } else {
      if (!connector && metaStatus().status === "not_connected") throw new MetaCollectionError("permission", "Meta not connected");
      const result = await collectMetaPage(pool,job.id,connector,owner);
      state = result.complete ? "complete" : "queued"; backoffMs = result.backoffMs;
      // Attempts apply to the current page, not the total number of healthy pages.
      resetAttempts = true;
    }
  } catch (error) {
    // Only controlled messages enter persistent status; driver/provider errors can contain secrets.
    if (error instanceof Error && error.message.startsWith("Jobs paused:")) {
      state = "paused";
      errorMessage = "Jobs paused: data_providers monthly budget is unset or its 90% threshold would be reached.";
    } else if (error instanceof MetaCollectionError && error.reason === "permission") {
      state = error.message === "Meta not connected" ? "not_connected" : "paused";
      errorMessage = state === "not_connected" ? "Meta not connected" : "Meta collection paused. Correct approved credentials and permissions, then resume explicitly; saved pages are retained.";
    } else if (error instanceof MetaCollectionError && error.reason === "schema") {
      state = "failed";
      errorMessage = "Meta collection returned an unsupported configuration or response. Saved pages are retained; review the source configuration before starting a new collection.";
    } else if (job.attempts >= MAX_PAGE_ATTEMPTS) {
      state = "failed";
      errorMessage = "Meta collection reached its retry limit. Saved pages are retained; start a new collection explicitly.";
    } else {
      state = "queued";
      errorMessage = error instanceof MetaCollectionError && error.reason === "rate_limited"
        ? "Meta collection was rate-limited. A bounded retry will resume from the saved cursor."
        : "Meta collection is temporarily unavailable. A bounded retry will resume from the saved cursor.";
      backoffMs = Math.min(3600000,60000 * 2 ** Math.min(job.attempts - 1,6));
    }
  }
  // Commit the run and job disposition together, fenced by the live claim.
  // Keep lock order consistent with collectMetaPage: run before job.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM collection_runs WHERE id=$1 FOR UPDATE", [job.id]);
    const lease = await client.query("SELECT id FROM collection_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now() FOR UPDATE", [job.id,owner]);
    if (!lease.rowCount) { await client.query("ROLLBACK"); return true; }
    if (errorMessage) await client.query("UPDATE collection_runs SET status=$2,errors=$3,finished_at=CASE WHEN $2='failed' THEN now() ELSE NULL END WHERE id=$1", [job.id,state,JSON.stringify([{ message: errorMessage }])]);
    await client.query(`UPDATE collection_jobs SET status=$3,available_at=now()+($4 * interval '1 millisecond'),lease_until=NULL,lease_owner=NULL,
      attempts=CASE WHEN $5 THEN 0 ELSE attempts END WHERE id=$1 AND lease_owner=$2`, [job.id,owner,state,backoffMs,resetAttempts]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return true;
}
export async function schedule(pool: pg.Pool, now = new Date()) {
  const watchlists = await pool.query("SELECT id FROM watchlists WHERE enabled ORDER BY id");
  for (const row of watchlists.rows) await enqueueCollection(pool,row.id,now.toISOString().slice(0,10));
}
