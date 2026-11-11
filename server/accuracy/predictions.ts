import type { DatabaseSync } from "node:sqlite";
import type { BrowserCreative } from "../../shared/creative-browser.js";
import { estimateLikelihood, likelihoodCohort } from "../../shared/likelihood.js";
import { mediaFormat } from "../../shared/public-comparisons.js";
import { likelihoodFeatures } from "../../shared/likelihood-features.js";
import { storedPredictions, modelValidations } from "./store.js";
/** Read-only enrichment. No training, model downloads or paid analysis on a page read. */
export function enrichLikelihood(db:DatabaseSync,workspace:string,rows:BrowserCreative[],at:string):BrowserCreative[] {
  if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accuracy_records'").get())return rows;
  const saved=storedPredictions(db,workspace,rows.map(row=>row.adId));
  // Reference arrays can be large. Automatic previews without embeddings use theory only.
  const metadata=modelValidations(db,workspace);
  return rows.map(row=>{
    const features=likelihoodFeatures(row,at),stored=saved.get(row.adId);
    let storedMatches=false;
    if(stored){try{
      const [target,account,category,format]=JSON.parse(stored.cohort);
      if(row.owned&&row.workspaceBrand&&target==="owned-benchmark"&&row.performance.length===1){
        const c=JSON.parse(account),p=row.performance[0],key=JSON.stringify([p.platform,p.accountId,row.nativeId]);
        const record=db.prepare("SELECT data FROM accuracy_records WHERE workspace_id=? AND kind='ad-scope' AND record_key=? ORDER BY rowid DESC LIMIT 1").get(workspace,key) as {data:string}|undefined;
        const scope=record?JSON.parse(record.data).scope:null;
        storedMatches=Boolean(Array.isArray(c)&&c.length===6&&c[5]!=="unknown-product"&&JSON.stringify(c.slice(0,5))===JSON.stringify([p.platform,p.accountId,p.currency,p.attribution,p.conversionEvent])&&scope?.category===category&&scope?.format===format&&scope?.product===c[5]&&(!mediaFormat(row)||mediaFormat(row)===format));
      }else storedMatches=Boolean(!row.owned&&target==="public-winner"&&account===null&&row.productCategories?.includes(category)&&mediaFormat(row)===format);
    }catch{}}

    if(stored&&storedMatches){
      const current=metadata.find(v=>v.cohort===stored.cohort),live=current?.status==="Live"&&!current.fixture&&current.checkedAt===stored.validation.checkedAt&&stored.reportEligible;
      return {...row,likelihood:{...stored,reportEligible:Boolean(live),label:live?"Modelled":"Estimated, not yet validated",validation:current?{auc:current.auc,sampleSize:current.sampleSize,status:live?"Live":"In validation",checkedAt:current.checkedAt}:stored.validation}};
    }
    if(!features)return row;
    // A theory-only preview cannot inherit a validated multimodal model's gate.
    const estimate=estimateLikelihood(features,[],[],null);
    const validation=metadata.find(v=>v.cohort===estimate.cohort);
    if(validation)estimate.validation={auc:validation.auc,sampleSize:validation.sampleSize,status:"In validation",checkedAt:validation.checkedAt};
    return {...row,likelihood:estimate};
  });
}
