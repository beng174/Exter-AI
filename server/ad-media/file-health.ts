import type pg from "pg";
import type {RetainedCreative} from "./read.js";
import {AdMediaStorage} from "./storage.js";
// Presence is cached briefly; never hash thousands of videos during a page read.
const checks=new Map<string,{at:number;available:boolean}>();
const pending=new Map<string,Promise<boolean>>();
export async function checkedRetainedMedia(pool:pg.Pool,rows:RetainedCreative[],storage=new AdMediaStorage(),now=Date.now()){
 const refs=[...new Map(rows.flatMap(row=>row.assets.map(asset=>[JSON.stringify([asset.ref.workspaceId,asset.ref.artifactId]),asset.ref] as const))).entries()];
 const updates:{workspace:string;artifact:string;available:boolean}[]=[];
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(8,refs.length)},async()=>{
  while(cursor<refs.length){const [key,ref]=refs[cursor++],cached=checks.get(key);if(cached&&now-cached.at<60000)continue;
   let task=pending.get(key);if(!task){task=storage.exists(ref);pending.set(key,task);}
   try{const available=await task;checks.set(key,{at:now,available});updates.push({workspace:ref.workspaceId,artifact:ref.artifactId,available});}finally{pending.delete(key);}
  }
 }));
 if(updates.length)await pool.query(`INSERT INTO ad_media_file_checks(workspace_id,artifact_id,available,checked_at)
  SELECT workspace,artifact,available,now() FROM jsonb_to_recordset($1::jsonb) AS x(workspace text,artifact text,available boolean)
  ON CONFLICT(workspace_id,artifact_id) DO UPDATE SET available=excluded.available,checked_at=excluded.checked_at`,[JSON.stringify(updates)]);
 const result=rows.map(row=>({...row,assets:row.assets.filter(asset=>checks.get(JSON.stringify([asset.ref.workspaceId,asset.ref.artifactId]))?.available)}));
 while(checks.size>25000)checks.delete(checks.keys().next().value!);
 return result;
}
/** Advance a bounded presence sweep; coverage reads never stat every saved file. */
export async function checkWorkspaceMediaSlice(pool:pg.Pool,workspace:string,storage=new AdMediaStorage()){
 const result=await pool.query(`SELECT * FROM (SELECT DISTINCT ON (a->'ref'->>'artifactId') c.workspace_id,c.brand_key,c.native_id,a AS asset,f.checked_at
 FROM ad_media_creatives c JOIN watchlists w ON w.workspace_id=c.workspace_id AND w.brand_key=c.brand_key AND w.page_ids->>0=c.page_id
 CROSS JOIN LATERAL jsonb_array_elements(c.assets)a LEFT JOIN ad_media_file_checks f ON f.workspace_id=c.workspace_id AND f.artifact_id=a->'ref'->>'artifactId'
 WHERE c.workspace_id=$1 AND (f.checked_at IS NULL OR f.checked_at<now()-interval '1 minute')
 ORDER BY a->'ref'->>'artifactId',f.checked_at NULLS FIRST) files ORDER BY checked_at NULLS FIRST,asset->'ref'->>'artifactId' LIMIT 250`,[workspace]);
 await checkedRetainedMedia(pool,result.rows.map(r=>({workspace_id:r.workspace_id,brand_key:r.brand_key,native_id:r.native_id,format:null,assets:[r.asset]})),storage);
}
