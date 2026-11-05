import {workAdMediaOnce} from "../ad-media/api.js";
import { infrastructureDatabase, migrate } from "./database.js";
import { schedule, workOnce, workOwnedOnce } from "./jobs.js";
import { configuredKernelArtifactClient, workKernelOnce } from "../kernel/worker.js";
const role = process.argv[2];
const pool = infrastructureDatabase();
try {
  await migrate(pool);
  if (role === "scheduler") await schedule(pool);
  else if (role === "migrate") { /* schema is ready */ }
  else if (role === "worker") {
    const artifactClient = configuredKernelArtifactClient();
    let stopping = false;
    const shutdown = new AbortController();
    process.once("SIGTERM", () => { stopping = true; shutdown.abort(); });
    process.once("SIGINT", () => { stopping = true; shutdown.abort(); });
    while (!stopping) {
      const collected = await workOnce(pool);
      const owned = !stopping ? await workOwnedOnce(pool) : false;
      const media = !stopping ? await workAdMediaOnce(pool) : false;
      const staged = artifactClient && !stopping ? await workKernelOnce(pool, artifactClient, { signal: shutdown.signal }) : false;
      if (!collected && !owned && !media && !staged && !stopping) await new Promise(resolve => setTimeout(resolve,1000));
    }
  } else throw new Error("Unknown runtime role.");
} catch {
  console.error("Infrastructure operation failed; check database configuration, permissions and service status. Credentials are never included in logs.");
  process.exitCode = 1;
} finally { await pool.end(); }
