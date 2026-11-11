import {randomUUID} from "node:crypto";
import type pg from "pg";
import {AD_MEDIA_BATCH,mediaEnabled,mediaMaximumUsd,mediaGbpRate} from "../../shared/ad-media.js";
import {PUBLIC_ROWS_SQL} from "../infrastructure/public-rows-sql.js";
import {reserveCost} from "../infrastructure/budget.js";
import {AdMediaActor,AdMediaError,actorMedia,providerId,finalMediaCostUsd,actorCounts,mediaActorInput,record,type ActorScope} from "./apify.js";
import {AdMediaStorage,videoFitsDisk} from "./storage.js";
const ACTIVE=["queued","running","starting","uncertain","paused"];
const isoDay=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
function yearStart(now:Date){const date=new Date(now),month=date.getUTCMonth();date.setUTCFullYear(date.getUTCFullYear()-1);if(date.getUTCMonth()!==month)date.setUTCDate(0);return date.toISOString().slice(0,10);}
/** Every batch requests exact official IDs; unrequested ads take priority over retries. */
export async function enqueueAdMedia(pool:pg.Pool,watchlistId:string,now=new Date(),preferredRun?:string){
  const lock=await pool.connect();
  try{
    await lock.query("BEGIN");await lock.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`ad-media:${watchlistId}`]);
    const w=(await lock.query("SELECT * FROM watchlists WHERE id=$1 AND enabled AND purpose='brand' AND brand_key IS NOT NULL AND jsonb_array_length(page_ids)=1 AND countries @> '[\"GB\"]'::jsonb",[watchlistId])).rows[0];
    if(!w){await lock.query("ROLLBACK");return null;}
    await lock.query("UPDATE ad_media_runs SET status='failed',error_kind='priority',finished_at=clock_timestamp() WHERE watchlist_id=$1 AND preview_policy='legacy' AND status='queued' AND actor_run_id IS NULL AND reservation_id IS NULL AND requested_ids IS NULL AND (lease_until IS NULL OR lease_until<now())",[watchlistId]);
    if((await lock.query("SELECT id FROM ad_media_runs WHERE watchlist_id=$1 AND status=ANY($2::text[])",[watchlistId,ACTIVE])).rowCount){await lock.query("ROLLBACK");return null;}
    const health=(await lock.query("SELECT data FROM ad_media_disk_health WHERE id=1 AND measured_at>now()-interval '10 minutes'")).rows[0]?.data;
    // Bulk joins must not rescan a request-history CTE once per ad when a new
    // workspace has small planner estimates. Settings end with this transaction.
    await lock.query("SET LOCAL enable_nestloop=off; SET LOCAL enable_mergejoin=off; SET LOCAL jit=off; SET LOCAL statement_timeout='30s'");
    const selected=await lock.query(`${PUBLIC_ROWS_SQL}, ranked AS (
      SELECT s.*,row_number() OVER(ORDER BY days DESC NULLS LAST,native_id) AS longevity_rank,
       CASE WHEN uk_reach IS NOT NULL THEN row_number() OVER(ORDER BY uk_reach DESC NULLS LAST,native_id) END AS reach_rank,
       CASE WHEN COALESCE(uk_reach,eu_reach) IS NOT NULL THEN row_number() OVER(ORDER BY COALESCE(uk_reach,eu_reach) DESC NULLS LAST,native_id) END AS video_reach_rank
      FROM state s
    ), eligible AS (
      SELECT *,days>=30 OR start_time BETWEEN $3::timestamptz-interval '7 days' AND $3 OR video_reach_rank<=20 AS priority,
       CASE WHEN longevity_rank<=50 AND days IS NOT NULL THEN 0 WHEN reach_rank<=50 THEN 1 WHEN status='active' THEN 2 ELSE 3 END AS priority_tier,
       CASE WHEN NOT image AND requested_at IS NULL AND legacy_attempt IS NULL THEN 0
        WHEN NOT image AND returned_at IS NOT NULL AND outcome<>'expired' AND dataset_id IS NOT NULL AND reprocess_version IS DISTINCT FROM 'preview-v2' AND lookup_mode<>'reprocess' THEN 1
        WHEN NOT image AND (lookup_mode='backfill' AND outcome IN ('not_returned','no_media','wrong_page','expired') OR lookup_mode='reprocess' AND outcome='expired') THEN 2
        WHEN NOT image AND (COALESCE(requested_at,legacy_attempt) AT TIME ZONE 'Europe/London')::date<($3::timestamptz AT TIME ZONE 'Europe/London')::date THEN 3
        WHEN image AND is_video AND NOT video AND $4::boolean AND (video_attempt_at IS NULL OR (video_attempt_at AT TIME ZONE 'Europe/London')::date<($3::timestamptz AT TIME ZONE 'Europe/London')::date) THEN 4 END AS phase
      FROM ranked
    ), ordered AS MATERIALIZED (
      SELECT *,row_number() OVER(ORDER BY phase,CASE WHEN phase=4 THEN CASE WHEN priority THEN 0 ELSE 1 END ELSE priority_tier END,
        CASE WHEN phase<>4 THEN days END DESC NULLS LAST,CASE WHEN phase=4 THEN start_time END DESC NULLS LAST,native_id) AS rank
      FROM eligible WHERE phase IS NOT NULL
    ), head AS MATERIALIZED (SELECT * FROM ordered WHERE rank=1 LIMIT 1)
    SELECT o.native_id,o.priority,o.phase,o.source_run_id,o.dataset_id,
      CASE WHEN o.phase=1 THEN 'reprocess' WHEN o.phase=2 OR h.phase=3 AND h.lookup_mode='ad_id' AND h.outcome IN ('not_returned','no_media','expired','wrong_page') THEN 'ad_id' ELSE 'backfill' END AS mode
    FROM ordered o CROSS JOIN head h WHERE o.phase=h.phase AND (h.phase<>1 OR o.source_run_id=h.source_run_id)
      AND (h.phase<>2 AND NOT COALESCE(h.phase=3 AND h.lookup_mode='ad_id' AND h.outcome IN ('not_returned','no_media','expired','wrong_page'),false) OR o.rank=h.rank)
    ORDER BY o.rank LIMIT $5`,[w.workspace_id,w.id,now,Boolean(health&&videoFitsDisk(health)),AD_MEDIA_BATCH]);
    if(!selected.rows.length){await lock.query("ROLLBACK");return null;}
    const targets=selected.rows.map(row=>row.native_id),priority=selected.rows.filter(row=>row.priority).map(row=>row.native_id),mode=selected.rows[0].mode,
      source=mode==='reprocess'?selected.rows[0]:null,downloadVideos=selected.rows[0].phase===4,id=randomUUID();
    await lock.query(`INSERT INTO ad_media_runs(id,watchlist_id,workspace_id,brand_key,revision,page_id,window_from,window_to,phase,target_ids,priority_ids,cap,download_videos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,w.id,w.workspace_id,w.brand_key,w.revision,w.page_ids[0],yearStart(now),now.toISOString().slice(0,10),"missing",JSON.stringify(targets),JSON.stringify(priority),mode==='reprocess'?500:Math.min(AD_MEDIA_BATCH,Math.max(targets.length,1)),downloadVideos]);
    await lock.query("UPDATE ad_media_runs SET lookup_mode=$2,source_run_id=$3,dataset_id=$4,preview_policy='preview-v2' WHERE id=$1",[id,mode,source?.source_run_id||null,source?.dataset_id||null]);
    if(mode==='reprocess')await lock.query("INSERT INTO ad_media_requests(run_id,native_id,reprocess_version) SELECT $1,unnest($2::text[]),'preview-v2'",[id,targets]);
    await lock.query("COMMIT");return id;
  }catch(error){await lock.query("ROLLBACK");throw error;}finally{lock.release();}
}
export async function scheduleAdMedia(pool:pg.Pool,env:Record<string,string|undefined>=process.env,now=new Date()){
  if(!mediaEnabled(env))return;
  await pool.query("UPDATE ad_media_runs SET status=CASE WHEN actor_run_id IS NULL THEN 'queued' ELSE 'running' END,error_kind=NULL,available_at=now() WHERE status='paused' AND error_kind IN ('budget','configuration','provider','disk') AND (reservation_id IS NULL OR actor_run_id IS NOT NULL) AND (available_at AT TIME ZONE 'Europe/London')::date<($1::timestamptz AT TIME ZONE 'Europe/London')::date",[now]);
  const rows=await pool.query("SELECT id FROM watchlists WHERE enabled AND purpose='brand' AND brand_key IS NOT NULL ORDER BY id");
  for(const w of rows.rows)await enqueueAdMedia(pool,w.id,now);
}
export async function claimAdMedia(pool:pg.Pool,owner:string){return(await pool.query(`UPDATE ad_media_runs SET lease_owner=$1,lease_until=now()+interval '6 minutes' WHERE id=(SELECT id FROM ad_media_runs WHERE status IN ('queued','running','starting') AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[owner])).rows[0]||null;}

/** A single fenced step runs on the disk-owning web service, not the diskless worker. */
export async function stepAdMedia(pool:pg.Pool,id:string,owner:string,options:{now?:Date;env?:Record<string,string|undefined>;actor?:AdMediaActor;storage?:AdMediaStorage;existingIds?:Set<string>;existingVideoIds?:Set<string>;existingVideoCandidates?:Set<string>}={}){
  const env=options.env||process.env;if(!mediaEnabled(env))return false;
  const client=await pool.connect();let run:any;
  try{
    // One disk writer/transcode across service processes, with automatic release after a crash.
    if(!(await client.query("SELECT pg_try_advisory_lock(hashtext('ad-media-disk-step')) AS locked")).rows[0].locked)return false;
    run=(await client.query("SELECT r.*,w.enabled,w.revision AS current_revision,w.page_ids FROM ad_media_runs r JOIN watchlists w ON w.id=r.watchlist_id WHERE r.id=$1 AND r.lease_owner=$2 AND r.lease_until>now()",[id,owner])).rows[0];
    if(!run||!ACTIVE.includes(run.status)||["paused","uncertain"].includes(run.status))return false;
    const update=async(status:string,error:string|null=null)=>client.query("UPDATE ad_media_runs SET status=$3,error_kind=COALESCE($4,error_kind),available_at=now()+interval '5 seconds' WHERE id=$1 AND lease_owner=$2 AND lease_until>now()",[id,owner,status,error]);
    if(!run.enabled||run.current_revision!==run.revision||run.page_ids[0]!==run.page_id){await update("failed","changed");return true;}
    if(run.preview_policy==='legacy'&&run.status==='queued'&&!run.actor_run_id&&!run.reservation_id&&!run.requested_ids){
      await client.query("UPDATE ad_media_runs SET status='failed',error_kind='priority',finished_at=clock_timestamp() WHERE id=$1 AND lease_owner=$2",[id,owner]);
      await enqueueAdMedia(pool,run.watchlist_id,options.now||new Date());return true;
    }
    const actor=options.actor||new AdMediaActor({env});
    if(run.status==="starting"&&!run.actor_run_id){await update("uncertain","uncertain");return true;}
    if(!run.actor_run_id&&run.lookup_mode!=='reprocess'){
      const known=(ids?:Set<string>)=>JSON.stringify((run.target_ids as string[]).filter(nativeId=>ids?.has(nativeId)));
      await client.query("UPDATE ad_media_runs SET known_media_ids=$2,known_video_ids=$3,known_video_candidates=$4 WHERE id=$1",[id,known(options.existingIds),known(options.existingVideoIds),known(options.existingVideoCandidates)]);
      const requested=(run.target_ids as string[]).filter(nativeId=>!(run.download_videos?options.existingVideoIds:options.existingIds)?.has(nativeId)).slice(0,run.cap);
      if(!requested.length){await client.query("UPDATE ad_media_runs SET status='complete',finished_at=clock_timestamp() WHERE id=$1 AND lease_owner=$2",[id,owner]);await enqueueAdMedia(pool,run.watchlist_id,options.now||new Date());return true;}
      if(!env.APIFY_TOKEN?.trim()||/[\r\n]/.test(env.APIFY_TOKEN)||mediaGbpRate(env)===null){await update("paused","configuration");return true;}
      const disk=await (options.storage||new AdMediaStorage()).disk();
      await client.query("INSERT INTO ad_media_disk_health(id,data) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=excluded.data,measured_at=now()",[JSON.stringify(disk)]);
      if(disk.status!=='available'||disk.remainingBytes===null||disk.remainingBytes<16*1024*1024){await update('paused','disk');return true;}
      const rate=mediaGbpRate(env)!;
      let reservation:string;
      try{reservation=await reserveCost(pool,"data_providers","apify_ad_media",Math.ceil(mediaMaximumUsd(run.cap)*rate*1e6)/1e6);}catch{await update("paused","budget");return true;}
      const scope:ActorScope={pageId:run.page_id,from:isoDay(run.window_from),to:isoDay(run.window_to),ids:requested,cap:run.cap,lookupMode:run.lookup_mode};
      const input=mediaActorInput(scope);

      // Persist the hold BEFORE a chargeable request. A crash cannot cause an automatic second start.
      await client.query("BEGIN");
      await client.query("UPDATE ad_media_runs SET status='starting',phase='missing',reservation_id=$3,gbp_per_usd=$4,requested_ids=$5,dispatched_at=clock_timestamp(),input_details=$6 WHERE id=$1 AND lease_owner=$2",[id,owner,reservation,rate,JSON.stringify(requested),JSON.stringify({pageId:run.page_id,countries:input.countries,from:scope.from,to:scope.to,dateFiltered:false,activeStatus:input.activeStatus,adType:input.adType,maxAds:input.maxAds,maxAdsPerQuery:input.maxAdsPerQuery,mode:"adArchiveIds",lookupMode:run.lookup_mode,requested:requested.length})]);
      await client.query("INSERT INTO ad_media_requests(run_id,native_id,reprocess_version) SELECT $1,unnest($2::text[]),'preview-v2' ON CONFLICT DO NOTHING",[id,requested]);
      await client.query("COMMIT");
      try{
        const started=await actor.start(scope);
        if(!providerId(started.id)||!providerId(started.defaultDatasetId))throw new AdMediaError("output");
        await client.query("UPDATE ad_media_runs SET status='running',actor_run_id=$3,dataset_id=$4,available_at=now() WHERE id=$1 AND lease_owner=$2",[id,owner,started.id,started.defaultDatasetId]);
      }catch{await update("uncertain","uncertain");}
      return true;
    }
    // Read terminal state before the dataset tail, so a final append cannot be missed.
    const state=run.lookup_mode==='reprocess'?{id:null,status:"SUCCEEDED"}:await actor.run(run.actor_run_id);
    if(run.lookup_mode!=='reprocess'&&state.id!==run.actor_run_id)throw new AdMediaError("output");
    const storage=options.storage||new AdMediaStorage();
    await client.query("INSERT INTO ad_media_disk_health(id,data) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=excluded.data,measured_at=now()",[JSON.stringify(await storage.disk())]);
    const items=await actor.items(run.dataset_id,run.result_offset);
    if(items.length){
      if(run.result_offset>=run.cap*3+100)throw new AdMediaError("output");
      const summary=actorCounts(items[0]);
      if(summary)await client.query("UPDATE ad_media_runs SET actor_requested_count=$2,actor_returned_count=$3,actor_query_count=$4,actor_stop_reasons=$5 WHERE id=$1",[id,summary.requested,summary.returned,summary.queries,JSON.stringify(summary.stopReasons)]);
      const raw=record(items[0]),rawId=raw.adArchiveId||raw.ad_archive_id,returnedId=typeof rawId==="string"&&/^\d{1,40}$/.test(rawId)?rawId:null;
      if(returnedId&&run.returned_ads>=run.cap)throw new AdMediaError("output");
      const media=actorMedia(items[0]);
      if(returnedId)await client.query("UPDATE ad_media_requests SET returned_at=COALESCE(returned_at,clock_timestamp()),outcome=$3,dataset_offset=$4 WHERE run_id=$1 AND native_id=$2",[id,returnedId,media&&media.pageId!==run.page_id?"wrong_page":"no_media",run.result_offset]);
      if(media&&media.pageId===run.page_id&&(run.phase==="page"||(run.requested_ids||run.target_ids).includes(media.adId))){
        const official=await client.query(`SELECT 1 FROM ad_observations o JOIN public_ads a USING(platform,native_id) JOIN collection_runs r ON r.id=o.run_id WHERE o.workspace_id=$1 AND a.platform='Meta' AND a.native_id=$2 AND a.advertiser_id=$3 AND r.watchlist_id=$4 AND r.config->>'revision'=$5 LIMIT 1`,[run.workspace_id,media.adId,run.page_id,run.watchlist_id,String(run.revision)]);
        if(official.rowCount){
          const prior=(await client.query("SELECT assets,error_kind FROM ad_media_creatives WHERE run_id=$1 AND native_id=$2",[id,media.adId])).rows[0];
          const eligible=run.download_videos;
          const kept=prior?{assets:prior.assets,error:prior.error_kind,diagnostics:[]}:(run.download_videos?options.existingVideoIds:options.existingIds)?.has(media.adId)?{assets:[],error:null}:await storage.retain(run.workspace_id,media,eligible);
          if(kept.assets.length)await client.query(`INSERT INTO ad_media_file_checks(workspace_id,artifact_id,available) SELECT $1,unnest($2::text[]),true ON CONFLICT(workspace_id,artifact_id) DO UPDATE SET available=true,checked_at=now()`,[run.workspace_id,[...new Set(kept.assets.map((a:{ref:{artifactId:string}})=>a.ref.artifactId))]]);
          if(kept.error)await client.query("UPDATE ad_media_runs SET error_kind=COALESCE(error_kind,$2) WHERE id=$1",[id,kept.error]);
          await client.query(`INSERT INTO ad_media_creatives(id,run_id,workspace_id,brand_key,native_id,page_id,format,assets,video_eligible,error_kind,complete,expected_videos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(run_id,native_id) DO NOTHING`,[randomUUID(),id,run.workspace_id,run.brand_key,media.adId,run.page_id,media.format,JSON.stringify(kept.assets),eligible,kept.error,kept.assets.length>0&&!kept.error&&kept.assets.length>=media.images.length+media.posters.length+(eligible?media.videos.length:0),media.videos.length]);
          if(!prior)await client.query('UPDATE ad_media_creatives SET product=$3,diagnostics=$4 WHERE run_id=$1 AND native_id=$2',[id,media.adId,JSON.stringify(media.product||null),JSON.stringify(kept.diagnostics||[])]);
          const outcome=!media.images.length&&!media.posters.length&&!media.videos.length?"no_media":kept.assets.some((a:{role:string})=>a.role==="image"||a.role==="poster")?"stored":["expired","unsupported","disk","provider"].includes(kept.error||"")?kept.error:"no_media";
          await client.query("UPDATE ad_media_requests SET matched_at=COALESCE(matched_at,clock_timestamp()),outcome=$3 WHERE run_id=$1 AND native_id=$2",[id,media.adId,outcome]);
        }
      }
      // Every returned item counts, including unmatched, duplicate and discarded output.
      await client.query("UPDATE ad_media_runs SET result_offset=result_offset+1,results=results+1,returned_ads=returned_ads+$3,matched_ads=(SELECT count(*) FROM ad_media_requests q WHERE q.run_id=ad_media_runs.id AND q.matched_at IS NOT NULL),ads_with_media=(SELECT count(*) FROM ad_media_creatives c WHERE c.run_id=ad_media_runs.id AND jsonb_array_length(c.assets)>0),available_at=now() WHERE id=$1 AND lease_owner=$2",[id,owner,returnedId?1:0]);
      return true;
    }
    if(["RUNNING","READY","ABORTING","TIMING-OUT"].includes(state.status)){await update("running");return true;}
    if(!["SUCCEEDED","FAILED","ABORTED","TIMED-OUT"].includes(state.status))throw new AdMediaError("output");
    // Read optional INPUT counts on the terminal turn, outside the download deadline.
    if(!run.actor_input_checked&&providerId(state.defaultKeyValueStoreId)){
      let actorInput:number|null=null;try{actorInput=await actor.requestedCount(state.defaultKeyValueStoreId);}catch{/* Optional count failures cannot erase saved files or restart a paid run. */}
      await client.query("UPDATE ad_media_runs SET actor_input_count=$2,actor_input_checked=true WHERE id=$1",[id,actorInput]);
    }
    // Only final, bounded costs release a portion of the conservative maximum hold.
    const charged=run.lookup_mode==='reprocess'?0:finalMediaCostUsd(state,run.returned_ads,run.cap);
    if(charged!==null){
      await client.query("BEGIN");await client.query("SELECT monthly_budget_gbp FROM budget_settings WHERE cost_type='data_providers' FOR UPDATE");
      await client.query("UPDATE cost_ledger SET cost_gbp=$2,status='settled',cost_basis='estimated' WHERE id=$1 AND provider='apify_ad_media' AND status='reserved'",[run.reservation_id,Math.ceil(charged*Number(run.gbp_per_usd)*1e6)/1e6]);await client.query("COMMIT");
    }
    await client.query("UPDATE ad_media_requests SET outcome='not_returned' WHERE run_id=$1 AND returned_at IS NULL",[id]);
    // One controlled failure per ad per UK day; queued/budget-only days never count.
    await client.query(`INSERT INTO ad_media_preview_days(workspace_id,brand_key,page_id,native_id,day,run_id,reason)
      SELECT r.workspace_id,r.brand_key,r.page_id,q.native_id,(q.requested_at AT TIME ZONE 'Europe/London')::date,r.id,
       CASE WHEN $2::boolean THEN CASE WHEN q.outcome IN ('expired','unsupported','wrong_page','disk','provider') THEN q.outcome ELSE 'not_returned' END ELSE 'provider' END
      FROM ad_media_requests q JOIN ad_media_runs r ON r.id=q.run_id
      WHERE q.run_id=$1 AND NOT EXISTS(SELECT 1 FROM ad_media_creatives c WHERE c.workspace_id=r.workspace_id AND c.brand_key=r.brand_key AND c.page_id=r.page_id AND c.native_id=q.native_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets)a WHERE a->>'role' IN ('image','poster')))
      ON CONFLICT(workspace_id,brand_key,page_id,native_id,day) DO UPDATE SET reason=excluded.reason,run_id=excluded.run_id,attempted_at=clock_timestamp()`,[id,state.status==='SUCCEEDED']);
    await client.query("UPDATE ad_media_runs SET status=$3,error_kind=COALESCE($4,error_kind),finished_at=clock_timestamp() WHERE id=$1 AND lease_owner=$2",[id,owner,state.status==="SUCCEEDED"?"complete":"failed",state.status==="SUCCEEDED"?null:"provider"]);
    if(charged!==null)await enqueueAdMedia(pool,run.watchlist_id,options.now||new Date());
    return true;
  }catch(error){
    await client.query("ROLLBACK").catch(()=>{});
    if(run?.lookup_mode==='reprocess'&&error instanceof AdMediaError&&[404,410].includes(error.httpStatus||0)){
      await client.query("UPDATE ad_media_requests SET outcome='expired',returned_at=COALESCE(returned_at,clock_timestamp()) WHERE run_id=$1",[id]);
      await client.query("UPDATE ad_media_runs SET status='complete',error_kind='expired',finished_at=clock_timestamp() WHERE id=$1 AND lease_owner=$2",[id,owner]);
      await enqueueAdMedia(pool,run.watchlist_id,options.now||new Date());return true;
    }
    if(run?.actor_run_id&&error instanceof AdMediaError&&error.kind==='provider'&&(!error.httpStatus||error.httpStatus===429||error.httpStatus>=500)){
      await client.query("UPDATE ad_media_runs SET status='running',error_kind='provider',available_at=now()+interval '30 seconds' WHERE id=$1 AND lease_owner=$2",[id,owner]);return true;
    }

    if(run?.actor_run_id)await client.query(`INSERT INTO ad_media_preview_days(workspace_id,brand_key,page_id,native_id,day,run_id,reason)
      SELECT r.workspace_id,r.brand_key,r.page_id,q.native_id,(clock_timestamp() AT TIME ZONE 'Europe/London')::date,r.id,'provider'
      FROM ad_media_requests q JOIN ad_media_runs r ON r.id=q.run_id WHERE r.id=$1
       AND NOT EXISTS(SELECT 1 FROM ad_media_creatives c WHERE c.workspace_id=r.workspace_id AND c.brand_key=r.brand_key AND c.page_id=r.page_id AND c.native_id=q.native_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets)a WHERE a->>'role' IN ('image','poster')))
      ON CONFLICT(workspace_id,brand_key,page_id,native_id,day) DO UPDATE SET reason=excluded.reason,run_id=excluded.run_id,attempted_at=clock_timestamp()`,[id]).catch(()=>{});
    if(run)await client.query("UPDATE ad_media_runs SET status='paused',error_kind=$3 WHERE id=$1 AND lease_owner=$2",[id,owner,error instanceof AdMediaError?error.kind:"provider"]);
    return true;
  }finally{await client.query("SELECT pg_advisory_unlock(hashtext('ad-media-disk-step'))").catch(()=>{});client.release();}
}
