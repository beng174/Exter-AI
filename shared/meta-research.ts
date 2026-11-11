import type {CreativeBrowserResponse} from "./creative-browser.js";
import {brandSnapshots,selectResearchAds,type ResearchWindow,type EvidenceSelection,type EvidenceMeasure} from "./creative-research.js";
import {countryReach} from "./meta-public.js";
export function reachScorecard(data:CreativeBrowserResponse,window:ResearchWindow,platform?:string){
  const brands=brandSnapshots(data,window,platform),shares=reachShares(data,{asOf:window.asOf||undefined,platform});
  const hasReach=shares.some(b=>b.totalReach!==null);
  return {hasReach,brands:hasReach?brands.map(brand=>({...brand,shareActive:shares.find(b=>b.id===brand.id)!.measure})):brands};
}

export function reachShares(data:CreativeBrowserResponse,selection:EvidenceSelection={},country="GB") {
  const brands=[{id:data.brand.id,name:data.brand.name,workspaceBrand:true},...data.competitors.map(b=>({id:b.brandId||b.key,name:b.name,workspaceBrand:false}))];
  if(data.sql&&country==="GB"){
    const stats=data.sql.brands.filter(s=>s.format===(data.sql!.scopeFormat||"all")),total=stats.reduce((n,s)=>n+(s.ukReach||0),0),known=stats.reduce((n,s)=>n+s.ukKnown,0),excluded=stats.reduce((n,s)=>n+s.sample-s.ukKnown,0);
    return brands.map(brand=>{const s=stats.find(s=>s.brandId===brand.id),n=s?.ukKnown||0;const measure:EvidenceMeasure={value:n&&total>0?100*s!.ukReach!/total:null,known:n,excluded:(s?.sample||0)-n,selection:{...selection,brand:brand.id,kind:"all",reachCountry:country}};return {...brand,measure,totalReach:n?s!.ukReach:null,total,known,excluded};});
  }
  const ids=new Set(brands.map(b=>b.id));
  const rows=selectResearchAds(data.creatives,{...selection,kind:"all"}).filter(row=>ids.has(row.brandId)),known=rows.filter(row=>countryReach(row.publicReach,country)!==null);
  const total=known.reduce((sum,row)=>sum+countryReach(row.publicReach,country)!,0);
  return brands.map(brand=>{
    const sample=rows.filter(row=>row.brandId===brand.id),ads=known.filter(row=>row.brandId===brand.id),sum=ads.reduce((n,row)=>n+countryReach(row.publicReach,country)!,0);
    const measure:EvidenceMeasure={value:ads.length&&total>0?100*sum/total:null,known:ads.length,excluded:sample.length-ads.length,selection:{...selection,brand:brand.id,kind:"all",reachCountry:country}};
    return {...brand,measure,totalReach:ads.length?sum:null,total,known:known.length,excluded:rows.length-known.length};
  });
}
export function reachedAudience(data:CreativeBrowserResponse,selection:EvidenceSelection={}) {
  if(data.sql?.audience)return data.sql.audience.filter(c=>(!selection.brand||c.brandId===selection.brand)&&(!selection.show||selection.show==="all"||selection.show==="yours"&&c.brandId===data.brand.id||selection.show==="competitors"&&c.brandId!==data.brand.id));
  const brands=new Map([[data.brand.id,data.brand.name],...data.competitors.map(b=>[b.brandId||b.key,b.name] as [string,string])]);
  const result=new Map<string,{key:string;brandId:string;brand:string;country:string;age:string;gender:string;reach:number;ads:Set<string>}>();
  for(const ad of selectResearchAds(data.creatives,{...selection,kind:"all"}).filter(ad=>brands.has(ad.brandId)))for(const cell of ad.publicReach?.demographics?.value||[]){
    const key=JSON.stringify([ad.brandId,cell.country,cell.age,cell.gender]);const item=result.get(key)||{key,brandId:ad.brandId,brand:brands.get(ad.brandId)||ad.brandName,country:cell.country,age:cell.age,gender:cell.gender,reach:0,ads:new Set<string>()};
    item.reach+=cell.reach;item.ads.add(ad.adId);result.set(key,item);
  }
  return [...result.values()].map(row=>({...row,ads:row.ads.size})).sort((a,b)=>a.brand.localeCompare(b.brand)||a.country.localeCompare(b.country)||a.age.localeCompare(b.age)||a.gender.localeCompare(b.gender));
}
export function audienceReachTable(data:CreativeBrowserResponse,selection:EvidenceSelection={}){
  const cells=reachedAudience(data,selection),ages=[...new Set(cells.map(cell=>cell.age))].sort();
  const rows=new Map<string,{key:string;brandId:string;brand:string;country:string;ages:Record<string,number>;women:number|null}>();
  for(const cell of cells){
    const key=JSON.stringify([cell.brandId,cell.country]),row=rows.get(key)||{key,brandId:cell.brandId,brand:cell.brand,country:cell.country,ages:{},women:null};
    row.ages[cell.age]=(row.ages[cell.age]??0)+cell.reach;if(cell.gender==="female")row.women=(row.women??0)+cell.reach;rows.set(key,row);
  }
  return {ages,rows:[...rows.values()]};
}
