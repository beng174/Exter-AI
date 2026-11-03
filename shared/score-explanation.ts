import type { DemoAdScore, DemoScoreCriterion } from "./brand-demo.js";
export function explainScore(score: DemoAdScore) {
  const earned = score.criteria.reduce((sum,criterion)=>sum+(criterion.status==="met"?criterion.weight:0),0);
  const assessed = score.criteria.reduce((sum,criterion)=>sum+(criterion.status==="unknown"?0:criterion.weight),0);
  return {earned,assessed,total:score.totalWeight,percent:assessed?Math.round(100*earned/assessed):null,
    rows:score.criteria.map(criterion=>({...criterion,earned:criterion.status==="unknown"?null:criterion.status==="met"?criterion.weight:0}))};
}
export function scoreCriterionPopulation(scores:DemoAdScore[]) {
  const groups=new Map<string,{id:string;label:string;met:number;failed:number;unknown:number;total:number}>();
  for(const score of scores)for(const criterion of score.criteria){let row=groups.get(criterion.id);if(!row){row={id:criterion.id,label:criterion.label,met:0,failed:0,unknown:0,total:0};groups.set(criterion.id,row);}row.total++;row[criterion.status==="met"?"met":criterion.status==="not-met"?"failed":"unknown"]++;}
  return [...groups.values()];
}
