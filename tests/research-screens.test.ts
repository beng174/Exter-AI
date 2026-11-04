import test,{after} from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir,mkdtemp,writeFile,rm } from "node:fs/promises";
import { resolve,join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { researchFixture } from "./fixtures/research.js";
import { researchWindow } from "../shared/creative-research.js";
import type { ResearchData } from "../src/components/research/useResearchData.js";
await mkdir(resolve("work"),{recursive:true});const dir=await mkdtemp(resolve("work/research-render-"));
const components:Record<string,any>={};
for(const entry of ["HomeScreen","BrandScreen","ResearchScreens"]){const result=await build({entryPoints:[`src/components/research/${entry}.tsx`],bundle:true,platform:"node",format:"esm",write:false,external:["react","react-dom","lucide-react"],loader:{".css":"empty"}});const file=join(dir,`${entry}.mjs`);await writeFile(file,result.outputFiles[0].contents);Object.assign(components,await import(pathToFileURL(file).href));}
after(()=>rm(dir,{recursive:true,force:true}));
function data():ResearchData {const {library,brand}=researchFixture();return {library,brand,window:researchWindow(library.creatives),research:null,researchFailed:false,watchlists:[],infrastructure:{meta:{status:"not_connected"},database:"not_configured"},connections:[],budgets:null};}
const render=(name:string,source=data())=>renderToStaticMarkup(h(components[name],{data:source,selection:{asOf:source.window.asOf},refresh:()=>{},onManageBrands:()=>{},dimension:"format",onDimension:()=>{}}));
test("UI-04 through UI-10 all seven screens render real evidence with exact Creative URLs and no old page tabs",()=>{
  for(const name of ["HomeScreen","BrandScreen","CompetitorsScreen","FormatsScreen","PatternsScreen","AudienceScreen","WinnersScreen"]){const html=render(name);assert.ok(html.includes("ui-section-card"),name);assert.ok(!html.includes("rws-tabs")&&!html.includes("Sample data"),name);assert.ok(!html.includes("n = Unavailable")&&!html.includes("Unavailable to Unavailable"),name);}
  assert.match(render("HomeScreen"),/Longest running/);assert.match(render("WinnersScreen"),/Longest running/);assert.match(render("CompetitorsScreen"),/view=creatives.*kind=active/);assert.match(render("PatternsScreen"),/dimension=format/);
});
test("UI-04 accounts stay separated, and unsupported winner/priority/demographic calculations remain unavailable",()=>{
  const source=data(),home=render("HomeScreen",source);assert.ok(home.includes("GBP")&&home.includes("USD"));assert.ok(!home.includes("£100.00"),"multiple account scopes require an explicit choice");
  assert.match(render("WinnersScreen"),/Your own winners appear once your ad account/);assert.match(render("PatternsScreen"),/Not yet available/);assert.match(render("AudienceScreen"),/Audience demographics are never inferred/);
  source.library.creatives[0].performance=source.library.creatives[0].performance.slice(0,1);assert.match(render("HomeScreen",source),/£100.00/);
});
test("UI-07/UI-08 no saved analysis yields compact gaps rather than guessed formats or actions",()=>{
  const source=data();source.library.creatives=source.library.creatives.map(row=>({...row,analysis:null,creativeFormat:null,hookType:null,angle:null,offerType:null,durationSeconds:null}));
  const formats=render("FormatsScreen",source),patterns=render("PatternsScreen",source);assert.match(formats,/No supported format analysis is saved/);assert.match(patterns,/No supported labels are saved/);assert.ok(!formats.includes("tbody"));
});

test("Review fixes hide universal unavailable winner columns and mark uncollected brand headers once",()=>{
 const source=data();source.library.competitors.push({key:"pending",brandId:null,name:"Pending advertiser",status:"not-started"});
 const winners=render("WinnersScreen",source);assert.ok(!winners.includes('data-label="Working Score"')&&!winners.includes('data-label="Confidence"'));assert.match(winners,/reference-thumb/);assert.match(winners,/First line/);
 const competitors=render("CompetitorsScreen",source);assert.equal((competitors.match(/not-collected-header/g)||[]).length,1);
 for(const name of ["HomeScreen","BrandScreen","CompetitorsScreen","FormatsScreen","PatternsScreen","AudienceScreen","WinnersScreen"])assert.doesNotMatch(render(name,source),/\b(?:CA|UI)-\d+/);
});

test("Scorecards never label unsupported share of voice Observed, and keep genuine observed zero",()=>{
 const source=data();source.library.competitors.push({key:"pending",brandId:null,name:"Pending advertiser",status:"not-started"});
 for(const name of ["HomeScreen","CompetitorsScreen"]) {
  const html=render(name,source),row=html.match(/<tr[^>]*><td[^>]*>Share of voice<\/td>.*?<\/tr>/)?.[0];
  assert.ok(row,name);assert.match(row,/data-label="Basis"><span[^>]*>Unavailable</,name);
  const active=html.match(/<tr[^>]*><td[^>]*>Active ads<\/td>.*?<\/tr>/)?.[0];assert.match(active!,/data-label="Basis"><span[^>]*>Observed</,name);
 }
 const production=render("FormatsScreen",source),unknown=production.match(/<tr[^>]*><td[^>]*>Captions on<\/td>.*?<\/tr>/)?.[0],talking=production.match(/<tr[^>]*><td[^>]*>Talking to camera \(%\)<\/td>.*?<\/tr>/)?.[0];
 assert.match(unknown!,/data-label="Basis"><span[^>]*>Unavailable</);assert.match(talking!,/data-label="Basis"><span[^>]*>Modelled</);
 const audience=render("AudienceScreen",source),pending=audience.match(/<tr[^>]*><td[^>]*>Pending advertiser<\/td>.*?<\/tr>/)?.[0];assert.match(pending!,/data-label="Basis"><span[^>]*>Unavailable</);
});
