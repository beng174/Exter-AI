import type {Express} from "express";
import type {DatabaseSync} from "node:sqlite";
import type pg from "pg";
import {readBrand} from "../db.js";
import {brandIdentities,BrandLogoStore,type LogoOptions} from "../brand-logos.js";
import {configuredCreativeCompetitors} from "../demo/creative-competitors.js";
import type {DemoCollectionService} from "../demo/collection.js";
import {MetaCollectionError,metaResponseDelay} from "../connectors/meta-library.js";
import {MetaLookupWait,MetaPageCandidates,type LookupOptions,type PageLookupTarget} from "../connectors/meta-page-candidates.js";
import {delayMetaRequests} from "./meta-rate.js";
import {brandColour,brandInitials} from "../../shared/brand-identity.js";

export function savedPageLookupTarget(db:DatabaseSync,workspaceId:unknown,brandKey:unknown,collection?:Pick<DemoCollectionService,"snapshot">):PageLookupTarget|null{
  if(typeof workspaceId!=="string"||typeof brandKey!=="string")return null;
  const brand=readBrand(db,workspaceId);if(!brand||brand.mode==="demo")return null;
  if(brandKey===brand.id)return {workspaceId:brand.id,brandKey,name:brand.name,domain:brand.domain};
  const rival=configuredCreativeCompetitors(db,brand,collection).find(c=>(c.brandId||c.key)===brandKey);
  if(!rival)return null;
  const domain=rival.brandId?readBrand(db,rival.brandId)?.domain:brandIdentities(db,brand.id,collection).find(b=>b.name===rival.name)?.domain;
  return {workspaceId:brand.id,brandKey,name:rival.name,domain:domain||""};
}
export type PageLookupApiOptions=LookupOptions&{logos?:LogoOptions};
export function attachMetaPageCandidates(app:Express,db:DatabaseSync,getPool:()=>pg.Pool,options:PageLookupApiOptions={}){
  const lookups=new MetaPageCandidates(getPool,options);
  const pictures=new BrandLogoStore({...options.logos,opaqueMetaIdentity:true,
    beforeResourceRequest:async url=>{if(url.hostname==="graph.facebook.com")await lookups.slot();},
    onResourceResponse:async(url,response)=>{
      if(url.hostname!=="graph.facebook.com")return;
      let wait=metaResponseDelay(response),rateLimited=response.status===429;
      if(response.headers.get("content-type")?.includes("application/json"))try{
        const body=await response.clone().json();rateLimited||=[4,17,32,613,80000,80001,80003,80004].includes(Number(body?.error?.code));
      }catch{/* Only rate codes and headers are used; source error text is discarded. */}
      if(rateLimited)wait=Math.max(wait,60000);await delayMetaRequests(getPool(),wait);if(rateLimited)throw new MetaLookupWait(wait);
    },
    retryAutomatic:error=>error instanceof MetaLookupWait||error instanceof MetaCollectionError||error instanceof Error&&error.message.startsWith("Jobs paused:")
  });
  app.locals.metaCandidatePictures=pictures;
  const failure=(res:import("express").Response,error:unknown)=>{
    if(error instanceof MetaLookupWait){res.setHeader("Retry-After",String(Math.ceil(error.waitMs/1000)));res.status(429).json({error:"Waiting for the next Meta request slot.",waiting:true,retryAfterSeconds:Math.ceil(error.waitMs/1000)});}
    else if(error instanceof MetaCollectionError){const status=error.reason==="permission"?409:error.reason==="rate_limited"?429:502;
      const retryAfterSeconds=error.reason==="rate_limited"?Math.ceil(Math.max(60000,error.retryAfterMs)/1000):undefined;
      if(retryAfterSeconds)res.setHeader("Retry-After",String(retryAfterSeconds));
      res.status(status).json({error:error.reason==="permission"?"Meta access is not available. Check the token and permissions in Render.":error.reason==="rate_limited"?"Meta asked us to wait. Earlier suggestions are retained.":"The Page search could not finish. Earlier suggestions are retained.",retryAfterSeconds});
    }else res.status(503).json({error:"Page lookup is unavailable. Check the collection database and provider budget."});
  };
  app.post("/api/public/meta/page-candidates",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    const target=savedPageLookupTarget(db,req.body?.workspaceId,req.body?.brandKey,app.locals.demoCollection);
    if(!target){res.status(404).json({error:"Choose a brand from this real workspace's watchlist."});return;}
    if(!lookups.configured()){res.status(409).json({error:"Add META_ACCESS_TOKEN in Render to find Pages."});return;}
    try{
      const saved=await getPool().query("SELECT page_ids FROM watchlists WHERE workspace_id=$1 AND brand_key=$2 AND purpose='brand'",[target.workspaceId,target.brandKey]);
      if(saved.rows.some(w=>w.page_ids.length)){res.status(409).json({error:"This brand already has a saved Page ID. Manual entry remains available."});return;}
      const value=await lookups.search(target,req.body?.more===true);
      if(value.retryAfterMs)res.setHeader("Retry-After",String(Math.ceil(value.retryAfterMs/1000)));
      res.status(value.status).json({...value.result,waiting:value.status!==200,retryAfterSeconds:Math.ceil(value.retryAfterMs/1000)});
    }catch(error){failure(res,error);}
  });
  // POST keeps credential-bearing image retrieval behind the existing same-origin JSON guard.
  app.post("/api/public/meta/page-candidates/:id/picture",async(req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    if(!lookups.configured()){res.status(409).json({error:"Meta access is not configured."});return;}
    const snapshot=typeof req.body?.workspaceId==="string"?lookups.snapshot(req.body.workspaceId,String(req.params.id)):null;
    const page=snapshot?.candidates.find(c=>c.pageId===req.body?.pageId);
    if(!page){res.status(404).json({error:"This Page suggestion has expired. Search again."});return;}
    const target=savedPageLookupTarget(db,req.body.workspaceId,snapshot!.brandKey,app.locals.demoCollection);
    if(!target||target.name!==snapshot!.brandName){res.status(409).json({error:"The saved brand changed. Search again."});return;}
    try{
      const image=await (app.locals.metaCandidatePictures as BrandLogoStore).image({id:`meta-page-preview:${page.pageId}`,name:page.pageName,domain:"",metaPageId:page.pageId,mode:"imported",color:brandColour(page.pageName),initials:brandInitials(page.pageName)});
      if(image)res.type("png").send(image);else res.status(204).end();
    }catch(error){failure(res,error);}
  });
}
