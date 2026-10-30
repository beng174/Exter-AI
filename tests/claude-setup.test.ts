import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
const setup = resolve("scripts/setup-claude-mac.mjs");
const run = (args: string[]) => {
  const result = spawnSync(process.execPath, [setup, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
};
function temporary() { return mkdtempSync(join(tmpdir(), "exter-claude-setup-")); }
test("Mac setup preserves unrelated config, backs it up and seeds the saved case", () => {
  const dir = temporary();
  try {
    const config = join(dir, "claude.json"), dbPath = join(dir, "exter.db");
    const original = JSON.stringify({ preferences: { theme: "dark" }, mcpServers: { other: { command: "other-tool", env: { PRIVATE_TOKEN: "must-not-print-this" } } } });
    writeFileSync(config, original);
    const result = run(["--config", config, "--db", dbPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes("must-not-print-this"));
    const updated = JSON.parse(readFileSync(config, "utf8"));
    assert.deepEqual(updated.preferences, { theme: "dark" });
    assert.equal(updated.mcpServers.other.env.PRIVATE_TOKEN, "must-not-print-this");
    assert.equal(updated.mcpServers["exter-monitor"].command, process.execPath);
    assert.equal(updated.mcpServers["exter-monitor"].env.EXTER_DB_PATH, dbPath);
    assert.ok(updated.mcpServers["exter-monitor"].args.every((value: string, i: number) => i === 0 || value.startsWith("/")));
    assert.equal(statSync(config).mode & 0o777, 0o600);
    const backups = readdirSync(dir).filter((value) => value.includes("exter-backup"));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(dir, backups[0]), "utf8"), original);
    assert.equal(statSync(join(dir, backups[0])).mode & 0o777, 0o600);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(db.prepare("SELECT COUNT(*) n FROM ads").get()!.n, 58);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM brand_research").get()!.n, 1);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM ads WHERE source='sample'").get()!.n, 0);
    } finally { db.close(); }
    const repeated = run(["--config", config, "--db", dbPath]);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(readdirSync(dir).filter((value) => value.includes("exter-backup")).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("Malformed config is untouched and never creates a database or prints its contents", () => {
  const dir = temporary();
  try {
    const config = join(dir, "claude.json"), dbPath = join(dir, "exter.db");
    const malformed = '{"secret":"must-not-print-this",';
    writeFileSync(config, malformed);
    const result = run(["--config", config, "--db", dbPath]);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(config, "utf8"), malformed);
    assert.equal(existsSync(dbPath), false);
    assert.ok(!result.stderr.includes("must-not-print-this"));
    assert.deepEqual(readdirSync(dir), ["claude.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("Dry-run prints only the generated Exter entry and writes nothing", () => {
  const dir = temporary();
  try {
    const result = run(["--dry-run", "--config", join(dir, "claude.json"), "--db", join(dir, "exter.db")]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(Object.keys(JSON.parse(result.stdout).mcpServers), ["exter-monitor"]);
    assert.deepEqual(readdirSync(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("An existing Valentte workspace and its custom research are never overwritten", () => {
  const dir = temporary();
  try {
    const config = join(dir, "claude.json"), dbPath = join(dir, "exter.db");
    let result = run(["--config", config, "--db", dbPath]);
    assert.equal(result.status, 0, result.stderr);
    const db = new DatabaseSync(dbPath);
    const row = db.prepare("SELECT id,data FROM brands").get() as { id: string; data: string };
    const brand = JSON.parse(row.data);
    brand.voice = ["User-edited voice"];
    db.prepare("UPDATE brands SET data=? WHERE id=?").run(JSON.stringify(brand), row.id);
    db.prepare("UPDATE brand_research SET data=? WHERE brand_id=?").run('{"user":"custom research"}', row.id);
    db.prepare("DELETE FROM ads").run();
    db.close();
    result = run(["--config", config, "--db", dbPath]);
    assert.equal(result.status, 0, result.stderr);
    const checked = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(checked.prepare("SELECT COUNT(*) n FROM ads").get()!.n, 0, "existing source work is not replaced with bundled data");
      assert.equal((checked.prepare("SELECT data FROM brand_research").get() as { data: string }).data, '{"user":"custom research"}');
      assert.deepEqual(JSON.parse((checked.prepare("SELECT data FROM brands").get() as { data: string }).data).voice, ["User-edited voice"]);
    } finally { checked.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
