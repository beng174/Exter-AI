import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { browserCreative, ownedDay } from "./fixtures/creative-browser.js";
import { ownedMetrics } from "../shared/owned-metrics.js";
import type { BrowserCreative, CreativeBrowserResponse } from "../shared/creative-browser.js";
await mkdir(resolve("work"), { recursive: true });
const dir = await mkdtemp(resolve("work/detail-render-"));
const bundle = await build({ entryPoints: ["src/components/creatives/CreativeDetailPage.tsx"], bundle: true, format: "esm", platform: "node", write: false, external: ["react", "react-dom", "lucide-react"], loader: { ".css": "empty" } });
const file = join(dir, "detail.mjs");
await writeFile(file, bundle.outputFiles[0].contents);
const { CreativeDetailPage } = await import(pathToFileURL(file).href);
after(() => rm(dir, { recursive: true, force: true }));
function render(row: BrowserCreative) {
    const original = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { value: { location: { href: "http://exter.local/?view=creative&brandId=workspace-a&id=creative-a", origin: "http://exter.local" } }, configurable: true });
    const data: CreativeBrowserResponse = { brand: { id: "workspace-a", name: "Fixture advertiser", domain: "fixture.example" }, creatives: [row], competitors:[], sources: [], ownedStatus: "not_configured", dateRange: { from: null, to: null }, lastChecked: null, reportingRange: { from: "2026-11-01", to: "2026-11-04" } };
    try {
        return renderToStaticMarkup(h(CreativeDetailPage, { data, adId: row.adId, filtered: [row], onOpen: () => { } }));
    }
    finally {
        if (original)
            Object.defineProperty(globalThis, "window", original);
        else
            Reflect.deleteProperty(globalThis, "window");
    }
}
test("UI-03 missing evidence renders reasons/unlocks, never invented outcomes, scenes or scores", () => {
    const html = render(browserCreative({ daysRunning: null, durationSeconds: null, angle: null, creativeFormat: null }));
    assert.match(html, /No retained media file/);
    assert.match(html, /No scene boundaries are stored/);
    assert.match(html, /Owned metrics are not synced/);
    assert.match(html, /No saved analysis supports/);
    assert.ok(!html.includes('aria-label="Working Score"'),"unbuilt Working Score does not add a duplicate section");
    assert.equal((html.match(/class="ui-meta-line"/g)||[]).length,1,"only the complete source-history metadata remains");
    assert.ok(!html.includes('role="dialog"'));
    assert.ok(!html.includes('>0<'));
    assert.ok(!html.includes("Proven winner"));
    assert.ok(!html.includes("Correct a tag"));
    assert.match(html, /disabled="" title="Adding saved creatives to briefs is not available yet/);
});
test("UI-03 a competitor never receives private outcomes or a retention section", () => {
    const html = render(browserCreative({ workspaceBrand: false, owned: true, performance: [] }));
    assert.ok(!html.includes('aria-label="Viewer retention"'));
    assert.ok(!html.includes('aria-label="ROAS"'));
    assert.ok(!html.includes('aria-label="Spend"'));
    assert.match(html, /Days running/);
    assert.match(html, /Public signals only/);
});
test("UI-03 explicit owned rows unlock metrics, without displaying below-sample outcomes", () => {
    const metrics = ownedMetrics([ownedDay({ purchases: 1, retention50: null })]);
    const html = render(browserCreative({ owned: true, performance: [{ id: "one", accountId: "account-a", platform: "Meta", currency: "GBP", attribution: "7d_click", conversionEvent: "purchase", from: "2026-11-01", to: "2026-11-04", lastChecked: null, benchmarkSampleSize: 1, metrics, benchmark: metrics }] }));
    assert.match(html, /£100.00/);
    assert.match(html, /Too early/);
    assert.match(html, /Viewer retention/);
    assert.match(html, /Missing values break the line/);
    assert.ok(!html.includes('aria-label="ROAS">4'));
});

test("UI-03 machine evidence is Modelled, timestamped and never reproduces sung lyrics as speech",()=>{
  const field=(value:string)=>({value,confidence:.4,timestamps:[{startSeconds:1,endSeconds:2}]});
  const row=browserCreative({videoUrl:"/retained-fixture-video",analysis:{id:"fixture-analysis",mediaKind:"video",createdAt:"2026-11-04",promptVersion:"exter-native-video-v2",fields:{hook:field("Fixture hook"),format:{...field("studio"),value:"studio"},angle:field("gifting"),keyClaims:[],spokenTranscript:[field("LEGACY_LYRIC_MUST_NOT_RENDER")],onScreenText:[field("Fixture overlay")],cta:field("See the source"),personTalkingToCamera:{...field("false"),value:false},creatorEvidence:[],audio_segments:[{startSeconds:1,endSeconds:2,kind:"spoken",speaker_type:"voiceover",text:"Fixture spoken words",confidence:.4},{startSeconds:0,endSeconds:1,kind:"sung_lyrics",speaker_type:"singer",text:"LYRIC_MUST_NOT_RENDER",confidence:.4}]}}});
  const html=render(row);
  assert.match(html,/Fixture spoken words/);assert.match(html,/Fixture overlay/);assert.match(html,/1:|0:01/);assert.match(html,/Modelled/);
  assert.ok(!html.includes("LYRIC_MUST_NOT_RENDER"));assert.ok(!html.includes("Human reviewed"));
});

test("UI-03 a checklist read failure stays explicit rather than claiming missing analysis",()=>{const html=render(browserCreative({scoreError:true}));assert.match(html,/saved checklist could not be read/);});


test("UI-03 source facts are formatted, active ads remain Still running, and gaps link to their actual fixes",()=>{
  const html=render(browserCreative({title:"{{product.name}}",copy:"First line of retained copy\nSecond line",firstObservedAt:null,placements:["FACEBOOK","INSTAGRAM","AUDIENCE_NETWORK"],observedAt:"2026-10-30T00:00:00Z"}));
  assert.match(html,/<h1>First line of retained copy<\/h1>/);assert.ok(!html.includes("{{product.name}}"));
  assert.match(html,/Facebook, Instagram, Audience Network/);assert.match(html,/Still running/);assert.match(html,/>Active</);assert.match(html,/30 Oct 2026/);
  assert.ok(!html.includes("n = Unavailable")&&!html.includes("Unavailable to Unavailable"));
  assert.match(html,/view=settings&amp;brandId=workspace-a&amp;analysisAdId=12345678#gemini-smoke-test/);
  assert.match(html,/Open original ad/);assert.match(html,/Connect account/);
});
