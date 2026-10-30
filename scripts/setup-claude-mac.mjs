#!/usr/bin/env node
import { constants } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
let configPath;
let databasePath = resolve(root, process.env.EXTER_DB_PATH || ".data/exter.db");
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--dry-run") dryRun = true;
  else if (arg === "--config" || arg === "--db") {
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a path.`);
    if (arg === "--config") configPath = resolve(value);
    else databasePath = resolve(value);
  } else if (arg === "--help") {
    console.log("Usage: npm run claude:setup -- [--dry-run] [--config path] [--db path]\nConfigures Claude Desktop on this Mac using the full Exter checkout. Existing config is preserved and backed up. No API key is needed.");
    process.exit(0);
  } else throw new Error(`Unknown option: ${arg}`);
}

async function setup() {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Install Node.js 24 or newer before setting up Exter.");
  const loader = join(root, "node_modules/tsx/dist/loader.mjs");
  try { await access(loader); }
  catch { throw new Error("Exter dependencies are missing. Run npm ci in the full Exter checkout first."); }
  const entry = {
    command: process.execPath,
    args: ["--import", loader, join(root, "scripts/claude-mcp.ts")],
    env: { EXTER_DB_PATH: databasePath },
  };
  if (dryRun) {
    // Print only the generated entry, never an existing config or its secrets.
    console.log(JSON.stringify({ mcpServers: { "exter-monitor": entry } }, null, 2));
    return;
  }
  if (!configPath) {
    if (process.platform !== "darwin")
      throw new Error("Run this helper on your Mac, or use --config with an explicit export/test path.");
    configPath = join(homedir(), "Library/Application Support/Claude/claude_desktop_config.json");
  }
  let previous = {};
  let original;
  try {
    const stat = await lstat(configPath);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Claude config must be a regular file; no changes made.");
    if (stat.size > 2 * 1024 * 1024)
      throw new Error("Claude config exceeds the supported size; no changes made.");
    original = await readFile(configPath, "utf8");
    try { previous = JSON.parse(original); }
    catch { throw new Error("Existing Claude config is not valid JSON; no changes made."); }
    if (!previous || typeof previous !== "object" || Array.isArray(previous) ||
        (previous.mcpServers !== undefined &&
          (!previous.mcpServers || typeof previous.mcpServers !== "object" || Array.isArray(previous.mcpServers))))
      throw new Error("Existing Claude config has an unsupported structure; no changes made.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const prepared = spawnSync(process.execPath, [
    "--import", loader, join(root, "scripts/prepare-claude-db.ts"), "--db", databasePath,
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (prepared.error || prepared.status !== 0)
    throw new Error("Could not prepare Exter’s saved research database. Run npm ci and check the --db path; Claude config was not changed.");
  const next = { ...previous, mcpServers: { ...previous.mcpServers, "exter-monitor": entry } };
  const serialized = JSON.stringify(next, null, 2) + "\n";
  let backup;
  if (serialized !== original) {
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
    if (original !== undefined) {
      backup = `${configPath}.exter-backup-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
      await copyFile(configPath, backup, constants.COPYFILE_EXCL);
      await chmod(backup, 0o600);
    }
    const temporary = join(dirname(configPath), `.${basename(configPath)}.exter-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(serialized, "utf8");
      await handle.close();
      handle = undefined;
      await rename(temporary, configPath);
    } catch (error) {
      await handle?.close();
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  console.log(`Exter Monitor configured in ${configPath}`);
  if (backup) console.log(`Previous config backed up to ${backup}`);
  console.log("Existing workspaces and research were preserved. A fresh database includes the saved Valentte research and public ad snapshot, with original observation dates.");
  console.log("Fully quit and reopen Claude Desktop. Confirm exter-monitor appears, then ask: What does Exter know about Valentte? Cite sources and dates and distinguish missing engagement metrics.");
}
setup().catch((error) => {
  console.error(error instanceof Error ? error.message : "Claude setup failed.");
  process.exitCode = 1;
});
