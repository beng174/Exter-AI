import {captionDomain,pageNameMatch} from "../meta-page-candidates.js";
import type {BrandUnderstanding,CompetitorChoice,DiscoveredPage,IdentityMatch,WebsitePage} from "./types.js";
export const normalCategory=(value:string)=>value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}& /-]/gu," ").replace(/\s+/g," ").trim();
export function categoryList(value:unknown,max=16):string[]{return Array.isArray(value)?[...new Set(value.filter((item):item is string=>typeof item==="string").map(normalCategory).filter(item=>item.length>=3&&item.length<=80))].slice(0,max):[];}
export function sameDomain(a:unknown,b:unknown){const x=captionDomain(a),y=captionDomain(b);return Boolean(x&&y&&(x===y||x.endsWith('.'+y)||y.endsWith('.'+x)));}
export function identityMatch(page:DiscoveredPage,brandName:string,domain:string):IdentityMatch{
 const name=pageNameMatch(brandName,page.name),website=sameDomain(page.website,domain),ads=page.domainAds>0&&sameDomain(page.domain,domain);
 const exact=name===1,highConfidence=exact&&website||ads;
 const confidence=exact&&website?.99:ads?.96:website?.88:Math.min(.79,.3+name*.35+Number(page.ukAds>0)*.1+Number(Boolean(page.username&&pageNameMatch(brandName,page.username)>=.75))*.04);
 const reasons=[...(website?["Page website matches your domain"]:[]),...(ads?[`${page.domainAds} UK ${page.domainAds===1?"ad links":"ads link"} to your domain`]:[]),...(exact?["Page name matches exactly"]:name>=.5?["Page name is similar"]:[]),...(page.ukAds?[`${page.ukAds} UK ads found`]:[])];
 return {...page,confidence:Math.round(confidence*100),highConfidence,reasons};
}
export function rankIdentity(pages:DiscoveredPage[],name:string,domain:string){return pages.map(page=>identityMatch(page,name,domain)).sort((a,b)=>Number(b.highConfidence)-Number(a.highConfidence)||b.domainAds-a.domainAds||b.ukAds-a.ukAds||b.confidence-a.confidence||a.pageId.localeCompare(b.pageId));}
export function priceRange(pages:WebsitePage[]):CompetitorChoice["priceRange"]{
 const prices=pages.flatMap(page=>page.prices).filter(price=>price.currency==="GBP"&&Number.isFinite(price.value)&&price.value>0);
 return prices.length?{min:Math.min(...prices.map(price=>price.value)),max:Math.max(...prices.map(price=>price.value)),currency:"GBP",products:prices.length}:null;
}
export function competitorDecision(input:{name:string;domain:string;pages:IdentityMatch[];profile:BrandUnderstanding;ownDomain:string;ownCategories:string[];ownPrices:CompetitorChoice["priceRange"];prices:CompetitorChoice["priceRange"];keywords:string[];source:"ads"|"suggestion"}):CompetitorChoice|null{
 if(sameDomain(input.domain,input.ownDomain))return null;
 const profile=input.profile,matches=profile.matchedCategories.filter(category=>input.ownCategories.includes(category));
 if(!matches.length||["marketplace","reseller","retailer"].includes(profile.businessType)&&!profile.ownRange)return null;
 const pages=input.pages.filter(page=>page.highConfidence&&page.ukAds>0);if(!pages.length)return null;
 const ads=pages.reduce((n,page)=>n+page.ukAds,0),reaches=pages.flatMap(page=>page.reach===null?[]:[page.reach]);
 const overlap=matches.length/Math.max(input.ownCategories.length,1),priceOverlap=input.ownPrices&&input.prices&&input.ownPrices.currency===input.prices.currency&&input.ownPrices.max>=input.prices.min&&input.prices.max>=input.ownPrices.min;
 const confidence=Math.min(99,Math.round(Math.min(...pages.map(page=>page.confidence))*.8+overlap*5+Number(profile.businessType==="own_brand"||profile.ownRange)*15+Number(Boolean(priceOverlap))*4));
 return {key:input.domain,name:input.name,domain:input.domain,pageIds:pages.map(page=>page.pageId),confidence,reasons:[`Sells ${matches.join(", ")}`,`${ads} UK ads found`,...pages[0].reasons.filter(reason=>!/UK ads found/.test(reason)),...(priceOverlap?["Product prices overlap yours"]:[])],ukAds:ads,reach:reaches.length?reaches.reduce((a,b)=>a+b,0):null,categories:matches,keywordOverlap:input.keywords.filter(keyword=>input.pages.some(page=>page.examples.some(ad=>ad.copy.toLowerCase().includes(keyword.toLowerCase())))).length,priceRange:input.prices,state:confidence>=90&&(profile.businessType==="own_brand"||profile.ownRange)?"automatic":"needs_review",source:input.source};
}
export function rankCompetitors(rows:CompetitorChoice[]){return [...rows].sort((a,b)=>b.ukAds-a.ukAds||(b.reach??-1)-(a.reach??-1)||(b.keywordOverlap??0)-(a.keywordOverlap??0)||b.categories.length-a.categories.length||Number(b.reasons.includes("Product prices overlap yours"))-Number(a.reasons.includes("Product prices overlap yours"))||b.confidence-a.confidence||a.domain.localeCompare(b.domain));}
export function nextMonth(now:Date){const next=new Date(now),day=next.getUTCDate();next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+1);next.setUTCDate(Math.min(day,new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate()));return next;}
