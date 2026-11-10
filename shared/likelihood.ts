import type { ModelValidation } from "./accuracy.js";
export const LIKELIHOOD_VERSION="likelihood-v1";
export const THEORY_CHECKS=[
  {key:"opening",label:"Clear opening",weight:20},
  {key:"product",label:"Product appears early",weight:15},
  {key:"sound",label:"Message works without sound",weight:15},
  {key:"offer",label:"Clear commercial decision",weight:10},
  {key:"proof",label:"Claim has support",weight:15},
  {key:"cta",label:"Clear next action",weight:15},
  {key:"placement",label:"Fits its placement",weight:10},
] as const;
export type TheoryKey=typeof THEORY_CHECKS[number]["key"];
export interface LikelihoodFeatures {
  adId:string;familyId:string;advertiserId:string;category:string;format:string;
  at:string;target:"public-winner"|"owned-benchmark";accountCohort:string|null;
  hook:string|null;angle:string|null;offer:string|null;claims:string[];cta:string|null;
  ugc:boolean|null;faceToCamera:boolean|null;hookSeconds:number|null;
  productSeconds:number|null;captions:boolean|null;lengthSeconds:number|null;
  checks:Partial<Record<TheoryKey,{met:boolean;reason:string;seconds?:number}>>;
  embeddingVersion:string|null;textEmbedding:number[]|null;visualEmbedding:number[]|null;
}
export interface ResolvedNeighbour {features:LikelihoodFeatures;outcome:0|1;resolvedAt:string}
export interface MomentumAd {adId:string;category:string;format:string;angle:string|null;hook:string|null;firstSeen:string}
export interface LikelihoodEstimate {
  modelVersion:string;target:LikelihoodFeatures["target"];cohort:string;probability:number;
  interval:[number,number];confidence:"95% uncertainty range";neighbourCount:number;
  neighbourWinShare:number|null;theoryWeight:number;theoryCoverage:number;
  momentum:number|null;positive:string[];negative:string[];missing:string[];
  validation:{auc:number|null;sampleSize:number;status:string;checkedAt:string|null};
  label:"Estimated, not yet validated"|"Modelled";reportEligible:boolean;
}
export const likelihoodCohort=(f:LikelihoodFeatures)=>JSON.stringify([f.target,f.accountCohort,f.category,f.format]);
function cosine(a:number[]|null,b:number[]|null):number|null {
  if(!a?.length||!b||a.length!==b.length||a.some(v=>!Number.isFinite(v))||b.some(v=>!Number.isFinite(v)))return null;
  const norm=Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0));
  return norm?Math.max(0,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0)/norm)):null;
}
function similarity(a:LikelihoodFeatures,b:LikelihoodFeatures):number|null {
  if(!a.embeddingVersion||a.embeddingVersion!==b.embeddingVersion)return null;
  const text=cosine(a.textEmbedding,b.textEmbedding),visual=cosine(a.visualEmbedding,b.visualEmbedding);
  if(text===null||visual===null)return null;
  const pairs:([unknown,unknown])[]=[[a.hook,b.hook],[a.angle,b.angle],[a.offer,b.offer],[a.cta,b.cta],[a.ugc,b.ugc],[a.faceToCamera,b.faceToCamera],[a.captions,b.captions]];
  const known=pairs.filter(([x,y])=>x!==null&&y!==null),tags=known.length?known.filter(([x,y])=>x===y).length/known.length:0;
  const claims=new Set([...a.claims,...b.claims]);
  const claimMatch=claims.size?a.claims.filter(c=>b.claims.includes(c)).length/claims.size:null;
  const timing=([[a.hookSeconds,b.hookSeconds,3],[a.productSeconds,b.productSeconds,5],[a.lengthSeconds,b.lengthSeconds,30]] as const).filter(([x,y])=>x!==null&&y!==null).map(([x,y,scale])=>Math.exp(-Math.abs(x!-y!)/scale));
  const contextual=[tags,...(claimMatch===null?[]:[claimMatch]),...timing];
  return (text+visual+contextual.reduce((s,v)=>s+v,0)/contextual.length)/3;
}
/** Approximate equal-tail Beta quantiles by a normalised log-density grid. */
export function betaInterval(alpha:number,beta:number):[number,number] {
  const size=1024,logs=Array.from({length:size},(_,i)=>{const x=(i+.5)/size;return (alpha-1)*Math.log(x)+(beta-1)*Math.log1p(-x);});
  const max=Math.max(...logs),weights=logs.map(v=>Math.exp(v-max)),sum=weights.reduce((s,v)=>s+v,0);
  let cumulative=0,lo=0,hi=1,found=false;
  for(let i=0;i<size;i++){cumulative+=weights[i]/sum;if(!found&&cumulative>=.025){lo=i/size;found=true;}if(cumulative>=.975){hi=(i+1)/size;break;}}
  return [lo,hi];
}
export function marketMomentum(f:LikelihoodFeatures,ads:MomentumAd[]):number|null {
  const at=Date.parse(f.at),day=86400000,seen=new Set<string>();
  const rows=ads.filter(a=>{const t=Date.parse(a.firstSeen);if(seen.has(a.adId)||a.adId===f.adId||a.category!==f.category||!Number.isFinite(t)||t>=at||t<at-60*day)return false;seen.add(a.adId);return true;});
  const recent=rows.filter(a=>Date.parse(a.firstSeen)>=at-30*day),prior=rows.filter(a=>Date.parse(a.firstSeen)<at-30*day);
  if(recent.length<10||prior.length<10)return null;
  const keys=["format",...(f.angle?["angle"]:[]),...(f.hook?["hook"]:[])] as ("format"|"angle"|"hook")[];
  const changes=keys.map(k=>recent.filter(a=>a[k]===f[k]).length/recent.length-prior.filter(a=>a[k]===f[k]).length/prior.length);
  return Math.max(-.25,Math.min(.25,changes.reduce((s,v)=>s+v,0)/changes.length));
}
export function estimateLikelihood(f:LikelihoodFeatures,reference:ResolvedNeighbour[],market:MomentumAd[],validation?:ModelValidation|null):LikelihoodEstimate {
  if(!f.category||!f.format||!Number.isFinite(Date.parse(f.at))||(f.target==="owned-benchmark"&&!f.accountCohort))throw new Error("Choose a category, format and target cohort.");
  const assessed=THEORY_CHECKS.filter(c=>f.checks[c.key]),maximum=assessed.reduce((s,c)=>s+c.weight,0);
  const score=maximum?assessed.reduce((s,c)=>s+(f.checks[c.key]!.met?c.weight:0),0)/maximum:.5;
  const prior=Math.max(.1,Math.min(.9,score)),cohort=likelihoodCohort(f),ids=new Set<string>(),families=new Set<string>();
  const neighbours=(!f.textEmbedding||!f.visualEmbedding?[]:reference).flatMap(n=>{
    const r=n.features;
    if(![r.at,n.resolvedAt].every(t=>Number.isFinite(Date.parse(t)))||r.adId===f.adId||r.familyId===f.familyId||likelihoodCohort(r)!==cohort||Date.parse(r.at)>=Date.parse(f.at)||Date.parse(n.resolvedAt)>=Date.parse(f.at)||Date.parse(n.resolvedAt)<=Date.parse(r.at)||![0,1].includes(n.outcome))return [];
    const weight=similarity(f,r);return weight!==null&&weight>=.5?[{...n,weight}]:[];
  }).sort((a,b)=>b.weight-a.weight||a.features.adId.localeCompare(b.features.adId)).filter(n=>{if(ids.has(n.features.adId)||families.has(n.features.familyId))return false;ids.add(n.features.adId);families.add(n.features.familyId);return true;}).slice(0,50);
  const weight=neighbours.reduce((s,n)=>s+n.weight,0),wins=neighbours.reduce((s,n)=>s+n.weight*n.outcome,0),momentum=marketMomentum(f,market);
  const alpha=prior*2+wins+(momentum===null?0:.5+momentum),beta=(1-prior)*2+weight-wins+(momentum===null?0:.5-momentum);
  const positive=assessed.filter(c=>f.checks[c.key]!.met).sort((a,b)=>b.weight-a.weight).map(c=>f.checks[c.key]!.reason);
  const negative=assessed.filter(c=>!f.checks[c.key]!.met).sort((a,b)=>b.weight-a.weight).map(c=>f.checks[c.key]!.reason);
  const share=weight?wins/weight:null;
  if(share!==null)(share>=.5?positive:negative).push(`${Math.round(share*100)}% of similar ads won.`);
  if(momentum!==null&&momentum!==0)(momentum>0?positive:negative).push(momentum>0?"Similar messages are growing in this category.":"Similar messages are shrinking in this category.");
  const valid=validation?.modelVersion===LIKELIHOOD_VERSION&&validation.cohort===cohort&&validation.target===f.target?validation:null;
  const live=valid?.status==="Live"&&!valid.fixture&&Boolean(f.textEmbedding&&f.visualEmbedding&&neighbours.length);
  return {modelVersion:LIKELIHOOD_VERSION,target:f.target,cohort,probability:alpha/(alpha+beta),interval:betaInterval(alpha,beta),confidence:"95% uncertainty range",neighbourCount:neighbours.length,neighbourWinShare:share,theoryWeight:2/(2+weight+(momentum===null?0:1)),theoryCoverage:maximum/100,momentum,positive:positive.slice(0,3),negative:negative.slice(0,3),missing:[...(!f.textEmbedding||!f.visualEmbedding?["Text and visual analysis are needed for similar-ad matching."]:[]),...(!neighbours.length?["No earlier resolved similar ads."]:[]),...(momentum===null?["Not enough earlier ads to measure momentum."]:[])],validation:{auc:valid?.auc??null,sampleSize:valid?.sampleSize??0,status:valid?.status??"Not enough data",checkedAt:valid?.checkedAt??null},label:live?"Modelled":"Estimated, not yet validated",reportEligible:Boolean(live)};
}
export function predictionForReport(estimate:LikelihoodEstimate|null|undefined):LikelihoodEstimate|null {
  return estimate?.modelVersion===LIKELIHOOD_VERSION&&estimate?.reportEligible&&estimate.label==="Modelled"&&estimate.validation.status==="Live"&&estimate.validation.auc!==null&&estimate.validation.auc>=.7&&estimate.validation.sampleSize>=3000?estimate:null;
}
