import {emptyAccuracy} from "../shared/accuracy-workspace.js";
import { sampleCreatorResearch, sampleBriefReport } from "../shared/sample/research.js";
import type { Express } from "express";
import { sampleBrands, sampleLibrary, sampleResearch, sampleReports, sampleValues, sampleCannedAnswer, SAMPLE_BRAND_ID, SAMPLE_CHECKED, isSampleId } from "../shared/sample/workspace.js";

/** The sample boundary is before every database/provider route and never accepts writes. */
export function attachSampleWorkspace(app:Express) {
 app.use("/api",(req,res,next)=>{
  const requested=[...req.path.split("/"),...Object.values(req.query),...Object.values(req.body||{})];
  const hasSampleId=requested.some(isSampleId);
  const enabled=req.query.demo==="1";
  let sampleReferrer=false;
  try{sampleReferrer=new URL(req.get("referer")||"").searchParams.get("demo")==="1";}catch{}
  if(!enabled&&!hasSampleId&&!sampleReferrer)return next();
  res.setHeader("Cache-Control","private, no-store");
  if(!enabled){res.status(hasSampleId?404:403).json({error:hasSampleId?"Sample workspace requires demo=1.":"Sample workspace is read-only."});return;}
  const id=String(req.query.brandId||req.query.workspaceId||req.body?.brandId||req.body?.workspaceId||(/^\/brands\/([^/]+)/.exec(req.path)?.[1])||SAMPLE_BRAND_ID);
  if(!sampleBrands.some(brand=>brand.id===id)){res.status(404).json({error:"No sample workspace matches this request."});return;}
  if(req.path==="/ask"&&req.method==="POST") {res.json(sampleCannedAnswer(String(req.body?.question||"")));return;}
  if(!["GET","HEAD"].includes(req.method)){res.status(403).json({error:"Sample workspace is read-only. Provider, analysis, sync, collection and budget actions are disabled."});return;}
  if(req.path==="/accuracy"){res.json(emptyAccuracy(true));return;}
  if(req.path==="/brand-identities"){res.json(sampleBrands);return;}
  if(req.path==="/brands"){res.json(sampleBrands);return;}
  if(/^\/brands\/[^/]+\/creatives$/.test(req.path)){res.json(sampleLibrary(id));return;}
  if(/^\/brands\/[^/]+\/creative-competitors$/.test(req.path)){res.json({competitors:sampleLibrary(id).competitors});return;}
  if(req.path==="/brand-research"){res.json(sampleResearch(id));return;}
  if(req.path==="/public/meta/watchlists"){res.json([{id:"sample-watchlist",workspace_id:id,page_ids:["sample-page"],search_terms:sampleValues.Brands.keywords.map(item=>item.name),countries:["GB"]}]);return;}
  if(req.path==="/infrastructure/status"){res.json({meta:{status:"connected"},tiktok:{status:"not_connected"},database:"sample",budgets:[],sample:true});return;}
  if(req.path==="/connections"){res.json({connections:[{name:"Sample sources",platform:"Meta",status:"connected"}]});return;}
  if(req.path==="/budgets"){res.json({month:"2026-11",currency:"GBP",timezone:"UTC",pause_threshold:.9,budgets:[{cost_type:"inference",monthly_budget_gbp:100,used_gbp:38,paused:false,pause_reason:null,threshold_gbp:90,remaining_gbp:52,request_reserve_gbp:1},{cost_type:"data_providers",monthly_budget_gbp:20,used_gbp:0,paused:false,pause_reason:null,threshold_gbp:18,remaining_gbp:18,request_reserve_gbp:null}]});return;}
  if(req.path==="/owned/accounts"){res.json({accounts:[{id:"sample-account",workspace_id:id,platform:"Meta",account_id:"sample-northwick-main",currency:"GBP",attribution:"7d_click,1d_view",conversion_event:"purchase",enabled:false,status:"connected",last_successful_sync:SAMPLE_CHECKED,latest_data_date:"2026-11-02",last_error:null}],liveDispatchEnabled:false});return;}
  if(req.path==="/creator-research"){res.json(sampleCreatorResearch(id));return;}
  if(req.path==="/reports"){res.json(sampleReports);return;}
  if(/^\/reports\/sample-report-\d+\/download$/.test(req.path)){res.type("text/plain").send(sampleReports[0].content);return;}
  if(/^\/brands\/[^/]+\/demo$/.test(req.path)){res.json(sampleBriefReport(id));return;}
  res.status(404).json({error:"This operation is not available in the sample workspace."});
 });
}
