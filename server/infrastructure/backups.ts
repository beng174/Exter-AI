import { backup, type DatabaseSync } from "node:sqlite";
import { mkdir, readdir, unlink, stat, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { infrastructureDatabase } from "./database.js";
export function libpqEnvironment(connectionString: string): NodeJS.ProcessEnv {
  const url = new URL(connectionString);
  if (!["postgres:","postgresql:"].includes(url.protocol)) throw new Error("Unsupported database connection format.");
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) };
  for (const [parameter,variable] of Object.entries({ sslmode: "PGSSLMODE", sslrootcert: "PGSSLROOTCERT", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY", options: "PGOPTIONS", channel_binding: "PGCHANNELBINDING" })) {
    const value = url.searchParams.get(parameter);
    if (value) (env as NodeJS.ProcessEnv)[variable] = value;
  }
  return env;
}
export async function createBackup(db: DatabaseSync, root = process.env.EXTER_BACKUP_PATH || "/var/data/backups") {
  await mkdir(root,{ recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g,"-");
  const sqlite = join(root,`${stamp}.sqlite`);
  await backup(db,sqlite);
  let postgres: string | null = null;
  if (process.env.DATABASE_URL) {
    postgres = join(root,`${stamp}.dump`);
    await new Promise<void>((resolve,reject) => {
      // Split the connection into libpq variables. Never put credentials in args or logs.
      const child = spawn("pg_dump",["--format=custom","--file",`${postgres}.partial`], { env: libpqEnvironment(process.env.DATABASE_URL!), stdio: "ignore" });
      child.once("error",() => reject(new Error("Database backup process unavailable.")));
      child.once("exit",code => code === 0 ? resolve() : reject(new Error("Database backup failed; check database permissions and client version.")));
    });
    await rename(`${postgres}.partial`,postgres);
  }
  const manifest = { sqlite, postgres, createdAt: new Date().toISOString() };
  if (process.env.DATABASE_URL) await infrastructureDatabase().query("INSERT INTO backup_runs(created_at,status) VALUES(now(),'complete')");
  // Retain seven days; never include media files in this cleanup.
  for (const file of await readdir(root)) {
    if (!/^\d{4}-\d{2}-\d{2}T.*\.(sqlite|dump|partial)$/.test(file)) continue;
    const path = resolve(root,file);
    if ((await stat(path)).mtimeMs < Date.now()-7*86400000) await unlink(path);
  }
  return manifest;
}
export function startDailyBackups(db: DatabaseSync) {
  if (process.env.EXTER_BACKUPS_ENABLED !== "true") return () => {};
  let running = false;
  let lastDay = "";
  const tick = async () => {
    const day = new Date().toISOString().slice(0,10);
    if (running || day === lastDay) return;
    running = true;
    try { await createBackup(db); lastDay = day; console.log("Daily database backup completed."); }
    catch {
      console.error("Daily database backup failed; check storage, database permissions and pg_dump version.");
      if (process.env.DATABASE_URL) await infrastructureDatabase().query("INSERT INTO backup_runs(created_at,status) VALUES(now(),'failed')").catch(() => {});
    } finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(),3600000);
  timer.unref();
  return () => clearInterval(timer);
}
