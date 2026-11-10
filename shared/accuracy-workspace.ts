import type { AccuracyRow, ModelValidation } from "./accuracy.js";
import type { RecommendationTest, TestResult, ThresholdOverride } from "./recommendation-tests.js";
export interface AccuracyAccount {id:string;accountId:string;platform:"Meta"|"TikTok";currency:string;attribution:string;conversionEvent:string}
export interface AccuracyWorkspace {
  rows:AccuracyRow[];models:ModelValidation[];tests:{test:RecommendationTest;result:TestResult|null}[];
  accounts:AccuracyAccount[];ownedError:string|null;sample:boolean;
  overrides:{key:string;scope:import("./recommendation-tests.js").TestScope;values:ThresholdOverride;version:string}[];
}
export function emptyAccuracy(sample=false):AccuracyWorkspace {
  const layers=["Facts","Calculations","Tags","Predictions","Recommendations"] as const;
  return {rows:layers.map(layer=>({layer,field:layer==="Predictions"?"Conversion likelihood":layer==="Tags"?"Human agreement":layer==="Recommendations"?"Test win rate":layer==="Facts"?"Meta source match":"Owned formulas",version:"Not checked",score:null,sampleSize:0,checkedAt:null,status:"Not enough data",detail:sample?"Sample workspace cannot validate real models.":"No measurement is saved yet."})),models:[],tests:[],accounts:[],ownedError:null,sample,overrides:[]};
}
