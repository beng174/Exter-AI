import { basicAuth } from "./auth.js";
import { startDailyBackups } from "./infrastructure/backups.js";
import { infrastructureDatabase, migrate } from "./infrastructure/database.js";
import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { startConnectionPolling } from "./connections.js";

basicAuth(); // Validate the production access gate before opening any databases.
for (const name of ["GEMINI_API_KEY","META_ACCESS_TOKEN","APIFY_TOKEN","YOUTUBE_API_KEY","DATABASE_URL"])
  console.log(`${name}: ${process.env[name] ? "configured" : "not configured"}`);
if (process.env.DATABASE_URL) {
  try { await migrate(infrastructureDatabase()); }
  catch { console.error("Database initialisation failed. Check DATABASE_URL, permissions and pgvector support."); process.exit(1); }
}
const db = openDatabase();
const app = createApp(db);
app.locals.videoAnalysis.recoverInterruptedJobs();
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
server.listen(port, "0.0.0.0", () =>
  console.log(
    `Exter AI available on port ${port}. Sample/import workspaces available. Provider polling runs only after authorised account setup and a successful sync.`,
  ),
);
