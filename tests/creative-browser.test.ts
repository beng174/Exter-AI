import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type pg from "pg";
import type { Brand } from "../shared/types.js";
import { browserFilters, filterBrowserCreatives, similarPublicCreatives, creativeUrl, privateMetric, type CreativeBrowserResponse } from "../shared/creative-browser.js";
import { ownedMetrics } from "../shared/owned-metrics.js";
import { browserCreative, ownedDay } from "./fixtures/creative-browser.js";
import { openDatabase } from "../server/db.js";
import { basicAuth } from "../server/auth.js";
import { attachCreativeBrowser } from "../server/demo/creative-browser.js";
import { brandContext } from "../src/lib/brand-context.js";
import { metricText, cardMetrics } from "../src/components/creatives/presentation.js";
test("UI-02 filters intersect, search transcript/OCR/copy and keep URL state through detail", () => {
    const rows = [browserCreative(), browserCreative({ adId: "competitor", workspaceBrand: false, brandId: "competitor-a", platform: "TikTok", daysRunning: 40 }), browserCreative({ adId: "unknown", deliveryStatus: "unknown", hookType: null, ugc: null, observedAt: null, daysRunning: null })];
    assert.deepEqual(filterBrowserCreatives(rows, { show: "yours", platform: "Meta", format: "studio", hook: "offer-led", angle: "gifting", offer: "bundle", ugc: "no", status: "active", from: "2026-11-01", to: "2026-11-04", search: "OVERLAY" }).map(row => row.adId), ["creative-a"]);
    assert.deepEqual(filterBrowserCreatives(rows, { show: "competitors", brand: "competitor-a" }).map(row => row.adId), ["competitor"]);
    assert.deepEqual(filterBrowserCreatives(rows, { ugc: "unknown", status: "unknown" }).map(row => row.adId), ["unknown"]);
    assert.deepEqual(filterBrowserCreatives(rows, { sort: "days" }).map(row => row.adId), ["competitor", "creative-a", "unknown"]);
    assert.equal(filterBrowserCreatives(rows, { search: "missing" }).length, 0);
    const url = creativeUrl("/?view=ads&show=competitors&search=overlay&layout=table#evidence", "workspace-a", "competitor");
    const params = new URL(url, "http://fixture.local").searchParams;
    assert.deepEqual(browserFilters(params), { show: "competitors", search: "overlay", layout: "table" });
    assert.equal(params.get("view"), "creative");
    assert.equal(params.get("id"), "competitor");
    assert.ok(url.endsWith("#evidence"));
    assert.equal(new URL(creativeUrl(url, "workspace-a"), "http://fixture.local").searchParams.has("id"), false);
});
test("UI-03 similarity requires categories and media type and excludes own/private/self records",()=>{
 const selected=browserCreative({adFormat:"video",productCategories:["candles"]});
 const rows=[selected,browserCreative({...selected,adId:"same",workspaceBrand:false,brandId:"competitor"}),browserCreative({...selected,adId:"private",brandId:"competitor",workspaceBrand:false,owned:true}),browserCreative({...selected,adId:"other",brandId:"competitor",workspaceBrand:false,adFormat:"static_image"}),browserCreative({...selected,adId:"unknown",brandId:"competitor",workspaceBrand:false,productCategories:null})];
 assert.deepEqual(similarPublicCreatives(selected,rows).map(row=>row.adId),["same"]);
 assert.deepEqual(similarPublicCreatives({...selected,adFormat:null,mediaAvailable:false},rows),[]);
});

test("UI-02/UI-03 preserve real zero, missing and too-early states and isolate private cohorts", () => {
    const metric = ownedMetrics([ownedDay()]);
    const cohort = { id: "a", accountId: "a", platform: "Meta", currency: "GBP", attribution: "7d_click", conversionEvent: "purchase", from: "2026-11-01", to: "2026-11-04", lastChecked: null, benchmarkSampleSize: 1, metrics: metric, benchmark: metric };
    const row = browserCreative({ owned: true, sourceKind: "owned", performance: [cohort, { ...cohort, id: "b", currency: "USD" }], observedAt: "2026-11-05T00:00:00Z" });
    assert.equal(privateMetric(row, undefined, "Spend"), null);
    assert.equal(privateMetric(row, "a", "Spend")?.value, 100);
    assert.equal(privateMetric({ ...row, workspaceBrand: false }, "a", "Spend"), null);
    assert.equal(privateMetric({ ...row, owned: false }, "a", "Spend"), null);
    assert.ok(cardMetrics(row).every(item => item.value === null));
    assert.equal(cardMetrics(row,"a")[0].value,"£100.00");
    assert.equal(cardMetrics({ ...row, workspaceBrand: false })[0].label, "Days running");
    assert.equal(metricText({ ...metric.Spend, value: 0 }, "Spend", "GBP"), "£0.00");
    assert.equal(metricText({ ...metric.ROAS, value: null, status: "too early" }, "ROAS"), null);
    assert.equal(metricText(metric["Hook rate"], "Hook rate"), "25.0%");
    assert.deepEqual(filterBrowserCreatives([row], { cohort: "a", from: "2026-11-01", to: "2026-11-04" }), [row], "owned dates are the reporting window, never the pull timestamp");
    assert.deepEqual(filterBrowserCreatives([row], { cohort: "missing" }), []);
});
test("UI-00 brand switcher omits unknown roles and explains an empty competitor set", () => {
    const brand = { competitors: [] } as unknown as Brand;
    assert.equal(brandContext(brand), "No competitors added");
    assert.equal(brandContext({ ...brand, role: "client" }), "Client · No competitors added");
    assert.equal(brandContext({ ...brand, role: "prospect", competitors: ["a"] }), "Prospect · 1 competitor");
    assert.ok(!brandContext({ ...brand, role: "other" }).includes("Type:"));
    assert.equal(brandContext(brand,3),"3 competitors");assert.equal(brandContext(brand,null),"Competitors unavailable");
});
test("UI-02 paginated endpoint is authenticated, scoped, read-only and returns controlled failures", async()=>{
 const {CreativeGalleryService}=await import("../server/demo/gallery.js"),db=openDatabase(":memory:",false),app=express();
 const root={id:"workspace-a",name:"Fixture advertiser",domain:"fixture.example",category:"Home fragrance & gifting",color:"#123456",initials:"FA",voice:[],competitors:["competitor-a","Fixture competitor","WORKSPACE-A"],mode:"imported",createdAt:"2026-11-01"} as Brand;
 for(const brand of [root,{...root,id:"competitor-a",name:"Fixture competitor"},{...root,id:"unrelated",name:"Unrelated"}])db.prepare("INSERT INTO brands VALUES(?,?)").run(brand.id,JSON.stringify(brand));
 for(const [id,target,owned] of [["own","workspace-a",false],["public-competitor","competitor-a",false],["private-competitor","competitor-a",true],["private-other","unrelated",false]] as const){const data={id,brandId:target,brand:target,providerAdId:id,source:"import",platform:"Meta",category:root.category,title:"A quiet evening.",copy:"A quiet evening.",format:"Video",owned,active:true,observedAt:"2026-11-04T00:00:00Z",deliveryStartAt:"2026-10-01T00:00:00Z",publishedAt:"2026-11-01",publisherPlatforms:[]};db.prepare("INSERT INTO ads VALUES(?,?,?,?,?,?)").run(id,target,"import","Meta",data.observedAt,JSON.stringify(data));}
 const before=db.prepare("SELECT data FROM ads ORDER BY id").all();app.use(basicAuth({EXTER_ADMIN_USER:"browser-fixture",EXTER_ADMIN_PASSWORD:"fixture-only"}));app.locals.creativeGallery=new CreativeGalleryService(db);
 app.locals.demoCollection={snapshot(){return {competitors:[{brandId:"competitor-a",name:"Fixture competitor",status:"complete"},{brandId:null,name:"Pending competitor",status:"not-started"}]};}};
 let fail=false;attachCreativeBrowser(app,db,{getPool:()=>{if(fail)throw new Error("private provider detail");return null;},now:()=>new Date("2026-11-05T12:00:00Z")});
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/brands/${root.id}/creatives`,headers={authorization:`Basic ${Buffer.from("browser-fixture:fixture-only").toString("base64")}`};
 try{
  assert.equal((await fetch(base)).status,401);assert.equal((await fetch(base+"?from=2026-02-31",{headers})).status,400);assert.equal((await fetch(base+"?from=2026-11-04&to=2026-11-01",{headers})).status,400);assert.equal((await fetch(base.replace(root.id,"missing"),{headers})).status,404);
  const response=await fetch(base+"?from=2026-11-01&to=2026-11-04&limit=1",{headers});assert.equal(response.status,200);assert.match(response.headers.get("cache-control")!,/no-store/);assert.match(response.headers.get("vary")!,/Accept-Encoding/i);assert.equal(response.headers.get("content-encoding"),"gzip");
  const data=await response.json() as CreativeBrowserResponse;assert.equal(data.creatives.length,1);assert.equal(data.sql!.page.total,2);assert.equal(data.sql!.page.hasNext,true);
  const second=await (await fetch(base+"?from=2026-11-01&to=2026-11-04&limit=1&offset=1",{headers})).json() as CreativeBrowserResponse;const rows=[...data.creatives,...second.creatives];assert.equal(new Set(rows.map(r=>r.adId)).size,2);assert(rows.every(r=>[root.id,"competitor-a"].includes(r.brandId)));assert(!rows.some(r=>r.adId==="private-competitor"));assert(rows.every(r=>r.performance.length===0));assert(rows.every(r=>r.publicEvidence));
  const configured=await(await fetch(base.replace("/creatives","/creative-competitors"),{headers})).json();assert.deepEqual(configured.competitors,data.competitors);assert.equal(configured.competitors.length,2);assert.equal(configured.competitors[1].brandId,null);
  const preset=await(await fetch(base+"?window=research",{headers})).json();assert.deepEqual(preset.reportingRange,{from:"2026-10-29",to:"2026-11-04"});
  fail=true;const failed=await fetch(base,{headers});assert.equal(failed.status,503);assert(!JSON.stringify(await failed.json()).includes("private provider detail"));assert.deepEqual(db.prepare("SELECT data FROM ads ORDER BY id").all(),before);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();}
});
