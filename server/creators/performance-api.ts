import {randomUUID} from 'node:crypto';
import type {Express,Request,Response} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import type pg from 'pg';
import {z} from 'zod';
import {readBrand} from '../db.js';
import {infrastructureDatabase} from '../infrastructure/database.js';
import {protectSettingsMutation} from '../request-guard.js';
import {creatorHandle} from '../../shared/creator-discovery.js';
import {CREATOR_HISTORY_HEADER,historyCampaigns,creatorCohort,type CreatorCampaign} from '../../shared/creator-campaigns.js';
import {salesFeatures} from '../../shared/creator-performance.js';
import {creatorForecastGate,validateCreatorForecast,trainCreatorForecast,predictCreatorRoas,type CreatorForecastModel} from '../../shared/creator-forecast.js';
import type {CreatorAccount,CreatorOwnedResult,CreatorPerformanceWorkspace} from '../../shared/creator-performance-workspace.js';
import {OWNED_METRICS_SQL} from '../infrastructure/owned-read.js';
import {creatorEvidencePage,creatorModelRows,performanceHash,saveCreatorCampaigns} from './performance-store.js';
import {ensureAccuracy} from '../accuracy/store.js';
const scopeSchema=z.object({account:z.string().trim().min(1).max(100),currency:z.string().regex(/^[A-Z]{3}$/),attribution:z.string().trim().min(1).max(100),event:z.string().trim().min(1).max(100),category:z.string().trim().min(1).max(160),product:z.string().trim().min(1).max(160)}).strict();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
class InputError extends Error{}
export async function creatorOwnedOutcomes(p:Pick<pg.Pool,'query'>,workspace:string,handle:string,from:string,to:string):Promise<CreatorOwnedResult[]>{
 const result=await p.query(`SELECT a.account_id AS account,a.platform,d.currency,d.attribution,d.conversion_event AS event,l.category,l.product,l.format,min(d.day)::text AS "from",max(d.day)::text AS "to",count(DISTINCT d.ad_id)::integer ads,max(d.pulled_at) AS checked,jsonb_build_object(${OWNED_METRICS_SQL}) metrics
 FROM creator_owned_links l JOIN owned_accounts a ON a.id=l.owned_account_id AND a.workspace_id=l.workspace_id
 JOIN owned_ad_days d ON d.owned_account_id=a.id AND d.platform=a.platform AND d.ad_id=l.ad_id AND d.currency=a.currency AND d.attribution=a.attribution AND d.conversion_event=a.conversion_event
 WHERE l.workspace_id=$1 AND l.handle=$2 AND a.platform='Meta' AND a.last_successful_sync IS NOT NULL AND d.day BETWEEN $3::date AND $4::date
 GROUP BY a.account_id,a.platform,d.currency,d.attribution,d.conversion_event,l.category,l.product,l.format ORDER BY a.account_id,l.category,l.product,l.format LIMIT 101`,[workspace,handle,from,to]);
 if(result.rows.length>100)throw new InputError('Choose a shorter own-account reporting window.');return result.rows.map(r=>({...r,checkedAt:new Date(r.checked).toISOString()}));
}
export function attachCreatorPerformance(app:Express,db:DatabaseSync,options:{pool?:pg.Pool;now?:()=>Date;fixture?:boolean}={}){
 ensureAccuracy(db);
 const now=()=>options.now?.()??new Date(),pool=()=>options.pool??(process.env.DATABASE_URL?infrastructureDatabase():null);
 app.use('/api/creator-performance',protectSettingsMutation);
 const route=(handler:(req:Request,res:Response,workspace:string,p:pg.Pool)=>Promise<void>)=>(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','private, no-store');Promise.resolve().then(async()=>{
   const value=req.method==='GET'?req.query.workspaceId:req.body?.workspaceId;
   if(typeof value!=='string'||req.query.demo==='1'||!readBrand(db,value)||readBrand(db,value)!.mode==='demo')throw new InputError('Choose a real workspace.');
   const p=pool();if(!p)throw new InputError('Creator performance needs its database configured.');
   // A supplied credential is never persisted in an import, filter or identity.
   const body=JSON.stringify(req.body??{});if(Object.entries(process.env).some(([key,secret])=>/(TOKEN|API_KEY|PASSWORD|SECRET)$/.test(key)&&secret&&secret.length>=8&&body.includes(secret)))throw new InputError('Remove credentials from the submitted data.');
   await handler(req,res,value,p);
  }).catch(e=>res.status(e instanceof z.ZodError?400:409).json({error:e instanceof InputError?e.message:e instanceof z.ZodError?'Check the campaign fields, handle and date range.':'Creator performance could not be read. Earlier records are unchanged.'}));
 };
 const accounts=async(p:pg.Pool,id:string):Promise<CreatorAccount[]> =>(await p.query('SELECT id,account_id AS "accountId",platform,currency,attribution,conversion_event AS event,status FROM owned_accounts WHERE workspace_id=$1 ORDER BY account_id',[id])).rows;
 async function storedModels(p:pg.Pool,id:string){const rows=(await p.query('SELECT data FROM creator_forecast_models WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',[id])).rows;return [...new Map(rows.map(r=>r.data as CreatorForecastModel).reverse().map(m=>[m.cohort,m])).values()];}
 app.get('/api/creator-performance',route(async(_req,res,id,p)=>{
  const cohorts=(await p.query(`SELECT cohort AS key,count(DISTINCT handle)::integer creators,count(*)::integer campaigns FROM creator_campaign_outcomes WHERE workspace_id=$1 AND data->>'roas' IS NOT NULL GROUP BY cohort ORDER BY cohort LIMIT 100`,[id])).rows;
  const validations=(await p.query('SELECT data FROM creator_forecast_validation WHERE workspace_id=$1',[id])).rows.map(r=>r.data),models=(await storedModels(p,id)).map(m=>{const {residuals,coefficients,trainingIds,calibrationIds,holdoutIds,handles,...rest}=m;return {...rest,validation:validations.find(v=>v.modelVersion===m.version),training:trainingIds.length,calibration:calibrationIds.length,holdout:holdoutIds.length,live:creatorForecastGate(m,validations.find(v=>v.modelVersion===m.version&&v.cohort===m.cohort))};});
  const value:CreatorPerformanceWorkspace={accounts:await accounts(p,id),cohorts:cohorts.map(c=>({...c,label:JSON.parse(c.key).join(' · ')})),models};res.json(value);
 }));
 app.get('/api/creator-performance/creator',route(async(req,res,id,p)=>{
  const handle=creatorHandle(req.query.handle);if(!handle)throw new InputError('Choose a creator handle.');
  const from=day.parse(req.query.from??new Date(now().getTime()-90*86400000).toISOString().slice(0,10)),to=day.parse(req.query.to??now().toISOString().slice(0,10)),offset=z.coerce.number().int().min(0).max(100000).parse(req.query.offset??0);
  if(from>to||Date.parse(to)-Date.parse(from)>366*86400000)throw new InputError('Choose a date range up to one year.');
  await p.query('UPDATE creator_discovery_results SET used_at=now() WHERE workspace_id=$1 AND handle=$2',[id,handle]);
  const signal=(await p.query('SELECT signal FROM creator_sales_current WHERE workspace_id=$1 AND handle=$2',[id,handle])).rows[0]?.signal??null;
  const campaigns=(await p.query("SELECT data-'features'-'featureAt' AS data FROM creator_campaign_outcomes WHERE workspace_id=$1 AND handle=$2 ORDER BY data->>'to' DESC,id LIMIT 100",[id,handle])).rows.map(r=>r.data);
  const validations=(await p.query('SELECT data FROM creator_forecast_validation WHERE workspace_id=$1',[id])).rows.map(r=>r.data),forecasts=[];
  if(signal)for(const m of await storedModels(p,id)){if(String(JSON.parse(m.cohort)[5]).toLowerCase()!==signal.category.toLowerCase())continue;const value=predictCreatorRoas(m,salesFeatures(signal),validations.find(v=>v.modelVersion===m.version&&v.cohort===m.cohort));if(value)forecasts.push({cohort:m.cohort,value});}
  res.json({handle,signal,ads:await creatorEvidencePage(p,id,handle,offset),totalAds:Number((await p.query('SELECT count(DISTINCT (platform,native_id)) n FROM creator_ad_evidence WHERE workspace_id=$1 AND handle=$2',[id,handle])).rows[0].n),owned:await creatorOwnedOutcomes(p,id,handle,from,to),campaigns,forecasts});
 }));
 app.get('/api/creator-performance/template',route(async(_req,res)=>{res.setHeader('Content-Disposition','attachment; filename="creator-campaign-template.csv"');res.type('text/csv').send(CREATOR_HISTORY_HEADER+'\n');}));
 app.post('/api/creator-performance/import',route(async(req,res,id,p)=>{
  const input=z.object({workspaceId:z.string(),csv:z.string().max(1_000_000),scope:scopeSchema}).strict().parse(req.body),brand=readBrand(db,id)!;
  if(input.scope.account!=='reported'&&!(await accounts(p,id)).some(a=>a.accountId===input.scope.account&&a.currency===input.scope.currency&&a.attribution===input.scope.attribution&&a.event===input.scope.event))throw new InputError('Choose an account and its current reporting settings.');
  let rows:CreatorCampaign[];try{rows=historyCampaigns(input.csv,brand.name,input.scope,now().toISOString(),options.fixture);}catch(e){throw new InputError((e as Error).message);}
  // Imported IDs are optional context, never a fabricated owned match or a gate release.
  if(input.scope.account!=='reported'){const known=await accounts(p,id);if(rows.some(r=>!known.some(a=>a.accountId===input.scope.account&&a.platform===(r.platform==='Instagram'?'Meta':r.platform)&&a.currency===input.scope.currency&&a.attribution===input.scope.attribution&&a.event===input.scope.event)))throw new InputError('Campaign platforms must match the selected reporting account.');}
  else if(input.scope.attribution!=='reported'||input.scope.event!=='reported')throw new InputError('Reported campaigns use reported attribution and event settings.');
  if(input.scope.account==='reported'&&rows.some(r=>r.adIds.length))throw new InputError('Select the owned account for campaign ad IDs.');
  for(const row of rows)if(row.adIds.length){const existing=(await p.query('SELECT DISTINCT d.ad_id FROM owned_ad_days d JOIN owned_accounts a ON a.id=d.owned_account_id WHERE a.workspace_id=$1 AND a.account_id=$2 AND a.platform=$3 AND d.ad_id=ANY($4::text[])',[id,input.scope.account,row.platform==='Instagram'?'Meta':row.platform,row.adIds])).rows;if(existing.length!==new Set(row.adIds).size)throw new InputError('Every imported ad ID must belong to the selected account.');}
  try{res.json({inserted:await saveCreatorCampaigns(p,id,rows),rows:rows.length});}catch(e){if(e instanceof Error&&/campaign identifier|deleted/.test(e.message))throw new InputError(e.message);throw e;}
 }));
 app.post('/api/creator-performance/owned',route(async(req,res,id,p)=>{
  const b=z.object({workspaceId:z.string(),handle:z.string().max(31),accountId:z.string().max(100),adIds:z.array(z.string().regex(/^\d{1,40}$/)).min(1).max(100),kind:z.enum(['Partnership','Whitelisted']),category:z.string().min(1).max(160),product:z.string().min(1).max(160),format:z.enum(['video','static_image','carousel','catalogue']),from:day,to:day,campaignId:z.string().regex(/^[\w .:-]{1,100}$/)}).strict().parse(req.body),handle=creatorHandle(b.handle);
  if(!handle||b.from>b.to||b.to>=now().toISOString().slice(0,10)||Date.parse(b.to)-Date.parse(b.from)>366*86400000)throw new InputError('Choose a creator and completed campaign dates.');
  const account=(await accounts(p,id)).find(a=>a.id===b.accountId&&a.platform==='Meta');if(!account)throw new InputError('Choose this workspace’s Meta ad account.');
  const owned=(await p.query(`SELECT DISTINCT d.ad_id FROM owned_ad_days d WHERE d.owned_account_id=$1 AND d.platform='Meta' AND d.currency=$3 AND d.attribution=$4 AND d.conversion_event=$5 AND d.ad_id=ANY($2::text[])`,[account.id,b.adIds,account.currency,account.attribution,account.event])).rows;
  if(owned.length!==new Set(b.adIds).size)throw new InputError('Every linked ad must exist in this owned account.');
  if((await p.query('SELECT 1 FROM creator_discovery_suppression WHERE workspace_id=$1 AND handle_hash=$2',[id,performanceHash([id,handle])])).rowCount)throw new InputError('This creator was deleted.');
  // Only explicit owned identities are admitted. An archive ID is never matched by number.
  // Campaign aggregation is scoped to the explicitly selected IDs, never other linked ads.
  const grouped=(await p.query(`SELECT jsonb_build_object(${OWNED_METRICS_SQL}) metrics,sum((data->>'purchaseValue')::float8) revenue,sum((data->>'purchases')::float8) purchases FROM owned_ad_days WHERE owned_account_id=$1 AND platform='Meta' AND ad_id=ANY($2::text[]) AND day BETWEEN $3::date AND $4::date AND currency=$5 AND attribution=$6 AND conversion_event=$7`,[account.id,b.adIds,b.from,b.to,account.currency,account.attribution,account.event])).rows[0];
  const m=grouped.metrics,at=now().toISOString(),row:CreatorCampaign={id:b.campaignId,handle,brand:readBrand(db,id)!.name,platform:'Meta',from:b.from,to:b.to,scope:{account:account.accountId,currency:account.currency,attribution:account.attribution,event:account.event,category:b.category,product:b.product,format:b.format},spend:m.Spend.value,revenue:grouped.revenue,purchases:grouped.purchases,roas:m.ROAS.value,cpa:m.CPA.value,hookRate:m['Hook rate'].value,holdRate:m['Hold rate'].value,source:'Owned',adIds:[...new Set(b.adIds)],recordedAt:at,features:null,featureAt:null,fixture:options.fixture??false};
  if(row.spend===null)throw new InputError('No saved reporting days exist in this campaign window.');

  const controlIds=(db.prepare(`SELECT json_extract(data,'$.adId') AS adId FROM accuracy_records WHERE workspace_id=? AND kind='ad-scope' AND rowid IN (SELECT max(rowid) FROM accuracy_records WHERE workspace_id=? AND kind='ad-scope' GROUP BY record_key) AND json_extract(data,'$.scope.accountId')=? AND json_extract(data,'$.scope.platform')='Meta' AND json_extract(data,'$.scope.currency')=? AND json_extract(data,'$.scope.attribution')=? AND json_extract(data,'$.scope.conversionEvent')=? AND json_extract(data,'$.scope.category')=? AND json_extract(data,'$.scope.product')=? AND json_extract(data,'$.scope.format')=? LIMIT 5001`).all(id,id,account.accountId,account.currency,account.attribution,account.event,b.category,b.product,b.format) as {adId:string}[]).map(r=>r.adId);
  const comparable=[...new Set([...controlIds,...b.adIds])];if(comparable.length>5000)throw new InputError('Choose a smaller account comparison group.');
  const benchmark=(await p.query(`SELECT jsonb_build_object(${OWNED_METRICS_SQL}) metrics FROM owned_ad_days WHERE owned_account_id=$1 AND platform='Meta' AND ad_id=ANY($2::text[]) AND day BETWEEN $3::date AND $4::date AND currency=$5 AND attribution=$6 AND conversion_event=$7`,[account.id,comparable,b.from,b.to,account.currency,account.attribution,account.event])).rows[0].metrics.ROAS.value;
  const individual=(await p.query(`SELECT ad_id,jsonb_agg(DISTINCT data->'assetIds') assets,jsonb_build_object(${OWNED_METRICS_SQL}) metrics FROM owned_ad_days WHERE owned_account_id=$1 AND platform='Meta' AND ad_id=ANY($2::text[]) AND day BETWEEN $3::date AND $4::date AND currency=$5 AND attribution=$6 AND conversion_event=$7 GROUP BY ad_id`,[account.id,b.adIds,b.from,b.to,account.currency,account.attribution,account.event])).rows;
  row.adOutcomes=individual.filter(r=>benchmark!==null&&r.metrics.ROAS.value!==null&&r.assets?.flat().some((a:unknown)=>typeof a==='string'&&a.length)).map(r=>({adId:r.ad_id,familyId:performanceHash([...new Set(r.assets.flatMap((a:string[])=>a.length>1?[a[1]]:a))].sort()),roas:r.metrics.ROAS.value,benchmark}));

  const client=await p.connect();try{await client.query('BEGIN');for(const ad of new Set(b.adIds))await client.query(`INSERT INTO creator_owned_links(workspace_id,handle,owned_account_id,ad_id,kind,category,product,format) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(workspace_id,handle,owned_account_id,ad_id) DO UPDATE SET kind=excluded.kind,category=excluded.category,product=excluded.product,format=excluded.format`,[id,handle,account.id,ad,b.kind,b.category,b.product,b.format]);const inserted=await saveCreatorCampaigns(p,id,[row],client);await client.query('COMMIT');res.json({inserted});}catch(e){await client.query('ROLLBACK');if(e instanceof Error&&/campaign identifier/.test(e.message))throw new InputError(e.message);throw e;}finally{client.release();}
 }));
 app.post('/api/creator-performance/validate',route(async(req,res,id,p)=>{
  const version=z.string().min(1).max(100).parse(req.body?.version),stored=(await p.query("SELECT id,data FROM creator_forecast_models WHERE workspace_id=$1 AND data->>'version'=$2",[id,version])).rows[0];if(!stored)throw new InputError('Choose a saved creator model.');
  const model=stored.data as CreatorForecastModel;let validation;
  try{validation=validateCreatorForecast(model,await creatorModelRows(p,id,model.cohort,true),now().toISOString());}catch(e){if(e instanceof Error&&/20,000|too many campaigns/.test(e.message))throw new InputError(e.message);throw new InputError('Validation found overlapping ads or families. Keep the time holdout separate.');}
  await p.query('INSERT INTO creator_forecast_validation VALUES($1,$2,$3) ON CONFLICT(workspace_id,model_id) DO UPDATE SET data=excluded.data',[id,stored.id,JSON.stringify(validation)]);
  res.json({message:validation.reasons.join(' ')||'Owned outcome checks passed. Range checks still apply.'});
 }));
 app.post('/api/creator-performance/train',route(async(req,res,id,p)=>{
  const cohort=z.string().min(1).max(2000).parse(req.body?.cohort),at=now().toISOString();let model:CreatorForecastModel;
  try{model=trainCreatorForecast(await creatorModelRows(p,id,cohort),cohort,at);}catch(e){throw new InputError((e as Error).message);}
  const artifactId=performanceHash([model.cohort,model.trainingIds,model.calibrationIds,model.holdoutIds,model.coefficients,model.error90]);model.version+=':'+artifactId.slice(0,16);
  const existing=(await p.query('SELECT id FROM creator_forecast_models WHERE workspace_id=$1 AND id=$2',[id,artifactId])).rows[0];
  if(!existing)await p.query('INSERT INTO creator_forecast_models(workspace_id,id,cohort,data) VALUES($1,$2,$3,$4)',[id,artifactId,cohort,JSON.stringify(model)]);
  res.status(201).json({version:model.version,status:'In validation',message:'Model trained. Forecasts stay hidden until outcome checks pass.'});
 }));
}
