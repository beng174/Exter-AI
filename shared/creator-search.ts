/** CP-03. Deterministic draft filters; this helper never dispatches a search. */
import {CREATOR_STYLES,creatorHandle,type CreatorBrief} from './creator-discovery.js';
export function creatorSearchDraft(text:string,brief:CreatorBrief){
 if(text.length>1000)throw new Error('Use a search shorter than 1,000 characters.');
 const chosen:string[]=[],next={...brief,keywords:[...brief.keywords],styles:[...brief.styles]},lower=text.toLowerCase();let minSales:number|undefined;
 if(/\b(?:uk|united kingdom|british)\b/i.test(text)){next.country='GB';chosen.push('Country: United Kingdom');}
 const amount=(s:string)=>Number(s.toLowerCase().replace('k','').replaceAll(',',''))*(/k$/i.test(s)?1000:1);
 const range=/(\d[\d,.]*k?)\s*(?:to|-|–)\s*(\d[\d,.]*k?)\s*followers\b/i.exec(text)??/(\d[\d,.]*k)\s*(?:to|-|–)\s*(\d[\d,.]*k)\b/i.exec(text);
 if(range){const a=amount(range[1]),b=amount(range[2]);if(!Number.isFinite(a)||!Number.isFinite(b)||a>b||b>100000000)throw new Error('Check the follower range.');next.minFollowers=a;next.maxFollowers=b;chosen.push(`Followers: ${a.toLocaleString('en-GB')} to ${b.toLocaleString('en-GB')}`);}
 else for(const [word,a,b]of [['nano',0,9999],['micro',10000,99999],['mid',100000,499999],['macro',500000,100000000]] as const)if(new RegExp(`\\b${word}\\b`).test(lower)){next.minFollowers=a;next.maxFollowers=b;chosen.push(`Follower tier: ${word}`);break;}
 for(const style of CREATOR_STYLES)if(lower.includes(style.toLowerCase())){if(!next.styles.includes(style))next.styles.push(style);chosen.push(`Style: ${style}`);}
 const sales=/sales signal\s*(?:of\s*)?(?:at least|over|>=|above)?\s*(\d{1,3})/i.exec(text);if(sales){minSales=Number(sales[1]);if(minSales>100)throw new Error('Sales Signal must be between 0 and 100.');chosen.push(`Minimum Sales Signal: ${minSales}`);}
 const niche=/(?:about|niche:|category:|for)\s+([a-z][a-z ,&-]{1,100}?)(?=\s+(?:with|under|over|between|in the uk)|[.;]|$)/i.exec(text)?.[1]?.trim();
 if(niche&&!/^(?:these|this brief|creators)/i.test(niche)){next.keywords=[...new Set([...next.keywords,niche])].slice(0,30);chosen.push(`Niche: ${niche}`);}
 return {brief:next,minSales,chosen,notice:'Only the listed filters are applied. Review them before estimating cost.'};
}
export function creatorLookalikes(value:string){const handles=value.split(/[\s,]+/).filter(Boolean).map(creatorHandle);if(!handles.length||handles.length>3||handles.some(h=>!h))throw new Error('Enter one to three valid creator handles.');return [...new Set(handles as string[])];}

export function creatorBriefHref(workspaceId:string,category:string,description:string,title:string,format=''){return '/?'+new URLSearchParams({view:'creators',brandId:workspaceId,creatorCategory:category.slice(0,160),creatorBrief:description.slice(0,500),creatorBriefTitle:title.slice(0,160),creatorBriefFormat:format.slice(0,160)}).toString();}
