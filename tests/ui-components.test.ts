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
    [ui.MetaLine,{}],
    [ui.DataTable,{caption:"Rows",rows:[{id:"a",count:null}],columns:[{key:"count",label:"Count",value:(row:any)=>row.count}],rowKey:(row:any)=>row.id,basis:"Observed"}],
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
