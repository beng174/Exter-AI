import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "../server/db.js";
import { CreativeGalleryService } from "../server/demo/gallery.js";
import type { Brand } from "../shared/types.js";
import { workspaceEvidence } from "../shared/workspace-evidence.js";
import { filterGalleryCreatives, type DemoGalleryCreative } from "../shared/creative-gallery.js";
import { displayData } from "../shared/presentation.js";

const ad = (patch: Partial<DemoGalleryCreative> = {}): DemoGalleryCreative => ({
  adId: "a", brandId: "brand", deliveryStatus: "unknown", analysis: null,
  observedAt: "2026-10-30T12:00:00Z", firstObservedAt: null,
  deliveryStartAt: null, deliveryStopAt: null, searchText: "Fragrance spoken line\nGIFT BUNDLE",
  ...patch,
} as DemoGalleryCreative);

test("stored summary distinguishes unknown status and dates from observed zero", () => {
  const result = workspaceEvidence([ad()], new Date("2026-11-04T00:00:00Z"));
  assert.equal(result.activeKnown, 0);
  assert.equal(result.startsKnown, 0);
  assert.equal(result.stopsKnown, 0);
  assert.equal(result.lastCheck, "2026-10-30T12:00:00Z");
  assert.equal(result.weekFrom, "2026-10-23T12:00:00.000Z");
  assert.equal(workspaceEvidence([]).lastCheck, null);
});

test("weekly activity uses source timing and exposes exact supporting ads", () => {
  const records = [ad({adId:"active", deliveryStatus:"active",deliveryStartAt:"2026-10-29T00:00:00Z"}),
    ad({adId:"stop",deliveryStatus:"inactive",deliveryStopAt:"2026-10-28T00:00:00Z"}),
    ad({adId:"older",deliveryStartAt:"2026-01-01T00:00:00Z"}),
    ad({adId:"invalid",observedAt:"2099-01-01T00:00:00Z",deliveryStartAt:"invalid"})];
  const result = workspaceEvidence(records,new Date("2026-11-04T00:00:00Z"));
  assert.deepEqual(result.active.map(a=>a.adId),["active"]);
  assert.deepEqual(result.launched.map(a=>a.adId),["active"]);
  assert.deepEqual(result.stopped.map(a=>a.adId),["stop"]);
  assert.equal(result.startsKnown,2);
});

test("library search matches transcripts and OCR while filters intersect without guessed labels", () => {
  const records = [ad({creativeFormat:"studio", hookType:"demo", ugc:null}),ad({adId:"b",creativeFormat:"UGC",ugc:true})];
  assert.equal(filterGalleryCreatives(records,{search:"gift bundle",format:"studio",ugc:"unknown"}).length,1);
  assert.equal(filterGalleryCreatives(records,{search:"spoken line",format:"UGC",ugc:"no"}).length,0);
});

test("user-facing UI source rejects long dashes and display boundary normalises retained source text", () => {
  const files = (path:string):string[] => readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(path,entry.name)):[join(path,entry.name)]);
  for(const file of files("src").filter(file=>/\.tsx?$/.test(file))) assert.doesNotMatch(readFileSync(file,"utf8"),/[\u2013\u2014]/,file);
  assert.equal(displayData({text:"Saved\u2014source\u2013wording"}).text,"Saved-source-wording");
});

test("an empty stored workspace returns unavailable dates, while a missing workspace fails explicitly", async () => {
  const db = openDatabase(":memory:",false);
  try {
    const brand = {id:"empty",name:"Empty",domain:"empty.example",mode:"imported"} as Brand;
    db.prepare("INSERT INTO brands VALUES (?,?)").run(brand.id,JSON.stringify(brand));
    const service = new CreativeGalleryService(db);
    const result = await service.list(brand.id);
    assert.deepEqual(result.creatives,[]);
    assert.deepEqual(result.dateRange,{from:null,to:null});
    assert.equal(result.analysedAdsCount,0);
    await assert.rejects(service.list("absent"),/Brand workspace not found/);
  } finally { db.close(); }
});
