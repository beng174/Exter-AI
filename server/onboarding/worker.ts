import {randomUUID} from "node:crypto";
import type pg from "pg";
import {mediaBrokerConfig} from "../ad-media/api.js";
import {assertProxySupport} from "../connectors/http.js";
import {claimOnboarding,scheduleOnboarding} from "./queue.js";
export async function workOnboardingOnce(pool:pg.Pool,options:{env?:Record<string,string|undefined>;fetch?:typeof fetch}={}){
 const env=options.env||process.env,config=mediaBrokerConfig(env);if(!config)return false;await scheduleOnboarding(pool,new Date(),env);
 const owner=randomUUID(),run=await claimOnboarding(pool,owner);if(!run)return false;let worked=false;
 try{assertProxySupport(Boolean(options.fetch),env);const response=await(options.fetch||fetch)(`${config.origin}/api/onboarding/step/${run.id}/${owner}`,{method:'POST',headers:{'X-Exter-Ad-Media-Token':config.token},redirect:'error',signal:AbortSignal.timeout(150000)});if(response.ok&&Number(response.headers.get('content-length'))<=1024){if(response.body){const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>1024)throw new Error('output');chunks.push(next.value);}worked=JSON.parse(Buffer.concat(chunks).toString()).worked===true;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}}await response.body?.cancel().catch(()=>{});}catch{}
 await pool.query("UPDATE brand_onboarding_runs SET lease_owner=NULL,lease_until=NULL,available_at=CASE WHEN $3 THEN available_at ELSE now()+interval '1 minute' END WHERE id=$1 AND lease_owner=$2",[run.id,owner,worked]);return true;
}
