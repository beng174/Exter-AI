import test from "node:test";
import assert from "node:assert/strict";
import { creativeTitle, creativeIdentity, creativeTags, videoLength, plainEnum, ukDate, adCount, copyExcerpt, analysisUrl } from "../shared/creative-presentation.js";
import { browserCreative } from "./fixtures/creative-browser.js";

test("UI-02/UI-03 title fallback rejects templates, uses the first retained copy line, then analysis or brand identity without changing source data",()=>{
  const row=browserCreative({title:"{{product.name}}",copy:"\nA complete retained first line\nSecond line"});
  assert.equal(creativeTitle(row),"A complete retained first line");assert.equal(row.title,"{{product.name}}");
  assert.equal(creativeTitle({...row,title:"Valid saved title"}),"A complete retained first line");
  assert.equal(creativeTitle({...row,copy:"{{product.name}}\nAnother line"}),"Catalogue ad · product details loading");
  assert.equal(creativeTitle({...row,title:"",copy:""}),"Studio, gifting");
});
test("UI-03 source enums use plain labels, preserving the platform names and attribution meaning",()=>{
  assert.equal(["FACEBOOK","INSTAGRAM","AUDIENCE_NETWORK"].map(plainEnum).join(", "),"Facebook, Instagram, Audience Network");
  assert.equal(plainEnum("active"),"Active");assert.equal(plainEnum("music-only"),"Music only");
  assert.equal(plainEnum("7d_click"),"7-day click");assert.equal(plainEnum("UGC"),"UGC");
  assert.equal(adCount(1),"1 ad");assert.equal(adCount(0),"0 ads");
});
test("UI-03 UK dates respect local-day boundaries and daylight saving, with time only on request",()=>{
  assert.equal(ukDate("2026-10-30T12:30:00Z"),"30 Oct 2026");
  assert.equal(ukDate("2026-06-30T23:30:00Z"),"1 Jul 2026");
  assert.match(ukDate("2026-06-30T23:30:00Z",true)!,/1 Jul 2026.*00:30.*BST/);
  assert.match(ukDate("2026-10-30T12:30:00Z",true)!,/12:30.*GMT/);
  assert.equal(ukDate("unknown"),null);assert.equal(ukDate(null),null);
});
test("UI-03 copy disclosure keeps whole words and every retained character on expansion",()=>{
  const text="First full sentence. A second complete sentence stays together. The saved remainder.";
  const excerpt=copyExcerpt(text,33);
  assert.equal(excerpt.preview,"First full sentence. A second");assert.equal(excerpt.hasMore,true);
  assert.ok(text.startsWith(excerpt.preview));assert.equal(copyExcerpt("onewordwithoutbreaks",4).preview,"onewordwithoutbreaks");
  assert.deepEqual(copyExcerpt("Short copy"),{preview:"Short copy",hasMore:false});
  const link=new URL(analysisUrl("workspace-a","12345678"),"http://exter.local");
  assert.equal(link.searchParams.get("view"),"settings");assert.equal(link.searchParams.get("analysisAdId"),"12345678");assert.equal(link.hash,"#gemini-smoke-test");
  assert.equal(new URL(analysisUrl("competitor-a","12345678","workspace-a"),"http://exter.local").hash,"#demo-collection");
});

test("Creative cards share copy/analysis/brand identity, m:ss duration and nonempty tags",()=>{const row=browserCreative({copy:"",creativeFormat:null,angle:null});assert.deepEqual(creativeIdentity(row),{title:"Fixture advertiser ad",secondary:"Ad 12345678"});assert.equal(creativeIdentity({...row,creativeFormat:"UGC",angle:"gifting"}).title,"UGC, gifting");assert.equal(videoLength(11.9322),"0:12");assert.equal(videoLength(47.01),"0:47");assert.equal(videoLength(60),"1:00");assert.equal(videoLength(null),null);assert.deepEqual(creativeTags([null,"none","None","","unknown","gifting"]),["Gifting"]);});
