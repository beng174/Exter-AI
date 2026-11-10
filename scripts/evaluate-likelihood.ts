import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { estimateLikelihood, likelihoodCohort, LIKELIHOOD_VERSION, type LikelihoodFeatures, type ResolvedNeighbour, type MomentumAd } from "../shared/likelihood.js";
import { validateModel, type ValidationInput } from "../shared/accuracy.js";
import { modelSchema } from "../server/accuracy/schemas.js";
/** Offline only. No provider calls, fitted weights or automatic startup work. */
export function evaluateLikelihoodFile(input:{workspaceId:string;dataSource?:"fixtures"|"public-observations"|"owned-outcomes";reference:ResolvedNeighbour[];market:MomentumAd[];holdout:{features:LikelihoodFeatures;outcome:0|1;resolvedAt:string;baseline:number}[];referenceEnd:string;holdoutStart:string;holdoutEnd:string;checkedAt:string;trainingPrevalence:number}) {
  if(!input.reference.length||!input.holdout.length)throw new Error("Reference and holdout ads are required.");
  const cohort=likelihoodCohort(input.holdout[0].features),target=input.holdout[0].features.target;
  if([...input.reference.map(n=>n.features),...input.holdout.map(n=>n.features)].some(f=>likelihoodCohort(f)!==cohort))throw new Error("Evaluate one model target and comparison group at a time.");
  const evaluation:ValidationInput={modelVersion:LIKELIHOOD_VERSION,cohort,target,referenceEnd:input.referenceEnd,holdoutStart:input.holdoutStart,holdoutEnd:input.holdoutEnd,referenceIds:input.reference.map(n=>n.features.adId),referenceFamilies:input.reference.map(n=>n.features.familyId),referenceOutcomesResolvedBy:new Date(Math.max(...input.reference.map(n=>Date.parse(n.resolvedAt)))).toISOString(),trainingPrevalence:input.trainingPrevalence,cases:input.holdout.map(n=>({adId:n.features.adId,familyId:n.features.familyId,advertiserId:n.features.advertiserId,featureAt:n.features.at,predictedAt:n.features.at,resolvedAt:n.resolvedAt,outcome:n.outcome,baseline:n.baseline,probability:estimateLikelihood(n.features,input.reference,input.market).probability}))};
  validateModel(evaluation,input.checkedAt);
  const provenance=`offline-sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
  return modelSchema.parse({workspaceId:input.workspaceId,dataSource:input.dataSource??"fixtures",provenance,reference:input.reference,market:input.market,evaluation});
}
if(process.argv[1]?.endsWith("evaluate-likelihood.ts")&&process.argv[2]){
  const input=JSON.parse(readFileSync(process.argv[2],"utf8")),output=evaluateLikelihoodFile(input);
  if(!process.argv[3])throw new Error("Provide an output JSON path.");
  writeFileSync(process.argv[3],JSON.stringify(output,null,2));
  process.stdout.write("Offline validation artefact written. Fixture runs do not establish live accuracy.\n");
}
