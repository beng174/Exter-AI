import type { DatabaseSync } from "node:sqlite";
import type { BrowserCreative } from "../../shared/creative-browser.js";
import { estimateLikelihood, likelihoodCohort } from "../../shared/likelihood.js";
import { mediaFormat } from "../../shared/public-comparisons.js";
import { likelihoodFeatures } from "../../shared/likelihood-features.js";
import { storedPredictions, modelValidations } from "./store.js";
/** Read-only enrichment. No training, model downloads or paid analysis on a page read. */
export function enrichLikelihood(db:DatabaseSync,workspace:string,rows:BrowserCreative[],at:string):BrowserCreative[] {
  if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accuracy_records'").get())return rows;
  const saved=storedPredictions(db,workspace);
  // Reference arrays can be large. Automatic previews without embeddings use theory only.
  const metadata=modelValidations(db,workspace);
  return rows.map(row=>{
    const features=likelihoodFeatures(row,at),stored=saved.get(row.adId);
    let storedMatches=false;
    if(stored){try{const [target,account,category,format]=JSON.parse(stored.cohort);storedMatches=Boolean(row.productCategories?.includes(category)&&mediaFormat(row)===format&&(row.owned&&row.workspaceBrand?features&&stored.cohort===likelihoodCohort(features):target==="public-winner"&&account===null));}catch{}}
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
