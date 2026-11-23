/** CP-01/02. Public advertiser backing is not sales or a return on spend. */
import {creatorHandle,hasCreatorCounts,median,recentCreatorPosts,type DiscoveryCreator,type DiscoveryProfile} from './creator-discovery.js';
import type {BrowserCreative} from './creative-browser.js';
import type {CountryReach,DemographicReach,PublicReach} from './meta-public.js';
export const CREATOR_SALES_VERSION='creator-sales-v1';
export const SALES_KEYS=['backing','repeat','response','audience','authenticity'] as const;
export type SalesKey=typeof SALES_KEYS[number];
export interface CreatorCredit {handle:string;kind:'Partnership'|'Whitelisted'|'Co-author'|'Copy credit'|'On-screen credit';quote:string;seconds:number|null;basis:'Observed'|'Modelled'}
export interface CreatorAdEvidence {adId:string;nativeId:string;brandId:string;brandName:string;platform:string;title:string;from:string|null;days:number|null;workingScore:number|null;reach:PublicReach|null;versions:number|null;checkedAt:string|null;credits:CreatorCredit[]}
export interface CreatorAdStats {ads:number;competitorAds:number;brands:number;repeatBrands:number|null;longest:number|null;workingMedian:number|null;versions:number|null;countries:CountryReach[];demographics:DemographicReach[];from:string|null;to:string|null;checkedAt:string|null}
export interface SalesPart {key:SalesKey;label:string;value:number|null;weight:number;availableWeight:number;reason:string;formula:string}
export interface CreatorSalesSignal {version:string;category:string;score:number|null;coverage:number;confidence:'High'|'Medium'|'Low';provisional:boolean;parts:SalesPart[];evidence:string;stats:CreatorAdStats;checkedAt:string}
export interface CreatorAudienceTarget {ages?:string[];genders?:string[]}
const clamp=(n:number)=>Math.min(100,Math.max(0,n));
const mean=(values:(number|null)[])=>{const known=values.filter((v):v is number=>v!==null&&Number.isFinite(v));return known.length?known.reduce((a,b)=>a+b,0)/known.length:null;};
export const emptyAdStats=():CreatorAdStats=>({ads:0,competitorAds:0,brands:0,repeatBrands:null,longest:null,workingMedian:null,versions:null,countries:[],demographics:[],from:null,to:null,checkedAt:null});
function profileHandle(value:unknown):string|null {
 if(typeof value!=='string')return null;
 if(/^https?:/i.test(value)){try{const u=new URL(value);if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||u.search||u.hash)return null;return creatorHandle(u.pathname.replace(/^\//,'').replace(/\/$/,''));}catch{return null;}}
 return creatorHandle(value);
}
/** Only explicit identity fields and credits. Never infer a creator from a name/face. */
export function creatorCredits(raw:Record<string,unknown>,row?:Pick<BrowserCreative,'copy'|'creatorEvidence'|'partnershipAttribution'>):CreatorCredit[] {
 const found:CreatorCredit[]=[],add=(handle:string|null,kind:CreatorCredit['kind'],quote:string,seconds:number|null=null)=>{if(handle&&!found.some(r=>r.handle===handle&&r.kind===kind))found.push({handle,kind,quote:quote.slice(0,160),seconds,basis:kind==='On-screen credit'?'Modelled':'Observed'});};
 for(const [key,kind] of [['branded_content_partner','Partnership'],['brandedContentPartner','Partnership'],['partnership_ad','Partnership'],['whitelisted_creator','Whitelisted'],['coauthors','Co-author'],['coauthor_producers','Co-author']] as const){
  const source=raw[key],items=Array.isArray(source)?source.slice(0,20):source?[source]:[];
  for(const value of items){if(!value||typeof value!=='object')continue;const item=value as Record<string,unknown>;if(item.platform&&!/^(?:instagram|ig)$/i.test(String(item.platform)))continue;for(const field of ['username','handle','profile_url','profileUrl','creator_username','creator_profile_url'])add(profileHandle(item[field]),kind,'Published creator identity.');}
 }
 if(row?.partnershipAttribution?.profileUrl)add(profileHandle(row.partnershipAttribution.profileUrl),'Partnership','Published partnership identity.');
 const bodies=Array.isArray(raw.ad_creative_bodies)?raw.ad_creative_bodies.filter(v=>typeof v==='string').join('\n'):'';
 const copy=(row?.copy||bodies).slice(0,20000);
 const credits=/(?:\b(?:featuring|created by|creator|credit(?:s)?|content by|with|by)\s*[:\-]?\s*)@([a-z0-9._]{1,30})(?![a-z0-9._])/gi;
 for(const match of copy.matchAll(credits))add(creatorHandle(match[1].replace(/\.+$/,'')),'Copy credit',`Credit: @${match[1]}`);
 for(const evidence of row?.creatorEvidence||[]){if(evidence.kind!=='visible-creator-handle'||!evidence.timestamps.length)continue;const match=/^@([a-z0-9._]{1,30})$/i.exec(evidence.value.trim());if(!match)continue;const t=evidence.timestamps[0] as {startSeconds?:number;start?:number};const seconds=t.startSeconds??t.start; if(typeof seconds==='number'&&Number.isFinite(seconds)&&seconds>=0)add(creatorHandle(match[1]),'On-screen credit',`Visible handle: @${match[1]}`,seconds);}
 return found.slice(0,50);
}
export function creatorSalesSignal(profile:DiscoveryProfile,evaluation:DiscoveryCreator['evaluation'],keywords:string[],stats:CreatorAdStats,checkedAt:string,target:CreatorAudienceTarget={}):CreatorSalesSignal {
 const longevity=stats.longest===null?null:clamp(stats.longest/90*100),backing=mean([stats.workingMedian===null?null:clamp(stats.workingMedian),longevity]);
 const paid:number[]=[],organic:number[]=[];
 if(hasCreatorCounts(profile)&&profile.followers!==null&&profile.followers>0)for(const post of recentCreatorPosts(profile.posts)){
  if(post.likes===null||post.comments===null)continue;
  const rate=(post.likes+post.comments)/profile.followers;
  if(post.paidPartnership||/(?:^|\s)#(?:ad|sponsored)\b|paid partnership/i.test(post.caption))paid.push(rate);
  else if(!/(?:^|\s)#gifted\b|gifted|affiliate/i.test(post.caption))organic.push(rate);
 }
 const organicMedian=median(organic),response=paid.length>=3&&organic.length>=3&&organicMedian!==null&&organicMedian>0?clamp(median(paid)!/organicMedian/2*100):null;
 const terms=[...new Set(keywords.map(s=>s.toLowerCase().trim()).filter(Boolean))],text=[profile.bio,...profile.posts.map(p=>p.caption)].join(' ').toLowerCase();
 const niche=terms.length&&text.trim()?terms.filter(t=>text.includes(t)).length/terms.length*100:null;
 const countryTotal=stats.countries.reduce((n,c)=>n+c.reach,0),uk=stats.countries.find(c=>c.country==='GB')?.reach;
 const country=countryTotal>0&&uk!==undefined?uk/countryTotal*100:null;
 const selected=Boolean(target.ages?.length||target.genders?.length),demographicTotal=stats.demographics.reduce((n,c)=>n+c.reach,0);
 const demographic=selected&&demographicTotal>0?stats.demographics.filter(c=>(!target.ages?.length||target.ages.includes(c.age))&&(!target.genders?.length||target.genders.includes(c.gender))).reduce((n,c)=>n+c.reach,0)/demographicTotal*100:null;
 // Three potential audience inputs share the weight; missing inputs reduce coverage.
 const audienceValues=[country,niche,demographic],audience=mean(audienceValues),audienceWeight=20*audienceValues.filter(v=>v!==null).length/3;
 const authenticity=evaluation.risk.status==='Review'?0:evaluation.risk.status==='No sampled flags'?100:null;
 const parts:SalesPart[]=[
  {key:'backing',label:'Ad backing',value:backing,weight:35,availableWeight:17.5*Number(stats.workingMedian!==null)+17.5*Number(longevity!==null),formula:'Mean of available Working Score and min(longest days / 90, 1) × 100.',reason:stats.ads?`${stats.ads} linked ads; longest ${stats.longest??'not recorded'} days. Working Score ${stats.workingMedian===null?'not assessed':stats.workingMedian.toFixed(1)}.`:'No directly credited ads are linked.'},
  {key:'repeat',label:'Repeat brand use',value:stats.repeatBrands!==null&&stats.brands?stats.repeatBrands/stats.brands*100:null,weight:20,availableWeight:stats.repeatBrands!==null&&stats.brands?20:0,formula:'Brands with two campaign bursts / dated linked brands × 100.',reason:stats.repeatBrands===null?'Needs dated partnership or campaign history.':`${stats.repeatBrands} repeat brands from ${stats.brands} dated brands. Bursts are 30 days apart.`},
  {key:'response',label:'Sponsored response',value:response,weight:15,availableWeight:response===null?0:15,formula:'Median paid engagement / median organic engagement / 2 × 100, capped at 100.',reason:`${paid.length} paid and ${organic.length} organic posts. Each side needs three.`},
  {key:'audience',label:'Audience fit',value:audience,weight:20,availableWeight:audienceWeight,formula:'Mean of published UK share, niche overlap and requested age/gender overlap.',reason:`${country===null?'UK reach not assessed':`UK: ${country.toFixed(1)}% of published country reach`}; ${niche===null?'niche not assessed':`niche match ${niche.toFixed(1)}%`}; ${demographic===null?'age/gender fit not assessed':`age/gender match ${demographic.toFixed(1)}%`}.`},
  {key:'authenticity',label:'Authenticity',value:authenticity,weight:10,availableWeight:authenticity===null?0:10,formula:'100 for an assessed check without flags; 0 for recorded flags.',reason:evaluation.risk.reasons[0]||'Audience checks are not assessed.'}
 ];
 const available=parts.reduce((s,p)=>s+p.availableWeight,0),coverage=available/100;
 return {version:CREATOR_SALES_VERSION,category:keywords[0]??'',score:available?Math.round(parts.reduce((s,p)=>s+(p.value??0)*p.availableWeight,0)/available):null,coverage,confidence:coverage>=.8&&stats.ads>=10?'High':coverage>=.5&&stats.ads>=3?'Medium':'Low',provisional:available<100,parts,stats,checkedAt,evidence:`${stats.competitorAds} competitor ads, longest ${stats.longest===null?'not recorded':stats.longest+' days'}, ${stats.versions===null?'versions not counted':stats.versions+' versions'}`};
}
export function salesFeatures(signal:CreatorSalesSignal):number[]{return [...SALES_KEYS.map(key=>(signal.parts.find(p=>p.key===key)?.value??50)/100),...SALES_KEYS.map(key=>signal.parts.find(p=>p.key===key)?.value===null?1:0)];}
