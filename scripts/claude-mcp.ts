import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMonitorMcpServer } from "../server/mcp/monitor.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const path = resolve(root, process.env.EXTER_DB_PATH || ".data/exter.db");
if (!existsSync(path)) {
  console.error(
    "Exter Monitor database not found. Start the Exter app first, or set EXTER_DB_PATH to an existing database. No database was created.",
  );
  process.exit(1);
}
const db = new DatabaseSync(path, { readOnly: true });
db.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;");
const server = createMonitorMcpServer(db);
const transport = new StdioServerTransport();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  db.close();
}
process.once("SIGTERM", () => {
  void close().finally(() => process.exit(0));
});
process.once("SIGINT", () => {
  void close().finally(() => process.exit(0));
});
try {
  await server.connect(transport);
} catch (error) {
  console.error(
    "Exter Monitor could not start:",
    error instanceof Error ? error.message : "Unknown error",
  );
  await close();
  process.exit(1);
}
