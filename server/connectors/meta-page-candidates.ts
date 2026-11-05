import {randomUUID} from "node:crypto";
import type pg from "pg";
import {candidateExcerpt,captionDomain,rankPageCandidates,type CandidateAd,type PageCandidateResult} from "../../shared/meta-page-candidates.js";
import {MetaCollectionError,MetaLibraryConnector,metaStatus} from "./meta-library.js";
import {claimMetaRequest,delayMetaRequests} from "../infrastructure/meta-rate.js";
import {reserveCost} from "../infrastructure/budget.js";

export interface PageLookupTarget {workspaceId:string;brandKey:string;name:string;domain:string}
export class MetaLookupWait extends Error {constructor(public waitMs:number){super("Waiting for the next Meta request slot.");}}
interface Entry {id:string;target:PageLookupTarget;ads:Map<string,CandidateAd>;cursor:string|null;cursors:Set<string>;pages:number;limit:number;complete:boolean;pending:boolean;checkedAt:string|null;touched:number}
export interface LookupOptions {env?:Record<string,string|undefined>;connector?:MetaLibraryConnector;now?:()=>Date;paceMs?:number}
const TTL=30*60*1000,MAX_ENTRIES=100,MAX_ADS=10000,MAX_CACHED_ADS=20000;
/** Suggestions live only in this bounded cache. No brand, watchlist or ad observation is written. */
export class MetaPageCandidates {
  private entries=new Map<string,Entry>();
  constructor(private pool:()=>pg.Pool,private options:LookupOptions={}){}
  private now(){return (this.options.now?.()||new Date()).getTime();}
  private key(t:PageLookupTarget){return JSON.stringify([t.workspaceId,t.brandKey,t.name,t.domain]);}
  configured(){return metaStatus(this.options.env).status==="configured";}
  private prune(){for(const [key,e] of this.entries)if(!e.pending&&this.now()-e.touched>TTL)this.entries.delete(key);}
  get(workspaceId:string,id:string){this.prune();return [...this.entries.values()].find(e=>e.id===id&&e.target.workspaceId===workspaceId)||null;}
  private result(e:Entry):PageCandidateResult{return {id:e.id,brandKey:e.target.brandKey,brandName:e.target.name,websiteDomain:captionDomain(e.target.domain),adsSearched:e.ads.size,complete:e.complete,limited:!e.complete&&e.pages>=e.limit,canSearchMore:!e.complete&&e.ads.size<MAX_ADS,checkedAt:e.checkedAt,candidates:rankPageCandidates([...e.ads.values()],e.target.name,e.target.domain).slice(0,3)};}
  snapshot(workspaceId:string,id:string){const e=this.get(workspaceId,id);return e?this.result(e):null;}
  async slot(){
    if(!this.configured())throw new MetaCollectionError("permission","Meta not connected");
    const wait=await claimMetaRequest(this.pool(),this.options.paceMs??20000);if(wait)throw new MetaLookupWait(wait);
    await reserveCost(this.pool(),"data_providers","meta",0);
  }
  async search(target:PageLookupTarget,more=false){
    if(!this.configured())throw new MetaCollectionError("permission","Meta not connected");
    this.prune();const key=this.key(target);let e=this.entries.get(key);
    if(!e){
      if(this.entries.size>=MAX_ENTRIES){const oldest=[...this.entries].filter(([,e])=>!e.pending).sort((a,b)=>a[1].touched-b[1].touched)[0];if(!oldest)throw new MetaLookupWait(20000);this.entries.delete(oldest[0]);}
      e={id:randomUUID(),target,ads:new Map(),cursor:null,cursors:new Set(),pages:0,limit:10,complete:false,pending:false,checkedAt:null,touched:this.now()};this.entries.set(key,e);
    }
    e.touched=this.now();
    if(e.pending)return {status:202,retryAfterMs:1000,result:this.result(e)};
    if(more&&e.pages>=e.limit&&e.ads.size<MAX_ADS)e.limit+=10;
    if(e.complete||e.pages>=e.limit||e.ads.size>=MAX_ADS)return {status:200,retryAfterMs:0,result:this.result(e)};
    e.pending=true;
    try{
      try{await this.slot();}catch(error){if(error instanceof MetaLookupWait)return {status:429,retryAfterMs:error.waitMs,result:this.result(e)};throw error;}
      const env=this.options.env||process.env;
      const connector=this.options.connector||new MetaLibraryConnector({token:env.META_ACCESS_TOKEN,version:env.META_API_VERSION});
      const page=await connector.page({searchTerm:target.name,countries:["GB"],after:e.cursor});
      await delayMetaRequests(this.pool(),page.backoffMs);
      if(page.rows.some((row:CandidateAd)=>typeof row.page_id!=="string"||!/^\d{1,30}$/.test(row.page_id)))throw new MetaCollectionError("schema","Meta returned ads without usable Page identities.");
      if(page.after&&e.cursors.has(page.after))throw new MetaCollectionError("schema","Meta pagination contains a cycle.");
      let total=[...this.entries.values()].reduce((n,entry)=>n+entry.ads.size,0);
      for(const [oldKey,old] of [...this.entries].filter(([,entry])=>entry!==e&&!entry.pending).sort((a,b)=>a[1].touched-b[1].touched)){
        if(total+page.rows.length<=MAX_CACHED_ADS)break;total-=old.ads.size;this.entries.delete(oldKey);
      }
      if(total+page.rows.length>MAX_CACHED_ADS)throw new MetaCollectionError("unavailable","Suggestion cache is busy.");
      for(const row of page.rows){
        if(e.ads.size>=MAX_ADS)break;
        // Copy only candidate evidence, never provider URLs, errors, tokens or private outcomes.
        const bodies=Array.isArray(row.ad_creative_bodies)?row.ad_creative_bodies.filter((v:unknown):v is string=>typeof v==="string").slice(0,1).map(candidateExcerpt):[];
        const captions=Array.isArray(row.ad_creative_link_captions)?row.ad_creative_link_captions.slice(0,100).map(captionDomain).filter(Boolean):[];
        e.ads.set(row.id,{id:row.id,page_id:row.page_id,page_name:typeof row.page_name==="string"?row.page_name.slice(0,200):undefined,ad_creative_bodies:bodies,ad_creative_link_captions:captions});
      }
      if(page.after)e.cursors.add(page.after);e.cursor=page.after;e.pages++;e.complete=!page.after;e.checkedAt=new Date(this.now()).toISOString();
      return {status:200,retryAfterMs:0,result:this.result(e)};
    }catch(error){
      if(error instanceof MetaCollectionError)await delayMetaRequests(this.pool(),Math.max(error.retryAfterMs,error.reason==="rate_limited"?60000:0));
      throw error;
    }finally{e.pending=false;e.touched=this.now();}
  }
}
