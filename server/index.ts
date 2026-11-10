import { basicAuth } from "./auth.js";
import { startDailyBackups } from "./infrastructure/backups.js";
import { infrastructureDatabase, initialiseInfrastructure, migrationDiagnostic } from "./infrastructure/database.js";
import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { startConnectionPolling } from "./connections.js";
import { recoverHostedValentteResearch } from "./demo/reconcile.js";

basicAuth(); // Validate the production access gate before opening any databases.
for (const name of ["GEMINI_API_KEY","META_ACCESS_TOKEN","APIFY_TOKEN","YOUTUBE_API_KEY","DATABASE_URL"])
  console.log(`${name}: ${process.env[name] ? "configured" : "not configured"}`);
if (process.env.DATABASE_URL) {
  try {
    await initialiseInfrastructure(infrastructureDatabase(), {
      onProgress: phase => console.log(`Database initialisation: ${phase}.`),
      onRetry: error => console.warn(`${migrationDiagnostic(error)} Retrying within the startup deadline.`),
    });
    console.log("Database initialisation complete.");
  }
  catch (error) { console.error(migrationDiagnostic(error)); process.exit(1); }
}
console.log("Web initialisation: local_database.");
const db = openDatabase(undefined, false);
console.log("Web initialisation: routes.");
const app = createApp(db);
console.log("Web initialisation: recovery.");
app.locals.videoAnalysis.recoverInterruptedJobs();
recoverHostedValentteResearch(db);
// Keep boot limited to serving saved evidence. Browsers and model cold starts
// must be explicit operator actions, never competing with the web server for
// memory during deploy or restarting automatically after a process is killed.
const stopPolling = startConnectionPolling(db);
const stopBackups = startDailyBackups(db);
process.once("SIGTERM", () => {
  stopPolling();
  stopBackups();
  process.exit(0);
});
const server = createServer(app);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
console.log("Web initialisation: listening.");
server.listen(port, "0.0.0.0", () =>
  console.log(
    `Exter AI available on port ${port}. Sample/import workspaces available. Provider polling runs only after authorised account setup and a successful sync.`,
  ),
);
