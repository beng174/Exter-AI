import { latestOwnedDays, ownedMetrics, type OwnedDay } from "./owned-metrics.js";
import { wilson } from "./accuracy.js";
export type TestMetric="ROAS"|"CPA"|"Hook rate";
export interface TestScope {accountId:string;platform:OwnedDay["platform"];currency:string;attribution:string;conversionEvent:string;category:string;format:string;product:string}
export interface ScopedOwnedDay extends OwnedDay {category:string;format:string;product:string}
export interface TestThresholds {
  version:"test-thresholds-v1";source:"Account history"|"Default thresholds"|"Brand override";
  minSpend:number;minPurchases:number;minImpressions:number;minDays:number;winMargin:number;
  medianCpa:number|null;dailyPurchases:number|null;dailyImpressions:number|null;
  historyAds:number;historyDays:number;historyFrom:string;historyTo:string;
  settingsVersion:string;attributionLagDays:number;
}
export type ThresholdOverride=Partial<Pick<TestThresholds,"minSpend"|"minPurchases"|"minImpressions"|"minDays"|"winMargin"|"attributionLagDays">>;
export interface RecommendationTest {
  id:string;workspaceId:string;title:string;sourceKind:"brief"|"recommendation";sourceId:string;
  scope:TestScope;variantIds:string[];controlIds:string[];primaryMetric:TestMetric;
  from:string;to:string;launchedAt:string;thresholds:TestThresholds;
}
const DAY=86400000;
export const sameTestScope=(a:TestScope,b:TestScope)=>["accountId","platform","currency","attribution","conversionEvent","category","format","product"].every(k=>a[k as keyof TestScope]===b[k as keyof TestScope]);
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null;};
function grouped(rows:ScopedOwnedDay[]) {const groups=new Map<string,ScopedOwnedDay[]>();for(const r of rows){const group=groups.get(r.adId)||[];group.push(r);groups.set(r.adId,group);}return groups;}
export function deriveThresholds(history:ScopedOwnedDay[],scope:TestScope,primary:TestMetric,launchDay:string,override:ThresholdOverride={},settingsVersion="default"):TestThresholds {
  const end=Date.parse(launchDay),from=new Date(end-90*DAY).toISOString().slice(0,10),to=new Date(end-DAY).toISOString().slice(0,10);
  const rows=(latestOwnedDays(history) as ScopedOwnedDay[]).filter(r=>sameTestScope(scope,r)&&r.day>=from&&r.day<=to);
  const ads=[...grouped(rows).values()].map(ownedMetrics),eligible=ads.filter(m=>m.CPA.value!==null&&m.CPA.value>0);
  const days=new Set(rows.map(r=>r.day)).size,typical=median(eligible.map(m=>m.CPA.value!));
  const comparable=ads.map(m=>m[primary].value).filter((v):v is number=>v!==null&&v>0).slice(0,200);
  const differences:number[]=[];for(let i=0;i<comparable.length;i++)for(let j=i+1;j<comparable.length;j++)differences.push(Math.abs(comparable[i]-comparable[j])/((comparable[i]+comparable[j])/2));
  const enough=eligible.length>=20&&comparable.length>=20&&days>=30&&typical!==null;
  const total=(key:"purchases"|"impressions")=>rows.length&&rows.every(r=>r[key]!==null)?rows.reduce((s,r)=>s+r[key]!,0)/Math.max(1,days):null;
  const lag=scope.attribution.includes("7d_click")?7:scope.attribution.includes("1d_")?1:7;
  return {version:"test-thresholds-v1",source:Object.keys(override).length?"Brand override":enough?"Account history":"Default thresholds",minSpend:enough?3*typical!:150,minPurchases:10,minImpressions:1000,minDays:7,winMargin:enough?median(differences)??.1:.1,medianCpa:typical,dailyPurchases:total("purchases"),dailyImpressions:total("impressions"),historyAds:eligible.length,historyDays:days,historyFrom:from,historyTo:to,settingsVersion,attributionLagDays:lag,...override};
}
export interface TestArm {ROAS:number|null;CPA:number|null;"Hook rate":number|null;spend:number|null;purchases:number|null;impressions:number|null;adIds:string[]}
export interface TestResult {testId:string;checkedAt:string;status:"Pending"|"Won"|"Did not win";reason:string;variant:TestArm;control:TestArm;improvement:number|null;confidence:number|null;differenceInterval:[number,number]|null;cpaGuardrail:boolean|null}
function arm(rows:ScopedOwnedDay[],adIds:string[]):TestArm {
  const metrics=ownedMetrics(rows);const sum=(k:"spend"|"purchases"|"impressions")=>rows.length&&rows.every(r=>r[k]!==null)?rows.reduce((s,r)=>s+r[k]!,0):null;
  return {ROAS:metrics.ROAS.rowsExcluded?null:metrics.ROAS.value,CPA:metrics.CPA.rowsExcluded?null:metrics.CPA.value,"Hook rate":metrics["Hook rate"].rowsExcluded?null:metrics["Hook rate"].value,spend:sum("spend"),purchases:sum("purchases"),impressions:sum("impressions"),adIds};
}
function confidenceByDay(a:ScopedOwnedDay[],b:ScopedOwnedDay[],metric:TestMetric):{confidence:number|null;interval:[number,number]|null} {
  const days=[...new Set([...a,...b].map(r=>r.day))].sort();
  if(days.length<7)return {confidence:null,interval:null};
  // Paired day resampling preserves account-wide day effects. Fixed seed makes reruns reproducible.
  let seed=2166136261;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const numerator=metric==="ROAS"?"purchaseValue":metric==="CPA"?"spend":"earlyViews",denominator=metric==="ROAS"?"spend":metric==="CPA"?"purchases":"impressions";
  const aggregate=(rows:ScopedOwnedDay[])=>{const totals=new Map<string,[number,number]>();for(const r of rows){if(r[numerator]===null||r[denominator]===null)return null;const t=totals.get(r.day)||[0,0];t[0]+=r[numerator]!;t[1]+=r[denominator]!;totals.set(r.day,t);}return totals;};
  const left=aggregate(a),right=aggregate(b);if(!left||!right)return {confidence:null,interval:null};
  const deltas:number[]=[];for(let i=0;i<500;i++){let an=0,ad=0,bn=0,bd=0;for(let j=0;j<days.length;j++){const d=days[Math.floor(random()*days.length)],x=left.get(d),y=right.get(d);an+=x?.[0]??0;ad+=x?.[1]??0;bn+=y?.[0]??0;bd+=y?.[1]??0;}if(ad&&bd)deltas.push(metric==="CPA"?bn/bd-an/ad:an/ad-bn/bd);}
  if(deltas.length<400)return {confidence:null,interval:null};deltas.sort((x,y)=>x-y);
  return {confidence:deltas.filter(v=>v>0).length/deltas.length,interval:[deltas[Math.floor(deltas.length*.025)],deltas[Math.floor(deltas.length*.975)]]};
}
export function evaluateRecommendation(test:RecommendationTest,input:ScopedOwnedDay[],checkedAt:string):TestResult {
  const rows=latestOwnedDays(input).filter(r=>r.day>=test.from&&r.day<=test.to) as ScopedOwnedDay[],ids=[...test.variantIds,...test.controlIds];
  const selected=rows.filter(r=>ids.includes(r.adId));
  if(new Set(ids).size!==ids.length||!test.variantIds.length||!test.controlIds.length||selected.some(r=>!sameTestScope(test.scope,r)))throw new Error("Tests require disjoint ads in one owned comparison group.");
  const a=selected.filter(r=>test.variantIds.includes(r.adId)),b=selected.filter(r=>test.controlIds.includes(r.adId));
  const variant=arm(a,test.variantIds),control=arm(b,test.controlIds),t=test.thresholds;
  const result:TestResult={testId:test.id,checkedAt,status:"Pending",reason:"Waiting for enough account results.",variant,control,improvement:null,confidence:null,differenceInterval:null,cpaGuardrail:test.primaryMetric==="ROAS"&&variant.CPA!==null&&control.CPA!==null?variant.CPA>control.CPA*1.2:null};
  if(Date.parse(checkedAt)<Date.parse(test.to)+DAY*(1+t.attributionLagDays)){result.reason="Waiting for the reporting window and late purchases.";return result;}
  const groups=grouped(selected);
  let commonDays:Set<string>|null=null;
  for(const id of ids){const ad=groups.get(id)||[],m=arm(ad,[id]),days=new Set(ad.filter(r=>(r.spend!==null&&r.spend>0)||(r.impressions!==null&&r.impressions>0)).map(r=>r.day)).size;
    const active=new Set(ad.filter(r=>(r.spend!==null&&r.spend>0)||(r.impressions!==null&&r.impressions>0)).map(r=>r.day));
    commonDays=commonDays===null?active:new Set<string>([...(commonDays as Set<string>)].filter((d:string)=>active.has(d)));
    if(days<t.minDays||m.spend===null||m.spend<t.minSpend||(test.primaryMetric==="Hook rate"?m.impressions===null||m.impressions<t.minImpressions:m.purchases===null||m.purchases<t.minPurchases))return result;
    if(ad.some(r=>r.spend===null||(test.primaryMetric==="Hook rate"?r.impressions===null||r.earlyViews===null:r.purchases===null||(test.primaryMetric==="ROAS"&&r.purchaseValue===null)))){result.reason="Some daily results are missing.";return result;}
  }
  if(!commonDays||commonDays.size<t.minDays){result.reason="Variants need the same reporting days.";return result;}
  const x=variant[test.primaryMetric],y=control[test.primaryMetric];if(x===null||y===null||y<=0)return result;
  const improvement=test.primaryMetric==="CPA"?(y-x)/y:(x-y)/y,confidence=confidenceByDay(a,b,test.primaryMetric);
  return {...result,status:improvement>t.winMargin?"Won":"Did not win",reason:improvement>t.winMargin?"Beat the control beyond the normal swing.":"Did not beat the control beyond the normal swing.",improvement,confidence:confidence.confidence,differenceInterval:confidence.interval};
}
export function recommendationWinRate(results:TestResult[]) {
  const latest=new Map<string,TestResult>();for(const r of results)if(!latest.has(r.testId)||r.checkedAt>=latest.get(r.testId)!.checkedAt)latest.set(r.testId,r);
  const resolved=[...latest.values()].filter(r=>r.status!=="Pending"),wins=resolved.filter(r=>r.status==="Won").length;
  return {wins,resolved:resolved.length,pending:latest.size-resolved.length,rate:resolved.length?wins/resolved.length:null,interval:wilson(wins,resolved.length)};
}
