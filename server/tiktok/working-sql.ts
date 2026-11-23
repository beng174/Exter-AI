/** Uses the existing PRODUCT-SPEC percentiles/weights; all windows include platform and reporting group. */
export const TIKTOK_WORKING_CTES=`working_base AS (
 SELECT *,jsonb_build_array(brand_key,platform,format,categories)::text AS score_group,
 count(*) OVER(PARTITION BY brand_key,platform,format,categories) AS score_n,
 count(*) FILTER(WHERE stopped IS NOT NULL) OVER(PARTITION BY brand_key,platform,format,categories) AS stopped_n,
 CASE WHEN days>0 THEN COALESCE(uk_reach,(data#>>'{publicReach,total,value}')::numeric)/days END AS velocity,
 CASE WHEN data->>'versionsHashKey' IS NOT NULL THEN count(*) OVER(PARTITION BY brand_key,platform,format,categories,data->>'versionsHashKey')::numeric END AS scaling
 FROM raw_indexed WHERE platform='TikTok' AND public AND format IS NOT NULL AND jsonb_array_length(categories)>0
), working_signals AS (
 SELECT *,CASE WHEN score_n>=10 AND stopped_n>=3 AND days IS NOT NULL THEN 100.0*(rank() OVER(PARTITION BY score_group ORDER BY days NULLS LAST)-1+.5*count(*) OVER(PARTITION BY score_group,days))/count(days) OVER(PARTITION BY score_group) END AS survival_score,
 CASE WHEN score_n>=10 AND scaling IS NOT NULL THEN 100.0*(rank() OVER(PARTITION BY score_group ORDER BY scaling NULLS LAST)-1+.5*count(*) OVER(PARTITION BY score_group,scaling))/count(scaling) OVER(PARTITION BY score_group) END AS scaling_score,
 CASE WHEN score_n>=10 AND velocity IS NOT NULL THEN 100.0*(rank() OVER(PARTITION BY score_group ORDER BY velocity NULLS LAST)-1+.5*count(*) OVER(PARTITION BY score_group,velocity))/count(velocity) OVER(PARTITION BY score_group) END AS velocity_score
 FROM working_base
), working_parts AS (
 SELECT *,CASE WHEN survival_score IS NOT NULL THEN .35 ELSE 0 END+CASE WHEN scaling_score IS NOT NULL THEN .25 ELSE 0 END+CASE WHEN velocity_score IS NOT NULL THEN .25 ELSE 0 END AS assessed FROM working_signals
), working_values AS (
 SELECT *,round((COALESCE(survival_score,0)*.35+COALESCE(scaling_score,0)*.25+COALESCE(velocity_score,0)*.25)/NULLIF(assessed,0))::integer AS working_score,
 greatest(0,extract(epoch FROM ((data->>'observedAt')::timestamptz-(data->>'firstObservedAt')::timestamptz))/86400) AS history_days FROM working_parts
), working_rows AS (
 SELECT brand_key,platform,native_id,jsonb_build_object('score',working_score,'sample',score_n,'coverage',assessed,'provisional',assessed<1 OR status='active','censored',status='active','signals',jsonb_build_object('survival',survival_score,'scaling',scaling_score,'velocity',velocity_score,'organic',NULL),
 'confidence',CASE WHEN history_days<7 OR history_days IS NULL THEN 'Low' WHEN velocity_score IS NOT NULL AND history_days>=21 THEN 'High' ELSE 'Medium' END,
 'label',CASE WHEN status='inactive' AND days<=7 THEN 'Switched off fast' WHEN working_score>=75 AND days>=30 THEN 'Proven winner' WHEN days<14 AND (velocity_score>=200.0/3 OR scaling>1) THEN 'Rising' WHEN working_score BETWEEN 40 AND 74 THEN 'Steady' ELSE 'Watching' END) AS value FROM working_values WHERE working_score IS NOT NULL
), indexed AS MATERIALIZED (
 SELECT r.data||CASE WHEN w.value IS NOT NULL THEN jsonb_build_object('workingScore',w.value) ELSE '{}'::jsonb END AS data,r.brand_key,r.platform,r.native_id,r.source_type,r.image,r.video,r.uk_reach,r.has_analysis,r.claims,r.cta,r.talking,r.effective_format,r.ad_id,r.brand_name,r.own,r.public,r.owned,r.observed,r.started,r.stopped,r.status,r.days,r.format,r.categories FROM raw_indexed r LEFT JOIN working_rows w USING(brand_key,platform,native_id)
)`;
