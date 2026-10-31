import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";

test("secret scan rejects standalone credential patterns without exposing values and ignores incidental embedded base64", () => {
  const dir = mkdtempSync(join(tmpdir(),"exter-scan-"));
  const script = resolve("scripts/check-secrets.mjs");
  try {
    execFileSync("git",["init","--quiet",dir]);
    const fixtures = ["AIza"+"a".repeat(35),"AQ."+"b".repeat(40),"EAAB"+"c".repeat(40),"sk-proj-"+"d".repeat(40)];
    writeFileSync(join(dir,"fixture.txt"),"");
    execFileSync("git",["-C",dir,"add","fixture.txt"]);
    for (const value of fixtures) {
      writeFileSync(join(dir,"fixture.txt"),`CREDENTIAL=${value}\n`);
      const result = spawnSync(process.execPath,[script],{ cwd: dir,encoding: "utf8" });
      assert.equal(result.status,1);
      const output = result.stdout+result.stderr;
      assert.match(output,/Potential secret/);
      assert.ok(!output.includes(value));
    }
    writeFileSync(join(dir,"fixture.txt"),"data:image/png;base64,ABC"+"EAAB"+"A".repeat(200));
    assert.equal(spawnSync(process.execPath,[script],{ cwd: dir }).status,0);
  } finally { rmSync(dir,{ recursive: true,force: true }); }
});
