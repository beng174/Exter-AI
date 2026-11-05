import {test,after} from "node:test";
import assert from "node:assert/strict";
import {mkdir,mkdtemp,writeFile,rm} from "node:fs/promises";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {workspaceBrands,preferredWorkspace} from "../src/lib/workspace-brands.js";
import {creativeHeading,creativeTitle} from "../shared/creative-presentation.js";
import {brandContext} from "../src/lib/brand-context.js";
import {browserCreative} from "./fixtures/creative-browser.js";

await mkdir(resolve("work"),{recursive:true});
const dir=await mkdtemp(resolve("work/readability-render-"));
const bundle=await build({stdin:{contents:'export {SourceLabel,SourceDetail,sourceProviders} from "./src/components/ui/SourceLabel"; export {PageHeader} from "./src/components/ui/PageHeader"; export {DatabaseStorageDetail} from "./src/components/ui/DatabaseStorageDetail";',resolveDir:resolve(".")},bundle:true,format:"esm",platform:"node",write:false,external:["react","react-dom","lucide-react"],loader:{".css":"empty"}});
const file=join(dir,"components.mjs");await writeFile(file,bundle.outputFiles[0].contents);
const {SourceLabel,SourceDetail,sourceProviders,PageHeader,DatabaseStorageDetail}=await import(pathToFileURL(file).href);
after(()=>rm(dir,{recursive:true,force:true}));

test("legacy optional brand metadata cannot break workspace selection or mix sample brands",()=>{
 const source=[{id:"first",name:"Fictional first brand",mode:"imported"},{id:"current",name:"Fictional current brand",domain:"fictional.example",mode:"imported"},{id:"sample",name:"Fictional sample",mode:"demo"}];
 const real=workspaceBrands(source,false);assert.equal(real.unavailable,0);assert.equal(real.brands[0].domain,"");assert.equal(source[0].domain,undefined);assert.equal(brandContext(real.brands[0]),"Competitors unavailable");assert.equal(preferredWorkspace(real.brands,"missing-alias")?.id,"first");assert.equal(preferredWorkspace(real.brands,"current")?.id,"current");
 assert.deepEqual(workspaceBrands(source,true).brands.map(brand=>brand.id),["sample"]);assert.throws(()=>workspaceBrands({error:"unavailable"},false));assert.equal(workspaceBrands([{id:"broken"},...source],false).unavailable,1);
});
test("detail headings remain concise while the card identity and full source copy stay unchanged",()=>{
 const copy="A quieter evening starts here. "+"The full original source copy remains available for careful reading. ".repeat(20),row=browserCreative({copy});
 assert.equal(creativeHeading(row),"A quieter evening starts here.");assert.equal(creativeTitle(row),copy.trim());assert.equal(row.copy,copy);
 const sentence=browserCreative({copy:"A thoughtful fragrance for every room and every season ".repeat(30)});assert.ok(creativeHeading(sentence).length<=150);assert.ok(creativeHeading(sentence).endsWith("…"));
});
test("source labels use local decorative company marks and preserve both organic platforms",()=>{
 assert.deepEqual(sourceProviders("Your Meta ad account"),["meta"]);assert.deepEqual(sourceProviders("TikTok Commercial Content API"),["tiktok"]);assert.deepEqual(sourceProviders("Google Ads Transparency Center"),["google"]);assert.deepEqual(sourceProviders("Instagram and YouTube organic"),["instagram","youtube"]);
 const gap=renderToStaticMarkup(createElement(SourceDetail,{detail:"No account linked"}));assert.ok(!gap.includes("Unavailable")&&!gap.includes("Last successful"));
 const checked=renderToStaticMarkup(createElement(SourceDetail,{detail:"Saved public data",checked:"5 Nov 2026",records:0}));assert.match(checked,/Last successful check: 5 Nov 2026/);assert.match(checked,/>0</);
 for(const name of ["Your Meta ad account","TikTok Commercial Content API","Google Ads Transparency Center","Instagram and YouTube organic","Customer reviews","Brand websites"]){const html=renderToStaticMarkup(createElement(SourceLabel,{name,detail:"Saved source coverage"}));assert.match(html,/aria-hidden="true"/);assert.match(html,/Saved source coverage/);for(const img of html.matchAll(/<img[^>]+>/g)){assert.match(img[0],/src="\/providers\//);assert.match(img[0],/alt=""/);}}
});
test("prose headings can avoid automatic logo insertion while remaining accessible text",()=>{
 const html=renderToStaticMarkup(createElement(PageHeader,{title:"Fictional Candle House makes evenings warmer.",decorateTitle:false}));assert.match(html,/<h1>Fictional Candle House makes evenings warmer\.<\/h1>/);assert.ok(!html.includes("brand-mark"));
});

test("database storage renders known zero and a missing daily baseline honestly",()=>{
 const ready={status:"available",sizeBytes:1024**2,measuredAt:"2026-11-05T12:00:00Z",growthBytesPerDay:0,baselineAt:"2026-11-03T12:00:00Z",intervalHours:48,message:"Measured daily average"};
 const html=renderToStaticMarkup(createElement(DatabaseStorageDetail,{storage:ready}));assert.match(html,/1 MiB/);assert.match(html,/Growth per day/);assert.match(html,/>0 B/);assert.match(html,/Average since/);
 const waiting=renderToStaticMarkup(createElement(DatabaseStorageDetail,{storage:{...ready,growthBytesPerDay:null,baselineAt:null,message:"Daily growth needs 24 hours of measurements."}}));assert.match(waiting,/Unavailable/);assert.match(waiting,/24 hours/);assert.equal((waiting.match(/>Observed</g)||[]).length,1);
 const missing=renderToStaticMarkup(createElement(DatabaseStorageDetail,{}));assert.match(missing,/has not been measured/);assert.ok(!missing.includes("0 B"));
});
