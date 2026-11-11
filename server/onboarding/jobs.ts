import {smallerMetaPage,metaPageSize,type MetaPageSize} from "../../shared/meta-collection.js";
import {createHash} from "node:crypto";
import type pg from "pg";
import type {DatabaseSync} from "node:sqlite";
import {readBrand} from "../db.js";
import {OnboardingAI,understandingBatch,understandingBatchResult,type UnderstandingInput,type UnderstandingRequest} from "./ai.js";
import {OnboardingMeta,OnboardingWait,mergeDiscoveredPages} from "./meta.js";
import {readWebsite,crawlLinks} from "./website.js";
import type {BrandResearchOptions} from "../brand-research.js";
import type {BrandUnderstanding,DiscoveredPage,IdentityMatch,WebsitePage,CompetitorChoice} from "../../shared/onboarding/types.js";
import {rankIdentity,rankCompetitors,competitorDecision,priceRange,sameDomain} from "../../shared/onboarding/rules.js";
import {captionDomain} from "../../shared/meta-page-candidates.js";
import {mediaEnabled,mediaGbpRate} from "../../shared/ad-media.js";
import {CategoryError,CATEGORY_MODEL} from "../public-categories/provider.js";
import {reserveCost,settleGeminiCost,releaseGeminiCost,budgetStatus} from "../infrastructure/budget.js";
import {MetaCollectionError,metaLibraryEnabled} from "../connectors/meta-library.js";
import {enqueueCollection,CollectionBusyError,rollingYearStart} from "../infrastructure/jobs.js";
import {enqueueAdMedia} from "../ad-media/jobs.js";
import {enqueueCategoryBatch,categoryConfigured,countTaggedAds} from "../public-categories/jobs.js";
import {applyUnderstanding,applyOwnPages,applyCompetitor} from "./store.js";
import {readMediaCoverage} from "../ad-media/coverage.js";
export const ONBOARDING_ERRORS:Record<string,string>={configuration:"Setup needs its provider keys and service settings.",budget:"Setup is waiting for your budget.",website:"The website could not be read. Earlier results are kept.",provider:"A source could not finish. We will retry.",output:"A source returned an unreadable result.",uncertain:"A paid start needs review before retrying.",switch:"Collection is off. Review Data sources.",media_switch:"Media downloads are off. Review Data sources."};
export interface RunData {name:string;domain:string;pages:WebsitePage[];failedUrls:string[];visitedUrls?:string[];queue:string[];profile?:BrandUnderstanding;manualCategories?:boolean;ownPages:DiscoveredPage[];ownMatches?:IdentityMatch[];ownAfter?:string|null;ownSearchPages?:number;ownPageSize?:MetaPageSize;searchPageSize?:MetaPageSize;ownSearchSeen?:string[];ownCursors?:string[];searchCursors?:string[];pagesSearched?:boolean;pagesSearchUnavailable?:boolean;competitorPages:DiscoveredPage[];searchSeen:string[];keywordIndex:number;keywordRevision?:string;searchAfter:string|null;searchPages:number;suggestionIndex?:number;candidateIndex:number;candidateDomains?:{name:string;domain:string;pages:DiscoveredPage[];source:'ads'|'suggestion'}[];candidateWeb?:{domain:string;pages:WebsitePage[];queue:string[];failed:string[]};candidateSites?:Record<string,WebsitePage[]>;choices:CompetitorChoice[];collectionIds?:string[];applied?:boolean}
async function stepRecord(pool:pg.Pool,run:string,key:string,status:string,data:unknown={},estimate:number|null=null){await pool.query(`INSERT INTO brand_onboarding_steps(run_id,key,status,data,estimate_gbp) VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id,key) DO UPDATE SET status=excluded.status,data=excluded.data,estimate_gbp=COALESCE(excluded.estimate_gbp,brand_onboarding_steps.estimate_gbp),updated_at=now()`,[run,key,status,JSON.stringify(data),estimate]);}
async function profileBatchStep(pool:pg.Pool,id:string,key:string,requests:UnderstandingRequest[],ai:OnboardingAI,env:Record<string,string|undefined>):Promise<Record<string,BrandUnderstanding|null>|null>{
 let row=(await pool.query('SELECT * FROM brand_onboarding_steps WHERE run_id=$1 AND key=$2',[id,key])).rows[0];
 if(row?.status==='complete')return row.data.profiles||{profile:row.data.profile};
 if(row?.status==='starting'&&!row.provider_name)throw new CategoryError('uncertain');
 if(!row){const rate=mediaGbpRate(env),bytes=Buffer.byteLength(JSON.stringify(understandingBatch(requests)));if(rate===null)throw new CategoryError('configuration');const estimate=Math.ceil((bytes*.05+requests.length*4096*.20)/1e6*rate*1e6)/1e6;await stepRecord(pool,id,key,'queued',{model:CATEGORY_MODEL},estimate);return null;}
 if(!row.provider_name){
  const minimum=Number(env.GEMINI_REQUEST_RESERVE_GBP),rate=mediaGbpRate(env);if(!env.GEMINI_API_KEY?.trim()||rate===null||!Number.isFinite(minimum)||minimum<=0)throw new CategoryError('configuration');
  let reservation:string;try{reservation=await reserveCost(pool,'inference','gemini',Math.max(minimum,Number(row.estimate_gbp)));}catch{throw new CategoryError('budget');}
  await pool.query("UPDATE brand_onboarding_steps SET status='starting',reservation_id=$3,data=data||$4::jsonb,updated_at=now() WHERE run_id=$1 AND key=$2",[id,key,reservation,JSON.stringify({gbpPerUsd:rate})]);
  try{const name=await ai.startMany(requests);await pool.query("UPDATE brand_onboarding_steps SET status='running',provider_name=$3,updated_at=now() WHERE run_id=$1 AND key=$2",[id,key,name]);}
  catch(error){if(error instanceof CategoryError&&error.rejected){await releaseGeminiCost(reservation,pool);await pool.query("UPDATE brand_onboarding_steps SET status='queued',reservation_id=NULL,error_kind='configuration' WHERE run_id=$1 AND key=$2",[id,key]);throw new CategoryError('configuration');}throw new CategoryError('uncertain');}return null;
 }
 const result=await ai.poll(row.provider_name),state=result.metadata?.state;
 if(!result.done&&!['JOB_STATE_SUCCEEDED','JOB_STATE_FAILED','JOB_STATE_CANCELLED','JOB_STATE_EXPIRED'].includes(state))return null;
 if(state!=='JOB_STATE_SUCCEEDED')throw new CategoryError('provider');
 const parsed=understandingBatchResult(result,requests),held=(await pool.query('SELECT initial_reserved_gbp FROM cost_ledger WHERE id=$1',[row.reservation_id])).rows[0];
 if(parsed.priced&&parsed.inputTokens!==null&&parsed.outputTokens!==null){const actual=(parsed.inputTokens*.05+parsed.outputTokens*.20)/1e6*Number(row.data.gbpPerUsd);if(held&&actual<=Number(held.initial_reserved_gbp))await settleGeminiCost(row.reservation_id,actual,pool);}
 await pool.query("UPDATE brand_onboarding_steps SET status='complete',data=data||$3::jsonb,error_kind=NULL,updated_at=now() WHERE run_id=$1 AND key=$2",[id,key,JSON.stringify({profiles:parsed.profiles})]);return parsed.profiles;
}
export {claimOnboarding,scheduleOnboarding} from "./queue.js";
export {workOnboardingOnce} from "./worker.js";
export interface OnboardingOptions {env?:Record<string,string|undefined>;ai?:OnboardingAI;meta?:OnboardingMeta;website?:BrandResearchOptions;now?:()=>Date;onFailure?:(error:unknown)=>void}
export async function stepOnboarding(pool:pg.Pool,db:DatabaseSync,id:string,owner:string,options:OnboardingOptions={}){
 const env=options.env||process.env,client=await pool.connect();let run:any;
 try{if(!(await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[`onboarding-step:${id}`])).rows[0].locked)return false;
  run=(await client.query("SELECT * FROM brand_onboarding_runs WHERE id=$1 AND lease_owner=$2 AND lease_until>now() AND status IN ('queued','running','paused')",[id,owner])).rows[0];if(!run)return false;
  const brand=readBrand(db,run.workspace_id);if(!brand||brand.mode==='demo')return false;
  const data=run.data as RunData,ai=options.ai||new OnboardingAI({env}),meta=options.meta||new OnboardingMeta(pool,{env}),now=options.now?.()||new Date();
  const update=async(phase=run.phase,status='running',delay=5000,error:string|null=null)=>client.query('UPDATE brand_onboarding_runs SET phase=$3,status=$4,data=$5,available_at=$6,error_kind=$7,updated_at=now(),finished_at=CASE WHEN $4 IN (\'complete\',\'needs_review\') THEN now() ELSE NULL END WHERE id=$1 AND lease_owner=$2 AND lease_until>now()',[id,owner,phase,status,JSON.stringify(data),new Date(now.getTime()+delay),error]);
  if(run.phase==='website'){
   const url=data.queue.shift();if(url){data.visitedUrls=[...(data.visitedUrls||[]),url];try{const page=await readWebsite(url,data.domain,options.website);data.pages.push(page);data.queue=[...new Set([...data.queue,...crawlLinks(data.pages,data.domain)])].filter(link=>!(data.visitedUrls||[]).includes(link)&&!data.failedUrls.includes(link)&&!data.pages.some(page=>page.url===link)).slice(0,8-data.pages.length);}catch{data.failedUrls.push(url);if(!data.pages.length)throw new Error('website');}await stepRecord(pool,id,'website','running',{count:data.pages.length});await update();return true;}
   if(!data.pages.length)throw new Error('website');await stepRecord(pool,id,'website','complete',{count:data.pages.length});await update('understanding');return true;
  }
  if(run.phase==='understanding'){
   const results=await profileBatchStep(pool,id,'understanding',[{key:'profile',input:{name:data.name,domain:data.domain,pages:data.pages,categories:[]}}],ai,env);if(!results){await update(undefined,'running',15000);return true;}const profile=results.profile;if(!profile?.categories.length)throw new CategoryError('output');
   data.profile=profile;await applyUnderstanding(pool,db,brand.id,profile,data.pages,run.kind);await update('pages');return true;
  }
  if(run.phase==='pages'){
   if(!data.pagesSearched){const result=await meta.pages(data.name);data.ownPages=result.pages;data.pagesSearchUnavailable=result.unavailable;data.pagesSearched=true;await stepRecord(pool,id,'pages','running',{count:data.ownPages.length});await update();return true;}
   const page=await meta.ads(data.name,data.ownAfter||null,false,rollingYearStart(now.toISOString().slice(0,10)),data.ownPageSize||100),merged=mergeDiscoveredPages(data.ownPages,page.rows,data.domain,data.ownSearchSeen||[]);if(page.after&&(data.ownCursors||[]).includes(page.after))throw new MetaCollectionError('schema','output');if(page.after)data.ownCursors=[...(data.ownCursors||[]),page.after];data.ownPages=merged.pages;data.ownSearchSeen=merged.seen;data.ownAfter=page.after;data.ownSearchPages=(data.ownSearchPages||0)+1;
   if(page.after&&data.ownSearchPages<10&&merged.seen.length<1000){await update();return true;}
   data.ownMatches=rankIdentity(data.ownPages,data.name,data.domain);await stepRecord(pool,id,'pages',data.ownMatches.some(page=>page.highConfidence)?'complete':data.ownMatches.length?'needs_review':'complete',{count:data.ownMatches.filter(page=>page.highConfidence).length,noUkAds:!data.ownMatches.some(page=>page.highConfidence&&page.ukAds>0),limited:Boolean(page.after),pagesSearchUnavailable:data.pagesSearchUnavailable});
   if(run.kind==='initial')await applyOwnPages(pool,db,brand.id,data.ownMatches.filter(page=>page.highConfidence));await update('discovery');return true;
  }
  if(run.phase==='discovery'){
   const override=(await pool.query("SELECT search_terms FROM watchlists WHERE workspace_id=$1 AND purpose='discovery' AND managed_by='manual' ORDER BY revision DESC,id LIMIT 1",[brand.id])).rows[0],keywords=(override?override.search_terms:data.profile?.keywords.length?data.profile.keywords:data.profile?.categories||[]).slice(0,10) as string[];const revision=JSON.stringify(keywords);if(data.keywordRevision&&data.keywordRevision!==revision){data.keywordIndex=0;data.searchAfter=null;data.searchPages=0;data.searchCursors=[];}data.keywordRevision=revision;
   if(data.keywordIndex<keywords.length){const page=await meta.ads(keywords[data.keywordIndex],data.searchAfter,true,undefined,data.searchPageSize||100),merged=mergeDiscoveredPages(data.competitorPages,page.rows,null,data.searchSeen);if(page.after&&(data.searchCursors||[]).includes(page.after))throw new MetaCollectionError('schema','output');if(page.after)data.searchCursors=[...(data.searchCursors||[]),page.after];data.competitorPages=merged.pages;data.searchSeen=merged.seen;data.searchPages++;
    if(page.after&&data.searchPages<3&&data.searchSeen.length<3000)data.searchAfter=page.after;else{data.keywordIndex++;data.searchAfter=null;data.searchPages=0;data.searchCursors=[];data.searchPageSize=100;}
    await stepRecord(pool,id,'competitors','running',{count:data.competitorPages.length});await update();return true;
   }
   const suggestions=data.profile?.suggestions||[],index=data.suggestionIndex||0;
   if(index<suggestions.length){const suggestion=suggestions[index],page=await meta.ads(suggestion.name,null,true),merged=mergeDiscoveredPages(data.competitorPages,page.rows,null,data.searchSeen);data.competitorPages=merged.pages;data.searchSeen=merged.seen;data.suggestionIndex=index+1;await update();return true;}
   const grouped=new Map<string,NonNullable<RunData['candidateDomains']>[number]>();
   for(const page of data.competitorPages.sort((a,b)=>b.ukAds-a.ukAds||(b.reach??-1)-(a.reach??-1))){const domain=captionDomain(page.domain||page.website);if(!domain||sameDomain(domain,data.domain))continue;const group=grouped.get(domain)||{name:page.name,domain,pages:[],source:suggestions.some(s=>sameDomain(s.domain,domain))?'suggestion' as const:'ads' as const};group.pages.push(page);grouped.set(domain,group);}
   const ownIndex=new Map(data.ownPages.map(page=>[page.pageId,page]));for(const page of data.competitorPages.filter(page=>sameDomain(page.domain,data.domain))){const old=ownIndex.get(page.pageId);if(!old||page.ukAds>old.ukAds)ownIndex.set(page.pageId,page);}data.ownPages=[...ownIndex.values()];data.ownMatches=rankIdentity(data.ownPages,data.name,data.domain);await stepRecord(pool,id,'pages',data.ownMatches.some(page=>page.highConfidence)?'complete':data.ownMatches.length?'needs_review':'complete',{count:data.ownMatches.filter(page=>page.highConfidence).length,noUkAds:!data.ownMatches.some(page=>page.highConfidence&&page.ukAds>0)});if(run.kind==='initial')await applyOwnPages(pool,db,brand.id,data.ownMatches.filter(page=>page.highConfidence));
   data.candidateDomains=[...grouped.values()].slice(0,24);await update('competitors');return true;
  }
  if(run.phase==='competitors'){
   const target=data.candidateDomains?.[data.candidateIndex];
   if(target){const excluded=(await pool.query("SELECT 1 FROM brand_onboarding_choices WHERE workspace_id=$1 AND domain=$2 AND action='removed'",[brand.id,target.domain])).rowCount;
    if(excluded){data.candidateIndex++;data.candidateWeb=undefined;await update();return true;}
    const work=data.candidateWeb?.domain===target.domain?data.candidateWeb:{domain:target.domain,pages:[],queue:[`https://${target.domain}/`],failed:[]};data.candidateWeb=work;
    if(work.queue.length&&work.pages.length<5){const url=work.queue.shift()!;try{work.pages.push(await readWebsite(url,target.domain,options.website));work.queue=[...new Set([...work.queue,...crawlLinks(work.pages,target.domain)])].filter(link=>!work.failed.includes(link)&&!work.pages.some(page=>page.url===link)).slice(0,5-work.pages.length);}catch{work.failed.push(url);}await update();return true;}
    data.candidateSites={...data.candidateSites,[target.domain]:work.pages.map(page=>({...page,links:[],socialLinks:[]}))};data.candidateIndex++;data.candidateWeb=undefined;await update();return true;
   }
   const candidateKey=(domain:string)=>createHash('sha256').update(domain).digest('hex');
   const requests=(data.candidateDomains||[]).filter(target=>data.candidateSites?.[target.domain]?.length).map(target=>({key:candidateKey(target.domain),input:{name:target.name,domain:target.domain,pages:data.candidateSites![target.domain],categories:brand.primaryCategories||data.profile!.categories}}));
   if(requests.length){const profiles=await profileBatchStep(pool,id,'competitor-profiles',requests,ai,env);if(!profiles){await update(undefined,'running',15000);return true;}
    data.choices=[];for(const target of data.candidateDomains||[]){const profile=profiles[candidateKey(target.domain)];if(!profile)continue;const pages=rankIdentity(target.pages,target.name,target.domain),choice=competitorDecision({name:target.name,domain:target.domain,pages,profile,ownDomain:data.domain,ownCategories:brand.primaryCategories||data.profile!.categories,ownPrices:priceRange(data.pages),prices:priceRange(data.candidateSites?.[target.domain]||[]),keywords:data.profile!.keywords,source:target.source});if(choice)data.choices.push(choice);}
   }
   await stepRecord(pool,id,'competitors','complete',{count:data.choices.filter(row=>row.state==='automatic').length});await update('apply');return true;
  }
  if(run.phase==='apply'){
   data.choices=rankCompetitors(data.choices);let automaticCount=0;data.choices=data.choices.map(choice=>choice.state==='automatic'&&++automaticCount>8?{...choice,state:'suggested'}:choice);if(run.kind==='monthly'){data.choices=data.choices.filter(choice=>!brand.competitorProfiles?.some(saved=>sameDomain(saved.domain,choice.domain))).map(choice=>({...choice,state:'suggested'}));await stepRecord(pool,id,'competitors','complete',{count:data.choices.length});await update('complete',data.choices.length?'needs_review':'complete');return true;}
   for(const choice of data.choices.filter(choice=>choice.state==='automatic').slice(0,8))await applyCompetitor(pool,db,brand.id,choice);
   await stepRecord(pool,id,'competitors','complete',{count:data.choices.filter(choice=>choice.state==='automatic').length});data.applied=true;await update('collection');return true;
  }
  if(run.phase==='collection'){
   if(!metaLibraryEnabled(env)){await stepRecord(pool,id,'collection','paused');await update(undefined,'paused',60000,'switch');return true;}
   const watchlists=(await pool.query("SELECT id,brand_key,page_ids FROM watchlists WHERE workspace_id=$1 AND purpose='brand' AND enabled",[brand.id])).rows;
   data.collectionIds=[];for(const watch of watchlists){try{data.collectionIds.push(await enqueueCollection(pool,watch.id));}catch(error){if(!(error instanceof CollectionBusyError))throw error;const active=(await pool.query("SELECT id FROM collection_runs WHERE watchlist_id=$1 AND status IN ('queued','running') ORDER BY started_at DESC LIMIT 1",[watch.id])).rows[0];if(active)data.collectionIds.push(active.id);}}
   await stepRecord(pool,id,'collection','running',{count:0});await update('enrichment');return true;
  }
  if(run.phase==='enrichment'){
   const watches=(await pool.query("SELECT id,brand_key,page_ids FROM watchlists WHERE workspace_id=$1 AND purpose='brand' AND enabled",[brand.id])).rows;
   let latest=(await pool.query(`SELECT DISTINCT ON(w.id) w.id AS watchlist_id,r.id,r.status FROM watchlists w LEFT JOIN collection_runs r ON r.watchlist_id=w.id AND r.config->>'revision'=w.revision::text WHERE w.workspace_id=$1 AND w.purpose='brand' AND w.enabled ORDER BY w.id,r.started_at DESC,r.id DESC`,[brand.id])).rows;
   for(const watch of latest.filter(row=>!row.id))await enqueueCollection(pool,watch.watchlist_id);
   if(latest.some(row=>!row.id))latest=(await pool.query(`SELECT DISTINCT ON(w.id) w.id AS watchlist_id,r.id,r.status FROM watchlists w LEFT JOIN collection_runs r ON r.watchlist_id=w.id AND r.config->>'revision'=w.revision::text WHERE w.workspace_id=$1 AND w.purpose='brand' AND w.enabled ORDER BY w.id,r.started_at DESC,r.id DESC`,[brand.id])).rows;
   const states=latest;
   const coverage=await readMediaCoverage(pool,brand.id),ads=coverage.reduce((n,row)=>n+row.official,0),images=coverage.reduce((n,row)=>n+row.images,0);
   const pending=states.some(row=>!['complete','superseded'].includes(row.status)),blockedCollection=states.some(row=>['paused','failed','not_connected'].includes(row.status));await stepRecord(pool,id,'collection',blockedCollection?'paused':pending?'running':'complete',{count:ads,noUkAds:ads===0&&!pending});
   const budgets=await budgetStatus(pool),providerBudget=budgets.find(b=>b.cost_type==='data_providers'),inferenceBudget=budgets.find(b=>b.cost_type==='inference'),rate=mediaGbpRate(env);
   if(mediaEnabled(env)&&env.APIFY_TOKEN?.trim()&&rate!==null&&providerBudget&&!providerBudget.paused)await pool.query("UPDATE ad_media_runs SET status=CASE WHEN actor_run_id IS NULL THEN 'queued' ELSE 'running' END,error_kind=NULL,available_at=now() WHERE workspace_id=$1 AND status='paused' AND error_kind IN ('budget','configuration') AND (reservation_id IS NULL OR actor_run_id IS NOT NULL) AND (lease_until IS NULL OR lease_until<now()) AND $2::numeric+(cap*.0005+.00005)*$3::numeric<=$4::numeric",[brand.id,providerBudget.used_gbp,rate,providerBudget.threshold_gbp]);
   if(env.GEMINI_API_KEY?.trim()&&inferenceBudget&&!inferenceBudget.paused)await pool.query("UPDATE public_category_batches SET status=CASE WHEN provider_name IS NULL THEN 'queued' ELSE 'running' END,error_kind=NULL,available_at=now() WHERE workspace_id=$1 AND status='paused' AND error_kind IN ('budget','configuration') AND (reservation_id IS NULL OR provider_name IS NOT NULL) AND (lease_until IS NULL OR lease_until<now())",[brand.id]);
   for(const watch of watches)if(mediaEnabled(env))await enqueueAdMedia(pool,watch.id);
   if(env.GEMINI_API_KEY?.trim())await enqueueCategoryBatch(pool,brand.id);
   const media=(await pool.query("SELECT status,error_kind FROM ad_media_runs WHERE workspace_id=$1 AND status IN ('queued','running','starting','uncertain','paused')",[brand.id])).rows;
   const tag=(await pool.query("SELECT status,error_kind FROM public_category_batches WHERE workspace_id=$1 AND status IN ('queued','running','starting','uncertain','paused')",[brand.id])).rows;
   const requested=coverage.reduce((n,row)=>n+row.requested,0);await stepRecord(pool,id,'media',media.some(row=>['paused','uncertain'].includes(row.status))?'paused':ads&&!mediaEnabled(env)?'paused':images===ads?'complete':!media.length&&requested>=ads?'needs_review':'running',{count:images,total:ads});const tagged=Math.min(ads,await countTaggedAds(pool,brand.id)),taggingConfigured=categoryConfigured(env);await stepRecord(pool,id,'tagging',ads&&!taggingConfigured||tag.some(row=>['paused','uncertain'].includes(row.status))?'paused':tag.length?'running':tagged<ads?'needs_review':'complete',{count:tagged,total:ads});
   if(ads&&!taggingConfigured){await update(undefined,'paused',60000,'configuration');return true;}
   const blocked=[...media,...tag].find(row=>['paused','uncertain'].includes(row.status));if(blocked||blockedCollection){await update(undefined,blocked?.status==='uncertain'?'uncertain':'paused',60000,blocked?.error_kind==='budget'?'budget':blocked?.status==='uncertain'?'uncertain':blocked?.error_kind==='configuration'?'configuration':'provider');return true;}
   if(pending||media.length||tag.length||ads>0&&!mediaEnabled(env)){await update(undefined,ads>0&&!mediaEnabled(env)?'paused':'running',30000,ads>0&&!mediaEnabled(env)?'media_switch':null);return true;}
   await stepRecord(pool,id,'comparisons','complete',{count:ads});await update('complete',images<ads||tagged<ads||data.ownMatches?.some(page=>!page.highConfidence&&page.confidence>=50&&!watches.some(w=>w.brand_key===brand.id&&w.page_ids.includes(page.pageId)))||data.choices.some(choice=>choice.state==='needs_review')?'needs_review':'complete');return true;
  }
  return false;
 }catch(error){if(run){if(error instanceof MetaCollectionError&&error.reducePage&&['pages','discovery'].includes(run.phase)){const next=smallerMetaPage(metaPageSize(error.pageSize));if(next){const data=run.data as RunData;if(run.phase==='pages')data.ownPageSize=next;else data.searchPageSize=next;await client.query("UPDATE brand_onboarding_runs SET data=$3,status='running',error_kind=NULL,available_at=now()+interval '20 seconds',updated_at=now() WHERE id=$1 AND lease_owner=$2",[id,owner,JSON.stringify(data)]);return true;}}
 if(!(error instanceof OnboardingWait))options.onFailure?.(error);
 const kind=error instanceof OnboardingWait?'waiting':error instanceof CategoryError?error.kind:error instanceof MetaCollectionError?error.reason==='permission'?'configuration':'provider':error instanceof Error&&error.message==='website'?'website':'provider';await client.query("UPDATE brand_onboarding_runs SET status=CASE WHEN $3='uncertain' THEN 'uncertain' WHEN $3='waiting' THEN 'running' ELSE 'paused' END,error_kind=CASE WHEN $3='waiting' THEN NULL ELSE $3 END,available_at=now()+($4::integer*interval '1 millisecond'),updated_at=now() WHERE id=$1 AND lease_owner=$2",[id,owner,kind,error instanceof OnboardingWait?error.milliseconds:60000]);}if(!(error instanceof CategoryError)&&!(error instanceof MetaCollectionError)&&!(error instanceof OnboardingWait)&&!(error instanceof Error&&error.message==='website'))throw error;return true;}
 finally{await client.query('SELECT pg_advisory_unlock(hashtext($1))',[`onboarding-step:${id}`]).catch(()=>{});client.release();}
}
