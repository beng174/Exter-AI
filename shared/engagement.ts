import type { Ad } from './types';
export function engagementObservation(ad:Ad){
 const basis=ad.engagementRateBasis||'impressions';
 const denominator=basis==='views'?ad.views:basis==='followers'?ad.followers:ad.impressions;
 return {basis,denominator:denominator||0,rate:ad.metricsAvailable===false||basis==='unavailable'||!denominator?null:ad.engagements/denominator*100};
}
