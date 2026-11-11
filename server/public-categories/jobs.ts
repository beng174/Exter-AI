import type {WorkerObserver} from "../infrastructure/worker-diagnostics.js";
import {workerClaimGate,clearWorkerFailures} from "../infrastructure/worker-recovery.js";
import {randomUUID,createHash} from "node:crypto";
import type pg from "pg";
import {categoryText,creativeCategoryInput,type CategoryInput} from "../../shared/public-category-input.js";
import {mediaGbpRate} from "../../shared/ad-media.js";
import type {BrowserCreative} from "../../shared/creative-browser.js";
import {visitPublicCategoryInputs} from "../infrastructure/meta-evidence.js";
import {reserveCost,settleGeminiCost,releaseGeminiCost} from "../infrastructure/budget.js";
import {CATEGORY_MODEL,CATEGORY_VERSION,CATEGORY_BATCH_SIZE,categoryHash,categorySourceHash,categoryResult,categoryBatchInput,PublicCategoryProvider,CategoryError,type CategoryRequest} from "./provider.js";
interface Item {brandKey:string;pageId:string;nativeId:string;sourceHash:string;key:string}
const keyFor=(brand:string,page:string,native:string,hash:string)=>createHash('sha256').update(JSON.stringify([brand,page,native,hash])).digest('hex');
export async function categoryVocabulary(pool:Pick<pg.Pool,"query">,workspace:string):Promise<string[]>{return ((await pool.query('SELECT categories FROM workspace_category_vocabularies WHERE workspace_id=$1',[workspace])).rows[0]?.categories||[]).slice().sort();}
export async function countTaggedAds(pool:pg.Pool,workspace:string):Promise<number>{
 const result=await pool.query(`SELECT count(DISTINCT (c.brand_key,c.native_id))::integer AS count FROM public_ad_categories c
 JOIN watchlists w ON w.workspace_id=c.workspace_id AND w.brand_key=c.brand_key AND w.page_ids->>0=c.page_id
 JOIN public_category_batches b ON b.id=c.batch_id LEFT JOIN workspace_category_vocabularies v ON v.workspace_id=c.workspace_id
 WHERE c.workspace_id=$1 AND w.enabled AND c.prompt_version=$2 AND b.vocabulary @> COALESCE(v.categories,'[]'::jsonb)
 AND COALESCE(v.categories,'[]'::jsonb) @> b.vocabulary AND jsonb_array_length(c.categories)>0`,[workspace,CATEGORY_VERSION]);
 return Number(result.rows[0]?.count||0);
}
async function inputs(pool:pg.Pool,workspace:string,known=new Set<string>(),targets?:Set<string>,vocabulary?:string[],client?:pg.PoolClient){
 vocabulary=vocabulary||await categoryVocabulary(client||pool,workspace);
 const result:{item:Item;input:CategoryInput}[]=[];
 await visitPublicCategoryInputs(pool,workspace,row=>{
  if(!row.brand_key||!row.advertiser_id||!row.page_ids.includes(row.advertiser_id))return;
  const input=categoryText(row.raw_payload),sourceHash=categoryHash(input,vocabulary);
  const key=keyFor(row.brand_key,row.advertiser_id,row.native_id,sourceHash);
  if(result.length>=CATEGORY_BATCH_SIZE||known.has(key)||targets&&!targets.has(key))return;
  result.push({item:{brandKey:row.brand_key,pageId:row.advertiser_id,nativeId:row.native_id,sourceHash,key:keyFor(row.brand_key,row.advertiser_id,row.native_id,sourceHash)},input});
 },client);return result;
}
export const categoryConfigured=(env:Record<string,string|undefined>)=>Boolean(env.GEMINI_API_KEY?.trim()&&mediaGbpRate(env)!==null&&Number.isFinite(Number(env.GEMINI_REQUEST_RESERVE_GBP))&&Number(env.GEMINI_REQUEST_RESERVE_GBP)>0);
function quoteFor(rows:{item:Item;input:CategoryInput}[],env:Record<string,string|undefined>,vocabulary:string[]=[]){
 const requests=rows.filter(row=>row.input.copy||row.input.headlines.length||row.input.landingPaths.length).map(row=>({key:row.item.key,input:row.input})),rate=mediaGbpRate(env),minimum=Number(env.GEMINI_REQUEST_RESERVE_GBP);
 const estimatedGbp=requests.length&&rate!==null?Math.ceil((Buffer.byteLength(JSON.stringify(categoryBatchInput(requests,vocabulary)))*.05+requests.length*128*.20)/1e6*rate*1e6)/1e6:0;
 const reserveGbp=requests.length&&categoryConfigured(env)?Math.max(minimum,estimatedGbp):0;
 return {ads:rows.length,estimatedGbp,reserveGbp,hash:createHash('sha256').update(JSON.stringify([rows.map(row=>row.item.key),estimatedGbp,reserveGbp,CATEGORY_VERSION])).digest('hex')};
}
async function pendingKeys(client:pg.Pool|pg.PoolClient,workspace:string,now:Date){
 const existing=(await client.query('SELECT brand_key,page_id,native_id,source_hash FROM public_ad_categories WHERE workspace_id=$1 AND prompt_version=$2',[workspace,CATEGORY_VERSION])).rows;
 const known=new Set(existing.map(r=>keyFor(r.brand_key,r.page_id,r.native_id,r.source_hash)));
 const attempted=(await client.query("SELECT items FROM public_category_batches WHERE workspace_id=$1 AND (status IN ('queued','starting','running','uncertain','paused') OR (COALESCE(finished_at,available_at,created_at) AT TIME ZONE 'Europe/London')::date=($2::timestamptz AT TIME ZONE 'Europe/London')::date)",[workspace,now])).rows.flatMap(r=>r.items as Item[]);
 for(const item of attempted)known.add(item.key);return known;
}
async function resumableCategory(client:pg.Pool|pg.PoolClient,workspace:string){return (await client.query("SELECT * FROM public_category_batches WHERE workspace_id=$1 AND status='paused' AND (reservation_id IS NULL OR provider_name IS NOT NULL) AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 1",[workspace])).rows[0];}
async function resumeQuote(pool:pg.Pool,run:any,env:Record<string,string|undefined>,client?:pg.PoolClient){
 const rows=await inputs(pool,run.workspace_id,new Set(),new Set((run.items as Item[]).map(item=>item.key)),run.vocabulary||[],client),quote=quoteFor(rows,env,run.vocabulary||[]);
 const estimatedGbp=run.provider_name?0:quote.estimatedGbp,reserveGbp=run.provider_name?0:quote.reserveGbp;
 return {...quote,ads:run.items.length,estimatedGbp,reserveGbp,resume:true,hash:createHash('sha256').update(JSON.stringify([run.id,run.provider_name,quote.hash,estimatedGbp,reserveGbp])).digest('hex')};
}
export async function categoryQuote(pool:pg.Pool,workspace:string,env:Record<string,string|undefined>=process.env){const paused=await resumableCategory(pool,workspace);return paused?resumeQuote(pool,paused,env):quoteFor(await inputs(pool,workspace,await pendingKeys(pool,workspace,new Date())),env,await categoryVocabulary(pool,workspace));}
export async function enqueueCategoryBatch(pool:pg.Pool,workspace:string,now=new Date(),quote?:{hash:string;env:Record<string,string|undefined>}){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`public-categories:${workspace}`]);
  if(quote){const paused=await resumableCategory(client,workspace);if(paused){const estimate=await resumeQuote(pool,paused,quote.env,client);if(estimate.hash!==quote.hash)throw new CategoryError('output');await client.query("UPDATE public_category_batches SET status=CASE WHEN provider_name IS NULL THEN 'queued' ELSE 'running' END,error_kind=NULL,available_at=now(),max_cost_gbp=CASE WHEN provider_name IS NULL THEN $2 ELSE max_cost_gbp END WHERE id=$1",[paused.id,estimate.reserveGbp]);await clearWorkerFailures(client,'categories',[paused.id]);await client.query('COMMIT');return paused.id;}}
  const vocabulary=await categoryVocabulary(client,workspace),known=await pendingKeys(client,workspace,now),rows=await inputs(pool,workspace,known,undefined,vocabulary,client),items=rows.map(row=>row.item);
  const estimate=quote?quoteFor(rows,quote.env,vocabulary):null;
  if(quote&&estimate?.hash!==quote.hash)throw new CategoryError('output');
  if(!items.length){await client.query('ROLLBACK');return null;}
  const id=randomUUID();await client.query('INSERT INTO public_category_batches(id,workspace_id,items,model,max_cost_gbp,vocabulary,estimate_gbp) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,workspace,JSON.stringify(items),CATEGORY_MODEL,estimate?.reserveGbp??null,JSON.stringify(vocabulary),categoryConfigured(quote?.env||process.env)?quoteFor(rows,quote?.env||process.env,vocabulary).estimatedGbp:null]);await client.query('COMMIT');return id;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function schedulePublicCategories(pool:pg.Pool,env:Record<string,string|undefined>=process.env){
 if(!categoryConfigured(env))return;
 const due=await pool.query("INSERT INTO public_category_refill_gate(id,next_check) VALUES(1,now()+interval '1 minute') ON CONFLICT(id) DO UPDATE SET next_check=excluded.next_check WHERE public_category_refill_gate.next_check<=now() RETURNING id");
 if(!due.rowCount)return;
 await pool.query("UPDATE public_category_batches SET status=CASE WHEN provider_name IS NULL THEN 'queued' ELSE 'running' END,error_kind=NULL,available_at=now() WHERE status='paused' AND (reservation_id IS NULL OR provider_name IS NOT NULL) AND (available_at AT TIME ZONE 'Europe/London')::date<(now() AT TIME ZONE 'Europe/London')::date");
 const workspaces=await pool.query("SELECT DISTINCT workspace_id FROM watchlists WHERE enabled AND purpose='brand' AND brand_key IS NOT NULL");
 for(const row of workspaces.rows)for(let n=0;n<10;n++){if(!await enqueueCategoryBatch(pool,row.workspace_id))break;}
}
export async function claimCategoryBatch(pool:pg.Pool,owner:string){return (await pool.query(`UPDATE public_category_batches SET lease_owner=$1,lease_until=now()+interval '6 minutes' WHERE id=(SELECT id FROM public_category_batches WHERE ${workerClaimGate('categories','public_category_batches.id')} AND status IN ('queued','starting','running') AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[owner])).rows[0]||null;}
export async function stepCategoryBatch(pool:pg.Pool,id:string,owner:string,options:WorkerObserver&{env?:Record<string,string|undefined>;provider?:PublicCategoryProvider}={}){
 const env=options.env||process.env;if(!categoryConfigured(env))return false;
 const client=await pool.connect();let run:any;
 try{
  if(!(await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[`category-step:${id}`])).rows[0].locked)return false;
  run=(await client.query('SELECT * FROM public_category_batches WHERE id=$1 AND lease_owner=$2 AND lease_until>now()',[id,owner])).rows[0];
  if(!run||!['queued','starting','running'].includes(run.status))return false;
  const update=async(status:string,error:string|null=null)=>client.query("UPDATE public_category_batches SET status=$3,error_kind=$4,available_at=now()+interval '1 minute',finished_at=CASE WHEN $3 IN ('complete','failed') THEN clock_timestamp() ELSE NULL END WHERE id=$1 AND lease_owner=$2 AND lease_until>now()",[id,owner,status,error]);
  if(run.status==='starting'&&!run.provider_name){await update('uncertain','uncertain');return true;}
  const provider=options.provider||new PublicCategoryProvider({env}),items=run.items as Item[];
  const save=async(item:Item,categories:string[],model:string)=>client.query(`INSERT INTO public_ad_categories(workspace_id,brand_key,page_id,native_id,source_hash,prompt_version,model,categories,batch_id) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 WHERE EXISTS(SELECT 1 FROM watchlists w WHERE w.workspace_id=$1 AND w.brand_key=$2 AND w.enabled AND w.page_ids->>0=$3) ON CONFLICT DO NOTHING`,[run.workspace_id,item.brandKey,item.pageId,item.nativeId,item.sourceHash,CATEGORY_VERSION,model,JSON.stringify(categories),id]);
  if(!run.provider_name){
   if(JSON.stringify(await categoryVocabulary(pool,run.workspace_id))!==JSON.stringify(run.vocabulary||[])){await update('complete','changed');return true;}
   const live=new Map((await inputs(pool,run.workspace_id,new Set(),new Set(items.map(item=>item.key)),run.vocabulary||[])).map(row=>[row.item.key,row.input]));
   const requests:CategoryRequest[]=[];
   for(const item of items){const input=live.get(item.key);if(!input)continue;if(!input.copy&&!input.headlines.length&&!input.landingPaths.length)await save(item,[],'unavailable');else requests.push({key:item.key,input});}
   if(!requests.length){await update('complete');return true;}
   const rate=mediaGbpRate(env),minimum=Number(env.GEMINI_REQUEST_RESERVE_GBP);
   if(!env.GEMINI_API_KEY?.trim()||rate===null||!Number.isFinite(minimum)||minimum<=0){await update('paused','configuration');return true;}
   const body=categoryBatchInput(requests,run.vocabulary||[]),bytes=Buffer.byteLength(JSON.stringify(body));if(bytes>16_000_000)throw new CategoryError('output');
   const bound=(bytes*.05+requests.length*128*.20)/1_000_000*rate;
   if(run.max_cost_gbp!==null&&Math.max(minimum,Math.ceil(bound*1e6)/1e6)>Number(run.max_cost_gbp)){await update('paused','quote');return true;}
   let reservation:string;try{reservation=await reserveCost(pool,'inference','gemini',Math.max(minimum,Math.ceil(bound*1e6)/1e6));}catch{await update('paused','budget');return true;}
   const fenced=await client.query("UPDATE public_category_batches SET status='starting',reservation_id=$3,gbp_per_usd=$4 WHERE id=$1 AND lease_owner=$2 AND lease_until>now() RETURNING id",[id,owner,reservation,rate]);if(!fenced.rowCount){await releaseGeminiCost(reservation,pool);return true;}
   try{const name=await provider.start(requests,run.vocabulary||[]);await client.query("UPDATE public_category_batches SET status='running',provider_name=$3,available_at=now()+interval '1 minute' WHERE id=$1 AND lease_owner=$2 AND lease_until>now()",[id,owner,name]);}catch(error){if(error instanceof CategoryError&&error.rejected){await releaseGeminiCost(reservation,pool);await update('failed','configuration');}else await update('uncertain','uncertain');}
   return true;
  }
  const result=await provider.poll(run.provider_name),state=result.metadata?.state;
  if(!result.done&&!['JOB_STATE_SUCCEEDED','JOB_STATE_FAILED','JOB_STATE_CANCELLED','JOB_STATE_EXPIRED'].includes(state)){await update('running');return true;}
  if(state!=='JOB_STATE_SUCCEEDED'){await update('failed','provider');return true;}
  const inline=result.response?.inlinedResponses,responses=Array.isArray(inline)?inline:inline?.inlinedResponses;
  if(!Array.isArray(responses)||responses.length>items.length)throw new CategoryError('output');
  const requested=new Map(items.map(item=>[item.key,item])),seen=new Set<string>();let inputTokens=0,outputTokens=0,priced=true,partial=false;
  const valid:{item:Item;parsed:NonNullable<ReturnType<typeof categoryResult>>}[]=[];
  for(const response of responses){
   const key=response.metadata?.key,item=requested.get(key);if(!item||seen.has(key))throw new CategoryError('output');seen.add(key);
   const parsed=categoryResult(response.response,run.vocabulary||[]);if(!parsed){partial=true;priced=false;continue;}
   valid.push({item,parsed});
   if(parsed.inputTokens===null||parsed.outputTokens===null||!parsed.model)priced=false;else{inputTokens+=parsed.inputTokens;outputTokens+=parsed.outputTokens;}
  }
  for(const {item,parsed} of valid)await save(item,parsed.categories,parsed.model||'unreported');
  if(priced&&seen.size===items.length&&run.reservation_id){const estimate=(inputTokens*.05+outputTokens*.20)/1_000_000*Number(run.gbp_per_usd),held=(await client.query('SELECT initial_reserved_gbp FROM cost_ledger WHERE id=$1',[run.reservation_id])).rows[0];if(held&&estimate<=Number(held.initial_reserved_gbp))await settleGeminiCost(run.reservation_id,estimate,pool);else partial=true;}
  await update('complete',partial||seen.size<items.length?'partial':null);return true;
 }catch(error){options.onFailure?.(error);if(run)await client.query("UPDATE public_category_batches SET status=CASE WHEN provider_name IS NULL AND reservation_id IS NOT NULL THEN 'uncertain' WHEN $3='output' THEN 'failed' ELSE 'paused' END,error_kind=$3,available_at=now()+interval '15 minutes' WHERE id=$1 AND lease_owner=$2",[id,owner,error instanceof CategoryError?error.kind:'provider']);return true;}
 finally{await client.query('SELECT pg_advisory_unlock(hashtext($1))',[`category-step:${id}`]).catch(()=>{});client.release();}
}
export async function workPublicCategoriesOnce(pool:pg.Pool,options:WorkerObserver&{env?:Record<string,string|undefined>;provider?:PublicCategoryProvider}={}){
 const env=options.env||process.env;if(!categoryConfigured(env))return false;
 const owner=randomUUID();let run=await claimCategoryBatch(pool,owner);if(!run){await schedulePublicCategories(pool,env);run=await claimCategoryBatch(pool,owner);}if(!run)return false;
 options.onClaim?.({id:run.id,owner,workspaceId:run.workspace_id,status:run.status});
 let worked=false;
 try{worked=await stepCategoryBatch(pool,run.id,owner,options);}finally{
  await pool.query("UPDATE public_category_batches SET lease_owner=NULL,lease_until=NULL,available_at=CASE WHEN $3 THEN available_at ELSE now()+interval '1 minute' END WHERE id=$1 AND lease_owner=$2",[run.id,owner,worked]);
 }
 return true;
}
export async function mergeProductCategories(pool:Pick<pg.Pool,"query">,workspace:string,rows:BrowserCreative[]){
 const vocabulary=await categoryVocabulary(pool,workspace);
 const labels=await pool.query(`SELECT c.* FROM public_ad_categories c JOIN watchlists w ON w.workspace_id=c.workspace_id AND w.brand_key=c.brand_key AND w.page_ids->>0=c.page_id WHERE c.workspace_id=$1 AND c.prompt_version=$2 AND c.native_id=ANY($3::text[]) ORDER BY c.created_at DESC`,[workspace,CATEGORY_VERSION,rows.map(row=>row.nativeId)]);
 const byKey=new Map<string,any>();for(const label of labels.rows){const key=JSON.stringify([label.brand_key,label.native_id,label.source_hash]);if(!byKey.has(key))byKey.set(key,label);}
 return rows.map(row=>{const hash=categorySourceHash(row.categorySourceHash||categoryHash(creativeCategoryInput(row)),vocabulary),label=byKey.get(JSON.stringify([row.brandId,row.nativeId,hash]));return label?{...row,productCategories:label.categories,productCategoryModel:label.model==='unavailable'?undefined:label.model}:row;});
}
