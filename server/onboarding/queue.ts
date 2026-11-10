import {randomUUID} from "node:crypto";
import type pg from "pg";
import type {Brand} from "../../shared/types.js";
import {nextMonth} from "../../shared/onboarding/rules.js";
import {mediaBrokerConfig} from "../ad-media/api.js";
export async function enqueueOnboarding(pool:pg.Pool,brand:Brand,kind:"initial"|"monthly"='initial'){
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`onboarding:${brand.id}`]);
 const old=(await client.query("SELECT id FROM brand_onboarding_runs WHERE workspace_id=$1 AND status IN ('queued','running','paused','uncertain') ORDER BY created_at DESC LIMIT 1",[brand.id])).rows[0];if(old){await client.query('COMMIT');return old.id as string;}
 const id=randomUUID();await client.query('INSERT INTO brand_onboarding_runs(id,workspace_id,kind,data) VALUES($1,$2,$3,$4)',[id,brand.id,kind,JSON.stringify({name:brand.name,domain:brand.domain,pages:[],failedUrls:[],queue:[`https://${brand.domain}/`],ownPages:[],searchSeen:[],competitorPages:[],choices:[],candidateIndex:0,keywordIndex:0,searchAfter:null,searchPages:0,manualCategories:brand.primaryCategoriesSource==='manual'||Boolean(brand.primaryCategories?.length&&brand.primaryCategoriesSource!=='onboarding')})]);await client.query('COMMIT');return id;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function claimOnboarding(pool:pg.Pool,owner:string){return (await pool.query(`UPDATE brand_onboarding_runs SET lease_owner=$1,lease_until=now()+interval '6 minutes' WHERE id=(SELECT id FROM brand_onboarding_runs WHERE status IN ('queued','running','paused') AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[owner])).rows[0]||null;}
export async function scheduleOnboarding(pool:pg.Pool,now=new Date(),env:Record<string,string|undefined>=process.env){
 if(!mediaBrokerConfig(env))return;
 const profiles=(await pool.query("SELECT workspace_id FROM brand_onboarding_profiles WHERE next_review_at<=$1",[now])).rows;
 // The web step owns SQLite reads; monthly requests carry their saved name/domain.
 for(const profile of profiles){const previous=(await pool.query(`SELECT jsonb_build_object('name',data->'name','domain',data->'domain','profile',jsonb_build_object('categories',data->'profile'->'categories')) AS data FROM brand_onboarding_runs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1`,[profile.workspace_id])).rows[0];if(!previous)continue;
  const row=previous.data;await enqueueOnboarding(pool,{id:profile.workspace_id,name:row.name,domain:row.domain,primaryCategories:row.profile?.categories} as any,'monthly');await pool.query('UPDATE brand_onboarding_profiles SET next_review_at=$2 WHERE workspace_id=$1',[profile.workspace_id,nextMonth(now)]);
 }
}
