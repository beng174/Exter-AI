import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { startConnectionPolling } from "./connections.js";

const db = openDatabase();
const app = createApp(db);
app.locals.videoAnalysis.recoverInterruptedJobs();
const stopPolling = startConnectionPolling(db);
process.once("SIGTERM", () => {
  stopPolling();
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
