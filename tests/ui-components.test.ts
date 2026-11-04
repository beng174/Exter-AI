import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdir,mkdtemp,writeFile,rm } from "node:fs/promises";
import { resolve,join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasValue, displayValue } from "../src/components/ui/value.js";
await mkdir(resolve("work"),{recursive:true});
const dir=await mkdtemp(resolve("work/ui-render-"));
const bundle=await build({entryPoints:["src/components/ui/index.ts"],bundle:true,format:"esm",platform:"node",write:false,external:["react","react-dom"],loader:{".css":"empty"}});
const file=join(dir,"components.mjs");await writeFile(file,bundle.outputFiles[0].contents);
const ui=await import(pathToFileURL(file).href);
after(()=>rm(dir,{recursive:true,force:true}));
const render=(component:any,props:any)=>renderToStaticMarkup(h(component,props));
const text=(html:string)=>html.replace(/<[^>]*>/g,"");
test("UI-01 missing values render Unavailable, never an invented zero",()=>{
  for(const missing of [null,undefined,NaN,Infinity,"","unknown","unsure"]) {
    assert.equal(hasValue(missing),false);assert.equal(displayValue(missing),"Unavailable");
    const result=text(render(ui.MetricTile,{label:"Count",value:missing,basis:"Observed"}));
    assert.match(result,/Unavailable/);assert.doesNotMatch(result,/\b0\b/);
    const card=text(render(ui.CreativeCard,{title:"Stored creative",source:"Source",onOpen:()=>{},metrics:[{label:"Spend",value:missing,basis:"Observed"}]}));assert.match(card,/Unavailable/);assert.doesNotMatch(card,/\b0\b/);
  }
  assert.match(text(render(ui.MetricTile,{label:"Count",value:0,basis:"Observed"})),/Observed0/);
  assert.equal(displayValue(false),"false");
});
test("UI-01 missing metadata, table cells, bars, heatmap values and trends stay Unavailable",()=>{
  for(const [component,props] of [
    [ui.DataTable,{hideUnavailable:false,caption:"Rows",rows:[{id:"a",count:null}],columns:[{key:"count",label:"Count",value:(row:any)=>row.count}],rowKey:(row:any)=>row.id,basis:"Observed"}],
    [ui.BarList,{label:"Counts",items:[{id:"a",label:"Ad",value:null}],basis:"Observed",onSelect:()=>{}}],
    [ui.Heatmap,{label:"Mix",columns:["Brand"],rows:[{id:"a",label:"Group",values:[null]}],basis:"Observed",onSelect:()=>{}}],
    [ui.Sparkline,{values:[null,null],summary:"Trend unavailable"}],
    [ui.Confidence,{level:null}],
    [ui.StatusChip,{status:null}],
    [ui.DataLabel,{}],
  ]) {const result=text(render(component,props));assert.match(result,/Unavailable/);assert.doesNotMatch(result,/\b0\b/);}
});
test("UI-01 primitives expose evidence targets, text status, summaries and real empty states",()=>{
  assert.match(render(ui.Unavailable,{reason:"The source has not synced.",unlock:"Connect the source to unlock this value.",href:"/?view=data"}),/href="\/\?view=data"/);
  assert.match(render(ui.DataTable,{caption:"Ads",rows:[{id:"ad",count:0}],columns:[{key:"count",label:"Count",value:(row:any)=>row.count,sortable:true}],rowKey:(row:any)=>row.id,onRow:()=>{},basis:"Observed"}),/tabindex="0"/);
  assert.match(text(render(ui.StatusChip,{status:"Not connected"})),/Not connected/);
  assert.match(render(ui.Sparkline,{values:[0,2],summary:"Two dated observations, rising from zero to two."}),/aria-label="Two dated observations/);
  assert.match(text(render(ui.EmptyState,{title:"No ads match",description:"Clear filters to see other stored ads."})),/No ads match/);
  const exports=["PageHeader","FilterBar","SectionCard","MetaLine","DataLabel","StatusChip","Confidence","MetricTile","Unavailable","EmptyState","CreativeCard","DataTable","BarList","Heatmap","Sparkline"];
  for(const name of exports)assert.equal(typeof ui[name],"function",name);
});

test("UI-03 retention never plots missing points as zero",()=>{
  const missing=text(render(ui.RetentionChart,{points:[{label:"Retention 25%",creative:null,benchmark:null}],onCreative:()=>{},onBenchmark:()=>{}}));
  assert.match(missing,/Unavailable/);assert.doesNotMatch(missing,/\b0\b/);
  const chart=render(ui.RetentionChart,{points:[{label:"25%",creative:.5,benchmark:.4},{label:"50%",creative:null,benchmark:null},{label:"75%",creative:.2,benchmark:.1}],onCreative:()=>{},onBenchmark:()=>{}});
  assert.ok(!chart.includes('class="retention-creative"'),"missing checkpoints break each line");
  assert.match(chart,/50.0 percent/);assert.match(chart,/Observed/);
});


test("UI-02/UI-03 incomplete metadata is hidden; complete evidence uses UK dates and singular ad",()=>{
  const complete={sampleSize:1,from:"2026-10-30T00:00:00Z",to:"2026-10-30T12:00:00Z",lastChecked:"2026-10-30T12:30:00Z"};
  for(const field of ["sampleSize","from","to","lastChecked"])assert.equal(render(ui.MetaLine,{...complete,[field]:null}),"");
  assert.equal(render(ui.MetaLine,{}),"");
  const known=text(render(ui.MetaLine,complete));assert.match(known,/n = 1 ad · 30 Oct 2026/);assert.doesNotMatch(known,/1 ads|Unavailable/);
  assert.match(text(render(ui.MetaLine,{...complete,sampleSize:0})),/n = 0 ads/);
  const empty=render(ui.SectionCard,{title:"Analysis",empty:{reason:"No analysis is saved.",href:"/?view=settings#gemini-smoke-test",linkLabel:"Run analysis"},meta:complete});
  assert.ok(!empty.includes("ui-meta-line"));assert.ok(!empty.includes("<footer"));assert.equal((empty.match(/<a /g)||[]).length,1);
});
test("UI-02 repeated missing values have one short label and a reason tooltip",()=>{
  const gap=render(ui.Unavailable,{compact:true,reason:"This account has not synced.",label:"Not synced",href:"/?view=data"});
  assert.equal(text(gap),"Not synced");assert.match(gap,/title="This account has not synced./);assert.ok(!gap.includes("<p")&&!gap.includes("<a"));
  const table=render(ui.DataTable,{hideUnavailable:false,caption:"Ads",rows:[{id:"a",spend:null}],columns:[{key:"spend",label:"Spend",value:(row:any)=>row.spend,unavailable:()=>({reason:"No owned rows."})}],rowKey:(row:any)=>row.id,basis:"Observed"});
  assert.ok(!table.includes("<p"));assert.match(table,/title="No owned rows/);
  const card=render(ui.CreativeCard,{title:"Saved creative",source:"You",onOpen:()=>{},metrics:[{label:"Spend",value:null,basis:"Observed",reason:"No owned rows.",missingLabel:"Not synced"}]});
  assert.ok(!card.includes("<p"));assert.ok(!card.includes("/?view=data"));assert.match(text(card),/SpendNot synced/);
});

test("Creative cards show m:ss, no None tags or unknown-format line, compact Modelled chip and no per-card metadata",()=>{
  const html=render(ui.CreativeCard,{title:"First source copy line",secondary:"Ad 12345678",source:"Fixture brand",duration:11.9322,format:null,tags:["None","","unknown","gifting"],meta:{sampleSize:1,from:"2026-10-30",to:"2026-10-30",lastChecked:"2026-10-30"},onOpen:()=>{}});
  assert.match(html,/0:12/);assert.ok(!html.includes("11.9322s"));assert.ok(!html.includes("ui-creative-format"));assert.ok(!html.includes("ui-meta-line"));assert.ok(!html.includes(">None<"));assert.match(html,/ui-creative-tags.*ui-data-label-modelled/);
});

test("Fidelity hides fully unavailable columns once, retains observed zero and preserves empty section frames",()=>{
 const html=render(ui.DataTable,{caption:"Saved rows",rows:[{id:"one",value:0},{id:"two",value:null}],columns:[{key:"value",label:"Count",value:(row:any)=>row.value},{key:"score",label:"Working Score",value:()=>null}],rowKey:(row:any)=>row.id,basis:"Observed"});
 assert.equal((html.match(/Not yet available:/g)||[]).length,1);assert.ok(!html.includes('data-label="Working Score"'));assert.match(html,/data-label="Count">0/);assert.match(html,/title="This value has not been recorded/);assert.match(html,/>Basis</);
 const empty=render(ui.SectionCard,{title:"Designed chart",empty:{reason:"No saved observations."}});assert.match(empty,/<header><div><h2>Designed chart/);assert.equal((empty.match(/No saved observations/g)||[]).length,1);
});
