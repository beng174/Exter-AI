import type pg from "pg";
import type {BrowserCreative,CreativeBrowserResponse,BrowserFilters} from "../../shared/creative-browser.js";
import type {CreativeReadModel} from "../../shared/creative-read-model.js";
import {researchWindow} from "../../shared/creative-research.js";
import {PUBLIC_ROWS_SQL} from "./public-rows-sql.js";
import {primaryCategories} from "../../shared/public-comparisons.js";
import type {Brand} from "../../shared/types.js";
import {ANGLE_VALUES,CLAIM_TYPE_VALUES,FORMAT_VALUES,HOOK_TYPE_VALUES,OFFER_TYPE_VALUES} from "../../shared/creative-taxonomy.js";

/** Only SQL contains the full metadata relation. Node receives pages and small groups. */
const ownedDefaults={adId:"",nativeId:"",brandId:"",brandName:"",title:"",copy:"",sourceUrl:null,mediaKind:"unknown",durationSeconds:null,thumbnailUrl:null,videoUrl:null,imageUrls:[],imageCount:0,mediaAvailable:false,mediaStatus:"not-stored",analysis:null,creativeFormat:null,hookType:null,angle:null,offerType:null,ugc:null,creatorEvidence:[],partnershipAttribution:null,deliveryStatus:"unknown",deliveryStartAt:null,deliveryStopAt:null,observedAt:null,firstObservedAt:null,daysRunning:null,daysRunningAsOf:null,daysRunningBasis:null,searchText:"",platform:"Meta",owned:true,workspaceBrand:true,sourceKind:"owned",publicEvidence:false,hasReporting:true,placements:[],score:null,performance:[],scenes:[]};
export const INDEX_ROWS_SQL=`${PUBLIC_ROWS_SQL}, owned_names AS MATERIALIZED (
 SELECT DISTINCT ON(d.platform,d.ad_id) d.platform,d.ad_id,d.pulled_at,d.data->>'adName' AS name,d.data->>'accountId' AS account
 FROM owned_ad_days d JOIN owned_accounts a ON a.id=d.owned_account_id WHERE a.workspace_id=$1 AND d.day BETWEEN $5::date AND $6::date ORDER BY d.platform,d.ad_id,d.pulled_at DESC
), valid_index AS MATERIALIZED (
 SELECT i.* FROM web_creative_index i WHERE i.workspace_id=$1 AND i.brand_key=ANY($4::text[]) AND (
 i.source_type='legacy' AND i.source_version=(SELECT legacy_generation FROM web_creative_index_state WHERE workspace_id=$1)
 OR i.source_type='official' AND EXISTS(SELECT 1 FROM watchlists w WHERE w.id=i.watchlist_id AND w.workspace_id=$1 AND w.brand_key=i.brand_key AND w.revision=i.revision AND w.page_ids @> to_jsonb(ARRAY[i.page_id])))
), legacy_index AS MATERIALIZED (SELECT * FROM valid_index WHERE source_type='legacy'), chosen AS (
 SELECT DISTINCT ON(brand_key,platform,native_id) * FROM valid_index ORDER BY brand_key,platform,native_id,CASE WHEN source_type='official' THEN 0 ELSE 1 END
), merged AS (
 SELECT b.brand_key,b.platform,b.native_id,b.source_type,b.watchlist_id,b.page_id,
  (b.data || COALESCE(l.data,'{}'::jsonb) || jsonb_build_object(
   'copy',COALESCE(NULLIF(l.data->>'copy',''),b.data->>'copy',''),
   'cardTitle',b.data->'cardTitle','versionsCopyKey',b.data->'versionsCopyKey','versionsHashKey',b.data->'versionsHashKey',
   'searchText',concat(l.data->>'searchText',E'\\n',b.data->>'searchText'),
   'publicEvidence',b.source_type='official' OR COALESCE((b.data->>'publicEvidence')::boolean,false),
   'publicReach',COALESCE(NULLIF(b.data->'publicReach','null'),l.data->'publicReach'),
   'publicDetails',COALESCE(NULLIF(b.data->'publicDetails','null'),l.data->'publicDetails'),
   'observedAt',greatest(b.data->>'observedAt',l.data->>'observedAt'),
   'firstObservedAt',COALESCE(l.data->>'firstObservedAt',b.data->>'firstObservedAt'),
   'deliveryStartAt',COALESCE(b.data->>'deliveryStartAt',l.data->>'deliveryStartAt'),
   'deliveryStopAt',COALESCE(b.data->>'deliveryStopAt',l.data->>'deliveryStopAt'),
   'deliveryStatus',CASE WHEN b.data->>'deliveryStopAt' IS NOT NULL AND COALESCE(b.data->>'observedAt','')>=COALESCE(l.data->>'observedAt','') THEN 'inactive' ELSE COALESCE(l.data->>'deliveryStatus',b.data->>'deliveryStatus','unknown') END,
   'daysRunning',COALESCE(NULLIF(l.data->'daysRunning','null'),b.data->'daysRunning'),
   'adFormat',CASE WHEN s.media_format='catalogue' THEN 'catalogue' ELSE COALESCE(b.data->>'adFormat',l.data->>'adFormat',CASE s.media_format WHEN 'image' THEN 'static_image' ELSE s.media_format END) END,
   'productCategories',COALESCE(b.data->'productCategories',l.data->'productCategories','[]'::jsonb)
  )) AS data,COALESCE(l.has_analysis,b.has_analysis) AS has_analysis,COALESCE(l.claims,b.claims) AS claims,COALESCE(l.cta,b.cta) AS cta,COALESCE(l.talking,b.talking) AS talking,
  COALESCE(s.image,false) OR COALESCE(l.data->>'thumbnailUrl',CASE WHEN b.source_type='legacy' THEN b.data->>'thumbnailUrl' END) IS NOT NULL AS image,
  COALESCE(s.video,false) OR COALESCE(l.data->>'videoUrl',CASE WHEN b.source_type='legacy' THEN b.data->>'videoUrl' END) IS NOT NULL AS video,
  COALESCE(s.uk_reach,(SELECT sum((entry->>'reach')::bigint) FROM jsonb_array_elements(COALESCE(NULLIF(b.data#>'{publicReach,locations,value}','null'),'[]'))entry WHERE entry->>'country'='GB')) AS uk_reach
 FROM chosen b LEFT JOIN legacy_index l ON b.source_type='official' AND l.brand_key=b.brand_key AND l.platform=b.platform AND l.native_id=b.native_id
 LEFT JOIN state s ON s.brand_key=b.brand_key AND s.native_id=b.native_id AND b.platform IN ('Meta','Facebook','Instagram')
), objects AS (
 SELECT b.data||CASE WHEN n.ad_id IS NOT NULL THEN '{"owned":true,"sourceKind":"owned","hasReporting":true}'::jsonb ELSE '{}'::jsonb END AS data,b.brand_key,b.platform,b.native_id,b.source_type,b.image,b.video,b.uk_reach,b.has_analysis,b.claims,b.cta,b.talking
 FROM merged b LEFT JOIN owned_names n ON b.brand_key=$1 AND n.platform=b.platform AND n.ad_id=b.native_id
 UNION ALL
 SELECT '${JSON.stringify(ownedDefaults)}'::jsonb||jsonb_build_object('adId',concat('owned:',$1,':',n.platform,':',n.account,':',n.ad_id),'nativeId',n.ad_id,'brandId',$1,'brandName',$7::text,'platform',n.platform,'title',COALESCE(n.name,concat('Ad ',n.ad_id)),'searchText',COALESCE(n.name,''),'observedAt',to_char(n.pulled_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'sourceUrl',CASE WHEN n.platform='Meta' AND n.ad_id~'^\\d+$' THEN concat('https://www.facebook.com/ads/library/?id=',n.ad_id) END),$1,n.platform,n.ad_id,'owned',false,false,NULL::numeric,false,'[]'::jsonb,NULL::text,NULL::boolean
 FROM owned_names n WHERE NOT EXISTS(SELECT 1 FROM merged b WHERE b.brand_key=$1 AND b.platform=n.platform AND b.native_id=n.ad_id)
), indexed AS MATERIALIZED (
 SELECT *,data->>'adId' AS ad_id,data->>'brandName' AS brand_name,(data->>'workspaceBrand')::boolean AS own,
 (data->>'publicEvidence')::boolean AS public,(data->>'owned')::boolean AS owned,
 data->>'observedAt' AS observed,data->>'deliveryStartAt' AS started,data->>'deliveryStopAt' AS stopped,data->>'deliveryStatus' AS status,
 (data->>'daysRunning')::integer AS days,data->>'adFormat' AS format,COALESCE(NULLIF(data->'productCategories','null'),'[]') AS categories
 FROM objects
)`;
export interface PageQuery extends BrowserFilters {screen?:string;offset?:string;limit?:string;previews?:string;chartFormat?:string;window?:string;refs?:string}
function sqlQuery(pool:Pick<pg.Pool,"query">,sql:string,values:unknown[]){const indexes=new Map<number,number>(),args:unknown[]=[];const text=sql.replace(/\$(\d+)\b/g,(_s,n)=>{const key=Number(n);if(!indexes.has(key)){indexes.set(key,indexes.size+1);args.push(values[key-1]);}return `$${indexes.get(key)}`;});return pool.query(text,args);}
const knownValue=(v:string|undefined)=>v&&v!=="all"?v:null;
export async function readCreativePage(pool:pg.Pool,brand:Brand,competitors:CreativeBrowserResponse["competitors"],query:PageQuery,now=new Date()):Promise<{rows:BrowserCreative[];model:CreativeReadModel;dateRange:CreativeBrowserResponse["dateRange"];lastChecked:string|null}> {
 const targets=[brand.id,...competitors.map(c=>c.brandId||c.key)],values:unknown[]=[brand.id,null,now,targets,query.from||new Date(now.getTime()-29*86400000).toISOString().slice(0,10),query.to||now.toISOString().slice(0,10),brand.name];
 const param=(v:unknown)=>{values.push(v);return `$${values.length}`;};
 const client=await pool.connect();
 try{
 await client.query("BEGIN");
 if(query.window==='research'){
  const latest=(await client.query(`SELECT max(i.data->>'observedAt') AS last FROM web_creative_index i WHERE i.workspace_id=$1 AND i.brand_key=ANY($2::text[]) AND COALESCE((i.data->>'publicEvidence')::boolean,false) AND (i.data->>'observedAt')::timestamptz<=$3::timestamptz AND (i.source_type='official' AND EXISTS(SELECT 1 FROM watchlists w WHERE w.id=i.watchlist_id AND w.revision=i.revision AND w.page_ids @> to_jsonb(ARRAY[i.page_id])) OR i.source_type='legacy' AND i.source_version=(SELECT legacy_generation FROM web_creative_index_state WHERE workspace_id=$1))`,[brand.id,targets,now])).rows[0].last;
  const reporting=researchWindow(latest?[{publicEvidence:true,observedAt:latest} as BrowserCreative]:[],query.from,query.to,now);if(reporting.from&&reporting.to){values[4]=reporting.from;values[5]=reporting.to;}
 }
 // Use complete hash joins for the metadata relation, then read its small
 // groups and pages. Fresh cache statistics must never cause row-squared scans.
 await client.query("SET LOCAL enable_nestloop=off; SET LOCAL enable_mergejoin=off; SET LOCAL jit=off; SET LOCAL statement_timeout='30s'");
 await sqlQuery(client,`CREATE TEMP TABLE web_page_rows ON COMMIT DROP AS ${INDEX_ROWS_SQL} SELECT * FROM indexed`,values);
 await client.query('ANALYZE web_page_rows');
 const base='WITH indexed AS (SELECT * FROM web_page_rows)';
 const readSummary=async()=>(await sqlQuery(client,`${base} SELECT count(*)::integer AS total,count(*) FILTER(WHERE own)::integer AS yours,count(*) FILTER(WHERE public)::integer AS ads,count(*) FILTER(WHERE public AND image)::integer AS images,count(*) FILTER(WHERE public AND video)::integer AS videos,
 count(*) FILTER(WHERE public AND jsonb_array_length(categories)>0)::integer AS tagged,count(*) FILTER(WHERE public AND format IS NOT NULL)::integer AS "formatKnown",count(*) FILTER(WHERE own AND owned)::integer AS owned,count(*) FILTER(WHERE source_type='official')::integer AS official,
 min(data->>'firstObservedAt') AS first,max(observed) AS last,max(observed) FILTER(WHERE public AND observed::timestamptz<=$3::timestamptz) AS public_last FROM indexed`,values)).rows[0];
 let summary=await readSummary();
 const window=researchWindow(summary.public_last?[{publicEvidence:true,observedAt:summary.public_last} as BrowserCreative]:[],query.from,query.to,now);
 const from=param(window.from),to=param(window.to),previousFrom=param(window.previousFrom),previousTo=param(window.previousTo),asOf=param(window.asOf),primary=primaryCategories(brand);
 const category=knownValue(query.category)||(["overview","competitors","formats","patterns","winners","briefs"].includes(query.screen||"")?"mine":"all");
 const categories=category==="mine"?primary:category==="all"?null:category.split(",");
 const cat=categories?`categories ?| ${param(categories)}::text[]`:"true",format=knownValue(query.adFormat),fmt=format&&format!=="same"?`format=${param(format)}`:"true";
 const platform=knownValue(query.platform)?`platform=${param(query.platform)}`:"true";
 const scope=`(${platform}) AND public AND observed IS NOT NULL AND left(observed,10)<=${asOf} AND (${cat}) AND (${fmt}) AND jsonb_array_length(categories)>0 AND format IS NOT NULL`;
 const cohortSql=`${base}, comparable AS (SELECT * FROM indexed WHERE ${scope})`;
 const cohorts=(await sqlQuery(client,`${cohortSql} SELECT format,count(*) FILTER(WHERE own)::integer AS yours,count(*) FILTER(WHERE NOT own)::integer AS competitors FROM comparable GROUP BY format ORDER BY yours DESC,competitors DESC,array_position(ARRAY['video','static_image','carousel','catalogue'],format)`,values)).rows.map(r=>({...r,hidden:r.yours<10&&r.competitors<10}));
 const fallback=query.screen==="winners"&&!cohorts.some(c=>!c.hidden);
 const groupedSql=`${cohortSql}, grouped AS (SELECT *,format AS group_format FROM comparable UNION ALL SELECT *, 'all' AS group_format FROM indexed WHERE (${platform}) AND public AND observed IS NOT NULL AND left(observed,10)<=${asOf})`;
 const groupedScopeSql=groupedSql+`, scoped AS (SELECT * FROM grouped UNION ALL SELECT *, 'scope' AS group_format FROM comparable WHERE format=ANY(${param(cohorts.filter(c=>!c.hidden).map(c=>c.format))}::text[]))`;
 const stats=(await sqlQuery(client,`${groupedScopeSql} SELECT brand_key AS "brandId",group_format AS format,count(*)::integer AS sample,max(observed) AS "lastChecked",
 count(*) FILTER(WHERE status<>'unknown')::integer AS statuses,count(*) FILTER(WHERE status='active')::integer AS active,count(*) FILTER(WHERE started IS NOT NULL)::integer AS starts,
 count(*) FILTER(WHERE left(started,10) BETWEEN ${from} AND ${to})::integer AS launches,count(*) FILTER(WHERE left(started,10) BETWEEN ${previousFrom} AND ${previousTo})::integer AS "previousLaunches",
 count(*) FILTER(WHERE status='active' OR stopped IS NOT NULL)::integer AS "stopsKnown",count(*) FILTER(WHERE status='inactive' AND left(stopped,10) BETWEEN ${from} AND ${to})::integer AS stopped,
 count(days)::integer AS "daysKnown",percentile_cont(.5) WITHIN GROUP(ORDER BY days) AS "medianDays",count(uk_reach)::integer AS "ukKnown",sum(uk_reach)::float8 AS "ukReach" FROM scoped GROUP BY brand_key,group_format`,values)).rows;
 const optionsRow=(await sqlQuery(client,`${base} SELECT jsonb_build_object('brands',COALESCE(jsonb_agg(DISTINCT jsonb_build_object('value',brand_key,'label',brand_name)),'[]'),
 'platforms',COALESCE(jsonb_agg(DISTINCT platform),'[]'),'formats',COALESCE(jsonb_agg(DISTINCT data->>'creativeFormat') FILTER(WHERE data->>'creativeFormat' IS NOT NULL),'[]'),
 'hooks',COALESCE(jsonb_agg(DISTINCT data->>'hookType') FILTER(WHERE data->>'hookType' IS NOT NULL),'[]'),'angles',COALESCE(jsonb_agg(DISTINCT data->>'angle') FILTER(WHERE data->>'angle' IS NOT NULL),'[]'),'offers',COALESCE(jsonb_agg(DISTINCT data->>'offerType') FILTER(WHERE data->>'offerType' IS NOT NULL),'[]')) AS options FROM indexed`,values)).rows[0];
 const conditions:string[]=[];
 if(["overview","winners"].includes(query.screen||""))conditions.push("public",`left(observed,10)<=${asOf}`);
 if(query.screen==="overview"||query.screen==="winners"&&!fallback){conditions.push(scope,`format=ANY(${param(cohorts.filter(c=>!c.hidden).map(c=>c.format))}::text[])`);}
 else if(!fallback){if(categories)conditions.push(cat);if(format&&format!=="same")conditions.push(fmt);}
 if(query.show==="yours")conditions.push("own");if(query.show==="competitors")conditions.push("NOT own");
 for(const [key,col] of [["brand","brand_key"],["platform","platform"],["status","status"],["hook","data->>'hookType'"],["angle","data->>'angle'"],["offer","data->>'offerType'"]] as const)if(knownValue(query[key]))conditions.push(`${col}=${param(query[key])}`);
 if(knownValue(query.format))conditions.push(`(data->>'creativeFormat'=${param(query.format)} OR data->>'mediaKind'=${param(query.format)})`);
 if(query.ad&&query.screen!=='detail')conditions.push(`(ad_id=${param(query.ad)} OR native_id=${param(query.ad)})`);
 if(query.ugc&&query.ugc!=="all")conditions.push(query.ugc==="unknown"?"data->>'ugc' IS NULL":`(data->>'ugc')::boolean=${param(query.ugc==="yes")}`);
 if(query.search?.trim())conditions.push(`strpos(lower(data->>'searchText'),lower(${param(query.search.trim())}))>0`);
 if(!query.screen||query.screen==="creatives"||query.screen==="detail"){
  if(query.from)conditions.push(`(COALESCE((data->>'hasReporting')::boolean,false) OR left(observed,10)>=${param(query.from)})`);if(query.to)conditions.push(`(COALESCE((data->>'hasReporting')::boolean,false) OR left(observed,10)<=${param(query.to)})`);
 }
 if(query.asOf)conditions.push(`public AND left(observed,10)<=${param(query.asOf)}`);
 if(query.kind==="active")conditions.push("status='active' AND observed IS NOT NULL");
 if(query.kind==="running"||query.screen==="overview"||query.screen==="winners"&&!fallback)conditions.push("days IS NOT NULL");
 if(query.kind==="analysed")conditions.push("has_analysis");if(query.kind==="unanalysed")conditions.push("NOT has_analysis");if(query.kind==="talking")conditions.push("talking IS TRUE");
 if(query.screen==='scores')conditions.push("data->'score' IS NOT NULL AND data->'score'<>'null'::jsonb");
 if(query.screen==='briefs'&&query.refs){const refs=JSON.parse(query.refs);if(!Array.isArray(refs)||refs.length>100||refs.some(v=>typeof v!=='string'||v.length>200))throw new Error('Choose a bounded set of brief ads.');conditions.push(`(ad_id=ANY(${param(refs)}::text[]) OR native_id=ANY(${param(refs)}::text[]))`);}
 if(query.kind==="launches"||query.kind==="stopped")conditions.push(`${query.kind==="launches"?"left(started,10)":"left(stopped,10)"} BETWEEN ${param(query.activityFrom||null)} AND ${param(query.activityTo||null)}`,"observed IS NOT NULL",...(query.kind==="stopped"?["status='inactive'"]:[]));
 if(query.dimension&&query.value){const col=({format:"creativeFormat",hook:"hookType",angle:"angle",offer:"offerType"} as Record<string,string>)[query.dimension];if(col)conditions.push(query.value==="classified"?`data->>'${col}' IS NOT NULL`:query.value==="unclassified"?`data->>'${col}' IS NULL`:`data->>'${col}'=${param(query.value)}`);else if(query.dimension==="claim")conditions.push(query.value==="classified"?"jsonb_array_length(claims)>0":query.value==="unclassified"?"jsonb_array_length(claims)=0":`claims ? ${param(query.value)}`);}
 if(query.reachCountry)conditions.push(query.reachCountry==="GB"?"uk_reach IS NOT NULL":`EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NULLIF(data#>'{publicReach,locations,value}','null'),'[]'))c WHERE c->>'country'=${param(query.reachCountry)})`);
 if(query.demographicCountry)conditions.push(`EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NULLIF(data#>'{publicReach,demographics,value}','null'),'[]'))c WHERE c->>'country'=${param(query.demographicCountry)}${query.reachAge?` AND c->>'age'=${param(query.reachAge)}`:''}${query.reachGender?` AND c->>'gender'=${param(query.reachGender)}`:''})`);
 if(query.cohort){const cohort=JSON.parse(query.cohort);if(!Array.isArray(cohort)||cohort.length!==5||!cohort.every(s=>typeof s==='string'))throw new Error('Choose a reporting scope.');conditions.push(`own AND EXISTS(SELECT 1 FROM owned_ad_days d JOIN owned_accounts a ON a.id=d.owned_account_id WHERE a.workspace_id=$1 AND d.platform=indexed.platform AND d.ad_id=indexed.native_id AND d.day BETWEEN $5::date AND $6::date AND jsonb_build_array(d.platform,d.data->>'accountId',d.currency,d.attribution,d.conversion_event)=${param(query.cohort)}::jsonb)`);}
 if(query.similarTo){const anchor=(await sqlQuery(client,`${base} SELECT * FROM indexed WHERE ad_id=${param(query.similarTo)} LIMIT 1`,values)).rows[0];if(anchor?.format&&anchor.categories.length)conditions.push(`NOT own AND NOT owned AND format=${param(anchor.format)} AND categories ?| ${param(anchor.categories)}::text[]`);else conditions.push('false');}
 const where=conditions.length?conditions.join(" AND "):"true",onlyPreviews=query.screen==="winners"&&query.previews!=="all";
 const limit=Math.min(100,Math.max(1,Number(query.limit)||50)),offset=Math.max(0,Number(query.offset)||0);
 if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(offset)||offset>10000000)throw new Error("Choose a valid page.");
 const order=query.screen==='scores'?"data#>>'{score,analysedAt}' DESC NULLS LAST,ad_id":query.sort==="likelihood"?"(data#>>'{likelihood,probability}')::float8 DESC NULLS LAST,ad_id":query.sort==="title"?"lower(COALESCE(data->>'cardTitle',data->>'copy',data->>'title')) COLLATE \"C\",ad_id":query.take||query.sort==="days"||["overview","winners"].includes(query.screen||"")?"days DESC NULLS LAST,ad_id":"observed DESC NULLS LAST,ad_id";
 const take=Number(query.take);if(query.take&&(!Number.isInteger(take)||take<1||take>100))throw new Error('Choose a valid sample.');
 const measure=query.measure==='duration'?" AND data->>'mediaKind'='video' AND data->>'durationSeconds' IS NOT NULL":query.measure==='talkingKnown'?" AND talking IS NOT NULL":'';
 const pageSql=`${base}, candidates AS MATERIALIZED(SELECT *,row_number() OVER(PARTITION BY format ORDER BY ${order}) AS format_rank FROM indexed WHERE ${where} ORDER BY ${order}${query.take?` LIMIT ${take}`:''}), filtered AS (SELECT * FROM candidates WHERE ${onlyPreviews?"image":"true"}${query.screen==="overview"?" AND format_rank<=5":""}${measure})`;
 const page=(await sqlQuery(client,`${pageSql} SELECT (SELECT count(*)::integer FROM filtered) AS total,(SELECT count(*)::integer FROM candidates WHERE NOT image) AS missing,
 COALESCE((SELECT jsonb_agg(p.data ORDER BY p.ord) FROM (SELECT data,row_number() OVER(ORDER BY ${order}) AS ord FROM filtered ORDER BY ${order} LIMIT ${param(limit)} OFFSET ${param(offset)})p),'[]') AS rows`,values)).rows[0];
 const model:CreativeReadModel={page:{offset,limit,total:page.total,totalAll:summary.total,hasNext:offset+limit<page.total},coverage:{yours:summary.yours,ads:summary.ads,images:summary.images,videos:summary.videos,tagged:summary.tagged,formatKnown:summary.formatKnown,owned:summary.owned,official:summary.official},window,cohorts,brands:stats,options:optionsRow.options,fallback,previewMissing:page.missing};
 if(query.screen==='detail'&&query.ad){
  const selected=(await sqlQuery(client,`${base} SELECT * FROM indexed WHERE ad_id=${param(query.ad)} OR native_id=${param(query.ad)} ORDER BY own DESC LIMIT 1`,values)).rows[0];
  if(selected){
   const copy=selected.data.versionsCopyKey||null,hash=selected.data.versionsHashKey||null;
   selected.data.publicVersionCount=copy||hash?(await sqlQuery(client,`${base} SELECT count(DISTINCT (CASE WHEN platform IN ('Meta','Facebook','Instagram') THEN 'Meta' ELSE platform END,native_id))::integer AS n FROM indexed WHERE brand_key=${param(selected.brand_key)} AND (NOT owned OR public) AND (data->>'versionsCopyKey'=${param(copy)} OR data->>'versionsHashKey'=${param(hash)})`,values)).rows[0].n:null;
   const neighbours=(await sqlQuery(client,`${base}, ordered AS MATERIALIZED(SELECT *,row_number() OVER(ORDER BY ${order}) AS ord FROM indexed WHERE ${where}) SELECT data FROM ordered WHERE ord BETWEEN (SELECT ord-1 FROM ordered WHERE ad_id=${param(selected.ad_id)} LIMIT 1) AND (SELECT ord+1 FROM ordered WHERE ad_id=${param(selected.ad_id)} LIMIT 1) ORDER BY ord`,values)).rows.map(r=>r.data as BrowserCreative);
   const detailCategory=!query.category||query.category==='mine'?`categories ?| ${param(primary)}::text[]`:cat;
   const similarResult=selected.format&&selected.categories.length?(await sqlQuery(client,`${base}, similar_ads AS MATERIALIZED(SELECT * FROM indexed WHERE public AND NOT own AND NOT owned AND brand_key<>${param(selected.brand_key)} AND format=${param(selected.format)} AND categories ?| ${param(selected.categories)}::text[] AND ${detailCategory}) SELECT (SELECT count(*)::integer FROM similar_ads) AS total,COALESCE((SELECT jsonb_agg(p.data) FROM (SELECT data FROM similar_ads ORDER BY (CASE WHEN data->>'angle'=${param(selected.data.angle||null)} THEN 2 ELSE 0 END+CASE WHEN data->>'offerType'=${param(selected.data.offerType||null)} THEN 1 ELSE 0 END) DESC,days DESC NULLS LAST,ad_id LIMIT 6)p),'[]') AS rows`,values)).rows[0]:{total:0,rows:[]};
   const similar:BrowserCreative[]=similarResult.rows;model.detailSimilarTotal=similarResult.total;
   model.detailOrder=neighbours.length?neighbours.map(r=>r.adId):[selected.ad_id];
   page.rows=[...new Map([...neighbours,...similar,selected.data].map((r:BrowserCreative)=>[r.adId,r])).values()];
  }else page.rows=[];
 }
 if(!['creatives','detail','winners','overview','data'].includes(query.screen||'')){
  const quoted=(items:readonly string[])=>`ARRAY[${items.filter(v=>!['unknown','unsure'].includes(v)).map(v=>`'${v.replaceAll("'","''")}'`).join(',')}]::text[]`;
  const dimensions=[['format','creativeFormat',FORMAT_VALUES],['hook','hookType',HOOK_TYPE_VALUES],['angle','angle',ANGLE_VALUES],['offer','offerType',OFFER_TYPE_VALUES],['claim',null,CLAIM_TYPE_VALUES]] as const;
  const kinds=`CROSS JOIN LATERAL (VALUES('all',true),('active',status='active'),('launches',left(started,10) BETWEEN ${from} AND ${to}),('previousLaunches',left(started,10) BETWEEN ${previousFrom} AND ${previousTo})) k(kind,eligible)`;
  const bucket=`CROSS JOIN LATERAL (SELECT brand_key AS brand UNION ALL SELECT '*' UNION ALL SELECT 'competitors' WHERE NOT own) b`;
  const dimensionValues=dimensions.map(([dim,key,allowed])=>`('${dim}',ARRAY(SELECT v FROM ${key?`unnest(ARRAY[data->>'${key}']) v`:'jsonb_array_elements_text(claims)v'} WHERE v=ANY(${quoted(allowed)})))`).join(',');
  model.dimensions=(await sqlQuery(client,`${groupedScopeSql}, events AS MATERIALIZED (SELECT s.*,b.brand,k.kind FROM scoped s ${kinds} ${bucket} WHERE k.eligible), totals AS (SELECT group_format,brand,kind,count(*)::integer AS sample FROM events GROUP BY group_format,brand,kind), dimensions AS (SELECT e.*,d.dimension,v.value,cardinality(d.labels)>0 AS classified FROM events e CROSS JOIN LATERAL (VALUES ${dimensionValues}) d(dimension,labels) LEFT JOIN LATERAL unnest(d.labels) v(value) ON true), classified AS (SELECT group_format,brand,kind,dimension,count(DISTINCT ad_id) FILTER(WHERE classified)::integer AS classified FROM dimensions GROUP BY group_format,brand,kind,dimension)
  SELECT d.group_format AS format,d.brand AS "brandId",d.kind,d.dimension,d.value,count(*)::integer AS count,t.sample,c.classified,percentile_cont(.5) WITHIN GROUP(ORDER BY days) AS "medianDays" FROM dimensions d JOIN totals t USING(group_format,brand,kind) JOIN classified c USING(group_format,brand,kind,dimension) GROUP BY d.group_format,d.brand,d.kind,d.dimension,d.value,t.sample,c.classified ORDER BY format,"brandId",kind,dimension,count DESC,value`,values)).rows;
  model.audience=(await sqlQuery(client,`${base} SELECT concat(brand_key,':',cell->>'country',':',cell->>'age',':',cell->>'gender') AS key,brand_key AS "brandId",max(brand_name) AS brand,cell->>'country' AS country,cell->>'age' AS age,cell->>'gender' AS gender,sum((cell->>'reach')::double precision) AS reach,count(DISTINCT ad_id)::integer AS ads FROM indexed CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(data#>'{publicReach,demographics,value}','null'),'[]'))cell WHERE public AND (${platform}) AND left(observed,10)<=${asOf} GROUP BY brand_key,cell->>'country',cell->>'age',cell->>'gender'`,values)).rows;
  model.voices=(await sqlQuery(client,`${groupedScopeSql}, phrases AS (
   SELECT group_format,brand_key,'claim' AS kind,v AS value FROM scoped CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(data->'voiceClaims','[]'))v WHERE status='active'
   UNION ALL SELECT group_format,brand_key,'cta',cta FROM scoped WHERE status='active' AND cta IS NOT NULL AND cta<>'unknown'
   UNION ALL SELECT group_format,brand_key,'offer',data->>'offerType' FROM scoped WHERE status='active' AND data->>'offerType'=ANY(${quoted(OFFER_TYPE_VALUES)})
  ), counts AS (SELECT group_format,brand_key,kind,value,count(*) AS n FROM phrases GROUP BY group_format,brand_key,kind,value), ranked AS (SELECT *,row_number() OVER(PARTITION BY group_format,brand_key,kind ORDER BY n DESC,value) AS position FROM counts)
   SELECT group_format AS format,brand_key AS "brandId",max(value) FILTER(WHERE kind='claim') AS claim,max(value) FILTER(WHERE kind='cta') AS cta,max(value) FILTER(WHERE kind='offer') AS offer FROM ranked WHERE position=1 GROUP BY group_format,brand_key`,values)).rows;
  if(query.screen==='formats')model.production=(await sqlQuery(client,`${groupedScopeSql}, ranked AS (SELECT s.*,b.show,row_number() OVER(PARTITION BY group_format,b.show ORDER BY days DESC,ad_id) AS position FROM scoped s CROSS JOIN LATERAL (VALUES('all'),(CASE WHEN own THEN 'yours' ELSE 'competitors' END)) b(show) WHERE days IS NOT NULL), top AS (SELECT * FROM ranked WHERE position<=5) SELECT group_format AS format,show,percentile_cont(.5) WITHIN GROUP(ORDER BY (data->>'durationSeconds')::double precision) FILTER(WHERE data->>'mediaKind'='video') AS duration,count(*) FILTER(WHERE data->>'mediaKind'='video' AND data->>'durationSeconds' IS NOT NULL)::integer AS "durationKnown",(100.0*count(*) FILTER(WHERE talking)/NULLIF(count(talking),0))::float8 AS "talkingShare",count(talking)::integer AS "talkingKnown" FROM top GROUP BY group_format,show`,values)).rows;
 }
 await client.query('COMMIT');
 return {rows:page.rows,model,dateRange:{from:summary.first||null,to:summary.last||null},lastChecked:summary.last||null};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
