import {test} from "node:test";
import assert from "node:assert/strict";
import {jsonFingerprint,metaSnapshot,observationFingerprint} from "../server/infrastructure/meta-observations.js";
import {META_FIELDS} from "../server/connectors/meta-library.js";
import {publishedReach} from "../shared/meta-public.js";
import {mergePublicEvidence,type PublicObservation} from "../server/infrastructure/meta-evidence.js";
import {storageMeasurement,storageBytes} from "../shared/storage-health.js";
import {databaseStorageHealth} from "../server/infrastructure/storage-health.js";
import {browserCreative} from "./fixtures/creative-browser.js";
import type pg from "pg";

test("change fingerprints ignore JSON object order but retain every stored field, array order, null and actual zero",()=>{
  const first={id:"101",page_id:"12",ad_creative_bodies:["A fictional candle for a quiet evening"],total_reach_by_location:[{key:"UK",value:0}]};
  assert.equal(jsonFingerprint(first),jsonFingerprint({total_reach_by_location:[{value:0,key:"UK"}],ad_creative_bodies:first.ad_creative_bodies,page_id:"12",id:"101"}));
  assert.notEqual(jsonFingerprint({a:null}),jsonFingerprint({}));assert.notEqual(jsonFingerprint([1,2]),jsonFingerprint([2,1]));
  for(const field of META_FIELDS.split(","))assert.notEqual(metaSnapshot(first).observationHash,metaSnapshot({...first,[field]:field==="id"?"102":field==="page_id"?"13":["Changed fixture value"]}).observationHash,field);
  assert.notEqual(metaSnapshot(first).observationHash,metaSnapshot({...first,total_reach_by_location:[]}).observationHash);
  const snapshot=metaSnapshot(first);assert.equal(snapshot.activeStatus,"unknown");assert.equal(metaSnapshot({...first,ad_delivery_stop_time:"2026-11-04"}).activeStatus,"inactive");
  assert.notEqual(snapshot.observationHash,observationFingerprint(snapshot.payloadHash,"active",snapshot.reach));
  assert.notEqual(snapshot.observationHash,observationFingerprint(snapshot.payloadHash,snapshot.activeStatus,publishedReach({})));
});
test("unchanged confirmation advances current evidence and days running without changing the original snapshot time",()=>{
 const brand={id:"fixture",name:"Fictional Candle House",domain:"fictional.example"};
 const observation:PublicObservation={native_id:"101",advertiser_id:"12",brand_key:brand.id,page_ids:["12"],first_seen_at:"2026-10-01T00:00:00Z",observed_at:"2026-10-02T00:00:00Z",last_confirmed_at:"2026-11-05T00:00:00Z",start_time:"2026-10-01T00:00:00Z",stop_time:null,raw_payload:{ad_creative_bodies:["Fictional source copy"],total_reach_by_location:[{key:"UK",value:0}]}};
 const row=mergePublicEvidence([], [observation],brand,[])[0];assert.equal(row.observedAt,new Date(observation.last_confirmed_at!).toISOString());assert.equal(row.daysRunning,35);assert.equal(row.reachObservedAt,new Date(observation.last_confirmed_at!).toISOString());assert.equal(observation.observed_at,"2026-10-02T00:00:00Z");
 const legacy=mergePublicEvidence([browserCreative({brandId:brand.id,nativeId:"102",observedAt:null,daysRunning:null})],[{...observation,native_id:"102",last_confirmed_at:null}],brand,[])[0];assert.equal(legacy.observedAt,new Date(observation.observed_at).toISOString());assert.equal(legacy.daysRunning,1);
});
test("daily storage growth uses elapsed measured days, preserves zero and decreases, and waits for a full-day baseline",()=>{
 const now="2026-11-05T12:00:00Z",before="2026-11-03T12:00:00Z";
 assert.equal(storageMeasurement(12000,now,{sizeBytes:10000,measuredAt:before}).growthBytesPerDay,1000);
 assert.equal(storageMeasurement(12000,now,{sizeBytes:12000,measuredAt:before}).growthBytesPerDay,0);
 assert.equal(storageMeasurement(10000,now,{sizeBytes:12000,measuredAt:before}).growthBytesPerDay,-1000);
 for(const baseline of [undefined,{sizeBytes:0,measuredAt:"2026-11-05T11:00:00Z"},{sizeBytes:0,measuredAt:"2026-11-06T12:00:00Z"},{sizeBytes:-1,measuredAt:before}])assert.equal(storageMeasurement(0,now,baseline).growthBytesPerDay,null);
 assert.equal(storageMeasurement(0,now).sizeBytes,0);assert.equal(storageMeasurement(-1,now).status,"unavailable");assert.equal(storageMeasurement(0,"invalid").sizeBytes,null);
 assert.equal(storageBytes(null),"Unavailable");assert.equal(storageBytes(0),"0 B");assert.equal(storageBytes(1024**2),"1 MiB");assert.equal(storageBytes(-1024,true),"−1 KiB");
});
test("storage check failures never expose driver errors or turn missing sizes into zero",async()=>{
 const health=await databaseStorageHealth({query:async()=>{throw new Error("fixture-private-driver-message");}} as unknown as pg.Pool);
 assert.equal(health.status,"unavailable");assert.equal(health.sizeBytes,null);assert.equal(health.growthBytesPerDay,null);assert.ok(!JSON.stringify(health).includes("fixture-private"));
});
