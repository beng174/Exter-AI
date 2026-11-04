import type { CreatorCandidate } from "./creator-research.js";
import type { BrowserCreative } from "./creative-browser.js";
import { median,selectResearchAds } from "./creative-research.js";
/** Presentation selectors over saved observations only; never introduce a fit model. */
export function selectCreatorCards(rows:CreatorCandidate[],filters:{platform?:string;country?:string;shortlisted?:boolean;minFollowers?:number}={}) {
  return rows.filter(row=>(!filters.platform||filters.platform==="all"||row.platform===filters.platform)&&(!filters.country||filters.country==="all"||row.profile?.country===filters.country)&&(!filters.shortlisted||row.shortlisted)&&(filters.minFollowers===undefined||row.profile?.followers!=null&&row.profile.followers>filters.minFollowers));
}
export function creatorCardMetrics(row:CreatorCandidate) {return {medianViews:median(row.profile?.recentPosts.map(post=>post.views)||[]),engagementPerView:row.metrics.engagementPerView.valuePercent,postsSampled:row.metrics.postsSampled};}
export function publicCaptureCount(rows:BrowserCreative[]) {return selectResearchAds(rows).length;}
export function savedScoreRows(rows:BrowserCreative[]) {return rows.filter(row=>Boolean(row.score)).sort((a,b)=>(b.score?.analysedAt||"").localeCompare(a.score?.analysedAt||""));}
export function safeEvidenceHref(value:string):string|null {try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password?url.href:null;}catch{return null;}}
