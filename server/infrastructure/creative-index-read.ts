import type pg from 'pg';
import type {BrowserCreative,CreativeBrowserResponse} from '../../shared/creative-browser.js';
import type {PageQuery} from './creative-pages.js';
import {mergePublicEvidence,type PublicObservation} from './meta-evidence.js';
import {compactPayloadSql} from './creative-index.js';
/** Progress counts identities only; raw observations are never decoded here. */
export async function readIndexProgress(pool:Pick<pg.Pool,'query'>,workspace:string,targets:string[]){
 const result=(await pool.query(`WITH source AS (
 SELECT DISTINCT w.brand_key,o.platform,o.native_id,w.id AS watchlist_id,w.revision,a.advertiser_id AS page_id FROM watchlists w JOIN collection_runs r ON r.watchlist_id=w.id AND r.config->>'revision'=w.revision::text
 JOIN ad_observations o ON o.run_id=r.id AND o.workspace_id=w.workspace_id JOIN public_ads a ON a.platform=o.platform AND a.native_id=o.native_id
 WHERE o.platform=w.platform AND w.workspace_id=$1 AND w.purpose='brand' AND w.brand_key=ANY($2::text[]) AND w.page_ids @> to_jsonb(ARRAY[a.advertiser_id]))
 SELECT count(*)::integer AS total,count(i.native_id)::integer AS indexed,
 (SELECT status FROM creative_index_jobs WHERE workspace_id=$1) AS status FROM source s
 LEFT JOIN web_creative_index i ON i.workspace_id=$1 AND i.brand_key=s.brand_key AND i.platform=s.platform AND i.native_id=s.native_id AND i.source_type='official' AND i.watchlist_id=s.watchlist_id AND i.revision=s.revision AND i.page_id=s.page_id `,[workspace,targets])).rows[0];
 return {indexed:result.indexed,total:result.total,status:result.indexed<result.total&&result.status==='complete'?'queued':result.status??(result.indexed<result.total?'queued':'complete')};
}
/** Cold-index safety net. Limit identities before reading the 48 payloads. */
export async function readLatestCreativeFallback(pool:Pick<pg.Pool,'query'>,brand:CreativeBrowserResponse['brand'],competitors:CreativeBrowserResponse['competitors'],query:PageQuery):Promise<BrowserCreative[]>{
 const targets=query.brand&&query.brand!=='all'?[query.brand]:[brand.id,...competitors.map(c=>c.brandId||c.key)];
 const rows=(await pool.query(`WITH ids AS MATERIALIZED(
 SELECT DISTINCT ON(a.start_time,w.brand_key,o.platform,o.native_id) w.brand_key,w.page_ids,w.id AS watchlist_id,w.revision,o.platform,o.native_id,o.run_id,o.observed_at,o.last_confirmed_at,a.advertiser_id,a.start_time,a.stop_time,a.first_seen_at
 FROM watchlists w JOIN collection_runs r ON r.watchlist_id=w.id AND r.config->>'revision'=w.revision::text JOIN ad_observations o ON o.run_id=r.id AND o.workspace_id=w.workspace_id JOIN public_ads a ON a.platform=o.platform AND a.native_id=o.native_id
 WHERE o.platform=w.platform AND w.workspace_id=$1 AND w.purpose='brand' AND w.brand_key=ANY($2::text[]) AND w.page_ids @> to_jsonb(ARRAY[a.advertiser_id])
 AND ($3::text IS NULL OR o.native_id=$3 OR concat('public:',o.platform,':',o.native_id)=$3)
 ORDER BY a.start_time DESC NULLS LAST,w.brand_key,o.platform,o.native_id,o.observed_at DESC LIMIT 48), payload AS MATERIALIZED(
 SELECT x.*,${compactPayloadSql('COALESCE(o.raw_payload,p.raw_payload)')} AS raw_payload FROM ids x
 JOIN ad_observations o ON o.platform=x.platform AND o.native_id=x.native_id AND o.run_id=x.run_id AND o.workspace_id=$1
 LEFT JOIN ad_observations p ON p.workspace_id=o.workspace_id AND p.platform=o.platform AND p.native_id=o.native_id AND p.run_id=o.raw_payload_run_id)
 SELECT * FROM payload`,[brand.id,targets,query.ad??null])).rows;
 return mergePublicEvidence([],rows as PublicObservation[],brand,competitors);
}
