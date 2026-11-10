import type { BrowserCreative } from "./creative-browser.js";
import { mediaFormat } from "./public-comparisons.js";
import type { LikelihoodFeatures } from "./likelihood.js";
/** Conservative adapter: source copy does not prove product visibility or visual readability. */
export function likelihoodFeatures(row:BrowserCreative,at:string):LikelihoodFeatures|null {
  const category=row.productCategories?.[0],format=mediaFormat(row),fields=row.analysis?.fields;
  if(!category||!format||!fields)return null;
  const checks:LikelihoodFeatures["checks"]={},hook=fields.hook;
  const start="timestamps" in hook&&hook.timestamps.length?Math.min(...hook.timestamps.map(t=>t.startSeconds)):null;
  if(start!==null&&hook.value!=="unknown")checks.opening={met:start<=2,reason:start<=2?"Opening message starts within two seconds.":`Opening message starts at ${Math.floor(start/60)}:${String(Math.floor(start%60)).padStart(2,"0")}.`,seconds:start};
  // The review's seven proposed checks are stricter than the existing five-check score.
  // Do not manufacture relevance, proof, product timing or destination compatibility.
  const clean=(v:unknown)=>typeof v==="string"&&v&&!['unknown','unsure'].includes(v)?v:null;
  const cohort=row.owned&&row.workspaceBrand&&row.performance.length===1?row.performance[0]:null;
  if(row.owned&&!cohort)return null;
  return {adId:row.adId,familyId:row.mediaSha256||row.adId,advertiserId:row.brandId,category,format,at,target:row.owned?"owned-benchmark":"public-winner",accountCohort:cohort?JSON.stringify([cohort.platform,cohort.accountId,cohort.currency,cohort.attribution,cohort.conversionEvent,"unknown-product"]):null,hook:clean(row.hookType),angle:clean(row.angle),offer:clean(row.offerType),claims:[...new Set(fields.keyClaims.flatMap(c=>c.claim_type||[]))],cta:clean(fields.cta.value),ugc:row.ugc,faceToCamera:"personTalkingToCamera" in fields&&typeof fields.personTalkingToCamera.value==="boolean"?fields.personTalkingToCamera.value:null,hookSeconds:start,productSeconds:null,captions:null,lengthSeconds:row.durationSeconds,checks,embeddingVersion:null,textEmbedding:null,visualEmbedding:null};
}
