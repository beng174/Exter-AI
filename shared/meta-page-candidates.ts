export interface CandidateAd {id:string;page_id?:unknown;page_name?:unknown;ad_creative_bodies?:unknown;ad_creative_link_captions?:unknown}
export interface PageCandidate {
  pageId:string;pageName:string;adCount:number;domainMatchedAds:number|null;nameMatch:number;
  example:{id:string;copy:string;url:string};
}
export interface PageCandidateResult {
  id:string;brandKey:string;brandName:string;websiteDomain:string|null;adsSearched:number;
  complete:boolean;limited:boolean;canSearchMore:boolean;checkedAt:string|null;candidates:PageCandidate[];
}
/** Compare hosts, never substrings, paths or words in the caption. No URLs are fetched. */
export function captionDomain(value:unknown):string|null {
  if(typeof value!=="string"||!value.trim()||/\s/.test(value.trim()))return null;
  try{const url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.port)return null;
    const host=url.hostname.toLowerCase().replace(/^www\./,"");
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)?host:null;
  }catch{return null;}
}
const normalName=(name:string)=>name.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
export function candidateExcerpt(value:string){return value.length<=600?value:value.slice(0,599).replace(/\S+$/,"").trimEnd()+"…";}
export function pageNameMatch(brandName:string,pageName:string):number {
  const a=normalName(brandName),b=normalName(pageName);if(!a||!b)return 0;if(a===b)return 1;
  const words=new Set(a.split(" ")),other=new Set(b.split(" "));
  return [...words].filter(word=>other.has(word)).length/Math.max(words.size,other.size);
}
export function rankPageCandidates(ads:readonly CandidateAd[],brandName:string,savedDomain:string):PageCandidate[]{
  const domain=captionDomain(savedDomain),pages=new Map<string,{ads:Map<string,{ad:CandidateAd;match:boolean}>;names:Map<string,number>}>();
  for(const ad of ads){
    if(!/^\d{1,40}$/.test(ad.id)||typeof ad.page_id!=="string"||!/^\d{1,30}$/.test(ad.page_id))continue;
    const page=pages.get(ad.page_id)||{ads:new Map(),names:new Map()};
    if(page.ads.has(ad.id))continue;
    const match=Boolean(domain&&Array.isArray(ad.ad_creative_link_captions)&&ad.ad_creative_link_captions.some(caption=>{const host=captionDomain(caption);return host&&(host===domain||host.endsWith("."+domain));}));
    page.ads.set(ad.id,{ad,match});
    const name=typeof ad.page_name==="string"?ad.page_name.trim().slice(0,200):"";
    if(name)page.names.set(name,(page.names.get(name)||0)+1);pages.set(ad.page_id,page);
  }
  return [...pages].map(([pageId,page]):PageCandidate=>{
    const pageName=[...page.names].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||`Page ${pageId}`;
    const rows=[...page.ads.values()].sort((a,b)=>Number(b.match)-Number(a.match)||a.ad.id.localeCompare(b.ad.id));
    const example=rows[0].ad,bodies=Array.isArray(example.ad_creative_bodies)?example.ad_creative_bodies:[];
    return {pageId,pageName,adCount:rows.length,domainMatchedAds:domain?rows.filter(row=>row.match).length:null,nameMatch:pageNameMatch(brandName,pageName),example:{id:example.id,copy:candidateExcerpt(bodies.find((value):value is string=>typeof value==="string"&&Boolean(value.trim()))||`${pageName} ad`),url:`https://www.facebook.com/ads/library/?id=${example.id}`}};
  }).sort((a,b)=>(b.domainMatchedAds??0)-(a.domainMatchedAds??0)||b.nameMatch-a.nameMatch||b.adCount-a.adCount||a.pageId.localeCompare(b.pageId));
}
