import {randomUUID} from "node:crypto";
import type pg from "pg";
import {AD_MEDIA_BATCH,mediaEnabled,mediaMaximumUsd,mediaGbpRate,priorityVideoIds} from "../../shared/ad-media.js";
import {publishedReach} from "../../shared/meta-public.js";
import {readPublicObservations} from "../infrastructure/meta-evidence.js";
import {reserveCost} from "../infrastructure/budget.js";
import {AdMediaActor,AdMediaError,actorMedia,providerId,finalMediaCostUsd,type ActorScope} from "./apify.js";
import {AdMediaStorage} from "./storage.js";
const ACTIVE=["queued","running","starting","uncertain","paused"];
const isoDay=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
function yearStart(now:Date){const date=new Date(now),month=date.getUTCMonth();date.setUTCFullYear(date.getUTCFullYear()-1);if(date.getUTCMonth()!==month)date.setUTCDate(0);return date.toISOString().slice(0,10);}
/** Batches are bounded; the first Page query covers the rolling year, later ones request exact gaps. */
export async function enqueueAdMedia(pool:pg.Pool,watchlistId:string,now=new Date()){
  const lock=await pool.connect();
  try{
    await lock.query("BEGIN");await lock.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`ad-media:${watchlistId}`]);
    const w=(await lock.query("SELECT * FROM watchlists WHERE id=$1 AND enabled AND purpose='brand' AND brand_key IS NOT NULL AND jsonb_array_length(page_ids)=1 AND countries @> '[\"GB\"]'::jsonb",[watchlistId])).rows[0];
    if(!w){await lock.query("ROLLBACK");return null;}
    if((await lock.query("SELECT id FROM ad_media_runs WHERE watchlist_id=$1 AND status=ANY($2::text[])",[watchlistId,ACTIVE])).rowCount){await lock.query("ROLLBACK");return null;}
    const observations=(await readPublicObservations(pool,w.workspace_id)).filter(o=>o.brand_key===w.brand_key&&o.advertiser_id===w.page_ids[0]&&(!o.stop_time||Date.parse(String(o.stop_time))>=Date.parse(yearStart(now))));
    const previous=(await lock.query("SELECT 1 FROM ad_media_runs WHERE watchlist_id=$1 AND revision=$2 LIMIT 1",[w.id,w.revision])).rowCount;
    const priority=priorityVideoIds(observations.map(o=>({nativeId:o.native_id,brandId:w.brand_key,deliveryStartAt:o.start_time?new Date(o.start_time).toISOString():null,daysRunning:o.start_time?Math.max(0,Math.floor((Date.parse(String(o.stop_time||o.last_confirmed_at||o.observed_at))-Date.parse(String(o.start_time)))/86400000)):null,publicReach:publishedReach(o.raw_payload)})),now);
    const retained=await lock.query(`SELECT DISTINCT ON(native_id) native_id,complete,expected_videos,assets FROM ad_media_creatives WHERE workspace_id=$1 AND brand_key=$2 AND page_id=$3 ORDER BY native_id,created_at DESC`,[w.workspace_id,w.brand_key,w.page_ids[0]]);
    const present=new Set<string>(retained.rows.filter(r=>r.complete&&(!priority.has(r.native_id)||r.assets.filter((a:any)=>a.role==="video").length>=r.expected_videos)).map(r=>r.native_id));
    const attempted=await lock.query(`SELECT c.native_id FROM ad_media_creatives c WHERE workspace_id=$1 AND brand_key=$2 AND created_at>$3::timestamptz-interval '24 hours'
      UNION SELECT jsonb_array_elements_text(target_ids) FROM ad_media_runs WHERE watchlist_id=$4 AND started_at>$3::timestamptz-interval '24 hours' AND phase='missing'`,[w.workspace_id,w.brand_key,now.toISOString(),w.id]);
    const tried=new Set<string>(attempted.rows.map(r=>r.native_id));
    const missing=observations.filter(o=>!present.has(o.native_id)&&!tried.has(o.native_id));
    if(!missing.length){await lock.query("ROLLBACK");return null;}
    const targets=previous?missing.slice(0,AD_MEDIA_BATCH).map(o=>o.native_id):missing.map(o=>o.native_id),id=randomUUID();
    await lock.query(`INSERT INTO ad_media_runs(id,watchlist_id,workspace_id,brand_key,revision,page_id,window_from,window_to,phase,target_ids,priority_ids,cap) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,w.id,w.workspace_id,w.brand_key,w.revision,w.page_ids[0],yearStart(now),now.toISOString().slice(0,10),previous?"missing":"page",JSON.stringify(targets),JSON.stringify([...priority]),Math.min(AD_MEDIA_BATCH,Math.max(targets.length,1))]);
    await lock.query("COMMIT");return id;
  }catch(error){await lock.query("ROLLBACK");throw error;}finally{lock.release();}
}
export async function scheduleAdMedia(pool:pg.Pool,env:Record<string,string|undefined>=process.env,now=new Date()){
  if(!mediaEnabled(env))return;
  const rows=await pool.query("SELECT id FROM watchlists WHERE enabled AND purpose='brand' AND brand_key IS NOT NULL ORDER BY id");
  for(const w of rows.rows)await enqueueAdMedia(pool,w.id,now);
}
export async function claimAdMedia(pool:pg.Pool,owner:string){return(await pool.query(`UPDATE ad_media_runs SET lease_owner=$1,lease_until=now()+interval '6 minutes' WHERE id=(SELECT id FROM ad_media_runs WHERE status IN ('queued','running','starting') AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[owner])).rows[0]||null;}

/** A single fenced step runs on the disk-owning web service, not the diskless worker. */
export async function stepAdMedia(pool:pg.Pool,id:string,owner:string,options:{env?:Record<string,string|undefined>;actor?:AdMediaActor;storage?:AdMediaStorage;existingIds?:Set<string>}={}){
  const env=options.env||process.env;if(!mediaEnabled(env))return false;
  const client=await pool.connect();let run:any;
  try{
    // One disk writer/transcode across service processes, with automatic release after a crash.
    if(!(await client.query("SELECT pg_try_advisory_lock(hashtext('ad-media-disk-step')) AS locked")).rows[0].locked)return false;
    run=(await client.query("SELECT r.*,w.enabled,w.revision AS current_revision,w.page_ids FROM ad_media_runs r JOIN watchlists w ON w.id=r.watchlist_id WHERE r.id=$1 AND r.lease_owner=$2 AND r.lease_until>now()",[id,owner])).rows[0];
    if(!run||!ACTIVE.includes(run.status)||["paused","uncertain"].includes(run.status))return false;
    const update=async(status:string,error:string|null=null)=>client.query("UPDATE ad_media_runs SET status=$3,error_kind=COALESCE($4,error_kind),available_at=now()+interval '5 seconds' WHERE id=$1 AND lease_owner=$2 AND lease_until>now()",[id,owner,status,error]);
    if(!run.enabled||run.current_revision!==run.revision||run.page_ids[0]!==run.page_id){await update("failed","changed");return true;}
    const actor=options.actor||new AdMediaActor({env});
    if(run.status==="starting"&&!run.actor_run_id){await update("uncertain","uncertain");return true;}
    if(!run.actor_run_id){
      const requested=(run.target_ids as string[]).filter(nativeId=>!options.existingIds?.has(nativeId));
      if(!requested.length){await client.query("UPDATE ad_media_runs SET status='complete',finished_at=clock_timestamp() WHERE id=$1 AND lease_owner=$2",[id,owner]);return true;}
      if(!env.APIFY_TOKEN?.trim()||/[\r\n]/.test(env.APIFY_TOKEN)||mediaGbpRate(env)===null){await update("paused","configuration");return true;}
      const rate=mediaGbpRate(env)!;
      let reservation:string;
      try{reservation=await reserveCost(pool,"data_providers","apify_ad_media",Math.ceil(mediaMaximumUsd(run.cap)*rate*1e6)/1e6);}catch{await update("paused","budget");return true;}
      // Persist the hold BEFORE a chargeable request. A crash cannot cause an automatic second start.
      await client.query("UPDATE ad_media_runs SET status='starting',reservation_id=$3,gbp_per_usd=$4 WHERE id=$1 AND lease_owner=$2",[id,owner,reservation,rate]);
      const scope:ActorScope={pageId:run.page_id,from:isoDay(run.window_from),to:isoDay(run.window_to),ids:run.phase==="missing"?requested:[],cap:run.cap};
      try{
        const started=await actor.start(scope);
        if(!providerId(started.id)||!providerId(started.defaultDatasetId))throw new AdMediaError("output");
        await client.query("UPDATE ad_media_runs SET status='running',actor_run_id=$3,dataset_id=$4,available_at=now() WHERE id=$1 AND lease_owner=$2",[id,owner,started.id,started.defaultDatasetId]);
      }catch{await update("uncertain","uncertain");}
      return true;
    }
    // Read terminal state before the dataset tail, so a final append cannot be missed.
    const state=await actor.run(run.actor_run_id);
    if(state.id!==run.actor_run_id)throw new AdMediaError("output");
    const storage=options.storage||new AdMediaStorage(),items=await actor.items(run.dataset_id,run.result_offset);
    if(items.length){
      if(run.result_offset>=run.cap+100)throw new AdMediaError("output");
      const media=actorMedia(items[0]);
      if(media&&media.pageId===run.page_id&&!options.existingIds?.has(media.adId)&&(run.phase==="page"||run.target_ids.includes(media.adId))){
        const official=await client.query(`SELECT 1 FROM ad_observations o JOIN public_ads a USING(platform,native_id) JOIN collection_runs r ON r.id=o.run_id WHERE o.workspace_id=$1 AND a.platform='Meta' AND a.native_id=$2 AND a.advertiser_id=$3 AND r.watchlist_id=$4 AND r.config->>'revision'=$5 LIMIT 1`,[run.workspace_id,media.adId,run.page_id,run.watchlist_id,String(run.revision)]);
        if(official.rowCount){
          const prior=(await client.query("SELECT assets FROM ad_media_creatives WHERE run_id=$1 AND native_id=$2",[id,media.adId])).rows[0];
          const eligible=run.priority_ids.includes(media.adId);
          const kept=prior?{assets:prior.assets,error:null}:await storage.retain(run.workspace_id,media,eligible);
          if(kept.error)await client.query("UPDATE ad_media_runs SET error_kind=COALESCE(error_kind,$2) WHERE id=$1",[id,kept.error]);
          await client.query(`INSERT INTO ad_media_creatives(id,run_id,workspace_id,brand_key,native_id,page_id,format,assets,video_eligible,error_kind,complete,expected_videos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(run_id,native_id) DO NOTHING`,[randomUUID(),id,run.workspace_id,run.brand_key,media.adId,run.page_id,media.format,JSON.stringify(kept.assets),eligible,kept.error,kept.assets.length>0&&!kept.error&&kept.assets.length>=media.images.length+media.posters.length+(eligible?media.videos.length:0),media.videos.length]);
        }
      }
      // Every returned item counts, including unmatched, duplicate and discarded output.
      await client.query("UPDATE ad_media_runs SET result_offset=result_offset+1,results=results+1,ads_with_media=(SELECT count(*) FROM ad_media_creatives c WHERE c.run_id=ad_media_runs.id AND jsonb_array_length(c.assets)>0),available_at=now() WHERE id=$1 AND lease_owner=$2",[id,owner]);
      return true;
    }
    if(["RUNNING","READY","ABORTING","TIMING-OUT"].includes(state.status)){await update("running");return true;}
    if(!["SUCCEEDED","FAILED","ABORTED","TIMED-OUT"].includes(state.status))throw new AdMediaError("output");
    // Only final, bounded costs release a portion of the conservative maximum hold.
    const charged=finalMediaCostUsd(state,run.results,run.cap);
    if(charged!==null){
      await client.query("BEGIN");await client.query("SELECT monthly_budget_gbp FROM budget_settings WHERE cost_type='data_providers' FOR UPDATE");
      await client.query("UPDATE cost_ledger SET cost_gbp=$2,status='settled',cost_basis='estimated' WHERE id=$1 AND provider='apify_ad_media' AND status='reserved'",[run.reservation_id,Math.ceil(charged*Number(run.gbp_per_usd)*1e6)/1e6]);await client.query("COMMIT");
    }
    await client.query("UPDATE ad_media_runs SET status=$3,error_kind=COALESCE($4,error_kind),finished_at=clock_timestamp() WHERE id=$1 AND lease_owner=$2",[id,owner,state.status==="SUCCEEDED"?"complete":"failed",state.status==="SUCCEEDED"?null:"provider"]);
    return true;
  }catch(error){
    await client.query("ROLLBACK").catch(()=>{});
    if(run)await client.query("UPDATE ad_media_runs SET status='paused',error_kind=$3 WHERE id=$1 AND lease_owner=$2",[id,owner,error instanceof AdMediaError?error.kind:"provider"]);
    return true;
  }finally{await client.query("SELECT pg_advisory_unlock(hashtext('ad-media-disk-step'))").catch(()=>{});client.release();}
}
