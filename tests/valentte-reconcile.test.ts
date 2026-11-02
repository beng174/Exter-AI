import { test } from "node:test";
import assert from "node:assert/strict";
import source from "../shared/cases/valentte-ads.json";
import caseData from "../shared/cases/valentte.json";
import { openDatabase } from "../server/db.js";
import { ensureVideoTables } from "../server/video/service.js";
import { readBrandResearch } from "../server/brand-research.js";
import type { Ad, Brand } from "../shared/types.js";
import type { VideoAnalysisResult } from "../shared/video-analysis.js";
import type { ImageAnalysisResult } from "../shared/image-analysis.js";
import {
  canonicalValentteBrand, canonicalWorkspaceBrands, hostedValentteResearchState, linkedWorkspaceAnalyses,
  reconcileValentteWorkspace, resolveDemoBrandId, startHostedValentteResearch, valentteReconciliationStatus,
  workspaceAd, workspaceAdAliases, workspaceAds, workspaceBrandIds,
} from "../server/demo/reconcile.js";

const captured = source.ads as Ad[];
const fixtureBrand = (id: string): Brand => ({ ...(caseData.brand as Brand), id });
function fixture() {
  const db = openDatabase(":memory:",false);
  ensureVideoTables(db);
  db.exec(`CREATE TABLE image_media (id TEXT PRIMARY KEY,brand_id TEXT,ad_id TEXT,data TEXT);
    CREATE TABLE image_analysis_runs (id TEXT PRIMARY KEY,brand_id TEXT,ad_id TEXT,created_at TEXT,data TEXT);`);
  const brand = (value: Brand) => db.prepare("INSERT INTO brands VALUES (?,?)").run(value.id,JSON.stringify(value));
  const ad = (value: Ad) => db.prepare("INSERT INTO ads VALUES (?,?,?,?,?,?)").run(value.id,value.brandId,value.source,value.platform,value.publishedAt,JSON.stringify(value));
  return { db, brand, ad };
}
const timed = <T extends string|boolean>(value: T) => ({ value, confidence: 0.2, timestamps: [{ startSeconds: 0,endSeconds: 2 }] });
function video(ad: Ad,index = 0): VideoAnalysisResult {
  return { id: `paid-video-${index}`,brandId: ad.brandId,adId: ad.id,mediaId: `retained-video-${index}`,mediaSha256: `original-content-${index}`,
    provider: "gemini",model: "served-fixture",requestedModel: "requested-fixture",servedModel: "served-fixture",modelVersion: "served-fixture",
    processingMode: "static-high-fps-hook",promptVersion: "historical-v1",createdAt: "2026-11-01T10:00:00Z",confidenceThreshold: 0.75,
    inputContextSha256: "historical-context-hash",analysisConfigSha256: "historical-config-hash",coverage: { durationSeconds: 8,fullVideo: true,segments: [{startSeconds:0,endSeconds:8,processing:"static",fps:3}] },
    fields: { format: timed("studio"),hook:timed("Observed opening"),angle:timed("gifting"),keyClaims:[],onScreenText:[],spokenTranscript:[],cta:timed("Shop now"),creatorEvidence:[],personTalkingToCamera:timed(false) } };
}
function image(ad: Ad,index = 0): ImageAnalysisResult {
  const still = (value: string) => ({ value,confidence:0.2,imageIndices:[1] });
  return { id:`paid-image-${index}`,brandId:ad.brandId,adId:ad.id,mediaId:`retained-image-${index}`,mediaSha256:`original-still-${index}`,
    provider:"gemini",model:"served-fixture",modelVersion:null,processingMode:"image",promptVersion:"historical-v1",createdAt:"2026-11-01T10:00:00Z",
    fields:{format:still("static"),hook:still("Observed opening"),headline:still("Gift set"),angle:still("gifting"),keyClaims:[],onScreenText:[],offer:still("unknown"),cta:still("Shop now")},
    accounting:{usage:{inputTokens:100,outputTokens:20,totalTokens:120},tokenCostGbp:.001,reservedCostGbp:0,estimatedCostGbp:.001,costBasis:"token_estimate",pricing:null,requestAttempts:1} };
}

test("startup imports exactly the verified 58 Valentte ads with real creator credits and preserved capture dates", () => {
  const f = fixture();
  try {
    const status = reconcileValentteWorkspace(f.db);
    assert.equal(status.collectedAds,58); assert.equal(status.verifiedCaseAds,58); assert.equal(status.analysedAds,0);
    assert.equal(status.attributedAds,4); assert.equal(status.attributedCreators,3);
    const ads = workspaceAds(f.db,status.canonicalBrandId);
    assert.equal(new Set(ads.map(ad=>ad.providerAdId)).size,58);
    assert.ok(ads.every(ad=>ad.source === "public" && ad.metricsAvailable === false && ad.engagementRateBasis === "unavailable"));
    const greta = ads.find(ad=>ad.brandedContentPartner?.name === "_sheisgreta")!;
    assert.ok(greta.sourceUrl?.includes(greta.providerAdId!));
    assert.equal(greta.firstObservedAt,captured.find(ad=>ad.providerAdId===greta.providerAdId)!.firstObservedAt);
    const research = readBrandResearch(f.db,status.canonicalBrandId)!;
    assert.equal(research.observedAt,caseData.research.observedAt,"Reusing captured research must not redate it as a fresh scrape");
    assert.ok(research.adLibraryEvidence?.records.every(ad=>ad.brandId === status.canonicalBrandId));
    const before = f.db.prepare("SELECT id,data FROM ads ORDER BY id").all();
    const again = reconcileValentteWorkspace(f.db);
    assert.equal(again.newlyImportedAds,0); assert.equal(again.updatedAds,0);
    assert.deepEqual(f.db.prepare("SELECT id,data FROM ads ORDER BY id").all(),before);
  } finally { f.db.close(); }
});

test("an existing UUID workspace imports source records rather than mistaking bundled source objects for database rows", () => {
  const f = fixture();
  try {
    f.brand(caseData.brand as Brand);
    const status = reconcileValentteWorkspace(f.db);
    assert.equal(status.canonicalBrandId,caseData.brand.id); assert.equal(status.newlyImportedAds,58);
    assert.equal(workspaceAds(f.db,caseData.brand.id).length,58);
    assert.equal(resolveDemoBrandId(f.db,"valentte"),caseData.brand.id);
  } finally { f.db.close(); }
});

test("a legacy fictional Valentte workspace stays untouched while its old public route resolves to verified real data", () => {
  const f=fixture();
  try {
    f.brand({...fixtureBrand("valentte"),mode:"demo"});
    const sample={...captured[0],id:"legacy-sample",brandId:"valentte",source:"sample" as const};f.ad(sample);
    const before=f.db.prepare("SELECT data FROM ads WHERE id='legacy-sample'").get();
    const status=reconcileValentteWorkspace(f.db);
    assert.notEqual(status.canonicalBrandId,"valentte");assert.equal(resolveDemoBrandId(f.db,"valentte"),status.canonicalBrandId);
    assert.equal(workspaceAds(f.db,"valentte").length,58);
    assert.ok(workspaceAds(f.db,"valentte").every(ad=>ad.source==="public"));
    assert.deepEqual(f.db.prepare("SELECT data FROM ads WHERE id='legacy-sample'").get(),before);
    assert.ok(!workspaceBrandIds(f.db,"valentte").includes("valentte"));
  } finally { f.db.close(); }
});

test("14 completed alias analyses and their media link to the canonical 58 without rewriting immutable histories or manifests", () => {
  const f = fixture();
  try {
    f.brand(fixtureBrand("valentte")); f.brand(caseData.brand as Brand);
    for (let index=0;index<14;index++) {
      const ad = structuredClone(captured[index]);
      if (index<12) {
        const result = video(ad,index); ad.videoMediaId=result.mediaId; ad.videoAnalysis=result; f.ad(ad);
        f.db.prepare("INSERT INTO video_media VALUES (?,?,?,?)").run(result.mediaId,ad.brandId,ad.id,JSON.stringify({ mediaId:result.mediaId,brandId:ad.brandId,sourceAdId:ad.id,sha256:result.mediaSha256,absolutePath:`/fixture/${index}.mp4` }));
        f.db.prepare("INSERT INTO video_analysis_runs VALUES (?,?,?,?,?)").run(result.id,ad.brandId,ad.id,result.createdAt,JSON.stringify(result));
      } else {
        const result = image(ad,index); f.ad(ad);
        f.db.prepare("INSERT INTO image_media VALUES (?,?,?,?)").run(result.mediaId,ad.brandId,ad.id,JSON.stringify({mediaId:result.mediaId,brandId:ad.brandId,adId:ad.id,sha256:result.mediaSha256,images:[{absolutePath:`/fixture/${index}.jpg`}]}));
        f.db.prepare("INSERT INTO image_analysis_runs VALUES (?,?,?,?,?)").run(result.id,ad.brandId,ad.id,result.createdAt,JSON.stringify(result));
      }
    }
    const tables = ["video_analysis_runs","image_analysis_runs","video_media","image_media"];
    const originals = tables.map(table=>f.db.prepare(`SELECT id,data FROM ${table} ORDER BY id`).all());
    const status = reconcileValentteWorkspace(f.db);
    assert.equal(status.canonicalBrandId,"valentte"); assert.equal(status.collectedAds,58);
    assert.equal(status.analysedAds,14); assert.equal(status.videoAnalyses,12); assert.equal(status.imageAnalyses,2);
    assert.deepEqual(workspaceBrandIds(f.db,"valentte"),["valentte",caseData.brand.id]);
    assert.equal(canonicalWorkspaceBrands(f.db).filter(brand=>brand.domain === "valentte.com").length,1);
    assert.equal(resolveDemoBrandId(f.db,caseData.brand.id),"valentte");
    const canonicalAd = workspaceAd(f.db,"valentte",captured[0].providerAdId!)!;
    assert.equal(canonicalAd.brandId,"valentte"); assert.equal(canonicalAd.videoMediaId,undefined,"No alias-owned media manifest is relabelled as canonical");
    const refs = workspaceAdAliases(f.db,"valentte",canonicalAd.id);
    assert.equal(refs[0].brandId,"valentte"); assert.ok(refs.some(ref=>ref.brandId === caseData.brand.id && ref.adId === captured[0].id));
    const linked = linkedWorkspaceAnalyses(f.db,"valentte",canonicalAd.id);
    assert.equal(linked.length,1,"Embedded copies and durable analysis rows count once");
    assert.equal(linked[0].brandId,caseData.brand.id); assert.equal(linked[0].analysis.analysisConfigSha256,"historical-config-hash");
    const savedVideo = linked[0].analysis;
    assert.ok("coverage" in savedVideo);
    assert.equal(savedVideo.inputContextSha256,"historical-context-hash");
    assert.deepEqual(tables.map(table=>f.db.prepare(`SELECT id,data FROM ${table} ORDER BY id`).all()),originals);
    reconcileValentteWorkspace(f.db);
    assert.equal(valentteReconciliationStatus(f.db).analysedAds,14);
    assert.deepEqual(tables.map(table=>f.db.prepare(`SELECT id,data FROM ${table} ORDER BY id`).all()),originals);
  } finally { f.db.close(); }
});

test("duplicate internal IDs collapse by verified advertiser/native ID and unrelated workspaces never donate analyses", () => {
  const f = fixture();
  try {
    f.brand(fixtureBrand("valentte"));
    const foreign: Brand = { ...fixtureBrand("foreign"),name:"Other brand",domain:"other.example" }; f.brand(foreign);
    const first = { ...captured[0],brandId:"valentte",id:"existing-public-ad" }; f.ad(first);
    f.ad({ ...first,id:"duplicate-public-ad" });
    const other = { ...captured[0],brandId:foreign.id,id:"foreign-ad" }; f.ad(other);
    const result = video(other,99);
    f.db.prepare("INSERT INTO video_analysis_runs VALUES (?,?,?,?,?)").run(result.id,other.brandId,other.id,result.createdAt,JSON.stringify(result));
    reconcileValentteWorkspace(f.db);
    assert.equal(workspaceAds(f.db,"valentte").length,58);
    assert.deepEqual(linkedWorkspaceAnalyses(f.db,"valentte",first.id),[]);
    assert.ok(workspaceAdAliases(f.db,"valentte",first.id).every(ref=>ref.brandId !== "foreign"));
    assert.equal(workspaceAds(f.db,"foreign").length,1); assert.equal(canonicalValentteBrand(f.db)?.id,"valentte");
    const before = f.db.prepare("SELECT total_changes() AS n").get();
    workspaceAds(f.db,"valentte");workspaceAdAliases(f.db,"valentte",first.id);linkedWorkspaceAnalyses(f.db,"valentte",first.id);canonicalWorkspaceBrands(f.db);
    assert.deepEqual(f.db.prepare("SELECT total_changes() AS n").get(),before,"Read projections must not repair or mutate records on GET");
  } finally { f.db.close(); }
});

test("legacy embedded successful analyses remain readable and source imports participate in an outer transaction", () => {
  const f = fixture();
  try {
    f.brand(fixtureBrand("valentte")); f.brand(caseData.brand as Brand);
    const ad = structuredClone(captured[0]);ad.videoAnalysis=video(ad,1);f.ad(ad);
    reconcileValentteWorkspace(f.db);
    assert.equal(valentteReconciliationStatus(f.db).analysedAds,1);
    assert.equal(linkedWorkspaceAnalyses(f.db,"valentte",ad.providerAdId!)[0].analysis.id,"paid-video-1");
  } finally { f.db.close(); }
  const separate = fixture();
  try {
    separate.db.exec("BEGIN");reconcileValentteWorkspace(separate.db);assert.equal(workspaceAds(separate.db,"valentte").length,58);separate.db.exec("ROLLBACK");
    assert.equal((separate.db.prepare("SELECT count(*) AS n FROM ads").get() as {n:number}).n,0);
  } finally { separate.db.close(); }
});

test("hosted research is guarded, coalesced and restarts interrupted work without exposing raw errors", async () => {
  const f = fixture();
  try {
    reconcileValentteWorkspace(f.db); const saved = readBrandResearch(f.db,"valentte")!;
    let calls=0; const research = async () => { calls++;return saved; };
    await startHostedValentteResearch(f.db,{env:{NODE_ENV:"test",RENDER:"true"},research});assert.equal(calls,0);
    let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});
    const deferred = async () => { calls++;await gate;return saved; };
    const one=startHostedValentteResearch(f.db,{env:{NODE_ENV:"production",RENDER:"true"},research:deferred});
    const two=startHostedValentteResearch(f.db,{env:{NODE_ENV:"production",RENDER:"true"},research:deferred});
    assert.equal(hostedValentteResearchState(f.db).status,"running");finish();
    assert.equal((await one).status,"complete");assert.equal((await two).status,"complete");assert.equal(calls,1);
    await startHostedValentteResearch(f.db,{env:{NODE_ENV:"production",RENDER:"true"},research});assert.equal(calls,1);
    f.db.prepare("UPDATE metadata SET value=? WHERE key='valentte-demo-website-refresh-v1'").run(JSON.stringify({status:"running",brandId:"valentte",attempts:2,startedAt:"2026-11-01T00:00:00Z"}));
    const recovered=await startHostedValentteResearch(f.db,{env:{NODE_ENV:"production",RENDER:"true"},research});
    assert.equal(recovered.status,"complete");assert.equal(recovered.attempts,3);assert.equal(recovered.recoveredInterruptedAttempt,true);
    assert.deepEqual(readBrandResearch(f.db,"valentte"),saved);
    f.db.prepare("DELETE FROM metadata WHERE key='valentte-demo-website-refresh-v1'").run();
    const failed=await startHostedValentteResearch(f.db,{env:{NODE_ENV:"production",RENDER:"true"},research:async()=>{throw new Error("RAW_PROVIDER_DETAILS");}});
    assert.equal(failed.status,"failed");assert.doesNotMatch(failed.error!,/RAW_PROVIDER_DETAILS/);assert.deepEqual(readBrandResearch(f.db,"valentte"),saved);
  } finally { f.db.close(); }
});
