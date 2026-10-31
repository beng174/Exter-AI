import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const patterns = [/AIza[0-9A-Za-z_-]{35}/, /AQ\.[0-9A-Za-z_-]{35,}/, /(?<![0-9A-Za-z])(?:EAAB|EAAJ|EAAG)[0-9A-Za-z]{30,}(?![0-9A-Za-z])/, /sk-(?:proj-)?[0-9A-Za-z_-]{30,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
let failed = false;
for (const file of execFileSync("git",["ls-files","-z"]).toString().split("\0").filter(Boolean)) {
  let data;
  try { data = readFileSync(file); } catch { continue; }
  if (data.length > 20_000_000 || data.includes(0)) continue;
  if (patterns.some(p => p.test(data.toString("utf8")))) {
    console.error(`Potential secret detected in tracked file: ${file}. Value withheld.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("No known secret patterns found in tracked text files.");
