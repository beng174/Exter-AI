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
const versions=new WeakMap<DatabaseSync,Map<string,number>>();
const fields=["ad_creative_bodies","ad_creative_link_titles","ad_creative_link_captions","ad_creative_link_urls","total_reach_by_location","eu_total_reach","age_country_gender_reach_breakdown","publisher_platforms","target_ages","target_gender","target_locations","languages"];
export const compactPayloadSql=(p:string)=>`jsonb_build_object(${fields.map(key=>`'${key}',${p}->'${key}'`).join(",")})`;
const json=(value:unknown)=>JSON.stringify(value);
async function put(pool:pg.Pool,db:DatabaseSync,client:pg.PoolClient,workspace:string,rows:{row:BrowserCreative;source:string;version:string;watch?:string;revision?:number;page?:string}[]){
 if(!rows.length)return;
 const withMedia=mergeRetainedMedia(rows.map(r=>r.row),await readRetainedMedia(pool,workspace,rows.map(r=>r.row.nativeId),client),workspace);
 const enriched=enrichLikelihood(db,workspace,await mergeProductCategories(client,workspace,withMedia),new Date().toISOString());
 const values=rows.map(({source,version,watch,revision,page},index)=>{
  const row=enriched[index];
  const a=row.analysis,claims=a?.fields.keyClaims.flatMap(c=>c.claim_type||[])||[],talking=a?.mediaKind==="video"?a.fields.personTalkingToCamera.value:null;
  return {workspace_id:workspace,brand_key:row.brandId,platform:row.platform,native_id:row.nativeId,source_type:source,source_version:version,watchlist_id:watch||null,revision:revision??null,page_id:page||row.advertiserPageId||null,
   data:{...row,versionsCopyKey:fullCopy(row),versionsHashKey:sha(row),cardTitle:creativeTitle(row),voiceClaims:a?.fields.keyClaims.map(c=>c.value).filter(v=>v&&v!=="unknown")||[],...(source==="official"?{thumbnailUrl:null,videoUrl:null,imageUrls:[],imageCount:0,mediaAvailable:false,mediaStatus:"not-stored"}:{}),analysis:null,creatorEvidence:[],scenes:[],performance:[]},category_hash:row.categorySourceHash||null,has_analysis:Boolean(a),claims,cta:a?.fields.cta.value||null,talking:typeof talking==="boolean"?talking:null};
 });
 await client.query(`INSERT INTO web_creative_index(workspace_id,brand_key,platform,native_id,source_type,source_version,watchlist_id,revision,page_id,data,category_hash,has_analysis,claims,cta,talking)
 SELECT workspace_id,brand_key,platform,native_id,source_type,source_version,watchlist_id,revision,page_id,data,category_hash,has_analysis,claims,cta,talking FROM jsonb_to_recordset($1) AS x(workspace_id text,brand_key text,platform text,native_id text,source_type text,source_version text,watchlist_id text,revision integer,page_id text,data jsonb,category_hash text,has_analysis boolean,claims jsonb,cta text,talking boolean)
 ON CONFLICT(workspace_id,brand_key,platform,native_id,source_type) DO UPDATE SET source_version=excluded.source_version,watchlist_id=excluded.watchlist_id,revision=excluded.revision,page_id=excluded.page_id,data=excluded.data,category_hash=excluded.category_hash,has_analysis=excluded.has_analysis,claims=excluded.claims,cta=excluded.cta,talking=excluded.talking,updated_at=now()`,[json(values)]);
}
/** Rebuildable narrow metadata, fetched in batches. Never retain a workspace array. */
export async function refreshCreativeIndex(pool:pg.Pool,db:DatabaseSync,brand:CreativeBrowserResponse["brand"],competitors:CreativeBrowserResponse["competitors"],gallery:CreativeGalleryService,signal?:AbortSignal){
 const client=await pool.connect(),targets=[brand.id,...competitors.map(c=>c.brandId||c.key)],raw="COALESCE(o.raw_payload,p.raw_payload)";
 // Detoast once, inside Postgres, before reading individual keys. A large ignored
 // payer field must not be decompressed for every format/reach expression.
 const keys=[...fields,'source_format','display_format','displayFormat','creative_format','media_type','mediaType','snapshot','cards','videos','images','video_hd_url','video_sd_url','videoHdUrl','videoSdUrl','video_url','videoUrl','image_url','imageUrl','original_image_url','originalImageUrl'];
 const narrow=`(SELECT jsonb_object_agg(key,value) FROM jsonb_each(${raw}) WHERE key=ANY(ARRAY[${keys.map(k=>`'${k}'`).join(',')}]))`;
 const abort=()=>{if(signal?.aborted)throw new Error("Creative read disconnected.");};
 let cache=versions.get(db);if(!cache){cache=new Map();versions.set(db,cache);}
 const localVersion=Number((db.prepare("SELECT total_changes() AS n").get() as {n:number}).n),legacyChanged=cache.get(brand.id)!==localVersion;
 try{
  await client.query("BEGIN");await client.query("SET LOCAL jit=off; SET LOCAL statement_timeout='30s'");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`creative-index:${brand.id}`]);abort();
  if(legacyChanged){
   const generation=randomUUID();
   for(const target of [{id:brand.id},...competitors.filter(c=>c.brandId).map(c=>({id:c.brandId!}))]){
    const ids=workspaceBrandIds(db,target.id);if(!ids.length)continue;
    const iterator=db.prepare(`SELECT id,brand_id FROM ads WHERE brand_id IN (${ids.map(()=>"?").join(",")}) AND source<>'sample' ORDER BY id`).iterate(...ids);
    for(const input of iterator){abort();const selected=await gallery.selected(target.id,[String(input.id)]);
     for(const creative of selected){if(target.id!==brand.id&&creative.owned)continue;const ad=workspaceAd(db,target.id,creative.adId),score=ad?analysedCreatives(db,target.id,[ad]).map(scoreCreative)[0]||null:null;
      const row:BrowserCreative={...creative,placements:creative.placements||[],platform:creative.platform||"Unavailable",publicEvidence:!creative.owned,owned:target.id===brand.id&&creative.owned===true,workspaceBrand:target.id===brand.id,sourceKind:creative.owned?"owned":"public",score,performance:[],scenes:[]};
      // Search text already contains the transcript; the index needs no transcript object.
      await put(pool,db,client,brand.id,[{row,source:"legacy",version:generation}]);
     }
    }
   }
   await client.query("INSERT INTO web_creative_index_state VALUES($1,$2) ON CONFLICT(workspace_id) DO UPDATE SET legacy_generation=excluded.legacy_generation",[brand.id,generation]);
  }
  const vocabulary=await categoryVocabulary(client,brand.id),epoch=JSON.stringify(['web-card-v1',localVersion,vocabulary,new Date().toISOString().slice(0,10)]);
  const version=`md5(concat($3::text,':',(SELECT max(c.created_at) FROM public_ad_categories c WHERE c.workspace_id=$1 AND c.brand_key=w.brand_key AND c.native_id=o.native_id),':',(SELECT max(m.created_at) FROM ad_media_creatives m WHERE m.workspace_id=$1 AND m.brand_key=w.brand_key AND m.native_id=o.native_id),':',o.run_id,':',o.observed_at,':',o.last_confirmed_at,':',o.payload_hash,':',o.raw_payload_run_id,':',a.start_time,':',a.stop_time,':',w.revision))`;
  await client.query(`DECLARE web_public_cursor NO SCROLL CURSOR FOR WITH current AS (
    SELECT DISTINCT ON(w.brand_key,o.platform,o.native_id) o.native_id,o.platform,o.run_id,o.raw_payload_run_id,o.observed_at,o.last_confirmed_at,a.advertiser_id,a.first_seen_at,a.start_time,a.stop_time,w.id AS watchlist_id,w.revision,w.brand_key,w.page_ids,
     ${version} AS source_version
    FROM ad_observations o JOIN public_ads a USING(platform,native_id) JOIN collection_runs r ON r.id=o.run_id JOIN watchlists w ON w.id=r.watchlist_id
    LEFT JOIN ad_observations p ON p.workspace_id=o.workspace_id AND p.platform=o.platform AND p.native_id=o.native_id AND p.run_id=o.raw_payload_run_id
    WHERE o.workspace_id=$1 AND w.workspace_id=$1 AND w.purpose='brand' AND w.brand_key=ANY($2::text[]) AND r.config->>'revision'=w.revision::text AND w.page_ids @> to_jsonb(ARRAY[a.advertiser_id])
    ORDER BY w.brand_key,o.platform,o.native_id,o.observed_at DESC,o.run_id DESC
   ), changed AS MATERIALIZED (SELECT c.* FROM current c LEFT JOIN LATERAL (SELECT source_version FROM web_creative_index i WHERE i.workspace_id=$1 AND i.brand_key=c.brand_key AND i.platform=c.platform AND i.native_id=c.native_id AND i.source_type='official' LIMIT 1)i ON true WHERE i.source_version IS DISTINCT FROM c.source_version)
   , narrow AS MATERIALIZED(SELECT c.*,${narrow} AS payload FROM changed c
   JOIN LATERAL (SELECT raw_payload,raw_payload_run_id FROM ad_observations o WHERE o.workspace_id=$1 AND o.platform=c.platform AND o.native_id=c.native_id AND o.run_id=c.run_id LIMIT 1)o ON true
   LEFT JOIN LATERAL (SELECT raw_payload FROM ad_observations p WHERE p.workspace_id=$1 AND p.platform=c.platform AND p.native_id=c.native_id AND p.run_id=o.raw_payload_run_id LIMIT 1)p ON true)
   SELECT n.native_id,n.platform,n.observed_at,n.last_confirmed_at,n.advertiser_id,n.first_seen_at,n.start_time,n.stop_time,n.watchlist_id,n.revision,n.brand_key,n.page_ids,n.source_version,${compactPayloadSql('n.payload')} AS raw_payload,${sourceFormatSql('n.payload')} AS source_format FROM narrow n`,[brand.id,targets,epoch]);
  let updated=false;
  while(true){abort();const batch=(await client.query("FETCH FORWARD 500 FROM web_public_cursor")).rows;if(!batch.length)break;updated=true;
   const imports=(await client.query(`SELECT brand_key,native_id,data FROM web_creative_index WHERE workspace_id=$1 AND source_type='legacy' AND platform IN ('Meta','Facebook','Instagram') AND native_id=ANY($2::text[]) AND source_version=(SELECT legacy_generation FROM web_creative_index_state WHERE workspace_id=$1)`,[brand.id,batch.map(r=>r.native_id)])).rows;
   const legacy=new Map<string,BrowserCreative>();
   for(const target of [brand.id,...competitors.flatMap(c=>c.brandId?[c.brandId]:[])]){
    const saved=imports.filter(r=>r.brand_key===target);if(!saved.length)continue;
    const rich=new Map((await gallery.selected(target,saved.map(r=>r.data.adId))).map(r=>[r.nativeId,r]));
    for(const r of saved){const item=rich.get(r.native_id);legacy.set(JSON.stringify([target,r.native_id]),{...r.data,...(item?{analysis:item.analysis,creatorEvidence:item.creatorEvidence,scenes:item.scenes||[]}:{})});}
   }
   const rows=batch.flatMap(input=>{const raw=input.raw_payload;raw.source_format=input.source_format;
    const saved=legacy.get(JSON.stringify([input.brand_key,input.native_id]));
    const row=mergePublicEvidence(saved?[saved]:[], [input as PublicObservation],brand,competitors)[0];return row?[{row,source:"official",version:input.source_version,watch:input.watchlist_id,revision:input.revision,page:input.advertiser_id}]:[];
   });await put(pool,db,client,brand.id,rows);
  }
  await client.query("CLOSE web_public_cursor");if(updated||legacyChanged)await client.query('ANALYZE web_creative_index');await client.query("COMMIT");
  if(legacyChanged)cache.set(brand.id,localVersion);
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
