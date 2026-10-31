import { infrastructureDatabase, migrate } from "./database.js";
import { schedule, workOnce } from "./jobs.js";
const role = process.argv[2];
const pool = infrastructureDatabase();
try {
  await migrate(pool);
  if (role === "scheduler") await schedule(pool);
  else if (role === "migrate") { /* schema is ready */ }
  else if (role === "worker") {
    let stopping = false;
    process.once("SIGTERM", () => { stopping = true; });
    process.once("SIGINT", () => { stopping = true; });
    while (!stopping) {
      if (!await workOnce(pool)) await new Promise(resolve => setTimeout(resolve,1000));
    }
  } else throw new Error("Unknown runtime role.");
} catch {
  console.error("Infrastructure operation failed; check database configuration, permissions and service status. Credentials are never included in logs.");
  process.exitCode = 1;
} finally { await pool.end(); }
