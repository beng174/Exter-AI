import {tikTokPublishedWindow,isTikTokMaxDateError,tikTokDateRecovery} from '../connectors/tiktok-dates.js';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {TikTokCommercialConnector,TikTokCommercialError} from '../connectors/tiktok-commercial.js';
import {tiktokPayload,rankTikTokCandidates,TIKTOK_DEFAULT_COUNTRIES,type TikTokCandidate} from '../../shared/tiktok-public.js';
import {reserveCost} from '../infrastructure/budget.js';
import {workerClaimGate,clearWorkerFailures} from '../infrastructure/worker-recovery.js';
import {metaScheduleDay} from '../infrastructure/jobs.js';
import {jsonFingerprint,observationFingerprint} from '../infrastructure/meta-observations.js';
import {enqueueCreativeIndex} from '../infrastructure/creative-index-jobs.js';
import {mediaBrokerConfig} from '../ad-media/api.js';
import {brokerAcknowledgement,type WorkerObserver} from '../infrastructure/worker-diagnostics.js';
import type {AdMediaStorage,RetainedMedia} from '../ad-media/storage.js';
export class TikTokWait extends Error{constructor(public ms:number){super('Waiting for the TikTok request slot.');}}
export async function tikTokSlot(pool:pg.Pool,paceMs=20000){const r=await pool.query("UPDATE tiktok_request_gate SET next_request_at=now()+($1*interval '1 millisecond') WHERE id=1 AND next_request_at<=now() RETURNING id",[paceMs]);if(!r.rowCount)throw new TikTokWait(20000);const id=await reserveCost(pool,'data_providers','tiktok',0);await pool.query("UPDATE cost_ledger SET status='settled',cost_basis='observed' WHERE id=$1",[id]);}
export async function enqueueTikTok(pool:pg.Pool,watchId:string,options:{day?:string;discover?:boolean;limit?:number;analyse?:boolean;now?:Date}={}){
 const c=await pool.connect();try{await c.query('BEGIN');const w=(await c.query("SELECT * FROM watchlists WHERE id=$1 AND platform='TikTok' FOR UPDATE",[watchId])).rows[0];if(!w||!w.enabled&&!options.discover)throw new Error('TikTok advertiser is not configured.');
 if(options.day){const prior=(await c.query('SELECT run_id FROM schedule_slots WHERE watchlist_id=$1 AND day=$2',[watchId,options.day])).rows[0];if(prior){await c.query('COMMIT');return prior.run_id;}}
 const source=options.analyse?'tiktok_analysis':options.discover?'tiktok_discovery':options.limit?'tiktok_smoke':'tiktok',active=(await c.query("SELECT r.id,r.status,r.errors FROM collection_runs r WHERE watchlist_id=$1 AND source=$2 AND r.config->>'revision'=$3 AND status IN ('queued','running','paused','failed','not_connected') ORDER BY started_at LIMIT 1 FOR UPDATE",[watchId,source,String(w.revision)])).rows[0];
 let id=active?.id;if(active&&!options.day&&/search(?:_| )id.{0,35}(?:expired|invalid)|(?:expired|invalid).{0,35}search(?:_| )id/i.test(active.errors?.[0]?.message||'')){const stopped=await c.query("UPDATE collection_jobs SET status='superseded',lease_owner=NULL,lease_until=NULL WHERE id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING id",[id]);if(!stopped.rowCount)throw new Error('The TikTok request is still running.');await clearWorkerFailures(c,'collection',[id]);await c.query("UPDATE collection_runs SET status='superseded',finished_at=now() WHERE id=$1",[id]);id=undefined;}if(id&&active&&!options.day&&['paused','failed','not_connected'].includes(active.status)){const busy=await c.query("UPDATE collection_jobs SET status='queued',attempts=0,available_at=now(),lease_owner=NULL,lease_until=NULL WHERE id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING id",[id]);if(!busy.rowCount)throw new Error('The TikTok request is still running.');await c.query("UPDATE collection_runs SET status='queued',errors='[]',stopped_at=NULL,finished_at=NULL WHERE id=$1",[id]);await clearWorkerFailures(c,'collection',[id]);}
 if(!id){id=randomUUID();const day=options.day||(options.now||new Date()).toISOString().slice(0,10),config={revision:w.revision,brandKey:w.brand_key,name:w.business_name||w.search_terms[0],countries:options.limit?['GB']:w.countries,ids:w.page_ids,...tikTokPublishedWindow(new Date(day+'T00:00:00Z')),limit:options.limit??null};await c.query('INSERT INTO collection_runs(id,watchlist_id,source,config,pages_fetched) VALUES($1,$2,$3,$4,0)',[id,w.id,source,JSON.stringify(config)]);await c.query('INSERT INTO collection_jobs(id) VALUES($1)',[id]);}
 if(options.day)await c.query('INSERT INTO schedule_slots VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[watchId,options.day,id]);await c.query('COMMIT');return id;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function ensureTikTokTargets(pool:pg.Pool,workspace:string,targets:{key:string;name:string;domain:string}[]){
 for(const target of targets){const found=(await pool.query("SELECT id FROM watchlists WHERE workspace_id=$1 AND brand_key=$2 AND platform='TikTok' LIMIT 1",[workspace,target.key])).rows[0];if(found)continue;
 const id=randomUUID();const created=await pool.query("INSERT INTO watchlists(id,workspace_id,brand_key,platform,business_name,search_terms,countries,enabled,managed_by,discovery) VALUES($1,$2,$3,'TikTok',$4,$5,$6,false,'onboarding',$7) ON CONFLICT DO NOTHING RETURNING id",[id,workspace,target.key,target.name.slice(0,50),JSON.stringify([target.name.slice(0,50)]),JSON.stringify(TIKTOK_DEFAULT_COUNTRIES),JSON.stringify({domain:target.domain,name:target.name,candidates:[]})]);if(created.rowCount)await enqueueTikTok(pool,id,{discover:true});
 }}
/** Requeue only the known date rejection. No source dispatch or paid state changes. */
export async function recoverTikTokDateRuns(pool:pg.Pool,now=new Date()){
 const candidates=(await pool.query(`SELECT r.id,r.watchlist_id FROM collection_runs r JOIN watchlists w ON w.id=r.watchlist_id JOIN collection_jobs j ON j.id=r.id
 WHERE w.platform='TikTok' AND r.config->>'revision'=w.revision::text AND (w.enabled OR r.source='tiktok_discovery') AND r.source IN ('tiktok','tiktok_discovery','tiktok_smoke') AND r.status IN ('paused','failed')
 AND j.status IN ('paused','failed') AND (j.lease_until IS NULL OR j.lease_until<=$1::timestamptz)
 AND lower(r.errors->0->>'message') LIKE '%ad_published_date_range.max%' AND lower(r.errors->0->>'message') LIKE '%before today%'
 AND (COALESCE(r.config->>'dateRecoveryDay','')<>$2 OR r.config->>'to'>$3) ORDER BY r.started_at,r.id LIMIT 50`,[now,now.toISOString().slice(0,10),tikTokPublishedWindow(now,2).to])).rows;
 let recovered=0;
 for(const candidate of candidates){const c=await pool.connect();try{
  await c.query('BEGIN');const w=(await c.query("SELECT * FROM watchlists WHERE id=$1 AND platform='TikTok' FOR UPDATE",[candidate.watchlist_id])).rows[0];
  const r=(await c.query('SELECT * FROM collection_runs WHERE id=$1 FOR UPDATE',[candidate.id])).rows[0],j=(await c.query('SELECT * FROM collection_jobs WHERE id=$1 FOR UPDATE',[candidate.id])).rows[0];
  if(!w||!r||!j||!['paused','failed'].includes(r.status)||!['paused','failed'].includes(j.status)||j.lease_until&&new Date(j.lease_until)>now||r.config?.revision!==w.revision||!w.enabled&&r.source!=='tiktok_discovery'||!isTikTokMaxDateError(r.errors?.[0]?.message)){await c.query('COMMIT');continue;}
  const dates=tikTokDateRecovery(r.config,now);if(!dates){await c.query('COMMIT');continue;}
  const other=(await c.query("SELECT id FROM collection_runs WHERE watchlist_id=$1 AND source=$2 AND id<>$3 AND config->>'revision'=$4 AND status IN ('queued','running','paused','failed','not_connected') LIMIT 1",[w.id,r.source,r.id,String(w.revision)])).rows[0];
  await c.query("UPDATE collection_jobs SET status='superseded',lease_owner=NULL,lease_until=NULL WHERE id=$1",[r.id]);await c.query("UPDATE collection_runs SET status='superseded',finished_at=clock_timestamp() WHERE id=$1",[r.id]);
  await c.query("UPDATE worker_job_failures SET status='resolved',failures=0,next_attempt_at=NULL,resume_status=NULL WHERE job_type='collection' AND job_id=$1",[r.id]);
  if(!other){const id=randomUUID();await c.query("INSERT INTO collection_runs(id,watchlist_id,source,config,pages_fetched) VALUES($1,$2,$3,$4,0)",[id,w.id,r.source,JSON.stringify({...r.config,...dates,dateRecoveryOf:r.id})]);await c.query('INSERT INTO collection_jobs(id) VALUES($1)',[id]);}
  await c.query('COMMIT');recovered++;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 return recovered;
}
export async function scheduleTikTok(pool:pg.Pool,now=new Date()){
 await recoverTikTokDateRuns(pool,now);const day=metaScheduleDay(now);if(!day)return;const watches=(await pool.query("SELECT id FROM watchlists WHERE platform='TikTok' AND enabled AND jsonb_array_length(page_ids)>0 ORDER BY id")).rows;
 for(const w of watches)await enqueueTikTok(pool,w.id,{day,now});
}
export async function workTikTokOnce(pool:pg.Pool,options:WorkerObserver&{env?:Record<string,string|undefined>;fetch?:typeof fetch}={}){
 const env=options.env||process.env,broker=mediaBrokerConfig(env);if(!broker)return false;
 await recoverTikTokDateRuns(pool);
 const owner=randomUUID(),job=(await pool.query(`UPDATE collection_jobs SET status='running',attempts=attempts+1,lease_owner=$1,lease_until=now()+interval '6 minutes' WHERE id=(SELECT j.id FROM collection_jobs j JOIN collection_runs r ON r.id=j.id WHERE r.source IN ('tiktok','tiktok_discovery','tiktok_analysis','tiktok_smoke') AND j.status IN ('queued','running') AND j.available_at<=now() AND (j.lease_until IS NULL OR j.lease_until<now()) AND ${workerClaimGate('collection','j.id')} ORDER BY j.available_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1) RETURNING *`,[owner])).rows[0];if(!job)return false;
 options.onClaim?.({id:job.id,owner});try{const response=await(options.fetch||fetch)(`${broker.origin}/api/tiktok/step/${job.id}/${owner}`,{method:'POST',headers:{'X-Exter-Ad-Media-Token':broker.token},redirect:'error',signal:AbortSignal.timeout(300000)});await brokerAcknowledgement(response);}
 finally{await pool.query('UPDATE collection_jobs SET lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2',[job.id,owner]);}return true;
}
export interface TikTokStepOptions{now?:()=>Date;connector?:TikTokCommercialConnector;env?:Record<string,string|undefined>;storage:Pick<AdMediaStorage,'retain'>&Partial<Pick<AdMediaStorage,'exists'>>;onAd?:(watch:any,ad:any,retained:RetainedMedia)=>Promise<void>;paceMs?:number;analyse?:(watchId:string)=>Promise<boolean>}
/** Exactly one provider operation (and its immediate media download) per durable claim. */
export async function stepTikTok(pool:pg.Pool,id:string,owner:string,options:TikTokStepOptions){
 const c=await pool.connect();let lock=false;try{lock=(await c.query('SELECT pg_try_advisory_lock(hashtext($1)) locked',['tiktok:'+id])).rows[0].locked;if(!lock)return false;
 const run=(await c.query("SELECT r.*,w.workspace_id,w.brand_key,w.platform,w.enabled,w.page_ids,w.revision,w.discovery,w.managed_by FROM collection_runs r JOIN watchlists w ON w.id=r.watchlist_id JOIN collection_jobs j ON j.id=r.id WHERE r.id=$1 AND j.lease_owner=$2 AND j.lease_until>now() AND j.status='running'",[id,owner])).rows[0];if(!run||run.platform!=='TikTok')return false;
 const cfg=run.config,state=run.detail_state||{},discovery=run.source==='tiktok_discovery';if(cfg.revision!==run.revision||!discovery&&!run.enabled){await c.query("UPDATE collection_jobs SET status='superseded' WHERE id=$1 AND lease_owner=$2",[id,owner]);return true;}
 const save=async(status='queued',delay=0,error:string|null=null,page?:Awaited<ReturnType<TikTokCommercialConnector['page']>>)=>{await c.query('BEGIN');await c.query('SELECT id FROM watchlists WHERE id=$1 FOR UPDATE',[run.watchlist_id]);await c.query('SELECT id FROM collection_runs WHERE id=$1 FOR UPDATE',[id]);const live=(await c.query("SELECT id FROM collection_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now() FOR UPDATE",[id,owner])).rowCount;if(!live)throw new Error('The TikTok collection lease expired.');if(page){const seen=await c.query("INSERT INTO collection_cursors(run_id,query_index,cursor) VALUES($1,0,$2) ON CONFLICT DO NOTHING RETURNING run_id",[id,page.pageFingerprint]);if(!seen.rowCount)throw new TikTokCommercialError('schema','TikTok repeated an earlier result page.');await c.query('UPDATE collection_runs SET cursor=$2,pages_fetched=COALESCE(pages_fetched,0)+1,last_successful_check=clock_timestamp() WHERE id=$1',[id,page.cursor?JSON.stringify(page.cursor):null]);}await c.query("UPDATE collection_runs SET detail_state=$2,status=$3,errors=$4,stopped_at=CASE WHEN $3 IN ('failed','paused','not_connected') THEN clock_timestamp() END,finished_at=CASE WHEN $3='complete' THEN clock_timestamp() END WHERE id=$1",[id,JSON.stringify(state),status,JSON.stringify(error?[{message:error}]:[])]);await c.query("UPDATE collection_jobs SET status=$3,attempts=CASE WHEN $4::boolean THEN attempts ELSE 0 END,available_at=now()+($5*interval '1 millisecond') WHERE id=$1 AND lease_owner=$2",[id,owner, status,error!==null,delay]);await c.query('COMMIT');};
 try{
  const connector=options.connector||new TikTokCommercialConnector({env:options.env,beforeRequest:()=>tikTokSlot(pool,options.paceMs)});
  await c.query("UPDATE collection_runs SET status='running' WHERE id=$1",[id]);
  if(run.source==='tiktok_analysis'){const worked=await options.analyse?.(run.watchlist_id);await save(worked?'queued':'complete',5000);return true;}
  if(cfg.to>tikTokPublishedWindow(options.now?.()||new Date()).to)throw new TikTokCommercialError('configuration',"ad_published_date_range.max must be before today's date. The saved query needs a completed UTC date.");
  if(discovery&&!state.advertisers){state.advertisers=await connector.advertisers(cfg.name);await save('queued',5000);return true;}
  if(state.pending?.length){
   const next=state.pending[0],ad=await connector.detail(next);if(!ad.advertiserId)throw new TikTokCommercialError('schema','TikTok did not return an advertiser identity.');
   if(discovery){if(!state.advertisers.some((a:any)=>a.id===ad.advertiserId)&&ad.advertiserName)state.advertisers.push({id:ad.advertiserId,name:ad.advertiserName,country:null});state.examples=[...(state.examples||[]),{id:ad.id,advertiserId:ad.advertiserId,landingUrl:ad.landingUrl}].slice(0,30);state.pending.shift();}
   else if(cfg.ids.includes(ad.advertiserId)){
    const mediaKey=(url:string)=>{const u=new URL(url);return u.origin+u.pathname;},raw={...tiktokPayload(ad),tiktok_media_identity:jsonFingerprint({images:ad.media.images.map(mediaKey),videos:ad.media.videos.map(mediaKey)})},snapshot={activeStatus:raw.tiktok_status,reach:raw.tiktok_reach,payloadHash:jsonFingerprint(raw)};
    const cached=(await c.query("SELECT m.assets,m.complete,o.payload_hash FROM ad_media_creatives m JOIN collection_runs mr ON mr.id=$1 LEFT JOIN LATERAL(SELECT payload_hash FROM ad_observations WHERE workspace_id=$2 AND platform='TikTok' AND native_id=$3 ORDER BY observed_at DESC LIMIT 1)o ON true WHERE m.workspace_id=$2 AND m.native_id=$3 AND m.brand_key=$4 AND m.page_id=$5 AND m.platform='TikTok' ORDER BY m.created_at DESC LIMIT 1",[id,run.workspace_id,ad.id,run.brand_key,ad.advertiserId])).rows[0];
    const reusable=cached?.complete&&cached.payload_hash===snapshot.payloadHash&&options.storage.exists&&(await Promise.all(cached.assets.map((a:any)=>options.storage.exists!(a.ref)))).every(Boolean);
    const retained:RetainedMedia=reusable?{assets:cached.assets,error:null}:await options.storage.retain(run.workspace_id,{adId:ad.id,pageId:ad.advertiserId,format:ad.media.videos.length?'video':ad.media.images.length>1?'carousel':'image',images:ad.media.images,posters:[],videos:ad.media.videos},true);
    const analysable=ad.media.videos.length?retained.assets.some(a=>a.role==='video'):ad.media.images.length>0&&retained.assets.filter(a=>a.role==='image').length===ad.media.images.length;
    await c.query('BEGIN');const lease=(await c.query('SELECT id FROM collection_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now() FOR UPDATE',[id,owner])).rowCount;if(!lease)throw new Error('The TikTok collection lease expired.');
    const current=(await c.query("SELECT revision,enabled FROM watchlists WHERE id=$1 FOR UPDATE",[run.watchlist_id])).rows[0];if(current.revision!==cfg.revision||!current.enabled)throw new Error('The saved TikTok advertiser changed.');
    await c.query("INSERT INTO public_ads(platform,native_id,advertiser_id,start_time,stop_time,last_seen_active_at) VALUES('TikTok',$1,$2,$3,$4,CASE WHEN $5 THEN clock_timestamp() END) ON CONFLICT(platform,native_id) DO UPDATE SET start_time=excluded.start_time,stop_time=excluded.stop_time,last_seen_active_at=COALESCE(excluded.last_seen_active_at,public_ads.last_seen_active_at)",[ad.id,ad.advertiserId,ad.firstShownDate,ad.active===false?ad.lastShownDate:null,ad.active===true]);
    const previous=(await c.query("SELECT o.* FROM ad_observations o JOIN collection_runs r ON r.id=o.run_id WHERE o.platform='TikTok' AND o.native_id=$1 AND o.workspace_id=$2 AND r.watchlist_id=$3 AND r.config->>'revision'=$4 ORDER BY o.observed_at DESC LIMIT 1 FOR UPDATE OF o",[ad.id,run.workspace_id,run.watchlist_id,String(cfg.revision)])).rows[0],hash=observationFingerprint(snapshot.payloadHash,snapshot.activeStatus,snapshot.reach);
    if(previous?.observation_hash===hash)await c.query("UPDATE ad_observations SET last_confirmed_at=clock_timestamp() WHERE platform='TikTok' AND native_id=$1 AND run_id=$2",[ad.id,previous.run_id]);
    else await c.query("INSERT INTO ad_observations(platform,native_id,run_id,workspace_id,active_status,reach,raw_payload,payload_hash,observation_hash,last_confirmed_at) VALUES('TikTok',$1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()) ON CONFLICT DO NOTHING",[ad.id,id,run.workspace_id,snapshot.activeStatus,snapshot.reach,raw,snapshot.payloadHash,hash]);
    let mediaRun=state.mediaRun;if(!mediaRun){mediaRun=randomUUID();state.mediaRun=mediaRun;await c.query("INSERT INTO ad_media_runs(id,watchlist_id,workspace_id,brand_key,revision,page_id,window_from,window_to,phase,cap,status,platform) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'missing',10,'complete','TikTok')",[mediaRun,run.watchlist_id,run.workspace_id,run.brand_key,run.revision,ad.advertiserId,cfg.from,cfg.to]);}
    await c.query("INSERT INTO ad_media_creatives(id,run_id,workspace_id,brand_key,native_id,page_id,format,assets,complete,error_kind,platform) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'TikTok') ON CONFLICT(run_id,native_id) DO NOTHING",[randomUUID(),mediaRun,run.workspace_id,run.brand_key,ad.id,ad.advertiserId,raw.source_format==='VIDEO'?'video':raw.source_format==='CAROUSEL'?'carousel':'image',JSON.stringify(retained.assets),retained.error===null,retained.error]);
    if(analysable)await c.query("INSERT INTO tiktok_analysis_jobs(id,workspace_id,brand_key,native_id,watchlist_id,revision,assets,format,input_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(workspace_id,brand_key,native_id,revision) DO UPDATE SET assets=excluded.assets,input_hash=excluded.input_hash,format=excluded.format,attempt_id=CASE WHEN tiktok_analysis_jobs.status='complete' AND tiktok_analysis_jobs.input_hash<>excluded.input_hash THEN NULL ELSE tiktok_analysis_jobs.attempt_id END,status=CASE WHEN tiktok_analysis_jobs.status='complete' AND tiktok_analysis_jobs.input_hash<>excluded.input_hash THEN 'queued' ELSE tiktok_analysis_jobs.status END",[randomUUID(),run.workspace_id,run.brand_key,ad.id,run.watchlist_id,run.revision,JSON.stringify(retained.assets),raw.source_format||'UNKNOWN',jsonFingerprint({copy:ad.title||'',format:raw.source_format,assets:retained.assets.filter(a=>a.role!=='poster').map(a=>a.ref.sha256)})]);
    state.pending.shift();state.saved=(state.saved||0)+1;
    await c.query("UPDATE collection_runs SET records_new=records_new+$2,records_updated=records_updated+$4,last_successful_check=clock_timestamp(),detail_state=$3 WHERE id=$1",[id,previous?0:1,JSON.stringify(state),previous?1:0]);await c.query('COMMIT');
    await options.onAd?.(run,ad,retained);if(analysable)await enqueueTikTok(pool,run.watchlist_id,{analyse:true});await enqueueCreativeIndex(pool,run.workspace_id);
   }else state.pending.shift();
   await save('queued',5000);return true;
  }
  if(state.lastPage){
   if(discovery){const candidates=rankTikTokCandidates(state.advertisers,state.examples||[],run.discovery.name||cfg.name,run.discovery.domain||''),automatic=candidates.find(row=>row.highConfidence),canAuto=run.managed_by!=='manual';await c.query("UPDATE watchlists SET discovery=discovery||$2::jsonb WHERE id=$1",[run.watchlist_id,JSON.stringify({candidates,status:automatic?'confirmed':candidates.length?'needs_review':'not_found'})]);
    if(automatic&&canAuto){await c.query("UPDATE watchlists SET page_ids=$2,business_name=$3,enabled=true WHERE id=$1 AND managed_by<>'manual'",[run.watchlist_id,JSON.stringify([automatic.id]),automatic.name]);await enqueueTikTok(pool,run.watchlist_id);}}
   await save('complete');return true;
  }
  const page=await connector.page({searchTerm:cfg.name,countries:cfg.countries,publishedFrom:cfg.from,publishedTo:cfg.to,...(run.cursor?{cursor:JSON.parse(run.cursor)}:{})});
  state.pending=page.ads.filter(ad=>discovery||ad.advertiserId&&cfg.ids.includes(ad.advertiserId)).map(ad=>ad.id);if(cfg.limit)state.pending=state.pending.slice(0,Math.max(0,cfg.limit-(state.saved||0)));
  state.lastPage=!page.cursor||discovery&&(run.pages_fetched||0)>=2||Boolean(cfg.limit&&(state.saved||0)+state.pending.length>=cfg.limit);
  // A cached search may keep its search_id; page fingerprints establish progress.
  await save('queued',5000,null,page);return true;
 }catch(error){await c.query('ROLLBACK').catch(()=>{});if(error instanceof TikTokWait){await save('queued',error.ms);return true;}
  if(!(error instanceof TikTokCommercialError)&&!(error instanceof Error&&error.message.startsWith('Jobs paused:')))throw error;
  const attempt=(await c.query('SELECT attempts FROM collection_jobs WHERE id=$1',[id])).rows[0]?.attempts||1,status=error instanceof TikTokCommercialError&&error.code==='not_connected'?'not_connected':error instanceof TikTokCommercialError&&['unavailable','rate_limited'].includes(error.code)&&attempt<3?'queued':'paused',message=error instanceof TikTokCommercialError?error.message:'TikTok collection is waiting for the data provider budget.';
  if(error instanceof TikTokCommercialError&&error.code==='rate_limited')await pool.query("UPDATE tiktok_request_gate SET next_request_at=GREATEST(next_request_at,now()+interval '1 minute') WHERE id=1");
  await save(status,Math.min(3600000,60000*2**Math.min(attempt,5)),message);return true;
 }
 }finally{if(lock)await c.query('SELECT pg_advisory_unlock(hashtext($1))',['tiktok:'+id]).catch(()=>{});c.release();}}
