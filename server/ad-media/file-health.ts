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
