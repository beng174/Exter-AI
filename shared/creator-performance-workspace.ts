import type {CreatorSalesSignal,CreatorAdEvidence} from './creator-performance.js';
import type {CreatorCampaign} from './creator-campaigns.js';
import type {CreatorForecastModel,predictCreatorRoas} from './creator-forecast.js';
import type {MetricName,OwnedMetric} from './owned-metrics.js';
export interface CreatorAccount {id:string;accountId:string;platform:string;currency:string;attribution:string;event:string;status:string}
export interface CreatorOwnedResult {account:string;platform:string;currency:string;attribution:string;event:string;category:string;product:string;format:string;from:string;to:string;ads:number;checkedAt:string;metrics:Record<MetricName,OwnedMetric>}
export type CreatorModelSummary=Omit<CreatorForecastModel,'residuals'|'coefficients'|'trainingIds'|'calibrationIds'|'holdoutIds'|'handles'> & {training:number;calibration:number;holdout:number;live:boolean;validation?:import("./accuracy.js").ModelValidation};
export interface CreatorPerformanceWorkspace {accounts:CreatorAccount[];cohorts:{key:string;label:string;creators:number;campaigns:number}[];models:CreatorModelSummary[]}
export interface CreatorPerformanceDetail {handle:string;signal:CreatorSalesSignal|null;ads:CreatorAdEvidence[];totalAds:number;owned:CreatorOwnedResult[];campaigns:CreatorCampaign[];forecasts:{cohort:string;value:NonNullable<ReturnType<typeof predictCreatorRoas>>}[]}
