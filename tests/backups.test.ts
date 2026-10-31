import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createBackup } from "../server/infrastructure/backups.js";
test("online SQLite backup restores committed content into a separately opened database", async () => {
  const root = await mkdtemp(join(tmpdir(),"exter-backup-"));
  const db = new DatabaseSync(join(root,"live.db"));
  try {
    db.exec("PRAGMA journal_mode=WAL;CREATE TABLE evidence(id TEXT PRIMARY KEY,value TEXT);INSERT INTO evidence VALUES('e1','verified source');");
    const result = await createBackup(db,join(root,"backups"));
    const restored = new DatabaseSync(result.sqlite);
    try { assert.equal(restored.prepare("SELECT value FROM evidence WHERE id='e1'").get()!.value,"verified source"); }
    finally { restored.close(); }
  } finally { db.close(); await rm(root,{ recursive: true, force: true }); }
});

test("backup connection parsing preserves credentials and TLS selectors only in the child environment", async () => {
  const { libpqEnvironment } = await import("../server/infrastructure/backups.js");
  const env = libpqEnvironment("postgresql://test-user:test%3Apassword@db.example.com:5433/test_db?sslmode=verify-full&sslrootcert=%2Ftmp%2Fca.pem");
  assert.equal(env.PGUSER,"test-user");
  assert.equal(env.PGPASSWORD,"test:password");
  assert.equal(env.PGHOST,"db.example.com");
  assert.equal(env.PGPORT,"5433");
  assert.equal(env.PGDATABASE,"test_db");
  assert.equal(env.PGSSLMODE,"verify-full");
  assert.equal(env.PGSSLROOTCERT,"/tmp/ca.pem");
});
