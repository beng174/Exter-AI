import {assertProxySupport} from "../connectors/http.js";
import {load} from "cheerio";
import {fetchBrandWebsitePage,type BrandResearchOptions} from "../brand-research.js";
import type {WebsitePage} from "../../shared/onboarding/types.js";
import {captionDomain} from "../../shared/meta-page-candidates.js";
const clean=(value:string,max=6000)=>value.replace(/[\s\u00a0]+/g," ").trim().slice(0,max);
export function extractWebsite(html:string,url:string,checkedAt=new Date().toISOString()):WebsitePage {
 const $=load(html),base=new URL(url),links:string[]=[],socialLinks:string[]=[],prices:WebsitePage["prices"]=[];
 const addPrice=(amount:unknown,currency:unknown)=>{const value=typeof amount==="number"?amount:typeof amount==="string"&&/^\d+(?:\.\d{1,2})?$/.test(amount)?Number(amount):NaN;if(Number.isFinite(value)&&value>0&&value<1e7&&typeof currency==="string"&&/^[A-Z]{3}$/.test(currency))prices.push({value,currency});};
 const jsonProduct=(value:unknown,product=false,depth=0)=>{if(depth>8||!value||typeof value!=="object")return;if(Array.isArray(value)){for(const item of value.slice(0,100))jsonProduct(item,product,depth+1);return;}const item=value as Record<string,unknown>,kind=item['@type'];const isProduct=product||kind==="Product"||Array.isArray(kind)&&kind.includes("Product");if(isProduct){const offers=Array.isArray(item.offers)?item.offers:[item.offers];for(const offer of offers.slice(0,50)){if(offer&&typeof offer==="object"){const row=offer as Record<string,unknown>;addPrice(row.price,row.priceCurrency);}}}if(item['@graph'])jsonProduct(item['@graph'],false,depth+1);};
 $('script[type="application/ld+json"]').slice(0,10).each((_i,node)=>{try{const raw=$(node).text();if(raw.length<200000)jsonProduct(JSON.parse(raw));}catch{}});
 $('a[href]').each((_i,node)=>{if(links.length+socialLinks.length>=300)return;try{const target=new URL($(node).attr('href')||'',url);if(target.href.length>512||target.protocol!=="https:"||target.username||target.password||target.port)return;target.search='';target.hash='';if(captionDomain(target.hostname)===captionDomain(base.hostname))links.push(target.href);else if(/^(?:www\.)?facebook\.com$/.test(target.hostname))socialLinks.push(target.href);}catch{}});
 const title=clean($('title').first().text(),250);$('script,style,noscript,template,svg,form,nav,header,footer,dialog').remove();
 const root=$('main').first().length?$('main').first():$('body'),description=$('meta[name="description"]').attr('content')||'';
 const text=clean([title,description,root.text()].join(' '));if(text.length<40||/just a moment|access denied|robot check|verify you are human/i.test(title))throw new Error('website');
 const page={url,title,text,links:[...new Set(links)],socialLinks:[...new Set(socialLinks)].slice(0,10),prices:prices.slice(0,100),checkedAt};page.links=crawlLinks([page],base.hostname);return page;
}
export function crawlLinks(pages:WebsitePage[],domain:string){
 const links=[...new Set(pages.flatMap(page=>page.links))].filter(url=>{try{const target=new URL(url);return captionDomain(target.hostname)===captionDomain(domain)&&/\/(?:collections?|products?|about|our-story)(?:\/|[-.]|$)/i.test(target.pathname);}catch{return false;}});
 const products=links.filter(url=>/\/products?\//i.test(new URL(url).pathname)).slice(0,3),collections=links.filter(url=>/\/collections?(?:\/|$)/i.test(new URL(url).pathname)).slice(0,2),about=links.filter(url=>/\/(?:about|our-story)/i.test(new URL(url).pathname)).slice(0,2);
 return [...new Set([...collections.slice(0,1),...products.slice(0,1),...about.slice(0,1),...products.slice(1,2),...collections.slice(1),...products.slice(2),...about.slice(1)])].filter(url=>!pages.some(page=>page.url===url)).slice(0,Math.max(0,8-pages.length));
}
export async function readWebsite(url:string,domain:string,options:BrandResearchOptions={}){assertProxySupport(Boolean(options.fetch),process.env);const page=await fetchBrandWebsitePage(url,domain,options);return extractWebsite(page.html,page.url);}
