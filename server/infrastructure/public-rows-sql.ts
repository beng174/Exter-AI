/** SQL-only source state. Callers return aggregates or a limited set of IDs. */
export const jsonCountSql=(value:string)=>`CASE WHEN (${value}) #>> '{}' ~ '^\\d+$' AND length((${value}) #>> '{}')<=16 THEN CASE WHEN ((${value}) #>> '{}')::numeric<=9007199254740991 THEN ((${value}) #>> '{}')::bigint END END`;
export function sourceFormatSql(p:string){
 const get=(path:string)=>`${p}#>'{${path}}'`,text=(v:string)=>`(${v})#>>'{}'`;
 const truthy=(v:string)=>`CASE WHEN ${v} NOT IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb) THEN ${text(v)} END`;
 const explicit=`upper(COALESCE(${['source_format','display_format','displayFormat','creative_format','media_type','mediaType','snapshot,display_format','snapshot,displayFormat'].map(key=>truthy(get(key))).join(',')}))`;
 const array=(v:string)=>`CASE WHEN jsonb_typeof(${v})='array' THEN ${v} ELSE '[]'::jsonb END`,nonempty=(v:string)=>`jsonb_array_length(${array(v)})>0`;
 const cards=`COALESCE(NULLIF(${get('cards')},'null'::jsonb),${get('snapshot,cards')})`;
 const present=(v:string)=>`(jsonb_typeof(${v})='string' AND ${text(v)}<>'')`;
 const paths=(keys:string[])=>keys.flatMap(key=>[get(key),get(`snapshot,${key}`),`(${cards})#>'{0,${key}}'`]).map(present).join(' OR ');
 return `CASE WHEN ${explicit}='VIDEO' THEN 'video' WHEN ${explicit} IN ('IMAGE','STATIC_IMAGE','STATIC') THEN 'static_image' WHEN ${explicit} IN ('CAROUSEL','MULTI_IMAGES') THEN 'carousel' WHEN ${explicit} IN ('DPA','DCO','CATALOGUE','CATALOG') THEN 'catalogue'
 WHEN concat(${array(get('ad_creative_bodies'))},${array(get('ad_creative_link_titles'))}) ~* '\\{\\{product\\.(name|brand|price|description)' THEN 'catalogue'
 WHEN jsonb_array_length(${array(cards)})>1 THEN 'carousel'
 WHEN ${paths(['video_hd_url','video_sd_url','videoHdUrl','videoSdUrl','video_url','videoUrl'])} OR ${nonempty(get('videos'))} OR ${nonempty(get('snapshot,videos'))} THEN 'video'
 WHEN ${paths(['image_url','imageUrl','original_image_url','originalImageUrl'])} OR ${nonempty(get('images'))} OR ${nonempty(get('snapshot,images'))} THEN 'static_image' END`;
}
// $1 workspace; $2 optional watchlist; $3 measurement time. Payloads stay in SQL.
export const PUBLIC_ROWS_SQL=`WITH watches AS MATERIALIZED (
 SELECT * FROM watchlists WHERE workspace_id=$1 AND purpose='brand' AND brand_key IS NOT NULL AND jsonb_array_length(page_ids)=1 AND ($2::text IS NULL OR id=$2)
), latest AS MATERIALIZED (
 SELECT DISTINCT ON(w.brand_key,o.platform,o.native_id) w.id AS watchlist_id,w.brand_key,w.page_ids->>0 AS page_id,o.platform,o.native_id,
 COALESCE(o.last_confirmed_at,o.observed_at) AS observed_at,a.first_seen_at,a.start_time,a.stop_time,
 COALESCE(NULLIF(o.reach#>'{locations,value}','null'::jsonb),COALESCE(o.raw_payload,p.raw_payload)->'total_reach_by_location') AS locations,
 COALESCE(NULLIF(o.reach#>'{eu,value}','null'::jsonb),COALESCE(o.raw_payload,p.raw_payload)->'eu_total_reach') AS eu
 FROM watches w JOIN collection_runs r ON r.watchlist_id=w.id AND r.config->>'revision'=w.revision::text
 JOIN ad_observations o ON o.run_id=r.id AND o.workspace_id=$1 JOIN public_ads a USING(platform,native_id)
 LEFT JOIN ad_observations p ON p.workspace_id=o.workspace_id AND p.platform=o.platform AND p.native_id=o.native_id AND p.run_id=o.raw_payload_run_id
 WHERE a.advertiser_id=w.page_ids->>0 ORDER BY w.brand_key,o.platform,o.native_id,o.observed_at DESC,o.run_id DESC
), facts AS MATERIALIZED (
 SELECT l.*,CASE WHEN start_time IS NOT NULL THEN greatest(0,floor(extract(epoch FROM (COALESCE(stop_time,observed_at)-start_time))/86400))::integer END AS days,
 CASE WHEN stop_time IS NOT NULL THEN 'inactive' ELSE 'unknown' END AS status,
 (SELECT sum(${jsonCountSql("COALESCE(entry->'value',entry->'reach')")}) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(locations)='array' THEN locations ELSE '[]'::jsonb END) entry WHERE COALESCE(entry->>'key',entry->>'country',entry->>'location') IN ('GB','UK')) AS uk_reach,
 ${jsonCountSql("eu")} AS eu_reach
 FROM latest l
), media AS MATERIALIZED (
 SELECT c.brand_key,c.native_id,bool_or(EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets)a WHERE a->>'role' IN ('image','poster') AND NOT EXISTS(SELECT 1 FROM ad_media_file_checks f WHERE f.workspace_id=c.workspace_id AND f.artifact_id=a->'ref'->>'artifactId' AND NOT f.available))) AS image,
 bool_or(EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets)a WHERE a->>'role'='video' AND NOT EXISTS(SELECT 1 FROM ad_media_file_checks f WHERE f.workspace_id=c.workspace_id AND f.artifact_id=a->'ref'->>'artifactId' AND NOT f.available))) AS video,
 bool_or(EXISTS(SELECT 1 FROM jsonb_array_elements(c.assets)a JOIN ad_media_file_checks f ON f.workspace_id=c.workspace_id AND f.artifact_id=a->'ref'->>'artifactId' WHERE a->>'role' IN ('image','poster') AND NOT f.available)) AS missing_file,
 bool_or(c.format='video' OR c.expected_videos>0) AS is_video,max(c.created_at) AS legacy_attempt,(array_agg(c.error_kind ORDER BY c.created_at DESC))[1] AS error,
 (array_agg(c.format ORDER BY c.created_at DESC) FILTER(WHERE c.format IS NOT NULL))[1] AS media_format
 FROM ad_media_creatives c JOIN watches w ON w.brand_key=c.brand_key AND w.page_ids->>0=c.page_id WHERE c.workspace_id=$1 GROUP BY c.brand_key,c.native_id
), requests AS MATERIALIZED (
 SELECT DISTINCT ON(r.brand_key,q.native_id) r.brand_key,q.native_id,q.requested_at,q.returned_at,q.matched_at,q.outcome,q.reprocess_version,r.lookup_mode,r.dataset_id,r.id AS source_run_id,
 bool_or(q.returned_at IS NOT NULL) OVER(PARTITION BY r.brand_key,q.native_id) AS ever_returned,bool_or(q.matched_at IS NOT NULL) OVER(PARTITION BY r.brand_key,q.native_id) AS ever_matched
 FROM ad_media_requests q JOIN ad_media_runs r ON r.id=q.run_id JOIN watches w ON w.id=r.watchlist_id AND w.page_ids->>0=r.page_id
 WHERE r.workspace_id=$1 ORDER BY r.brand_key,q.native_id,q.requested_at DESC,r.id DESC
), video_attempts AS MATERIALIZED (
 SELECT r.brand_key,q.native_id,max(q.requested_at) AS video_attempt_at FROM ad_media_requests q JOIN ad_media_runs r ON r.id=q.run_id
 JOIN watches w ON w.id=r.watchlist_id AND w.page_ids->>0=r.page_id WHERE r.workspace_id=$1 AND r.download_videos GROUP BY r.brand_key,q.native_id
), queued AS MATERIALIZED (
 SELECT r.brand_key,t.native_id,bool_or(r.status IN ('queued','starting','running')) AS queued,bool_or(r.error_kind='budget') AS budget
 FROM ad_media_runs r JOIN watches w ON w.id=r.watchlist_id AND w.page_ids->>0=r.page_id CROSS JOIN LATERAL jsonb_array_elements_text(r.target_ids)t(native_id)
 WHERE r.workspace_id=$1 AND r.status IN ('queued','starting','running','paused','uncertain') GROUP BY r.brand_key,t.native_id
), known AS MATERIALIZED (
 SELECT r.brand_key,k.native_id,bool_or(k.kind='image') AS image,bool_or(k.kind='video') AS video,bool_or(k.kind='candidate') AS is_video
 FROM ad_media_runs r JOIN watches w ON w.id=r.watchlist_id AND w.page_ids->>0=r.page_id
 CROSS JOIN LATERAL (SELECT jsonb_array_elements_text(r.known_media_ids) AS native_id,'image' AS kind UNION ALL SELECT jsonb_array_elements_text(r.known_video_ids),'video' UNION ALL SELECT jsonb_array_elements_text(r.known_video_candidates),'candidate') k
 WHERE r.workspace_id=$1 AND r.started_at>$3::timestamptz-interval '1 day' GROUP BY r.brand_key,k.native_id
), state AS MATERIALIZED (
 SELECT f.*,COALESCE(m.image,false) OR COALESCE(k.image,false) AND NOT COALESCE(m.missing_file,false) AS image,COALESCE(m.video,false) OR COALESCE(k.video,false) AS video,
 COALESCE(m.is_video,false) OR COALESCE(k.is_video,false) AS is_video,m.media_format,m.missing_file,m.error,m.legacy_attempt,
 q.requested_at,q.returned_at,q.matched_at,q.outcome,q.reprocess_version,q.lookup_mode,q.dataset_id,q.source_run_id,q.ever_returned,q.ever_matched,v.video_attempt_at,z.queued,COALESCE(z.budget,false) OR EXISTS(SELECT 1 FROM ad_media_runs br JOIN watches bw ON bw.id=br.watchlist_id WHERE br.brand_key=f.brand_key AND br.status='paused' AND br.error_kind='budget') AS budget
 FROM facts f LEFT JOIN media m USING(brand_key,native_id) LEFT JOIN known k USING(brand_key,native_id) LEFT JOIN requests q USING(brand_key,native_id) LEFT JOIN video_attempts v USING(brand_key,native_id) LEFT JOIN queued z USING(brand_key,native_id)
)`;
export const MISSING_REASON_SQL=`CASE WHEN queued THEN CASE WHEN budget THEN 'budget' ELSE 'queued' END WHEN missing_file THEN 'file_missing'
 WHEN budget AND requested_at IS NULL THEN 'budget' WHEN requested_at IS NULL THEN CASE WHEN error IN ('expired','unsupported','disk','provider') THEN error WHEN legacy_attempt IS NOT NULL THEN 'provider' ELSE 'not_requested' END
 WHEN outcome IN ('expired','unsupported','wrong_page','disk','provider','no_media','not_returned','budget') THEN outcome WHEN returned_at IS NULL THEN 'not_returned' ELSE 'no_media' END`;
