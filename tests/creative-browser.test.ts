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
test("UI-02 read endpoint is authenticated, read-only, scoped and does not turn failures into empty success", async () => {
    const db = openDatabase(":memory:", false), app = express();
    const root = { id: "workspace-a", name: "Fixture advertiser", domain: "fixture.example", category: "Home fragrance & gifting", color: "#123456", initials: "FA", voice: [], competitors: ["competitor-a","Fixture competitor","WORKSPACE-A"], mode: "imported", createdAt: "2026-11-01" } as Brand;
    for (const brand of [root, { ...root, id: "competitor-a", name: "Fixture competitor" }, { ...root, id: "unrelated", name: "Unrelated" }])
        db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id, JSON.stringify(brand));
    app.use(basicAuth({ EXTER_ADMIN_USER: "browser-fixture", EXTER_ADMIN_PASSWORD: "fixture-only" }));
    let failGallery = false, failOwned = false, overflow = false;
    const reads: string[] = [];
    let queries = 0, expectedRange=["2026-11-01","2026-11-04"];
    app.locals.creativeGallery = { async list(id: string) { reads.push(id); if (failGallery)
            throw new Error("private provider detail"); return { creatives: id === root.id ? [browserCreative()] : [browserCreative({ adId: "public-competitor", brandId: id, workspaceBrand: false }), browserCreative({ adId: "private-competitor", brandId: id, workspaceBrand: false, owned: true })] }; } };
    app.locals.demoCollection={snapshot(){return {competitors:[{brandId:"competitor-a",name:"Fixture competitor",status:"complete"},{brandId:null,name:"Pending competitor",status:"not-started"}]};}};
    app.locals.brandDemo = { report() { throw new Error("No scoring evidence"); } };
    const pool = { async query(sql: string, params: unknown[]) { queries++; if(sql.includes("FROM ad_observations")||sql.startsWith("SELECT DISTINCT ON(w.id)")){assert.deepEqual(params,[root.id]);return {rows:[]};} assert.match(sql, /^SELECT d.data FROM owned_ad_days d JOIN owned_accounts/); assert.match(sql, /a.workspace_id=\$1/); assert.match(sql, /LIMIT 100001/); assert.deepEqual(params, [root.id, ...expectedRange]); if (failOwned)
            throw new Error("private database detail"); if (overflow)
            return { rows: new Array(100001).fill({ data: ownedDay() }) }; return { rows: [ownedDay(), ownedDay({ spend: 120, pulledAt: "2026-11-05T00:00:00Z" }), ownedDay({ accountId: "account-b", currency: "USD", spend: 300 }), ownedDay({ attribution: "1d_click", spend: 40 })].map(data => ({ data })) }; } } as unknown as pg.Pool;
    pool.connect=async()=>({query(q:any){queueMicrotask(()=>{void pool.query(q.text,q.values).then(result=>{for(const row of result.rows)q.emit("row",row);q.emit("end",{rows:[]});}).catch(error=>q.emit("error",error));});return q;},release(){}}) as any;
    attachCreativeBrowser(app, db, { getPool: () => pool, now:()=>new Date("2026-11-05T12:00:00Z") });
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/brands/${root.id}/creatives`, headers = { authorization: `Basic ${Buffer.from("browser-fixture:fixture-only").toString("base64")}` };
    const before = db.prepare("SELECT total_changes() AS n").get();
    try {
        assert.equal((await fetch(base)).status, 401);
        assert.equal(queries, 0);
        assert.equal((await fetch(base + "?from=2026-02-31", { headers })).status, 400);
        assert.equal((await fetch(base + "?from=2026-11-04&to=2026-11-01", { headers })).status, 400);
        assert.equal((await fetch(base.replace(root.id, "missing"), { headers })).status, 404);
        const response = await fetch(base + "?from=2026-11-01&to=2026-11-04", { headers });
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control")!, /no-store/);
        assert.match(response.headers.get("vary")!, /Accept-Encoding/i);
        assert.equal(response.headers.get("content-encoding"),"gzip");
        const data = await response.json() as CreativeBrowserResponse;
        assert.deepEqual(reads, ["workspace-a", "competitor-a"]);
        const configured=await (await fetch(base.replace("/creatives","/creative-competitors"),{headers})).json();
        assert.deepEqual(configured.competitors,data.competitors,"sidebar and list share the configured set");
        assert.equal(configured.competitors.length,2,"duplicates and self are excluded; uncollected competitors remain");
        assert.equal(configured.competitors[1].brandId,null);
        assert.deepEqual(reads,["workspace-a","competitor-a"],"count endpoint does not read creatives or owned metrics");

        assert.equal(data.creatives.length, 2);
        const own = data.creatives.find(row => row.workspaceBrand)!;
        assert.equal(own.performance.length, 3);
        assert.equal(own.publicEvidence,true,"a matched owned ad retains its independent public source evidence");
        assert.deepEqual(own.performance.map(item => item.metrics.Spend.value), [120, 300, 40]);
        assert.deepEqual(own.performance.map(item => item.benchmark.Spend.value), [120, 300, 40]);
        assert.equal(data.creatives.find(row => !row.workspaceBrand)!.performance.length, 0);
        assert.equal(data.creatives.some(row => row.adId === "private-competitor"), false);
        assert.equal(own.score, null, "saved creatives survive unavailable scoring");
        assert.equal(own.scoreError,true,"a checklist read failure is explicit");
        // The research preset resolves the same shared window before querying owned days.
        expectedRange=["2026-10-29","2026-11-04"];
        reads.length=0;
        const preset=await (await fetch(base+"?window=research",{headers})).json() as CreativeBrowserResponse;
        assert.deepEqual(preset.reportingRange,{from:expectedRange[0],to:expectedRange[1]});
        assert.deepEqual(reads,["workspace-a","competitor-a"],"one gallery pass, one response");
        assert.deepEqual(preset.creatives.find(row=>row.workspaceBrand)!.performance.map(cohort=>[cohort.from,cohort.to,cohort.currency,cohort.metrics.Spend.value]),[[...expectedRange,"GBP",120],[...expectedRange,"USD",300],[...expectedRange,"GBP",40]]);
        const explicit=await (await fetch(base+"?from=2026-10-29&to=2026-11-04",{headers})).json();
        assert.deepEqual(preset,explicit,"same data and cohorts as the old second read");
        expectedRange=["2026-10-07","2026-11-05"];
        const defaults=await (await fetch(base,{headers})).json();assert.deepEqual(defaults.reportingRange,{from:expectedRange[0],to:expectedRange[1]},"other clients keep the thirty-day default");
        expectedRange=["2026-11-01","2026-11-04"];
        failOwned = true;
        let failed = await (await fetch(base + "?from=2026-11-01&to=2026-11-04", { headers })).json();
        assert.equal(failed.ownedStatus, "error");
        assert.ok(!JSON.stringify(failed).includes("private database detail"));
        failOwned = false;
        overflow = true;
        failed = await (await fetch(base + "?from=2026-11-01&to=2026-11-04", { headers })).json();
        assert.equal(failed.ownedStatus, "error");
        failGallery = true;
        failed = await (await fetch(base + "?from=2026-11-01&to=2026-11-04", { headers })).json();
        assert.ok(failed.sources.some((source: any) => source.status === "error"));
        assert.ok(!JSON.stringify(failed).includes("private provider detail"));
        assert.deepEqual(db.prepare("SELECT total_changes() AS n").get(), before);
    }
    finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
        db.close();
    }
});
