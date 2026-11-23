/** PRODUCT-SPEC Working Score: advertiser backing, never sales or a prediction. */
export const WORKING_WEIGHTS={survival:.35,scaling:.25,velocity:.25,organic:.15} as const;
export type WorkingSignal=keyof typeof WORKING_WEIGHTS;
export interface WorkingScore {score:number;label:string;confidence:'High'|'Medium'|'Low';coverage:number;sample:number;provisional:boolean;signals:Record<WorkingSignal,number|null>;censored:boolean}
export function workingScore(signals:Record<WorkingSignal,number|null>,context:{days:number;active:boolean;history:number;sample:number;duplicates?:number}):WorkingScore|null{
 let earned=0,weight=0;for(const key of Object.keys(WORKING_WEIGHTS) as WorkingSignal[]){const value=signals[key];if(value!==null&&Number.isFinite(value)&&value>=0&&value<=100){earned+=value*WORKING_WEIGHTS[key];weight+=WORKING_WEIGHTS[key];}}
 if(!weight)return null;const score=Math.round(earned/weight),label=!context.active&&context.days<=7?'Switched off fast':score>=75&&context.days>=30?'Proven winner':context.days<14&&(signals.velocity!==null&&signals.velocity>=200/3||(context.duplicates??0)>1)?'Rising':score>=40&&score<=74?'Steady':'Watching';
 return {score,label,confidence:context.history<7?'Low':signals.velocity!==null&&context.history>=21?'High':'Medium',coverage:weight,sample:context.sample,provisional:weight<1||context.active,signals,censored:context.active};
}
export function percentile(value:number,values:readonly number[]){return 100*(values.filter(v=>v<value).length+.5*values.filter(v=>v===value).length)/values.length;}
