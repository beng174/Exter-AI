import { evaluateCreator } from "../shared/creator-discovery.js";
import { creatorBrief } from "./fixtures/creator-discovery.js";
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
for(const entry of ["EvidencePages","CreatorsPage","CreatorDiscoveryPage","CreatorRunHistory","AskPage","DataSourcesPage"]){const result=await build({entryPoints:[`src/components/workspace/${entry}.tsx`],bundle:true,platform:"node",format:"esm",write:false,external:["react","react-dom","lucide-react"],loader:{".css":"empty"}});const file=join(dir,`${entry}.mjs`);await writeFile(file,result.outputFiles[0].contents);Object.assign(components,await import(pathToFileURL(file).href));}
after(()=>rm(dir,{recursive:true,force:true}));
const render=(name:string,data=workspaceFixture())=>renderToStaticMarkup(h(components[name],{data,refresh:()=>{},header:()=>null}));
test("UI-E/F all six pages preserve designed sections and hide unsupported scores/rankings without internal IDs",()=>{
 for(const name of ["BriefsPage","CreatorsPage","ScoresPage","AskPage","ReportsPage","DataSourcesPage"]){const html=render(name);assert.ok(html.includes("ui-section-card")||html.includes("creator-reference-card"),name);assert.doesNotMatch(html,/\b(?:CA|UI)-\d+/);assert.ok(!html.includes("Sample data"));assert.ok(!html.includes("n = Unavailable")&&!html.includes("Unavailable to Unavailable"));}
 assert.match(render("BriefsPage"),/Opportunities this week/);assert.match(render("BriefsPage"),/The brief/);assert.match(render("ScoresPage"),/Draft analysis \(JSON\)/);assert.match(render("ScoresPage"),/Analyse this ad.*category, format and creative/);
});
test("UI-12 creator discovery separates unverified discovery from the official research card",()=>{
 const shell=render("CreatorsPage");for(const title of ["Find creators","Results","Segments"])assert.match(shell,new RegExp(title));assert.doesNotMatch(shell,/50[kK] followers|Over 40K/);
 const row=creatorRow(),html=renderToStaticMarkup(h(components.CreatorResearchCard,{workspaceId:"fixture",row,busy:false,act:async()=>true}));assert.match(html,/Harper Rowan/);assert.match(html,/10,000/);assert.match(html,/Observed/);assert.match(html,/Why this fit/);assert.match(html,/12\/12 posts/);
 row.profile.verification="Unverified";row.evaluation=evaluateCreator(row.profile,creatorBrief);const missing=renderToStaticMarkup(h(components.CreatorResearchCard,{workspaceId:"fixture",row,busy:false,act:async()=>true}));assert.match(missing,/Unverified/);assert.ok(!missing.includes("10,000"));
});
test("UI-13 saved checklist results remain Estimated and unknown Working Score columns disappear",()=>{const html=render("ScoresPage");assert.match(html,/Hook in 2 seconds/);assert.match(html,/Estimated/);assert.match(html,/call to action/i);assert.ok(!html.includes('data-label="Working Score"'));});
test("UI-14/15 no invented Ask history or weekly packs; saved markdown download remains available",()=>{assert.match(render("AskPage"),/No earlier questions in this session/);const report=render("ReportsPage");assert.match(report,/\/api\/reports\/fixture-report\/download/);assert.match(report,/Saved source-backed report text/);for(let n=1;n<=8;n++)assert.ok(report.includes(`${n}. `));assert.match(report,/Weekly packs are not available yet/);});
test("UI-16 keeps sync disabled and accounts separate, and does not show token fields",()=>{const html=render("DataSourcesPage");assert.match(html,/Sync now<\/button>/);assert.match(html,/Live sync is off/);assert.match(html,/GBP/);assert.match(html,/3 Nov 2026/);assert.ok(!html.includes('name="token"')&&!html.includes('type="password"'));assert.match(html,/Ad naming convention/);assert.match(html,/Users and client access/);});

test("creator search history shows live provider counts, run links, real charges and guarded reconciliation",()=>{
 const run={id:"fixture-search",kind:"discovery",status:"failed",found:2,verified:0,step:1,totalSteps:3,reservedGbp:.75,error:null,createdAt:"2026-11-10T12:00:00Z",providerRuns:[{reservationId:"fixture-hold",searchId:"fixture-search",runId:"fixture-run",status:"TIMED-OUT",found:12,usageUsd:.125,costGbp:.1,heldGbp:0,startedAt:"2026-11-10T12:00:00Z",checkedAt:"2026-11-10T12:15:00Z"}],legacyHolds:[{reservationId:"fixture-legacy-hold",heldGbp:.75,createdAt:"2026-11-10T12:00:00Z"}]};
 const html=renderToStaticMarkup(h(components.CreatorRunHistory,{runs:[run],busy:false,act:async()=>true}));
 assert.match(html,/https:\/\/console.apify.com\/actors\/runs\/fixture-run/);assert.match(html,/Records found/);assert.match(html,/\$0.1250/);assert.match(html,/Reconcile/);assert.match(html,/Confirm and reconcile/);assert.match(html,/Apify run ID/);assert.doesNotMatch(html,/Sample data/);
});
