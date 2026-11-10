import {workOnboardingOnce} from "../onboarding/worker.js";
import { workCreatorDiscoveryOnce } from "../creators/discovery-jobs.js";
import { retainCreatorPreviews } from "../creators/discovery-previews.js";
import {workAdMediaOnce} from "../ad-media/api.js";
import {workPublicCategoriesOnce} from "../public-categories/jobs.js";
import { infrastructureDatabase, migrate, initialiseInfrastructure, migrationDiagnostic, MigrationError } from "./database.js";
import { schedule, workOnce, workOwnedOnce } from "./jobs.js";
import { configuredKernelArtifactClient, workKernelOnce } from "../kernel/worker.js";
const role = process.argv[2];
const pool = infrastructureDatabase();
try {
  if (role === "migrate") await migrate(pool);
  else await initialiseInfrastructure(pool, {
    onProgress: phase => console.log(`Database initialisation: ${phase}.`),
    onRetry: error => console.warn(`${migrationDiagnostic(error)} Retrying within the startup deadline.`),
  });
  if (role === "scheduler") await schedule(pool);
  else if (role === "migrate") { /* schema is ready */ }
  else if (role === "worker") {
    const artifactClient = configuredKernelArtifactClient();
    let stopping = false;
    const shutdown = new AbortController();
    process.once("SIGTERM", () => { stopping = true; shutdown.abort(); });
    process.once("SIGINT", () => { stopping = true; shutdown.abort(); });
    while (!stopping) {
      const onboarding = await workOnboardingOnce(pool);
      const collected = await workOnce(pool);
      const owned = !stopping ? await workOwnedOnce(pool) : false;
      const media = !stopping ? await workAdMediaOnce(pool) : false;
      const creators = !stopping ? await workCreatorDiscoveryOnce(pool, {thumbnail:(workspace,profile)=>retainCreatorPreviews(pool,workspace,profile)}) : false;
      const categories = !stopping ? await workPublicCategoriesOnce(pool) : false;
      const staged = artifactClient && !stopping ? await workKernelOnce(pool, artifactClient, { signal: shutdown.signal }) : false;
      if (!onboarding && !collected && !owned && !media && !categories && !creators && !staged && !stopping) await new Promise(resolve => setTimeout(resolve,1000));
    }
  } else throw new Error("Unknown runtime role.");
} catch (error) {
  console.error(error instanceof MigrationError ? migrationDiagnostic(error) : "Infrastructure operation failed; check database configuration, permissions and service status. Credentials are never included in logs.");
  process.exitCode = 1;
} finally { await pool.end(); }
