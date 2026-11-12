import {randomUUID} from "node:crypto";
import type pg from "pg";
import {mediaBrokerConfig} from "../ad-media/api.js";
import {assertProxySupport} from "../connectors/http.js";
import {claimOnboarding,scheduleOnboarding} from "./queue.js";
import {brokerAcknowledgement,type WorkerObserver} from "../infrastructure/worker-diagnostics.js";
export async function workOnboardingOnce(pool:pg.Pool,options:WorkerObserver&{env?:Record<string,string|undefined>;fetch?:typeof fetch}={}){
 const env=options.env||process.env,config=mediaBrokerConfig(env);if(!config)return false;await scheduleOnboarding(pool,new Date(),env);
 const owner=randomUUID(),run=await claimOnboarding(pool,owner);if(!run)return false;let worked=false;
 options.onClaim?.({id:run.id,owner,workspaceId:run.workspace_id,status:run.status});
 try{assertProxySupport(Boolean(options.fetch),env);const response=await(options.fetch||fetch)(`${config.origin}/api/onboarding/step/${run.id}/${owner}`,{method:'POST',headers:{'X-Exter-Ad-Media-Token':config.token},redirect:'error',signal:AbortSignal.timeout(150000)});worked=await brokerAcknowledgement(response);}catch(error){options.onFailure?.(error);}
 await pool.query("UPDATE brand_onboarding_runs SET lease_owner=NULL,lease_until=NULL,available_at=CASE WHEN $3 THEN available_at ELSE now()+interval '1 minute' END WHERE id=$1 AND lease_owner=$2",[run.id,owner,worked]);return true;
}
