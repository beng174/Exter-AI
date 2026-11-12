import {workOnboardingOnce} from "../onboarding/worker.js";
import { workCreatorDiscoveryOnce } from "../creators/discovery-jobs.js";
import { retainCreatorPreviews } from "../creators/discovery-previews.js";
import {workAdMediaOnce} from "../ad-media/api.js";
import {workPublicCategoriesOnce} from "../public-categories/jobs.js";
import { infrastructureDatabase, migrate, initialiseInfrastructure, migrationDiagnostic, MigrationError } from "./database.js";
import { schedule, workOnce, workOwnedOnce } from "./jobs.js";
import { configuredKernelArtifactClient, workKernelOnce } from "../kernel/worker.js";
import {runWorkerLoop} from "./worker-loop.js";
import {workerDiagnostic} from "./worker-diagnostics.js";
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
    const shutdown = new AbortController();
    process.once("SIGTERM", () => shutdown.abort());
    process.once("SIGINT", () => shutdown.abort());
    console.log(JSON.stringify({event:"worker_started",failureLimit:3}));
    await runWorkerLoop(pool,[
      {type:"onboarding",run:observer=>workOnboardingOnce(pool,observer)},
      {type:"collection",run:observer=>workOnce(pool,undefined,observer)},
      {type:"owned",run:observer=>workOwnedOnce(pool,observer)},
      {type:"media",run:observer=>workAdMediaOnce(pool,observer)},
      {type:"creators",run:observer=>workCreatorDiscoveryOnce(pool,{...observer,thumbnail:(workspace,profile)=>retainCreatorPreviews(pool,workspace,profile)})},
      {type:"categories",run:observer=>workPublicCategoriesOnce(pool,observer)},
      {type:"kernel",run:observer=>{const client=configuredKernelArtifactClient();return client?workKernelOnce(pool,client,{...observer,signal:shutdown.signal}):Promise.resolve(false);}},
    ],{signal:shutdown.signal});
  } else throw new Error("Unknown runtime role.");
} catch (error) {
  console.error(error instanceof MigrationError ? migrationDiagnostic(error) : JSON.stringify({event:"infrastructure_stopped",role,error:workerDiagnostic(error)}));
  process.exitCode = 1;
} finally { await pool.end(); }
