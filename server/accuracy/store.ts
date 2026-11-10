import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AccuracyRow, ModelValidation, ValidationInput } from "../../shared/accuracy.js";
import type { LikelihoodEstimate, ResolvedNeighbour, MomentumAd } from "../../shared/likelihood.js";
export interface ModelArtifact {reference:ResolvedNeighbour[];market:MomentumAd[];validation:ModelValidation;provenance:string;evaluation:ValidationInput;dataSource:"fixtures"|"public-observations"|"owned-outcomes"}
export function ensureAccuracy(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS accuracy_records(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,kind TEXT NOT NULL,record_key TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS accuracy_records_latest ON accuracy_records(workspace_id,kind,record_key,created_at DESC);
    CREATE TABLE IF NOT EXISTS likelihood_estimates(workspace_id TEXT NOT NULL,ad_id TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(workspace_id,ad_id));`);
}
export function appendAccuracy(db:DatabaseSync,workspace:string,kind:string,key:string,data:unknown,at:string) {
  // Content hashes make identical retry writes idempotent. History is never replaced.
  const id=createHash("sha256").update(JSON.stringify([workspace,kind,key,data])).digest("hex");
  db.prepare("INSERT INTO accuracy_records VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run(id,workspace,kind,key,at,JSON.stringify(data));return id;
}
export function latestRecords<T>(db:DatabaseSync,workspace:string,kind:string,limit=2000):T[] {
  const rows=db.prepare(`SELECT data FROM accuracy_records WHERE workspace_id=? AND kind=? AND rowid IN
    (SELECT max(rowid) FROM accuracy_records WHERE workspace_id=? AND kind=? GROUP BY record_key) ORDER BY record_key LIMIT ?`).all(workspace,kind,workspace,kind,limit+1) as {data:string}[];
  if(rows.length>limit)throw new Error("Accuracy history exceeds the read limit. No partial measurement is shown.");
  return rows.map(r=>JSON.parse(r.data) as T);
}
export function saveMeasurements(db:DatabaseSync,workspace:string,rows:AccuracyRow[],at:string){for(const r of rows)appendAccuracy(db,workspace,"measurement",`${r.layer}:${r.field}:${r.version}`,r,at);}
export function storedPredictions(db:DatabaseSync,workspace:string):Map<string,LikelihoodEstimate> {
  return new Map((db.prepare("SELECT ad_id,data FROM likelihood_estimates WHERE workspace_id=? LIMIT 100000").all(workspace) as {ad_id:string;data:string}[]).map(r=>[r.ad_id,JSON.parse(r.data)]));
}
export function savePrediction(db:DatabaseSync,workspace:string,id:string,value:LikelihoodEstimate,at:string){db.prepare("INSERT INTO likelihood_estimates VALUES(?,?,?,?) ON CONFLICT(workspace_id,ad_id) DO UPDATE SET created_at=excluded.created_at,data=excluded.data").run(workspace,id,at,JSON.stringify(value));}
export const newAccuracyId=()=>randomUUID();
export function modelValidations(db:DatabaseSync,workspace:string):ModelValidation[] {
  return (db.prepare(`SELECT json_extract(data,'$.validation') AS validation FROM accuracy_records
    WHERE workspace_id=? AND kind='model' AND rowid IN (SELECT max(rowid) FROM accuracy_records WHERE workspace_id=? AND kind='model' GROUP BY record_key)`).all(workspace,workspace) as {validation:string}[]).map(r=>JSON.parse(r.validation));
}
export function readModel(db:DatabaseSync,workspace:string,cohort:string):ModelArtifact|null {
  const row=db.prepare("SELECT data FROM accuracy_records WHERE workspace_id=? AND kind='model' AND record_key=? ORDER BY rowid DESC LIMIT 1").get(workspace,`likelihood-v1:${cohort}`) as {data:string}|undefined;
  return row?JSON.parse(row.data):null;
}
