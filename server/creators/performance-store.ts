import {scrubCreatorText} from "../../shared/creator-discovery.js";
import {createHash} from 'node:crypto';
import type pg from 'pg';
import type {BrowserCreative} from '../../shared/creative-browser.js';
import {creatorCredits,creatorSalesSignal,emptyAdStats,salesFeatures,type CreatorCredit,type CreatorAdEvidence,type CreatorAdStats,type CreatorSalesSignal} from '../../shared/creator-performance.js';
import {creatorCohort,type CreatorCampaign} from '../../shared/creator-campaigns.js';
import {creativeTitle} from '../../shared/creative-presentation.js';
import {countryReach} from '../../shared/meta-public.js';
import {fullCopy,sha} from '../../shared/public-signals.js';
type Query=Pick<pg.Pool,'query'>;
export const performanceHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const suppression=(workspace:string,handle:string)=>performanceHash([workspace,handle]);
/** Called only in the existing bounded indexing transaction. No new provider reads. */
export async function recordCreatorAdEvidence(client:Query,workspace:string,rows:{row:BrowserCreative;credits?:CreatorCredit[]}[]){
 const values=rows.flatMap(({row,credits})=>{
  if(row.platform!=='Meta'||row.owned&&row.publicEvidence!==true)return [];
  const proofs=credits??creatorCredits({},row),handles=[...new Set(proofs.map(p=>p.handle))];
  return handles.map(handle=>({workspace_id:workspace,handle,brand_key:row.brandId,platform:row.platform,native_id:row.nativeId,suppression:suppression(workspace,handle),data:{adId:row.adId,nativeId:row.nativeId,brandId:row.brandId,brandName:row.brandName,platform:row.platform,title:scrubCreatorText(creativeTitle(row),240)||'Ad '+row.nativeId,from:row.deliveryStartAt,days:row.daysRunning,workingScore:(typeof row.workingScore==="number"?row.workingScore:row.workingScore?.score)??null,reach:row.publicReach??null,versions:row.publicVersionCount??null,checkedAt:row.observedAt,credits:proofs.filter(p=>p.handle===handle),copyKey:fullCopy(row),hashKey:sha(row),workspaceBrand:row.workspaceBrand,ukReach:countryReach(row.publicReach)}}));
 });
 if(!values.length)return;
 await client.query(`INSERT INTO creator_ad_evidence(workspace_id,handle,brand_key,platform,native_id,data)
 SELECT workspace_id,handle,brand_key,platform,native_id,data FROM jsonb_to_recordset($1) AS x(workspace_id text,handle text,brand_key text,platform text,native_id text,suppression text,data jsonb)
 WHERE NOT EXISTS(SELECT 1 FROM creator_discovery_suppression s WHERE s.workspace_id=x.workspace_id AND s.handle_hash=x.suppression)
 ON CONFLICT(workspace_id,handle,brand_key,platform,native_id) DO UPDATE SET data=excluded.data,updated_at=now()`,[JSON.stringify(values)]);
 const handles=[...new Set(values.map(v=>v.handle))];
 await client.query(`INSERT INTO creator_discovery_ad_handles(workspace_id,handle,ad_ids) SELECT $1,handle,jsonb_agg(DISTINCT data->>'adId') FROM creator_ad_evidence WHERE workspace_id=$1 AND handle=ANY($2::text[]) GROUP BY handle
 ON CONFLICT(workspace_id,handle) DO UPDATE SET ad_ids=excluded.ad_ids`,[workspace,handles]);
 // The final index phase refreshes summaries in separate 100-profile chunks.
}
/** Aggregate in SQL. Raw observations and complete ad libraries never enter a page. */
export async function refreshCreatorSales(client:Query,workspace:string,handles:string[],at=new Date().toISOString()){
 if(!handles.length)return;
 const profiles=(await client.query(`SELECT r.handle,r.profile,r.evaluation,s.brief FROM creator_discovery_results r LEFT JOIN creator_discovery_settings s USING(workspace_id) WHERE r.workspace_id=$1 AND r.handle=ANY($2::text[])`,[workspace,handles])).rows;
 if(!profiles.length)return;
 handles=profiles.map(p=>p.handle);
 const suppressed=new Set((await client.query('SELECT handle_hash FROM creator_discovery_suppression WHERE workspace_id=$1',[workspace])).rows.map(r=>r.handle_hash));
 const stats=await client.query(`WITH ads AS (SELECT DISTINCT ON(handle,platform,native_id) * FROM creator_ad_evidence WHERE workspace_id=$1 AND handle=ANY($2::text[]) ORDER BY handle,platform,native_id,COALESCE((data->>'workspaceBrand')::boolean,false) DESC,updated_at DESC,brand_key),
 dates AS (SELECT handle,lower(data->>'brandName') brand,(data->>'from')::timestamptz started FROM ads WHERE data->>'from' IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(data->'credits') c WHERE c->>'kind' IN ('Partnership','Whitelisted','Co-author'))
 UNION ALL SELECT handle,lower(data->>'brand'),(data->>'from')::timestamptz FROM creator_campaign_outcomes WHERE workspace_id=$1 AND handle=ANY($2::text[])),
 ordered_dates AS (SELECT handle,brand,started,lag(started) OVER(PARTITION BY handle,brand ORDER BY started) previous FROM (SELECT DISTINCT handle,brand,started FROM dates) d),
 repeats AS (SELECT handle,brand,bool_or(previous IS NOT NULL AND started-previous>=interval '30 days') repeated FROM ordered_dates GROUP BY handle,brand),
 version_ads AS (SELECT handle,platform,native_id FROM ads UNION SELECT a.handle,i.platform,i.native_id FROM ads a JOIN web_creative_index i ON i.workspace_id=a.workspace_id AND i.brand_key=a.brand_key AND i.platform=a.platform AND ((NULLIF(a.data->>'copyKey','') IS NOT NULL AND i.data->>'versionsCopyKey'=a.data->>'copyKey') OR (NULLIF(a.data->>'hashKey','') IS NOT NULL AND i.data->>'versionsHashKey'=a.data->>'hashKey')))
 SELECT r.handle,(SELECT count(*)::integer FROM ads a WHERE a.handle=r.handle) ads,
 (SELECT count(*)::integer FROM ads a WHERE a.handle=r.handle AND NOT COALESCE((data->>'workspaceBrand')::boolean,false)) competitor_ads,
 (SELECT count(*)::integer FROM repeats p WHERE p.handle=r.handle) brands,
 (SELECT count(*)::integer FROM repeats p WHERE p.handle=r.handle AND repeated) repeat_brands,
 (SELECT max((data->>'days')::float8) FROM ads a WHERE a.handle=r.handle) longest,
 (SELECT percentile_cont(.5) WITHIN GROUP(ORDER BY (data->>'workingScore')::float8) FROM ads a WHERE a.handle=r.handle AND data->>'workingScore' IS NOT NULL) working_median,
 (SELECT count(*)::integer FROM version_ads a WHERE a.handle=r.handle) versions,
 (SELECT jsonb_agg(jsonb_build_object('country',country,'reach',n)) FROM (SELECT c->>'country' country,sum((c->>'reach')::float8) n FROM ads a CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(data->'reach'->'locations'->'value','null'),'[]')) c WHERE a.handle=r.handle GROUP BY c->>'country') x) countries,
 (SELECT jsonb_agg(jsonb_build_object('country',country,'age',age,'gender',gender,'reach',n)) FROM (SELECT c->>'country' country,c->>'age' age,c->>'gender' gender,sum((c->>'reach')::float8) n FROM ads a CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(data->'reach'->'demographics'->'value','null'),'[]')) c WHERE a.handle=r.handle GROUP BY c->>'country',c->>'age',c->>'gender') x) demographics,
 (SELECT min(data->>'from') FROM ads a WHERE a.handle=r.handle) started,
 (SELECT max(data->>'checkedAt') FROM ads a WHERE a.handle=r.handle) checked
 FROM unnest($2::text[]) r(handle)`,[workspace,handles]);
 const current:Record<string,unknown>[]=[],history:Record<string,unknown>[]=[];
 for(const p of profiles){
  if(suppressed.has(suppression(workspace,p.handle)))continue;
  const r=stats.rows.find(r=>r.handle===p.handle),s:CreatorAdStats=r?{ads:r.ads,competitorAds:r.competitor_ads,brands:r.brands,repeatBrands:r.brands?r.repeat_brands:null,longest:r.longest,workingMedian:r.working_median,versions:r.ads?r.versions:null,countries:r.countries??[],demographics:r.demographics??[],from:r.started,to:r.checked,checkedAt:r.checked}:emptyAdStats();
  const signal=creatorSalesSignal(p.profile,p.evaluation,p.brief?[p.brief.category,...p.brief.keywords]:[],s,at,p.brief?.audienceTarget),features=salesFeatures(signal);
  current.push({workspace_id:workspace,handle:p.handle,signal});history.push({workspace_id:workspace,handle:p.handle,feature_hash:performanceHash([signal.category,features]),features,recorded_at:at,category:signal.category});
 }
 await client.query(`INSERT INTO creator_sales_current SELECT * FROM jsonb_to_recordset($1) AS x(workspace_id text,handle text,signal jsonb) ON CONFLICT(workspace_id,handle) DO UPDATE SET signal=excluded.signal`,[JSON.stringify(current)]);
 await client.query(`INSERT INTO creator_sales_history SELECT * FROM jsonb_to_recordset($1) AS x(workspace_id text,handle text,feature_hash text,features jsonb,recorded_at timestamptz,category text) ON CONFLICT DO NOTHING`,[JSON.stringify(history)]);
}
export async function creatorEvidencePage(client:Query,workspace:string,handle:string,offset=0){
 const result=await client.query(`SELECT data FROM (SELECT DISTINCT ON(platform,native_id) * FROM creator_ad_evidence WHERE workspace_id=$1 AND handle=$2 ORDER BY platform,native_id,COALESCE((data->>'workspaceBrand')::boolean,false) DESC,updated_at DESC,brand_key) chosen ORDER BY (data->>'days')::float8 DESC NULLS LAST,platform,native_id,brand_key LIMIT 48 OFFSET $3`,[workspace,handle,offset]);
 const ads=result.rows.map(r=>r.data as CreatorAdEvidence);
 // Exact creative/copy versions stay in the read index; only this page's keys are compared.
 for(const ad of ads){const row=ad as CreatorAdEvidence&{copyKey?:string;hashKey?:string};const n=(await client.query(`SELECT count(DISTINCT platform||':'||native_id)::integer n FROM web_creative_index WHERE workspace_id=$1 AND brand_key=$2 AND platform=$5 AND (NULLIF($3,'') IS NOT NULL AND data->>'versionsCopyKey'=$3 OR NULLIF($4,'') IS NOT NULL AND data->>'versionsHashKey'=$4)`,[workspace,ad.brandId,row.copyKey??'',row.hashKey??'',ad.platform])).rows[0].n;ad.versions=Math.max(n,ad.versions??1);delete row.copyKey;delete row.hashKey;}
 return ads;
}
export async function saveCreatorCampaigns(pool:pg.Pool,workspace:string,campaigns:CreatorCampaign[],transactionClient?:pg.PoolClient){
 const client=transactionClient??await pool.connect();let inserted=0;
 try{if(!transactionClient)await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['creator-outcomes:'+workspace]);
  for(const input of campaigns){
   if((await client.query('SELECT 1 FROM creator_discovery_suppression WHERE workspace_id=$1 AND handle_hash=$2',[workspace,suppression(workspace,input.handle)])).rowCount)throw new Error('A creator in this file was deleted.');
   const snapshot=(await client.query('SELECT features,recorded_at FROM creator_sales_history WHERE workspace_id=$1 AND handle=$2 AND recorded_at<$3::timestamptz AND lower(category)=lower($4) ORDER BY recorded_at DESC LIMIT 1',[workspace,input.handle,input.from,input.scope.category])).rows[0];
   const identity={handle:input.handle,brand:input.brand,platform:input.platform,scope:input.scope,from:input.from,to:input.to},id=input.id||performanceHash(identity),content={...input,id,features:null,featureAt:null,recordedAt:''},hash=performanceHash(content);
   const prior=(await client.query('SELECT content_hash FROM creator_campaign_outcomes WHERE workspace_id=$1 AND id=$2',[workspace,id])).rows[0];if(prior){if(prior.content_hash!==hash)throw new Error('A campaign identifier already has different outcomes. Use a new identifier.');continue;}
   const row={...input,id,features:snapshot?.features??null,featureAt:snapshot?new Date(snapshot.recorded_at).toISOString():null};
   await client.query('INSERT INTO creator_campaign_outcomes(workspace_id,id,handle,cohort,data,content_hash) VALUES($1,$2,$3,$4,$5,$6)',[workspace,id,row.handle,creatorCohort(row),JSON.stringify(row),hash]);inserted++;
  }
  await client.query('UPDATE creator_discovery_results SET used_at=now() WHERE workspace_id=$1 AND handle=ANY($2::text[])',[workspace,[...new Set(campaigns.map(c=>c.handle))]]);
  await refreshCreatorSales(client,workspace,[...new Set(campaigns.map(c=>c.handle))]);if(!transactionClient)await client.query('COMMIT');return inserted;
 }catch(e){if(!transactionClient)await client.query('ROLLBACK');throw e;}finally{if(!transactionClient)client.release();}
}
export async function creatorModelRows(client:Query,workspace:string,cohort:string,withAdOutcomes=false){
 if(withAdOutcomes){const count=(await client.query("SELECT COALESCE(sum(jsonb_array_length(COALESCE(data->'adOutcomes','[]'))),0)::integer n FROM creator_campaign_outcomes WHERE workspace_id=$1 AND cohort=$2",[workspace,cohort])).rows[0].n;if(count>20000)throw new Error('Validation allows at most 20,000 saved ad results per reporting group.');}
 const rows=await client.query(`SELECT ${withAdOutcomes?"data":"data-'adOutcomes'"} AS data FROM creator_campaign_outcomes WHERE workspace_id=$1 AND cohort=$2 ORDER BY id LIMIT 5001`,[workspace,cohort]);if(rows.rows.length>5000)throw new Error('This reporting group has too many campaigns.');return rows.rows.map(r=>r.data as CreatorCampaign);
}
export async function deleteCreatorPerformance(client:Query,workspace:string,handle:string){
 for(const table of ['creator_ad_evidence','creator_sales_current','creator_sales_history','creator_campaign_outcomes','creator_owned_links'])await client.query(`DELETE FROM ${table} WHERE workspace_id=$1 AND handle=$2`,[workspace,handle]);
 await client.query("DELETE FROM creator_forecast_models WHERE workspace_id=$1 AND data->'handles' @> to_jsonb(ARRAY[$2::text])",[workspace,handle]);
}

/** Exact owned identity only, from returned metadata. Never archive-ID matching. */
export async function recordOwnedCreatorIdentities(client:Query,workspace:string,account:string,days:import('../../shared/owned-metrics.js').OwnedDay[]){
 const links=new Map<string,{handle:string;ad:string;kind:string}>();
 for(const day of days)if(day.platform==='Meta')for(const proof of day.creatorAttributions??[])links.set(proof.handle+':'+day.adId,{handle:proof.handle,ad:day.adId,kind:proof.kind});
 if(!links.size)return;
 const suppressed=new Set((await client.query('SELECT handle_hash FROM creator_discovery_suppression WHERE workspace_id=$1',[workspace])).rows.map(r=>r.handle_hash));
 const rows=[...links.values()].filter(r=>!suppressed.has(suppression(workspace,r.handle)));
 await client.query(`INSERT INTO creator_owned_links(workspace_id,handle,owned_account_id,ad_id,kind,category,product,format)
 SELECT $1,handle,$2,ad,kind,'Not classified','Not specified','unknown' FROM jsonb_to_recordset($3) AS x(handle text,ad text,kind text)
 ON CONFLICT(workspace_id,handle,owned_account_id,ad_id) DO NOTHING`,[workspace,account,JSON.stringify(rows)]);
}
