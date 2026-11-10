import test,{after} from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir,mkdtemp,writeFile,rm } from "node:fs/promises";
import { resolve,join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { creatorRow } from "./fixtures/creator-discovery.js";
import { workspaceFixture } from "./fixtures/workspace.js";
await mkdir(resolve("work"),{recursive:true});const dir=await mkdtemp(resolve("work/workspace-render-"));
const components:Record<string,any>={};
for(const entry of ["EvidencePages","CreatorsPage","CreatorDiscoveryPage","AskPage","DataSourcesPage"]){const result=await build({entryPoints:[`src/components/workspace/${entry}.tsx`],bundle:true,platform:"node",format:"esm",write:false,external:["react","react-dom","lucide-react"],loader:{".css":"empty"}});const file=join(dir,`${entry}.mjs`);await writeFile(file,result.outputFiles[0].contents);Object.assign(components,await import(pathToFileURL(file).href));}
after(()=>rm(dir,{recursive:true,force:true}));
const render=(name:string,data=workspaceFixture())=>renderToStaticMarkup(h(components[name],{data,refresh:()=>{},header:()=>null}));
test("UI-E/F all six pages preserve designed sections and hide unsupported scores/rankings without internal IDs",()=>{
 for(const name of ["BriefsPage","CreatorsPage","ScoresPage","AskPage","ReportsPage","DataSourcesPage"]){const html=render(name);assert.ok(html.includes("ui-section-card")||html.includes("creator-reference-card"),name);assert.doesNotMatch(html,/\b(?:CA|UI)-\d+/);assert.ok(!html.includes("Sample data"));assert.ok(!html.includes("n = Unavailable")&&!html.includes("Unavailable to Unavailable"));}
 assert.match(render("BriefsPage"),/Opportunities this week/);assert.match(render("BriefsPage"),/The brief/);assert.match(render("ScoresPage"),/Draft analysis \(JSON\)/);assert.match(render("ScoresPage"),/Analyse this ad.*category, format and creative/);
});
test("UI-12 creator discovery separates unverified discovery from the official research card",()=>{
 const shell=render("CreatorsPage");for(const title of ["Find creators","Results","Segments"])assert.match(shell,new RegExp(title));assert.doesNotMatch(shell,/50[kK] followers|Over 40K/);
 const row=creatorRow(),html=renderToStaticMarkup(h(components.CreatorResearchCard,{workspaceId:"fixture",row,busy:false,act:async()=>true}));assert.match(html,/Fictional creator/);assert.match(html,/10,000/);assert.match(html,/Observed/);assert.match(html,/Why this fit/);assert.match(html,/12\/12 posts/);
 row.profile.verification="Unverified";row.evaluation.engagement=null;const missing=renderToStaticMarkup(h(components.CreatorResearchCard,{workspaceId:"fixture",row,busy:false,act:async()=>true}));assert.match(missing,/Unverified/);assert.ok(!missing.includes("10,000"));
});
test("UI-13 saved checklist results remain Estimated and unknown Working Score columns disappear",()=>{const html=render("ScoresPage");assert.match(html,/Hook in 2 seconds/);assert.match(html,/Estimated/);assert.match(html,/call to action/i);assert.ok(!html.includes('data-label="Working Score"'));});
test("UI-14/15 no invented Ask history or weekly packs; saved markdown download remains available",()=>{assert.match(render("AskPage"),/No earlier questions in this session/);const report=render("ReportsPage");assert.match(report,/\/api\/reports\/fixture-report\/download/);assert.match(report,/Saved source-backed report text/);for(let n=1;n<=8;n++)assert.ok(report.includes(`${n}. `));assert.match(report,/Weekly packs are not available yet/);});
test("UI-16 keeps sync disabled and accounts separate, and does not show token fields",()=>{const html=render("DataSourcesPage");assert.match(html,/Sync now<\/button>/);assert.match(html,/Live sync is off/);assert.match(html,/GBP/);assert.match(html,/3 Nov 2026/);assert.ok(!html.includes('name="token"')&&!html.includes('type="password"'));assert.match(html,/Ad naming convention/);assert.match(html,/Users and client access/);});
