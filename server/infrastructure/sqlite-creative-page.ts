import type {DatabaseSync} from "node:sqlite";
import type {Brand} from "../../shared/types.js";
import type {BrowserCreative,CreativeBrowserResponse} from "../../shared/creative-browser.js";
import type {CreativeReadModel,SqlBrandStats} from "../../shared/creative-read-model.js";
import type {PageQuery} from "./creative-pages.js";
import type {CreativeGalleryService} from "../demo/gallery.js";
import {workspaceBrandIds,workspaceAd} from "../demo/reconcile.js";
import {analysedCreatives} from "../demo/service.js";
import {scoreCreative} from "../demo/scores.js";
import {researchWindow} from "../../shared/creative-research.js";
import {creativeTitle} from "../../shared/creative-presentation.js";
import {primaryCategories} from "../../shared/public-comparisons.js";
const generations=new WeakMap<DatabaseSync,Map<string,number>>();
/** Standalone imports keep a narrow temporary index. Raw ads are projected one at a time. */
export async function sqliteCreativePage(db:DatabaseSync,brand:Brand,competitors:CreativeBrowserResponse["competitors"],query:PageQuery,gallery:CreativeGalleryService){
 const targets=[{id:brand.id,name:brand.name},...competitors.filter(c=>c.brandId).map(c=>({id:c.brandId!,name:c.name}))];
 db.exec(`CREATE TEMP TABLE IF NOT EXISTS web_import_index(workspace TEXT,brand TEXT,platform TEXT,native TEXT,id TEXT,data TEXT,PRIMARY KEY(workspace,brand,platform,native))`);
 let cache=generations.get(db);if(!cache){cache=new Map();generations.set(db,cache);}const changes=()=>Number((db.prepare('SELECT total_changes() AS n').get() as {n:number}).n);
 if(cache.get(brand.id)!==changes()){
  db.exec('SAVEPOINT web_import_refresh');
  try{
   db.prepare('DELETE FROM temp.web_import_index WHERE workspace=?').run(brand.id);
   const save=db.prepare('INSERT OR REPLACE INTO temp.web_import_index VALUES(?,?,?,?,?,?)');
   for(const target of targets){const ids=workspaceBrandIds(db,target.id);if(!ids.length)continue;
    for(const input of db.prepare(`SELECT id FROM ads WHERE brand_id IN (${ids.map(()=>'?').join(',')}) AND source<>'sample' ORDER BY id DESC`).iterate(...ids)){
     for(const creative of await gallery.selected(target.id,[String(input.id)])){
      if(target.id!==brand.id&&creative.owned)continue;
      const ad=workspaceAd(db,target.id,creative.adId);let score=null,scoreError=false;try{score=ad?analysedCreatives(db,target.id,[ad]).map(scoreCreative)[0]||null:null;}catch{scoreError=true;}
      const row:BrowserCreative={...creative,placements:creative.placements||[],platform:creative.platform||'Unavailable',workspaceBrand:target.id===brand.id,owned:target.id===brand.id&&creative.owned===true,publicEvidence:!creative.owned,sourceKind:creative.owned?'owned':'public',score,scoreError,performance:[],scenes:creative.scenes||[]};
      // Analysis is hydrated only for selected IDs below.
      save.run(brand.id,target.id,row.platform,row.nativeId,row.adId,JSON.stringify({...row,cardTitle:creativeTitle(row),hasAnalysis:Boolean(row.analysis),analysis:null,creatorEvidence:[],scenes:[]}));
     }
    }
   }
   db.exec('RELEASE web_import_refresh');cache.set(brand.id,changes());
  }catch(error){db.exec('ROLLBACK TO web_import_refresh; RELEASE web_import_refresh');throw error;}
 }
 const params:(string|number)[]=[brand.id],bind=(value:string|number)=>{params.push(value);return '?';};
 const base=`WITH indexed AS (SELECT *,json_extract(data,'$.observedAt') AS observed,json_extract(data,'$.deliveryStartAt') AS started,json_extract(data,'$.deliveryStopAt') AS stopped,json_extract(data,'$.deliveryStatus') AS status,json_extract(data,'$.daysRunning') AS days,json_extract(data,'$.owned') AS owned,json_extract(data,'$.publicEvidence') AS public,json_extract(data,'$.workspaceBrand') AS own,json_extract(data,'$.adFormat') AS format FROM temp.web_import_index WHERE workspace=?)`;
 const summary=db.prepare(`${base} SELECT count(*) AS total,sum(own) AS yours,sum(public) AS ads,sum(owned) AS owned,sum(public AND json_extract(data,'$.thumbnailUrl') IS NOT NULL) AS images,sum(public AND json_extract(data,'$.videoUrl') IS NOT NULL) AS videos,sum(public AND json_array_length(data,'$.productCategories')>0) AS tagged,sum(public AND format IS NOT NULL) AS known,min(json_extract(data,'$.firstObservedAt')) AS first,max(observed) AS last,max(CASE WHEN public THEN observed END) AS public_last FROM indexed`).get(...params) as any;
 const window=researchWindow(summary.public_last?[{publicEvidence:true,observedAt:summary.public_last} as BrowserCreative]:[],query.from,query.to),conditions:string[]=[];
 if(query.show==='yours')conditions.push('own');if(query.show==='competitors')conditions.push('NOT own');
 for(const [key,column] of [['brand','brand'],['platform','platform'],['status','status'],['adFormat','format']] as const)if(query[key]&&!['all','same'].includes(query[key]!)&&!(key==='adFormat'&&query.screen==='winners'))conditions.push(`${column}=${bind(query[key]!)}`);
 if(query.ad)conditions.push(`(id=${bind(query.ad)} OR native=${bind(query.ad)})`);
 if(query.screen==='briefs'&&query.refs){const refs=JSON.parse(query.refs);if(!Array.isArray(refs)||refs.length>100||refs.some(v=>typeof v!=='string'))throw new Error('Choose a bounded set of brief ads.');conditions.push(`(id IN (${refs.map(v=>bind(v)).join(',')||'NULL'}) OR native IN (${refs.map(v=>bind(v)).join(',')||'NULL'}))`);}
 if(query.search)conditions.push(`instr(lower(json_extract(data,'$.searchText')),lower(${bind(query.search)}))>0`);
 for(const [key,path] of [['format','creativeFormat'],['hook','hookType'],['angle','angle'],['offer','offerType']] as const)if(query[key]&&query[key]!=='all')conditions.push(`json_extract(data,'$.${path}')=${bind(query[key]!)}`);
 if(query.ugc&&query.ugc!=='all')conditions.push(query.ugc==='unknown'?"json_extract(data,'$.ugc') IS NULL":`json_extract(data,'$.ugc')=${bind(query.ugc==='yes'?1:0)}`);
 const cats=query.category==='mine'?primaryCategories(brand):query.category&&query.category!=='all'?query.category.split(','):null;
 if(cats&&query.screen!=='winners')conditions.push(`EXISTS(SELECT 1 FROM json_each(data,'$.productCategories') WHERE value IN (${cats.map(v=>bind(v)).join(',')||'NULL'}))`);
 if(query.kind==='active')conditions.push("status='active' AND observed IS NOT NULL");if(query.kind==='running')conditions.push('days IS NOT NULL AND observed IS NOT NULL');
 if(query.screen==='scores')conditions.push("json_type(data,'$.score')='object'");
 if(query.kind==='analysed'||query.kind==='unanalysed')conditions.push(`json_extract(data,'$.hasAnalysis')=${query.kind==='analysed'?1:0}`);
 if(query.asOf)conditions.push(`public AND substr(observed,1,10)<=${bind(query.asOf)}`);
 if(query.kind==='launches'||query.kind==='stopped')conditions.push(`substr(${query.kind==='launches'?'started':'stopped'},1,10) BETWEEN ${bind(query.activityFrom||'')} AND ${bind(query.activityTo||'')}`,"observed IS NOT NULL",...(query.kind==='stopped'?["status='inactive'"]:[]));
 if(query.screen==='winners'||query.screen==='overview')conditions.push('public');
 if(!query.screen||['creatives','detail'].includes(query.screen)){if(query.from)conditions.push(`(substr(observed,1,10)>=${bind(query.from)})`);if(query.to)conditions.push(`(substr(observed,1,10)<=${bind(query.to)})`);}
 const beforePreview=conditions.join(' AND ')||'1';
 const previewMissing=query.screen==='winners'?(db.prepare(`${base} SELECT count(*) AS n FROM indexed WHERE ${beforePreview} AND json_extract(data,'$.thumbnailUrl') IS NULL AND COALESCE(json_array_length(data,'$.imageUrls'),0)=0`).get(...params) as {n:number}).n:0;
 if(query.screen==='winners'&&query.previews!=='all')conditions.push("(json_extract(data,'$.thumbnailUrl') IS NOT NULL OR json_array_length(data,'$.imageUrls')>0)");
 const where=conditions.join(' AND ')||'1',limit=Math.min(100,Math.max(1,Number(query.limit)||50)),offset=Math.max(0,Number(query.offset)||0);
 if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(offset))throw new Error('Choose a valid page.');
 const total=(db.prepare(`${base} SELECT count(*) AS n FROM indexed WHERE ${where}`).get(...params) as {n:number}).n;
 const order=query.screen==='scores'?"json_extract(data,'$.score.analysedAt') DESC,id":query.sort==='days'||query.screen==='winners'||query.screen==='overview'?'days DESC,id':query.sort==='title'?"lower(json_extract(data,'$.cardTitle')),id":'observed DESC,id';
 const selected=db.prepare(`${base} SELECT id,brand,data FROM indexed WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params,limit,offset) as {id:string;brand:string;data:string}[];
 const rows:BrowserCreative[]=[];
 for(const target of targets){const records=selected.filter(r=>r.brand===target.id),rich=new Map((await gallery.selected(target.id,records.map(r=>r.id))).map(r=>[r.adId,r]));for(const record of records){const row=JSON.parse(record.data) as BrowserCreative,r=rich.get(record.id);rows.push(r?{...row,analysis:r.analysis,creatorEvidence:r.creatorEvidence,scenes:r.scenes||[]}:row);}}
 rows.sort((a,b)=>selected.findIndex(r=>r.id===a.adId)-selected.findIndex(r=>r.id===b.adId));
 const unique=(key:string)=>{const field=({platform:'platform',style:"json_extract(data,'$.creativeFormat')",hook:"json_extract(data,'$.hookType')",angle:"json_extract(data,'$.angle')",offer:"json_extract(data,'$.offerType')"} as Record<string,string>)[key];return (db.prepare(`${base} SELECT DISTINCT ${field} AS value FROM indexed WHERE ${field} IS NOT NULL ORDER BY value LIMIT 100`).all(brand.id) as {value:string}[]).map(r=>r.value);};
 const stats=db.prepare(`${base}, ranked AS (SELECT *,row_number() OVER(PARTITION BY brand ORDER BY days IS NULL,days) AS position,count(days) OVER(PARTITION BY brand) AS known FROM indexed WHERE public AND observed IS NOT NULL AND substr(observed,1,10)<=?) SELECT brand AS brandId,'all' AS format,count(*) AS sample,max(observed) AS lastChecked,sum(status<>'unknown') AS statuses,sum(status='active') AS active,sum(started IS NOT NULL) AS starts,sum(substr(started,1,10) BETWEEN ? AND ?) AS launches,sum(substr(started,1,10) BETWEEN ? AND ?) AS previousLaunches,sum(status='active' OR stopped IS NOT NULL) AS stopsKnown,sum(status='inactive' AND substr(stopped,1,10) BETWEEN ? AND ?) AS stopped,count(days) AS daysKnown,avg(CASE WHEN position IN ((known+1)/2,(known+2)/2) THEN days END) AS medianDays,0 AS ukKnown,NULL AS ukReach FROM ranked GROUP BY brand`).all(brand.id,window.asOf||'',window.from||'',window.to||'',window.previousFrom||'',window.previousTo||'',window.from||'',window.to||'') as unknown as SqlBrandStats[];
 const model:CreativeReadModel={page:{offset,limit,total,totalAll:summary.total,hasNext:offset+limit<total},coverage:{yours:summary.yours||0,ads:summary.ads||0,images:summary.images||0,videos:summary.videos||0,tagged:summary.tagged||0,formatKnown:summary.known||0,owned:summary.owned||0,official:0},window,cohorts:[],brands:stats,options:{brands:targets.map(t=>({value:t.id,label:t.name})),platforms:unique('platform'),formats:unique('style'),hooks:unique('hook'),angles:unique('angle'),offers:unique('offer')},fallback:query.screen==='winners',previewMissing};
 return {rows,model,dateRange:{from:summary.first||summary.last||null,to:summary.last||null},lastChecked:summary.last||null};
}
