// A disposable integration-test worker. No real provider or credential is used.
import pg from "pg";
import { claimJob } from "../../server/infrastructure/jobs.js";
import { collectMetaPage, MetaLibraryConnector } from "../../server/connectors/meta-library.js";
try {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const owner = "process-crash-fixture";
  const job = await claimJob(pool,owner);
  if (!job) throw new Error("Missing fixture job");
  const connector = new MetaLibraryConnector({ token: "fixture-only", fetch: async () => Response.json({ data: [{ id: "101", page_id: "12", eu_total_reach: 1200 }], paging: { next: "unused", cursors: { after: "page-two" } } }) });
  await collectMetaPage(pool,job.id,connector,owner);
  process.send?.({ checkpoint: true, runId: job.id });
  setInterval(() => {},1000); // Parent sends SIGKILL after the durable page commit.
} catch { process.send?.({ failed: true }); process.exit(1); }
