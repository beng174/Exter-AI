import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateVideoPredictions, parseVideoLabelCsv } from "../shared/video-evaluation.js";

const inputs: string[] = [];
let labelsPath = "", output = "";
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === "--help") {
    console.log("Usage: npm run video:evaluate -- --labels human-labels.csv --predictions gemini.json [--predictions pegasus.json] [--output report.json]\nOffline comparison only. Requires human-labelled real ads; never calls a model or sends labels to a provider.");
    process.exit(0);
  }
  if (!["--labels", "--predictions", "--output"].includes(flag)) throw new Error(`Unknown option ${flag}.`);
  const value = process.argv[++index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a file path.`);
  if (flag === "--labels") labelsPath = value;
  else if (flag === "--output") output = value;
  else inputs.push(value);
}
if (!labelsPath || !inputs.length) throw new Error("Provide --labels CSV and at least one --predictions JSON. Use --help for syntax.");
if (output && [labelsPath, ...inputs].some((path) => resolve(path) === resolve(output)))
  throw new Error("The evaluation report must not overwrite human labels or prediction inputs.");
async function boundedRead(path: string) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error("Evaluation inputs must be regular files no larger than 20 MB.");
  return readFile(path, "utf8");
}
const labels = parseVideoLabelCsv(await boundedRead(labelsPath));
const predictions = await Promise.all(inputs.map(async (path) => JSON.parse(await boundedRead(path)) as unknown));
const report = evaluateVideoPredictions(labels, predictions);
const body = JSON.stringify(report, null, 2) + "\n";
if (output) await writeFile(output, body, { mode: 0o600 });
console.log(body);
