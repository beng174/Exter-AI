import {createHash} from "node:crypto";
import type pg from "pg";
import {publishedReach} from "../../shared/meta-public.js";

/** JSON object order is irrelevant; array order, absent fields and explicit null stay distinct. */
export function jsonFingerprint(value:unknown):string {
  const json=JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  return createHash("sha256").update(json).digest("hex");
}
export function observationFingerprint(payloadHash:string,activeStatus:string,reach:unknown){
  return jsonFingerprint({payloadHash,activeStatus,reach});
}
export function metaSnapshot(row:Record<string,unknown>){
  const activeStatus=row.ad_delivery_stop_time?"inactive":"unknown",reach=publishedReach(row),payloadHash=jsonFingerprint(row);
  return {activeStatus,reach,payloadHash,observationHash:observationFingerprint(payloadHash,activeStatus,reach)};
}

/** Caller holds the public_ads row lock and page transaction, including its cursor. */
export async function recordMetaObservation(client:pg.PoolClient,run:{id:string;workspace_id:string;watchlist_id:string;config?:{revision?:number}|null},row:Record<string,unknown>){
  const snapshot=metaSnapshot(row),id=String(row.id);
  const latest=await client.query(`SELECT o.run_id,o.active_status,o.reach,o.payload_hash,o.observation_hash,o.raw_payload_run_id,
      CASE WHEN o.payload_hash IS NULL OR o.observation_hash IS NULL THEN COALESCE(o.raw_payload,p.raw_payload) END AS legacy_payload
    FROM ad_observations o JOIN collection_runs r ON r.id=o.run_id
    LEFT JOIN ad_observations p ON p.platform=o.platform AND p.native_id=o.native_id AND p.run_id=o.raw_payload_run_id AND p.workspace_id=o.workspace_id
    WHERE o.platform='Meta' AND o.native_id=$1 AND o.workspace_id=$2 AND r.watchlist_id=$3
      AND COALESCE(r.config->>'revision','')=$4
    ORDER BY o.observed_at DESC,o.run_id DESC LIMIT 1`,[id,run.workspace_id,run.watchlist_id,String(run.config?.revision??"")]);
  const previous=latest.rows[0];
  const previousPayloadHash=previous?.payload_hash||(previous?.legacy_payload?jsonFingerprint(previous.legacy_payload):null);
  const previousHash=previous?.observation_hash||(previousPayloadHash?observationFingerprint(previousPayloadHash,previous.active_status,previous.reach):null);
  if(previousHash===snapshot.observationHash){
    await client.query(`UPDATE ad_observations SET last_confirmed_at=GREATEST(COALESCE(last_confirmed_at,observed_at),clock_timestamp()),payload_hash=$4,observation_hash=$5
      WHERE platform='Meta' AND native_id=$1 AND workspace_id=$2 AND run_id=$3`,[id,run.workspace_id,previous.run_id,snapshot.payloadHash,snapshot.observationHash]);
    return "confirmed" as const;
  }
  // Conflicting duplicates in one provider run cannot overwrite an already committed snapshot.
  if(previous?.run_id===run.id)return "conflict" as const;
  const rawChanged=previousPayloadHash!==snapshot.payloadHash;
  const source=rawChanged?null:previous.raw_payload_run_id||previous.run_id;
  const inserted=await client.query(`WITH checked AS MATERIALIZED(SELECT clock_timestamp() AS checked_at)
    INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload,last_confirmed_at,payload_hash,observation_hash,raw_payload_run_id,observed_at)
    SELECT 'Meta',$1,$2,$3,$4,$5,$6,checked_at,$7,$8,$9,checked_at FROM checked ON CONFLICT DO NOTHING RETURNING native_id`,
    [id,run.id,run.workspace_id,snapshot.activeStatus,snapshot.reach,rawChanged?row:null,snapshot.payloadHash,snapshot.observationHash,source]);
  return inserted.rowCount?"inserted" as const:"conflict" as const;
}
