import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ANGLE_VALUES, AUDIO_TYPE_VALUES, CLAIM_TYPE_VALUES, CREATIVE_BOOLEAN_TAGS, FORMAT_VALUES, HOOK_TYPE_VALUES, OFFER_TYPE_VALUES } from "../shared/creative-taxonomy.js";
import { LABELLING_FIELDS, LABELLING_GUIDE_VERSION, LABELLING_SCHEMA_VERSION } from "../shared/labelling.js";

test("human dropdowns use the shared model categories without adding a carousel production format", () => {
  for (const [key, values] of [["format", FORMAT_VALUES], ["hookType", HOOK_TYPE_VALUES], ["angle", ANGLE_VALUES], ["offerType", OFFER_TYPE_VALUES]] as const) {
    assert.deepEqual(LABELLING_FIELDS.find(field => field.key === key)!.options.map(option => option[0]), values);
  }
  assert.ok(!(FORMAT_VALUES as readonly string[]).includes("carousel"));
});

test("the versioned guide documents every current category with a definition and two examples", () => {
  const guide = readFileSync(new URL("../research/LABELLING-GUIDE.md", import.meta.url), "utf8");
  assert.ok(guide.includes(LABELLING_GUIDE_VERSION));
  assert.ok(guide.includes(LABELLING_SCHEMA_VERSION));
  const tables = new Map<string, readonly string[]>([
    ["Format (`format`)", FORMAT_VALUES], ["Hook type (`hookType`)", HOOK_TYPE_VALUES], ["Angle (`angle`)", ANGLE_VALUES],
    ["Offer type (`offerType`)", OFFER_TYPE_VALUES], ["Shared audio vocabulary (`audio_type`)", AUDIO_TYPE_VALUES],
    ["Shared claim types (`claim_type`)", CLAIM_TYPE_VALUES], ["Shared boolean tags (`tags`)", CREATIVE_BOOLEAN_TAGS],
  ] as const);
  for (const [heading, values] of tables) {
    const section = guide.split(`## ${heading}\n`)[1]?.split("\n## ")[0];
    assert.ok(section, `Missing guide section: ${heading}`);
    for (const value of values) {
      const row = section.split("\n").find(line => line.startsWith(`| \`${value}\` |`));
      assert.ok(row, `Missing documented value: ${heading} ${value}`);
      assert.equal(row.split("|").filter(cell => cell.trim()).length, 4, `Expected definition and two examples for ${value}`);
    }
  }
  assert.match(guide, /sung or rapped lyric.*music, not spoken voiceover/i);
  assert.match(guide, /licensing.*does \*\*not\*\* establish|licensing evidence/i);
  assert.match(guide, /may need substantiation \(ASA\)/);
  assert.match(guide, /Do not filter ads/);
});
