/** AC-01..04: computed measurements, never caller-supplied pass flags. */
export const ACCURACY_VERSION = "accuracy-v1";
export type ValidationStatus = "Live" | "In validation" | "Not enough data";
export interface AccuracyRow {
  layer: "Facts" | "Calculations" | "Tags" | "Predictions" | "Recommendations";
  field: string; version: string; score: number | null; sampleSize: number;
  checkedAt: string | null; status: ValidationStatus; detail: string;
}
export function agreement(expected: unknown[], actual: unknown[]) {
  if (expected.length !== actual.length) throw new Error("Measurement pairs must match.");
  const equal = (a: unknown, b: unknown): boolean => {
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v,i)=>equal(v,b[i]));
    if (a && b && typeof a === "object" && typeof b === "object") {
      const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>,keys=Object.keys(aa).sort();
      return equal(keys,Object.keys(bb).sort())&&keys.every(k=>equal(aa[k],bb[k]));
    }
    return a === b;
  };
  const matched=expected.filter((v,i)=>equal(v,actual[i])).length;
  return {matched,total:expected.length,score:expected.length?matched/expected.length:null};
}
export function wilson(successes:number,total:number):[number,number]|null {
  if(!total)return null;
  const z=1.95996398454,p=successes/total,d=1+z*z/total;
  const centre=(p+z*z/(2*total))/d,half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
  return [Math.max(0,centre-half),Math.min(1,centre+half)];
}
export interface PredictionCase {
  adId:string; familyId:string; advertiserId:string; featureAt:string; predictedAt:string;
  resolvedAt:string; outcome:0|1; probability:number; baseline:number;
}
export interface ValidationInput {
  modelVersion:string; cohort:string; target:"public-winner"|"owned-benchmark";
  referenceEnd:string; holdoutStart:string; holdoutEnd:string;
  referenceIds:string[]; referenceFamilies:string[]; referenceOutcomesResolvedBy:string;
  trainingPrevalence:number; cases:PredictionCase[];
}
export interface CalibrationBin {from:number;to:number;count:number;predicted:number|null;observed:number|null}
export interface ModelValidation {
  modelVersion:string;cohort:string;target:ValidationInput["target"];sampleSize:number;
  advertisers:number;auc:number|null;baselineAuc:number|null;brier:number|null;
  baselineBrier:number|null;ece:number|null;bins:CalibrationBin[];
  status:ValidationStatus;reasons:string[];checkedAt:string;fixture:boolean;
  referenceEnd:string;holdoutStart:string;holdoutEnd:string;
}
export function rocAuc(rows:Pick<PredictionCase,"outcome"|"probability">[]):number|null {
  const positives=rows.filter(r=>r.outcome===1).length,negatives=rows.length-positives;
  if(!positives||!negatives)return null;
  const sorted=[...rows].sort((a,b)=>a.probability-b.probability);let ranks=0;
  for(let i=0;i<sorted.length;){let end=i+1;while(end<sorted.length&&sorted[end].probability===sorted[i].probability)end++;
    ranks+=sorted.slice(i,end).filter(r=>r.outcome===1).length*((i+1+end)/2);i=end;}
  return (ranks-positives*(positives+1)/2)/(positives*negatives);
}
export function validateModel(input:ValidationInput,checkedAt:string,fixture=false):ModelValidation {
  const ts=(v:string)=>Date.parse(v),start=ts(input.holdoutStart),end=ts(input.holdoutEnd),reference=ts(input.referenceEnd);
  if(!input.modelVersion||!input.cohort||![start,end,reference,ts(checkedAt),ts(input.referenceOutcomesResolvedBy)].every(Number.isFinite)||reference>=start||start>end||end>ts(checkedAt)||ts(input.referenceOutcomesResolvedBy)>=start||!Number.isFinite(input.trainingPrevalence)||input.trainingPrevalence<0||input.trainingPrevalence>1)throw new Error("Invalid temporal validation boundaries.");
  const ids=new Set<string>(),families=new Set(input.referenceFamilies),refs=new Set(input.referenceIds);
  for(const c of input.cases){
    const times=[ts(c.featureAt),ts(c.predictedAt),ts(c.resolvedAt)];
    if(!c.adId||!c.familyId||!c.advertiserId||ids.has(c.adId)||refs.has(c.adId)||families.has(c.familyId)||!times.every(Number.isFinite)||times[0]>times[1]||times[1]<start||times[1]>end||times[2]<=times[1]||times[2]>ts(checkedAt)||![0,1].includes(c.outcome)||![c.probability,c.baseline].every(p=>Number.isFinite(p)&&p>=0&&p<=1))throw new Error("Duplicate, leaking or invalid prediction case.");
    ids.add(c.adId);
  }
  const rows=input.cases,n=rows.length,auc=rocAuc(rows),baselineAuc=rocAuc(rows.map(r=>({...r,probability:r.baseline})));
  const brier=n?rows.reduce((s,r)=>s+(r.probability-r.outcome)**2,0)/n:null;
  const baselineBrier=n?rows.reduce((s,r)=>s+(input.trainingPrevalence-r.outcome)**2,0)/n:null;
  const bins=Array.from({length:10},(_,i)=>{const group=rows.filter(r=>Math.min(9,Math.floor(r.probability*10))===i);return {from:i/10,to:(i+1)/10,count:group.length,predicted:group.length?group.reduce((s,r)=>s+r.probability,0)/group.length:null,observed:group.length?group.reduce((s,r)=>s+r.outcome,0)/group.length:null};});
  const ece=n?bins.reduce((s,b)=>s+b.count/n*Math.abs((b.predicted??0)-(b.observed??0)),0):null;
  const advertisers=new Set(rows.map(r=>r.advertiserId)).size,reasons:string[]=[];
  if(n<3000)reasons.push("Needs 3,000 resolved test ads.");
  if(auc===null)reasons.push("Needs winning and non-winning outcomes.");
  if(input.target==="public-winner"&&advertisers<30)reasons.push("Needs 30 advertisers.");
  const enough=!reasons.length;
  if(auc!==null&&auc<.7)reasons.push("AUC is below 0.70.");
  if(auc!==null&&baselineAuc!==null&&auc<=baselineAuc)reasons.push("Must beat the simple baseline.");
  if(ece!==null&&ece>.05)reasons.push("Calibration error exceeds 5%.");
  if(brier!==null&&baselineBrier!==null&&brier>=baselineBrier)reasons.push("Must beat baseline calibration.");
  if(fixture)reasons.push("Fixtures are not live verification.");
  return {modelVersion:input.modelVersion,cohort:input.cohort,target:input.target,sampleSize:n,advertisers,auc,baselineAuc,brier,baselineBrier,ece,bins,status:!enough?"Not enough data":reasons.length?"In validation":"Live",reasons,checkedAt,fixture,referenceEnd:input.referenceEnd,holdoutStart:input.holdoutStart,holdoutEnd:input.holdoutEnd};
}
