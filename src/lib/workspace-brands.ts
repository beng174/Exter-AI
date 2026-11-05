import type {Brand} from "../../shared/types";
/** A read projection only. Missing optional metadata must not break the whole shell. */
export function workspaceBrands(value:unknown,demo:boolean){
  if(!Array.isArray(value))throw new Error("Brand list is unavailable.");
  const brands:Brand[]=[];let unavailable=0;
  for(const row of value){
    if(!row||typeof row!=="object"){unavailable++;continue;}
    if((row.mode==="demo")!==demo)continue;
    if(typeof row.id!=="string"||!row.id.trim()||typeof row.name!=="string"||!row.name.trim()){unavailable++;continue;}
    brands.push({...row,domain:typeof row.domain==="string"?row.domain:""});
  }
  return {brands,unavailable};
}
export function preferredWorkspace(brands:Brand[],currentId:string){
  return brands.find(brand=>brand.id===currentId)||brands.find(brand=>(brand.domain||"").replace(/^www\./,"")==="valentte.com")||brands[0];
}
