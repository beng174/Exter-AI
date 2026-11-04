import test,{after} from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir,mkdtemp,writeFile,rm } from "node:fs/promises";
import { resolve,join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { workspaceFixture } from "./fixtures/workspace.js";
await mkdir(resolve("work"),{recursive:true});const dir=await mkdtemp(resolve("work/workspace-render-"));
const components:Record<string,any>={};
for(const entry of ["EvidencePages","CreatorsPage","AskPage","DataSourcesPage"]){const result=await build({entryPoints:[`src/components/workspace/${entry}.tsx`],bundle:true,platform:"node",format:"esm",write:false,external:["react","react-dom","lucide-react"],loader:{".css":"empty"}});const file=join(dir,`${entry}.mjs`);await writeFile(file,result.outputFiles[0].contents);Object.assign(components,await import(pathToFileURL(file).href));}
after(()=>rm(dir,{recursive:true,force:true}));
const render=(name:string,data=workspaceFixture())=>renderToStaticMarkup(h(components[name],{data,refresh:()=>{},header:()=>null}));
test("UI-E/F all six pages preserve designed sections and hide unsupported scores/rankings without internal IDs",()=>{
 for(const name of ["BriefsPage","CreatorsPage","ScoresPage","AskPage","ReportsPage","DataSourcesPage"]){const html=render(name);assert.ok(html.includes("ui-section-card")||html.includes("creator-reference-card"),name);assert.doesNotMatch(html,/\b(?:CA|UI)-\d+/);assert.ok(!html.includes("Sample data"));assert.ok(!html.includes("n = Unavailable")&&!html.includes("Unavailable to Unavailable"));}
 assert.match(render("BriefsPage"),/Opportunities this week/);assert.match(render("BriefsPage"),/The brief/);assert.match(render("ScoresPage"),/Score draft:.*not available/);assert.match(render("ScoresPage"),/Not validated yet/);
});
test("UI-12 only saved profiles, qualitative fit and source metrics are shown",()=>{const html=render("CreatorsPage");assert.match(html,/Fixture creator/);assert.match(html,/50[kK] followers/);assert.ok(!html.includes("92%")&&!html.includes("Tone match100"));assert.match(html,/No attributed brand ad is saved/);});
test("UI-13 saved checklist results remain Estimated and unknown Working Score columns disappear",()=>{const html=render("ScoresPage");assert.match(html,/Hook in 2 seconds/);assert.match(html,/Estimated/);assert.match(html,/Call to action/);assert.ok(!html.includes('data-label="Working Score"'));});
test("UI-14/15 no invented Ask history or weekly packs; saved markdown download remains available",()=>{assert.match(render("AskPage"),/No earlier questions in this session/);const report=render("ReportsPage");assert.match(report,/\/api\/reports\/fixture-report\/download/);assert.match(report,/Saved source-backed report text/);for(let n=1;n<=8;n++)assert.ok(report.includes(`${n}. `));assert.match(report,/Weekly packs are not available yet/);});
test("UI-16 keeps sync disabled and accounts separate, and does not show token fields",()=>{const html=render("DataSourcesPage");assert.match(html,/Sync now<\/button>/);assert.match(html,/Live sync is off/);assert.match(html,/GBP/);assert.match(html,/3 Nov 2026/);assert.ok(!html.includes('name="token"')&&!html.includes('type="password"'));assert.match(html,/Ad naming convention/);assert.match(html,/Users and client access/);});
