/** CP-05. Explicit small regression; never loaded or fitted on web startup. */
import {median} from './creator-discovery.js';
import {creatorCohort,type CreatorCampaign} from './creator-campaigns.js';
import {validateModel,type ModelValidation} from './accuracy.js';
export const CREATOR_FORECAST_VERSION='creator-roas-v1';
export interface CreatorForecastModel {version:string;cohort:string;coefficients:number[];creators:number;trainingIds:string[];calibrationIds:string[];holdoutIds:string[];handles:string[];referenceEnd:string;holdoutStart:string;holdoutEnd:string;mae:number;baselineMae:number;coverage:number;error90:number;residuals:number[];checkedAt:string;fixture:boolean;status:'In validation'|'Live'}
const valid=(r:CreatorCampaign)=>r.roas!==null&&Number.isFinite(r.roas)&&r.roas>=0&&r.features?.length===10&&r.features.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&r.featureAt!==null&&Date.parse(r.featureAt)<Date.parse(r.from)&&Date.parse(r.recordedAt)>=Date.parse(r.to);
const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
const input=(v:number[])=>[1,...v];
const quantile=(v:number[],q:number)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.ceil((v.length+1)*q)-1)];
export function forecastCreatorCount(rows:CreatorCampaign[],cohort:string){return new Set(rows.filter(r=>creatorCohort(r)===cohort&&r.roas!==null).map(r=>r.handle)).size;}
export function trainCreatorForecast(all:CreatorCampaign[],cohort:string,at:string):CreatorForecastModel {
 if(all.length>5000)throw new Error('Choose a smaller campaign history.');
 const rows=all.filter(r=>creatorCohort(r)===cohort&&valid(r)&&r.recordedAt<=at),n=new Set(rows.map(r=>r.handle)).size;
 if(n<50)throw new Error(`Training needs 50 creators with earlier score snapshots. ${n} eligible so far.`);
 const first=new Map<string,string>();for(const r of rows)if(!first.has(r.handle)||r.from<first.get(r.handle)!)first.set(r.handle,r.from);
 const handles=[...first.keys()].sort((a,b)=>first.get(a)!.localeCompare(first.get(b)!)||a.localeCompare(b));
 const testHandles=new Set(handles.slice(Math.floor(handles.length*.8))),start=rows.filter(r=>testHandles.has(r.handle)).map(r=>r.from).sort()[0];
 const before=rows.filter(r=>!testHandles.has(r.handle)&&r.to<start&&r.recordedAt<start),priorHandles=handles.filter(h=>before.some(r=>r.handle===h));
 if(priorHandles.length<30)throw new Error('More completed campaigns are needed before the time holdout.');
 const calibrationHandles=new Set(priorHandles.slice(Math.floor(priorHandles.length*.8))),training=before.filter(r=>!calibrationHandles.has(r.handle)),calibration=before.filter(r=>calibrationHandles.has(r.handle));
 const test=rows.filter(r=>testHandles.has(r.handle)&&r.from>=start),b=Array(11).fill(0) as number[];
 b[0]=training.reduce((n,r)=>n+Math.log1p(r.roas!),0)/training.length;
 // Fixed ridge penalty and iterations; the holdout never selects hyperparameters.
 for(let epoch=0;epoch<300;epoch++){const gradients=Array(11).fill(0);for(const r of training){const x=input(r.features!),error=dot(b,x)-Math.log1p(r.roas!);for(let j=0;j<11;j++)gradients[j]+=error*x[j]/training.length;}for(let j=0;j<11;j++)b[j]-=.1*(gradients[j]+(j===0?0:.1*b[j]));}
 const predicted=(r:CreatorCampaign)=>Math.max(0,Math.expm1(Math.min(25,dot(b,input(r.features!)))));
 const residuals=calibration.map(r=>r.roas!-predicted(r));
 const errors=calibration.map(r=>Math.abs(predicted(r)-r.roas!)),error90=quantile(errors,.9),baseline=median(training.map(r=>r.roas!))!;
 const mae=test.reduce((s,r)=>s+Math.abs(predicted(r)-r.roas!),0)/test.length,baselineMae=test.reduce((s,r)=>s+Math.abs(baseline-r.roas!),0)/test.length,coverage=test.filter(r=>Math.abs(predicted(r)-r.roas!)<=error90).length/test.length;
 return {version:CREATOR_FORECAST_VERSION,cohort,coefficients:b,creators:n,trainingIds:training.map(r=>r.id),calibrationIds:calibration.map(r=>r.id),holdoutIds:test.map(r=>r.id),handles,referenceEnd:before.map(r=>r.recordedAt).sort().at(-1)!,holdoutStart:start,holdoutEnd:test.map(r=>r.to).sort().at(-1)!,mae,baselineMae,coverage,error90,residuals,checkedAt:at,fixture:rows.some(r=>r.fixture),status:'In validation'};
}
export function creatorForecastGate(model:CreatorForecastModel,validation:ModelValidation|undefined){return Boolean(!model.fixture&&model.creators>=50&&model.mae<model.baselineMae&&model.coverage>=.85&&validation&&!validation.fixture&&validation.target==='owned-benchmark'&&validation.status==='Live'&&validation.sampleSize>=3000&&validation.auc!==null&&validation.auc>=.7&&validation.baselineAuc!==null&&validation.auc>validation.baselineAuc&&validation.ece!==null&&validation.ece<=.05&&validation.brier!==null&&validation.baselineBrier!==null&&validation.brier<validation.baselineBrier&&validation.modelVersion===model.version&&validation.cohort===model.cohort&&validation.referenceEnd===model.referenceEnd&&validation.holdoutStart===model.holdoutStart&&validation.holdoutEnd===model.holdoutEnd);}
export function predictCreatorRoas(model:CreatorForecastModel,features:number[],validation:ModelValidation|undefined){
 if(!creatorForecastGate(model,validation)||features.length!==10||features.some(v=>!Number.isFinite(v)||v<0||v>1))return null;
 const mean=Math.max(0,Math.expm1(Math.min(25,dot(model.coefficients,input(features)))));
 return {range:[Math.max(0,mean-model.error90),mean+model.error90] as [number,number],confidence:.9,validation:{auc:validation!.auc,ads:validation!.sampleSize,mae:model.mae,coverage:model.coverage,checkedAt:model.checkedAt},version:model.version};
}

/** Server-side validation uses immutable owned per-ad results, never imported pass flags. */
export function validateCreatorForecast(model:CreatorForecastModel,rows:CreatorCampaign[],at:string){
 const byId=new Map(rows.map(r=>[r.id,r])),reference=[...model.trainingIds,...model.calibrationIds].map(id=>byId.get(id)).filter((r):r is CreatorCampaign=>Boolean(r));
 const held=model.holdoutIds.map(id=>byId.get(id)).filter((r):r is CreatorCampaign=>Boolean(r));
 const refResults=reference.flatMap(r=>r.source==='Owned'?r.adOutcomes??[]:[]),prevalence=refResults.length?refResults.filter(r=>r.roas>r.benchmark).length/refResults.length:.5;
 const cases=held.flatMap(c=>c.source==='Owned'&&c.features&&c.featureAt?(c.adOutcomes??[]).map(r=>{
  const forecast=Math.max(0,Math.expm1(Math.min(25,dot(model.coefficients,input(c.features!)))));
  const probability=(1+model.residuals.filter(e=>forecast+e>r.benchmark).length)/(model.residuals.length+2);
  return {adId:r.adId,familyId:r.familyId,advertiserId:c.brand,featureAt:c.featureAt!,predictedAt:c.from,resolvedAt:c.recordedAt,outcome:(r.roas>r.benchmark?1:0) as 0|1,probability,baseline:prevalence};
 }):[]);
 return validateModel({modelVersion:model.version,cohort:model.cohort,target:'owned-benchmark',referenceEnd:model.referenceEnd,holdoutStart:model.holdoutStart,holdoutEnd:model.holdoutEnd,referenceIds:refResults.map(r=>r.adId),referenceFamilies:refResults.map(r=>r.familyId),referenceOutcomesResolvedBy:model.referenceEnd,trainingPrevalence:prevalence,cases},at,model.fixture);
}
