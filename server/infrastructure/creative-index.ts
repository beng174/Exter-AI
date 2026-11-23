import {recordCreatorAdEvidence,refreshCreatorSales} from "../creators/performance-store.js";
import {creatorCredits,type CreatorCredit} from "../../shared/creator-performance.js";
import {randomUUID} from "node:crypto";
import type pg from "pg";
import type {DatabaseSync} from "node:sqlite";
import type {BrowserCreative,CreativeBrowserResponse} from "../../shared/creative-browser.js";
import {mergePublicEvidence,type PublicObservation} from "./meta-evidence.js";
import {sourceFormatSql} from "./public-rows-sql.js";
import {workspaceBrandIds,workspaceAd} from "../demo/reconcile.js";
import {analysedCreatives} from "../demo/service.js";
import {scoreCreative} from "../demo/scores.js";
import type {CreativeGalleryService} from "../demo/gallery.js";
import {mergeProductCategories,categoryVocabulary} from "../public-categories/jobs.js";
import {mergeRetainedMedia,readRetainedMedia} from "../ad-media/read.js";
import {enrichLikelihood} from "../accuracy/predictions.js";
import {creativeTitle} from "../../shared/creative-presentation.js";
import {fullCopy,sha} from "../../shared/public-signals.js";

const fields=["tiktok_reach","tiktok_status","tiktok_last_shown","ad_creative_bodies","ad_creative_link_titles","ad_creative_link_captions","ad_creative_link_urls","total_reach_by_location","eu_total_reach","age_country_gender_reach_breakdown","publisher_platforms","target_ages","target_gender","target_locations","languages","branded_content_partner","brandedContentPartner","partnership_ad","whitelisted_creator","coauthors","coauthor_producers"];
export const compactPayloadSql=(p:string)=>`jsonb_build_object(${fields.map(key=>`'${key}',${p}->'${key}'`).join(",")})`;
const json=(value:unknown)=>JSON.stringify(value);
async function put(pool:pg.Pool,db:DatabaseSync,client:pg.PoolClient,workspace:string,rows:{row:BrowserCreative;source:string;version:string;credits?:CreatorCredit[];watch?:string;revision?:number;page?:string}[]){
 if(!rows.length)return;
 const withMedia=mergeRetainedMedia(rows.map(r=>r.row),await readRetainedMedia(pool,workspace,rows.map(r=>r.row.nativeId),client),workspace);
 const enriched=enrichLikelihood(db,workspace,await mergeProductCategories(client,workspace,withMedia),new Date().toISOString());
 const values=rows.map(({source,version,watch,revision,page},index)=>{
  const row=enriched[index];
  const a=row.analysis,claims=a?.fields.keyClaims.flatMap(c=>c.claim_type||[])||[],talking=a?.mediaKind==="video"?a.fields.personTalkingToCamera.value:null;
  return {workspace_id:workspace,brand_key:row.brandId,platform:row.platform,native_id:row.nativeId,source_type:source,source_version:version,watchlist_id:watch||null,revision:revision??null,page_id:page||row.advertiserPageId||null,
   data:{...row,versionsCopyKey:fullCopy(row),versionsHashKey:sha(row),cardTitle:creativeTitle(row),voiceClaims:a?.fields.keyClaims.map(c=>c.value).filter(v=>v&&v!=="unknown")||[],...(source==="official"?{thumbnailUrl:null,videoUrl:null,imageUrls:[],imageCount:0,mediaAvailable:false,mediaStatus:"not-stored"}:{}),analysis:null,creatorEvidence:[],scenes:[],performance:[]},category_hash:row.categorySourceHash||null,has_analysis:Boolean(a),claims,cta:a?.fields.cta.value||null,talking:typeof talking==="boolean"?talking:null};
 });
 await recordCreatorAdEvidence(client,workspace,rows.map((input,index)=>({...input,row:enriched[index]})));
 await client.query(`INSERT INTO web_creative_index(workspace_id,brand_key,platform,native_id,source_type,source_version,watchlist_id,revision,page_id,data,category_hash,has_analysis,claims,cta,talking)
 SELECT workspace_id,brand_key,platform,native_id,source_type,source_version,watchlist_id,revision,page_id,data,category_hash,has_analysis,claims,cta,talking FROM jsonb_to_recordset($1) AS x(workspace_id text,brand_key text,platform text,native_id text,source_type text,source_version text,watchlist_id text,revision integer,page_id text,data jsonb,category_hash text,has_analysis boolean,claims jsonb,cta text,talking boolean)
 ON CONFLICT(workspace_id,brand_key,platform,native_id,source_type) DO UPDATE SET source_version=excluded.source_version,watchlist_id=excluded.watchlist_id,revision=excluded.revision,page_id=excluded.page_id,data=excluded.data,category_hash=excluded.category_hash,has_analysis=excluded.has_analysis,claims=excluded.claims,cta=excluded.cta,talking=excluded.talking,updated_at=now()
 WHERE ROW(web_creative_index.source_version,web_creative_index.data,web_creative_index.has_analysis,web_creative_index.claims,web_creative_index.cta,web_creative_index.talking,web_creative_index.category_hash,web_creative_index.revision,web_creative_index.page_id)
 IS DISTINCT FROM ROW(excluded.source_version,excluded.data,excluded.has_analysis,excluded.claims,excluded.cta,excluded.talking,excluded.category_hash,excluded.revision,excluded.page_id)`,[json(values)]);
}
export interface IndexCheckpoint {phase:"legacy"|"official"|"creators";target:number;after:string;key:string[];generation:string}
export const firstIndexCheckpoint=():IndexCheckpoint=>({phase:"legacy",target:0,after:"",key:["","",""],generation:randomUUID()});
export interface IndexChunkOptions {
 checkpoint?:IndexCheckpoint;
 /** Same transaction as index rows, so retries never skip rolled-back rows. */
 commit?:(client:pg.PoolClient,result:IndexChunkResult)=>Promise<void>;
 beforeWrite?:(client:pg.PoolClient)=>Promise<void>;
}
export interface IndexChunkResult {checkpoint:IndexCheckpoint;complete:boolean;processed:number}
/** Background only. Select at most 500 identities before touching any raw payload. */
export async function indexCreativeChunk(pool:pg.Pool,db:DatabaseSync,brand:CreativeBrowserResponse["brand"],competitors:CreativeBrowserResponse["competitors"],gallery:CreativeGalleryService,options:IndexChunkOptions={}):Promise<IndexChunkResult>{
 const client=await pool.connect(),checkpoint={...(options.checkpoint??firstIndexCheckpoint())},workspace=brand.id;
 try{
  await client.query("BEGIN");
  await client.query("SET LOCAL jit=off; SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='5s'");
  const locked=(await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",[`creative-index:${workspace}`])).rows[0].locked;
  if(!locked)throw new Error("Ad indexing is already running for this workspace.");
  let processed=0,complete=false;
  if(checkpoint.phase==="legacy"){
   const targets=[brand.id,...competitors.flatMap(c=>c.brandId?[c.brandId]:[])],target=targets[checkpoint.target];
   if(target){
    const ids=workspaceBrandIds(db,target),inputs=ids.length?db.prepare(`SELECT id FROM ads WHERE brand_id IN (${ids.map(()=>"?").join(",")}) AND source<>'sample' AND NOT(platform='TikTok' AND json_extract(data,'$.publicWatchlistBrandKey') IS NOT NULL) AND id>? ORDER BY id LIMIT 500`).all(...ids,checkpoint.after):[];
    if(inputs.length){
     const selected=await gallery.selected(target,inputs.map(r=>String(r.id)));
     const rows=selected.flatMap(creative=>{
      if(target!==brand.id&&creative.owned)return [];
      const ad=workspaceAd(db,target,creative.adId),score=ad?analysedCreatives(db,target,[ad]).map(scoreCreative)[0]||null:null;
      const row:BrowserCreative={...creative,placements:creative.placements||[],platform:creative.platform||"Unavailable",publicEvidence:!creative.owned,owned:target===brand.id&&creative.owned===true,workspaceBrand:target===brand.id,sourceKind:creative.owned?"owned":"public",score,performance:[],scenes:[]};
      return [{row,source:"legacy",version:checkpoint.generation}];
     });
     await options.beforeWrite?.(client);await put(pool,db,client,workspace,rows);
     checkpoint.after=String(inputs.at(-1)!.id);processed=inputs.length;
    }else{checkpoint.target++;checkpoint.after="";}
   }else{checkpoint.phase="official";}
   // Partial local imports are visible immediately, too.
   await client.query("INSERT INTO web_creative_index_state VALUES($1,$2) ON CONFLICT(workspace_id) DO UPDATE SET legacy_generation=excluded.legacy_generation",[workspace,checkpoint.generation]);
  }else if(checkpoint.phase==='creators'){
   const handles=(await client.query('SELECT handle FROM creator_discovery_results WHERE workspace_id=$1 AND handle>$2 ORDER BY handle LIMIT 100',[workspace,checkpoint.after])).rows.map(r=>r.handle as string);
   await refreshCreatorSales(client,workspace,handles);
   if(handles.length)checkpoint.after=handles.at(-1)!;else complete=true;
  }else{
   const targets=[brand.id,...competitors.map(c=>c.brandId||c.key)];
   const batch=(await client.query(`SELECT DISTINCT ON(w.brand_key,o.platform,o.native_id) o.native_id,o.platform,o.run_id,o.raw_payload_run_id,o.observed_at,o.last_confirmed_at,o.payload_hash,a.advertiser_id,a.first_seen_at,a.start_time,a.stop_time,w.id AS watchlist_id,w.revision,w.brand_key,w.page_ids
    FROM watchlists w JOIN collection_runs r ON r.watchlist_id=w.id AND r.config->>'revision'=w.revision::text
    JOIN ad_observations o ON o.run_id=r.id AND o.workspace_id=w.workspace_id JOIN public_ads a ON a.platform=o.platform AND a.native_id=o.native_id
    WHERE o.platform=w.platform AND w.workspace_id=$1 AND w.purpose='brand' AND w.brand_key=ANY($2::text[]) AND w.page_ids @> to_jsonb(ARRAY[a.advertiser_id]) AND (w.brand_key,o.platform,o.native_id)>($3,$4,$5)
    ORDER BY w.brand_key,o.platform,o.native_id,o.observed_at DESC,o.run_id DESC LIMIT 500`,[workspace,targets,...checkpoint.key])).rows;
   processed=batch.length;if(!batch.length){checkpoint.phase='creators';checkpoint.after='';}
   if(batch.length){
    // Identity selection above has no payload access. Only this bounded relation
    // can decompress JSON. No cursor or workspace-wide materialised payload CTE.
    const keys=[...fields,'source_format','display_format','displayFormat','creative_format','media_type','mediaType','snapshot','cards','videos','images','video_hd_url','video_sd_url','videoHdUrl','videoSdUrl','video_url','videoUrl','image_url','imageUrl','original_image_url','originalImageUrl'];
    const raw="COALESCE(o.raw_payload,p.raw_payload)",vocabulary=await categoryVocabulary(client,workspace),epoch=JSON.stringify(['web-card-v2',vocabulary,new Date().toISOString().slice(0,10)]);
    const enriched=(await client.query(`WITH ids AS MATERIALIZED(SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(brand_key text,platform text,native_id text,run_id text)), narrow AS MATERIALIZED (
     SELECT x.*, (SELECT jsonb_object_agg(key,value) FROM jsonb_each(${raw}) WHERE key=ANY($3::text[])) AS payload FROM ids x
     JOIN ad_observations o ON o.workspace_id=$1 AND o.platform=x.platform AND o.native_id=x.native_id AND o.run_id=x.run_id
     LEFT JOIN ad_observations p ON p.workspace_id=o.workspace_id AND p.platform=o.platform AND p.native_id=o.native_id AND p.run_id=o.raw_payload_run_id)
     SELECT n.brand_key,n.platform,n.native_id,${compactPayloadSql('n.payload')} AS raw_payload,${sourceFormatSql('n.payload')} AS source_format FROM narrow n`,[workspace,JSON.stringify(batch.map(r=>({brand_key:r.brand_key,platform:r.platform,native_id:r.native_id,run_id:r.run_id}))),keys])).rows;
    const payloads=new Map(enriched.map(r=>[JSON.stringify([r.brand_key,r.platform,r.native_id]),r]));
    const imports=(await client.query("SELECT brand_key,native_id,data FROM web_creative_index WHERE workspace_id=$1 AND source_type='legacy' AND platform IN ('Meta','Facebook','Instagram') AND native_id=ANY($2::text[])",[workspace,batch.map(r=>r.native_id)])).rows;
    const legacy=new Map(imports.map(r=>[JSON.stringify([r.brand_key,r.native_id]),r.data as BrowserCreative]));
    const tikRich=await gallery.selected(workspace,batch.filter(r=>r.platform==='TikTok').map(r=>`tiktok:${r.watchlist_id}:${r.native_id}`));
    const rows=batch.flatMap(input=>{
     const payload=payloads.get(JSON.stringify([input.brand_key,input.platform,input.native_id]));
     if(!payload)throw new Error("An ad changed during indexing. This batch will retry.");
     const raw=payload.raw_payload||{};raw.source_format=payload.source_format;
     const saved=input.platform==="Meta"?legacy.get(JSON.stringify([input.brand_key,input.native_id])):undefined;
     let row=mergePublicEvidence(saved?[saved]:[],[{...input,raw_payload:raw} as PublicObservation],brand,competitors)[0];
     if(row&&input.platform==='TikTok'){const rich=tikRich.find(r=>r.adId===`tiktok:${input.watchlist_id}:${input.native_id}`);if(rich){const ad=workspaceAd(db,workspace,rich.adId);row={...row,analysisAdId:rich.adId,analysis:rich.analysis,scenes:rich.scenes||[],score:ad?analysedCreatives(db,workspace,[ad]).map(scoreCreative)[0]||null:null,hookType:rich.hookType,angle:rich.angle,offerType:rich.offerType,ugc:rich.ugc,creativeFormat:rich.creativeFormat,mediaSha256:rich.mediaSha256,durationSeconds:rich.durationSeconds};}}
     return row?[{row,source:"official",credits:creatorCredits(raw,row),version:epoch+':'+input.run_id+':'+input.payload_hash,watch:input.watchlist_id,revision:input.revision,page:input.advertiser_id}]:[];
    });
    await options.beforeWrite?.(client);await put(pool,db,client,workspace,rows);
    const last=batch.at(-1)!;checkpoint.key=[last.brand_key,last.platform,last.native_id];
   }
  }
  const result={checkpoint,processed,complete};await options.commit?.(client,result);await client.query("COMMIT");return result;
 }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}
}
/** Fixture/offline convenience. Production public routes never call this. */
export async function refreshCreativeIndex(pool:pg.Pool,db:DatabaseSync,brand:CreativeBrowserResponse["brand"],competitors:CreativeBrowserResponse["competitors"],gallery:CreativeGalleryService){
 let checkpoint=firstIndexCheckpoint();for(;;){const result=await indexCreativeChunk(pool,db,brand,competitors,gallery,{checkpoint});if(result.complete)return;checkpoint=result.checkpoint;}
}
