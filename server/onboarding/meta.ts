import {CategoryError} from "../public-categories/provider.js";
import type {MetaPageSize} from "../../shared/meta-collection.js";
import type pg from "pg";
import {MetaLibraryConnector,MetaCollectionError,metaStatus} from "../connectors/meta-library.js";
import {boundedPublicBody} from "../connectors/public-json.js";
import {assertProxySupport} from "../connectors/http.js";
import {claimMetaRequest,delayMetaRequests} from "../infrastructure/meta-rate.js";
import {reserveCost} from "../infrastructure/budget.js";
import {captionDomain} from "../../shared/meta-page-candidates.js";
import {countryReach,publishedReach} from "../../shared/meta-public.js";
import type {DiscoveredPage} from "../../shared/onboarding/types.js";
export class OnboardingWait extends Error {constructor(public milliseconds:number){super('waiting');}}
export class OnboardingMeta {
 constructor(private pool:pg.Pool,private options:{env?:Record<string,string|undefined>;fetch?:typeof fetch;connector?:MetaLibraryConnector;paceMs?:number}={}){}
 async slot(){const env=this.options.env||process.env;if(metaStatus(env).status!=="configured")throw new MetaCollectionError('permission','configuration');const wait=await claimMetaRequest(this.pool,this.options.paceMs??20000);if(wait)throw new OnboardingWait(wait);try{await reserveCost(this.pool,'data_providers','meta',0);}catch{throw new CategoryError('budget');}}
 async pages(name:string):Promise<{pages:DiscoveredPage[];unavailable:boolean}>{
  await this.slot();const env=this.options.env||process.env,token=env.META_ACCESS_TOKEN!,version=env.META_API_VERSION||'v26.0';if(!/^v\d+\.0$/.test(version))throw new MetaCollectionError('schema','configuration');assertProxySupport(Boolean(this.options.fetch),env);
  const url=new URL(`https://graph.facebook.com/${version}/pages/search`);url.searchParams.set('q',name.slice(0,200));url.searchParams.set('fields','id,name,website,username');url.searchParams.set('limit','25');
  let response:Response;try{response=await(this.options.fetch||fetch)(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(90000)});}catch{throw new MetaCollectionError('unavailable','provider');}
  await delayMetaRequests(this.pool,0);let result:any;try{result=JSON.parse(await boundedPublicBody(response,1000000));}catch{throw new MetaCollectionError('unavailable','provider');}
  if(!response.ok||result.error){const code=Number(result.error?.code);if(response.status===429||[4,17,32,613,80000,80001,80003,80004].includes(code)){await delayMetaRequests(this.pool,60000);throw new OnboardingWait(60000);}if([10,100,200,2500].includes(code)||[400,403,404].includes(response.status))return {pages:[],unavailable:true};throw new MetaCollectionError('permission','configuration');}
  if(!Array.isArray(result.data)||result.data.length>25)throw new MetaCollectionError('schema','output');
  return {pages:result.data.filter((row:any)=>typeof row.id==='string'&&/^\d{1,30}$/.test(row.id)&&typeof row.name==='string'&&!row.name.includes(token)).map((row:any)=>({pageId:row.id,name:row.name.slice(0,200),website:captionDomain(typeof row.website==='string'&&!row.website.includes(token)?row.website.split(/\s+/)[0]:null),username:typeof row.username==='string'&&!row.username.includes(token)&&/^[A-Za-z0-9._]{1,100}$/.test(row.username)?row.username:null,ukAds:0,domainAds:0,domain:null,reach:null,examples:[]})),unavailable:false};
 }
 async ads(term:string,after:string|null,active:boolean,from?:string,pageSize:MetaPageSize=100){
  await this.slot();const env=this.options.env||process.env,connector=this.options.connector||new MetaLibraryConnector({token:env.META_ACCESS_TOKEN,version:env.META_API_VERSION,fetch:this.options.fetch});
  try{const page=await connector.page({searchTerm:term,countries:['GB'],after,pageSize,...(active?{activeStatus:'ACTIVE' as const}:{}),...(from?{from}:{})});await delayMetaRequests(this.pool,page.backoffMs);return page;}
  catch(error){if(error instanceof MetaCollectionError){await delayMetaRequests(this.pool,Math.max(error.retryAfterMs,error.reason==='rate_limited'?60000:0));}throw error;}
 }
}
export function mergeDiscoveredPages(previous:DiscoveredPage[],rows:Record<string,any>[],domain:string|null,seen:string[]){
 const pages=new Map(previous.map(page=>[page.pageId,{...page,examples:[...page.examples]}])),ids=new Set(seen);
 for(const row of rows){if(typeof row.id!=='string'||ids.has(row.id)||typeof row.page_id!=='string'||!/^\d{1,30}$/.test(row.page_id))continue;ids.add(row.id);
  const page=pages.get(row.page_id)||{pageId:row.page_id,name:typeof row.page_name==='string'?row.page_name.slice(0,200):`Page ${row.page_id}`,website:null,username:null,ukAds:0,domainAds:0,domain:null,reach:null,examples:[]};
  const captions=Array.isArray(row.ad_creative_link_captions)?row.ad_creative_link_captions:[],domains=captions.map(captionDomain).filter((value:unknown):value is string=>typeof value==='string');
  const match=domain?domains.find((host:string)=>host===domain||host.endsWith('.'+domain)):domains[0];
  page.ukAds++;if(match){page.domainAds++;page.domain=match;}
  const reach=countryReach(publishedReach(row));if(reach!==null)page.reach=(page.reach??0)+reach;
  if(page.examples.length<3)page.examples.push({id:row.id,copy:Array.isArray(row.ad_creative_bodies)?String(row.ad_creative_bodies[0]||'').slice(0,800):'',caption:domains[0]||null});pages.set(page.pageId,page);
 }
 return {pages:[...pages.values()].slice(0,150),seen:[...ids].slice(0,5000)};
}
