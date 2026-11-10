import { CREATOR_RULE_VERSION } from "../../shared/creator-discovery.js";
import { rescreenCreatorRules } from "../creators/discovery-store.js";
import type { Express, Request, Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import type pg from "pg";
import { z } from "zod";
import { readBrand } from "../db.js";
import { protectSettingsMutation } from "../request-guard.js";
import { infrastructureDatabase } from "../infrastructure/database.js";
import { LABELLING_FIELDS } from "../../shared/labelling.js";
import { emptyAccuracy, type AccuracyWorkspace } from "../../shared/accuracy-workspace.js";
import { validateModel, type AccuracyRow } from "../../shared/accuracy.js";
import { estimateLikelihood, LIKELIHOOD_VERSION, likelihoodCohort } from "../../shared/likelihood.js";
import { deriveThresholds, evaluateRecommendation, recommendationWinRate, type RecommendationTest, type ScopedOwnedDay, type TestScope, type TestResult, type ThresholdOverride } from "../../shared/recommendation-tests.js";
import { calculationChecks, factChecks, tagChecks } from "./measurements.js";
import { appendAccuracy, ensureAccuracy, latestRecords, modelValidations, readModel, newAccuracyId, saveMeasurements, savePrediction, type ModelArtifact } from "./store.js";
import { featuresSchema, launchSchema, modelSchema, overrideSchema, scopeSchema } from "./schemas.js";

interface AccuracyOptions {getPool?:()=>pg.Pool|null;now?:()=>Date}
interface Override {key:string;scope:TestScope;values:ThresholdOverride;version:string}
class AccuracyInputError extends Error {}
const scopeKey=(s:TestScope)=>JSON.stringify([s.accountId,s.platform,s.currency,s.attribution,s.conversionEvent,s.category,s.format,s.product]);
export function attachAccuracy(app:Express,db:DatabaseSync,options:AccuracyOptions={}) {
  ensureAccuracy(db);app.use("/api/accuracy",protectSettingsMutation);
  const now=()=>options.now?.()||new Date(),pool=()=>options.getPool?options.getPool():process.env.DATABASE_URL?infrastructureDatabase():null;
  const workspace=(value:unknown)=>{if(typeof value!=="string"||!readBrand(db,value)||readBrand(db,value)!.mode==="demo")throw new AccuracyInputError("Choose a real workspace.");return value;};
  const route=(handler:(req:Request,res:Response)=>Promise<void>|void)=>(req:Request,res:Response)=>{res.setHeader("Cache-Control","private, no-store");Promise.resolve().then(()=>handler(req,res)).catch(error=>res.status(error instanceof z.ZodError?400:422).json({error:error instanceof z.ZodError?"Check the measurement fields and date range.":error instanceof AccuracyInputError?error.message:"Saved accuracy data could not be checked. Previous results are unchanged."}));};
  async function accounts(id:string) {const p=pool();if(!p)return [];return (await p.query("SELECT id,account_id AS \"accountId\",platform,currency,attribution,conversion_event AS \"conversionEvent\" FROM owned_accounts WHERE workspace_id=$1",[id])).rows as AccuracyWorkspace["accounts"];}
  async function ownedRows(id:string,scope:TestScope,from:string,to:string):Promise<ScopedOwnedDay[]> {
    const p=pool();if(!p)throw new AccuracyInputError("No owned account database is available.");
    const a=(await accounts(id)).find(a=>a.accountId===scope.accountId&&a.platform===scope.platform&&a.currency===scope.currency&&a.attribution===scope.attribution&&a.conversionEvent===scope.conversionEvent);
    if(!a)throw new AccuracyInputError("Choose one account and its saved reporting settings.");
    const data=(await p.query(`SELECT d.data FROM owned_ad_days d JOIN owned_accounts a ON a.id=d.owned_account_id
      WHERE a.workspace_id=$1 AND a.id=$2 AND d.day BETWEEN $3::date AND $4::date ORDER BY d.day,d.ad_id LIMIT 100001`,[id,a.id,from,to])).rows;
    if(data.length>100000)throw new AccuracyInputError("The account window is too large. Choose a shorter period.");
    const mappings=new Map(latestRecords<{adId:string;scope:TestScope}>(db,id,"ad-scope",100000).map(m=>[JSON.stringify([m.scope.platform,m.scope.accountId,m.adId]),m]));
    return data.map(r=>{const d=r.data,m=mappings.get(JSON.stringify([d.platform,d.accountId,d.adId]));return {...d,category:m?.scope.category??"",format:m?.scope.format??"",product:m?.scope.product??""};});
  }
  app.get("/api/accuracy",route(async(req,res)=>{
    const id=workspace(req.query.workspaceId),value=emptyAccuracy();
    const rows=latestRecords<AccuracyRow>(db,id,"measurement"),tests=latestRecords<RecommendationTest>(db,id,"test"),results=latestRecords<TestResult>(db,id,"result");
    value.models=modelValidations(db,id);
    for(const model of value.models)rows.push({layer:"Predictions",field:`${model.target} · ${model.cohort}`,version:model.modelVersion,score:model.auc,sampleSize:model.sampleSize,checkedAt:model.checkedAt,status:model.status,detail:model.reasons.join(" ")||"Time holdout and calibration gates passed."});
    const wins=recommendationWinRate(results);if(tests.length)rows.push({layer:"Recommendations",field:"Test win rate",version:"test-thresholds-v1",score:wins.rate,sampleSize:wins.resolved,checkedAt:results.map(r=>r.checkedAt).sort().at(-1)??null,status:wins.resolved?"In validation":"Not enough data",detail:`${wins.wins} wins from ${wins.resolved} resolved tests. ${wins.pending} pending. No causal claim.`});
    for(const field of [...LABELLING_FIELDS.map(f=>f.label),"Product category"]){if(!rows.some(r=>r.layer==="Tags"&&(r.field===field||r.field.startsWith(`${field} (`))))rows.push({layer:"Tags",field,version:"Not checked",score:null,sampleSize:0,checkedAt:null,status:"Not enough data",detail:["Person on camera","Call to action","Product category"].includes(field)?"Matching human labels are not available.":""});}
    let creatorChecks:import("../../shared/creator-discovery.js").CreatorPrecision[]=[];
    try{const p=pool();if(p){await rescreenCreatorRules(p,id,now());const result=await p.query("SELECT v.results FROM creator_discovery_validation v JOIN creator_discovery_settings s USING(workspace_id) WHERE v.workspace_id=$1 AND v.brief_version=s.brief_version",[id]);creatorChecks=result.rows[0]?.results??[];}}catch{/* Missing creator checks never release their gate. */}
    for(const field of ["Good fit","UK","Individual creator"] as const){const c=creatorChecks.find(r=>r.field===field && r.ruleVersion===CREATOR_RULE_VERSION);rows.push({layer:"Tags",field:field==="Individual creator"?"Individual creator precision":`Creator ${field==="UK"?"UK":"good fit"} precision`,version:c?.ruleVersion??CREATOR_RULE_VERSION,score:c?.precision??null,sampleSize:c?c.tp+c.fp:0,checkedAt:c?.checkedAt??null,status:c?.clientReady?"Live":c?.matched?"In validation":"Not enough data",detail:c?`${c.tp} correct of ${c.tp+c.fp} suggested. ${c.fn} positive labels missed. ${c.missing} unmatched. ${c.interval?`95% range ${(100*c.interval[0]).toFixed(1)}% to ${(100*c.interval[1]).toFixed(1)}%.`:""} Target 85%; at least 20 suggestions. Business negatives: ${c.negativeCoverage?.business??0}; repost negatives: ${c.negativeCoverage?.repost??0}. ${c.fixture?"Fixture check only.":"Owner-labelled check."}`:"Needs a completed creator search and owner labels. Target 85%."});}
    value.rows=[...rows,...value.rows.filter(r=>!rows.some(m=>m.layer===r.layer))];
    value.tests=tests.map(test=>({test,result:results.find(r=>r.testId===test.id)??null}));
    value.overrides=latestRecords<Override>(db,id,"override");
    try{value.accounts=await accounts(id);}catch{value.ownedError="Owned account results could not be read.";}
    res.json(value);
  }));
  app.post("/api/accuracy/check",route(async(req,res)=>{
    const id=workspace(req.body?.workspaceId),at=now().toISOString(),rows=[calculationChecks(at),...tagChecks(db,id,at)];
    let factsError=false;try{const p=pool();if(p)rows.push(...await factChecks(p,id,at));}catch{factsError=true;}
    saveMeasurements(db,id,rows,at);res.json({rows,factsError,message:factsError?"Meta source facts could not be checked. Previous results are unchanged.":"Saved data checked. Fixtures are not live verification."});
  }));
  app.post("/api/accuracy/thresholds",route((req,res)=>{
    const id=workspace(req.body?.workspaceId),scope=scopeSchema.parse(req.body?.scope),values=overrideSchema.parse(req.body?.values),at=now().toISOString();
    const record:Override={key:scopeKey(scope),scope,values,version:at};appendAccuracy(db,id,"override",record.key,record,at);res.json(record);
  }));
  app.post("/api/accuracy/ad-scopes",route(async(req,res)=>{
    const id=workspace(req.body?.workspaceId),scope=scopeSchema.parse(req.body?.scope),ids=z.array(z.string().regex(/^[A-Za-z0-9:_-]{1,120}$/)).min(1).max(200).parse(req.body?.adIds),p=pool();
    if(!p)throw new AccuracyInputError("No owned account database is available.");
    const account=(await accounts(id)).find(a=>a.accountId===scope.accountId&&a.platform===scope.platform);if(!account)throw new AccuracyInputError("Choose an account in this workspace.");
    const present=(await p.query("SELECT DISTINCT ad_id FROM owned_ad_days WHERE owned_account_id=$1 AND ad_id=ANY($2::text[])",[account.id,ids])).rows.map(r=>r.ad_id);
    if(ids.some(ad=>!present.includes(ad)))throw new AccuracyInputError("Every test ad must exist in this owned account.");
    const at=now().toISOString();db.exec("BEGIN");try{for(const adId of ids)appendAccuracy(db,id,"ad-scope",JSON.stringify([scope.platform,scope.accountId,adId]),{adId,scope},at);db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}res.json({saved:ids.length});
  }));
  app.post("/api/accuracy/tests",route(async(req,res)=>{
    const body=launchSchema.parse(req.body),id=workspace(body.workspaceId),at=now().toISOString(),today=at.slice(0,10),days=(Date.parse(body.to)-Date.parse(body.from))/86400000+1;
    if(body.from<today||days<7||days>365||new Set([...body.variantIds,...body.controlIds]).size!==body.variantIds.length+body.controlIds.length)throw new AccuracyInputError("Tests need future dates, at least seven days and separate ads.");
    const overridden=latestRecords<Override>(db,id,"override").find(o=>o.key===scopeKey(body.scope));
    const history=await ownedRows(id,body.scope,new Date(Date.parse(today)-90*86400000).toISOString().slice(0,10),today);
    const mappings=latestRecords<{adId:string;scope:TestScope}>(db,id,"ad-scope",100000);
    if([...body.variantIds,...body.controlIds].some(ad=>!mappings.some(m=>m.adId===ad&&scopeKey(m.scope)===scopeKey(body.scope))))throw new AccuracyInputError("Record the category, product and format of every owned ad first.");
    const thresholds=deriveThresholds(history,body.scope,body.primaryMetric,today,overridden?.values,overridden?.version);
    if(days<thresholds.minDays)throw new AccuracyInputError("Tests must cover the full configured purchase cycle.");
    const test:RecommendationTest={...body,id:newAccuracyId(),launchedAt:at,thresholds};appendAccuracy(db,id,"test",test.id,test,at);res.status(201).json(test);
  }));
  app.post("/api/accuracy/tests/:id/refresh",route(async(req,res)=>{
    const id=workspace(req.body?.workspaceId),test=latestRecords<RecommendationTest>(db,id,"test").find(t=>t.id===req.params.id);
    if(!test){res.status(404).json({error:"No test matches this workspace."});return;}
    const result=evaluateRecommendation(test,await ownedRows(id,test.scope,test.from,test.to),now().toISOString());appendAccuracy(db,id,"result",test.id,result,result.checkedAt);res.json(result);
  }));
  app.post("/api/accuracy/models",route((req,res)=>{
    const b=modelSchema.parse(req.body),id=workspace(b.workspaceId),at=now().toISOString();
    if(b.dataSource!=="fixtures"&&b.dataSource!==(b.evaluation.target==="public-winner"?"public-observations":"owned-outcomes"))throw new AccuracyInputError("Invalid outcome source for this model target.");
    // Reference contents must agree with the frozen validation boundaries and cohort.
    if(b.reference.some(n=>n.features.target!==b.evaluation.target||likelihoodCohort(n.features)!==b.evaluation.cohort||Date.parse(n.features.at)>Date.parse(b.evaluation.referenceEnd)||Date.parse(n.resolvedAt)>Date.parse(b.evaluation.referenceOutcomesResolvedBy))||b.reference.some(n=>!b.evaluation.referenceIds.includes(n.features.adId)||!b.evaluation.referenceFamilies.includes(n.features.familyId)))throw new AccuracyInputError("Invalid reference snapshot or cohort.");
    const validation=validateModel(b.evaluation,at,b.dataSource==="fixtures"),record:ModelArtifact={reference:b.reference,market:b.market,validation,provenance:b.provenance,evaluation:b.evaluation,dataSource:b.dataSource};
    appendAccuracy(db,id,"model",`${LIKELIHOOD_VERSION}:${validation.cohort}`,record,at);res.status(201).json(validation);
  }));
  app.post("/api/accuracy/estimate",route((req,res)=>{
    const id=workspace(req.body?.workspaceId),features=featuresSchema.parse(req.body?.features);
    const model=readModel(db,id,likelihoodCohort(features));
    res.json(estimateLikelihood(features,model?.reference??[],model?.market??[],model?.validation));
  }));
  app.post("/api/accuracy/score-ads",route(async(req,res)=>{
    const id=workspace(req.body?.workspaceId),features=z.array(featuresSchema).min(1).max(20).parse(req.body?.features),at=now().toISOString();
    if(new Set(features.map(likelihoodCohort)).size>1)throw new AccuracyInputError("Choose one comparison group per scoring batch.");
    const model=readModel(db,id,likelihoodCohort(features[0])),output=[];
    for(const f of features){
      let exists=Boolean(db.prepare("SELECT id FROM ads WHERE id=? AND brand_id=? AND source!='sample'").get(f.adId,id));
      if(f.target==="owned-benchmark"){
        const c=JSON.parse(f.accountCohort!),[platform,accountId,currency,attribution,conversionEvent,product]=c;
        const prefix=`owned:${id}:${platform}:${accountId}:`,adId=f.adId.startsWith(prefix)?f.adId.slice(prefix.length):null;
        const scope={platform,accountId,currency,attribution,conversionEvent,product,category:f.category,format:f.format} as TestScope;
        const mapping=latestRecords<{adId:string;scope:TestScope}>(db,id,"ad-scope",100000).find(m=>m.adId===adId&&scopeKey(m.scope)===scopeKey(scope));
        if(!adId||!mapping||f.advertiserId!==id)throw new AccuracyInputError("Owned estimates need a confirmed product, format and account group.");
        const account=(await accounts(id)).find(a=>a.platform===platform&&a.accountId===accountId&&a.currency===currency&&a.attribution===attribution&&a.conversionEvent===conversionEvent),p=pool();
        exists=Boolean(account&&p&&(await p.query("SELECT 1 FROM owned_ad_days WHERE owned_account_id=$1 AND ad_id=$2 LIMIT 1",[account.id,adId])).rowCount);
      }

      const native=/^public:Meta:(\d+)$/.exec(f.adId)?.[1];
      if(!exists&&native){const p=pool();exists=Boolean(p&&(await p.query("SELECT 1 FROM ad_observations WHERE workspace_id=$1 AND platform='Meta' AND native_id=$2 LIMIT 1",[id,native])).rowCount);}
      if(!exists)throw new AccuracyInputError("Every scored ad must belong to this workspace. Use draft scoring for drafts.");
      const estimate=estimateLikelihood(f,model?.reference??[],model?.market??[],model?.validation);
      output.push({adId:f.adId,estimate});
    }
    db.exec("BEGIN");try{for(const item of output)savePrediction(db,id,item.adId,item.estimate,at);db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}res.json(output);
  }));
}
