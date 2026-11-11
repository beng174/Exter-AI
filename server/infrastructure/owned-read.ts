import type pg from "pg";
import {OWNED_METRIC_RULES,type MetricName,type OwnedMetric} from "../../shared/owned-metrics.js";
import type {BrowserCreative,CreativePerformance} from "../../shared/creative-browser.js";
const field=(name:string)=>`(data->>'${name}')::double precision`;
const measures=Object.entries(OWNED_METRIC_RULES).map(([name,rule])=>{
 const eligible=[rule.numerator,rule.denominator,rule.minimum?.[0]].filter(Boolean).map(key=>`${field(key!)} IS NOT NULL`).join(' AND ');
 const used=`count(*) FILTER(WHERE ${eligible})`,denom=rule.denominator?`sum(${field(rule.denominator)}) FILTER(WHERE ${eligible})`:'1',sum=`sum(${field(rule.numerator)}) FILTER(WHERE ${eligible})`;
 const available=rule.reported?`count(*)=1 AND ${used}=1`:`${used}>0 AND ${denom}<>0${rule.minimum?` AND sum(${field(rule.minimum[0])}) FILTER(WHERE ${eligible})>=${rule.minimum[1]}`:''}`;
 const early=rule.minimum?`${used}>0 AND sum(${field(rule.minimum[0])}) FILTER(WHERE ${eligible})<${rule.minimum[1]}`:'false';
 return `'${name}',jsonb_build_object('value',CASE WHEN ${available} THEN ${rule.reported?sum:`${sum}/${denom}*${rule.scale||1}`} END,'status',CASE WHEN ${available} THEN 'available' WHEN ${early} THEN 'too early' ELSE 'unavailable' END,'rowsUsed',${rule.reported?`CASE WHEN ${available} THEN 1 ELSE 0 END`:used},'rowsExcluded',count(*)-${rule.reported?`CASE WHEN ${available} THEN 1 ELSE 0 END`:used})`;
}).join(',');
/** Account-period benchmarks stay in SQL. Only the page's ad aggregates cross the wire. */
export async function ownedPagePerformance(pool:pg.Pool,workspace:string,rows:BrowserCreative[],from:string,to:string){
 const result=await pool.query(`WITH days AS (
 SELECT DISTINCT ON(d.platform,d.data->>'accountId',d.currency,d.attribution,d.conversion_event,d.ad_id,d.day)
 d.platform,d.data->>'accountId' AS account,d.currency,d.attribution,d.conversion_event,d.ad_id,d.pulled_at,d.data
 FROM owned_ad_days d JOIN owned_accounts a ON a.id=d.owned_account_id WHERE a.workspace_id=$1 AND d.day BETWEEN $2::date AND $3::date
 ORDER BY d.platform,d.data->>'accountId',d.currency,d.attribution,d.conversion_event,d.ad_id,d.day,d.pulled_at DESC
 ), groups AS (
 SELECT platform,account,currency,attribution,conversion_event,ad_id,false AS benchmark,data,pulled_at FROM days WHERE ad_id=ANY($4::text[])
 UNION ALL SELECT platform,account,currency,attribution,conversion_event,NULL,true,data,pulled_at FROM days
 ) SELECT platform,account,currency,attribution,conversion_event,ad_id,benchmark,count(DISTINCT data->>'adId')::integer AS sample,max(pulled_at) AS checked,jsonb_build_object(${measures}) AS metrics
 FROM groups GROUP BY platform,account,currency,attribution,conversion_event,ad_id,benchmark ORDER BY platform,account,currency,attribution,conversion_event,ad_id`,[workspace,from,to,rows.filter(r=>r.workspaceBrand).map(r=>r.nativeId)]);
 const key=(r:Record<string,any>)=>JSON.stringify([r.platform,r.account,r.currency,r.attribution,r.conversion_event]);
 const benchmarks=new Map(result.rows.filter(r=>r.benchmark).map(r=>[key(r),r]));
 const enriched=rows.map(row=>{if(!row.workspaceBrand)return {...row,performance:[]};const matches=result.rows.filter(r=>!r.benchmark&&r.platform===row.platform&&r.ad_id===row.nativeId);
 const performance:CreativePerformance[]=matches.map(r=>{const b=benchmarks.get(key(r))!;return {id:key(r),accountId:r.account,platform:r.platform,currency:r.currency,attribution:r.attribution,conversionEvent:r.conversion_event,from,to,lastChecked:new Date(r.checked).toISOString(),benchmarkSampleSize:b.sample,metrics:r.metrics as Record<MetricName,OwnedMetric>,benchmark:b.metrics};});
 return {...row,...(performance.length?{owned:true,sourceKind:'owned' as const}:{}),performance};});
 const scopes:CreativePerformance[]=[...benchmarks.values()].map(r=>({id:key(r),accountId:r.account,platform:r.platform,currency:r.currency,attribution:r.attribution,conversionEvent:r.conversion_event,from,to,lastChecked:new Date(r.checked).toISOString(),benchmarkSampleSize:r.sample,metrics:r.metrics,benchmark:r.metrics}));
 return {rows:enriched,scopes};
}
