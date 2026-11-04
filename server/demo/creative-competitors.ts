import type { DatabaseSync } from "node:sqlite";
import type { Brand } from "../../shared/types.js";
import type { CreativeCompetitor } from "../../shared/creative-browser.js";
import { DemoCollectionRequestError, type DemoCollectionService } from "./collection.js";

/** One configured set for UI-02 and the sidebar. This function only reads saved state. */
export function configuredCreativeCompetitors(db:DatabaseSync,brand:Brand,collection?:Pick<DemoCollectionService,"snapshot">):CreativeCompetitor[] {
  const all=(db.prepare("SELECT data FROM brands").all() as {data:string}[]).map(row=>JSON.parse(row.data) as Brand).filter(item=>item.mode!=="demo");
  const normal=(value:string)=>value.trim().toLocaleLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/\/$/,"");
  const result=new Map<string,CreativeCompetitor>();
  const add=(name:string,brandId:string|null,status:string)=>{
    const match=all.find(item=>item.id===brandId)||all.find(item=>[item.id,item.name,item.domain].some(value=>normal(value)===normal(name)));
    if(match?.id===brand.id||match&&normal(match.name)===normal(brand.name)||[brand.id,brand.name,brand.domain].some(value=>normal(value)===normal(name)))return;
    const key=match?`brand:${match.id}`:`name:${normal(name)}`;
    result.set(key,{key,brandId:match?.id||null,name:match?.name||name,status});
  };
  for(const name of brand.competitors)add(name,null,"configured");
  if(collection){
    try {for(const item of collection.snapshot(brand.id).competitors)add(item.name,item.brandId,item.status);}
    catch(error){if(!(error instanceof DemoCollectionRequestError&&error.status===400))throw error;}
  }
  return [...result.values()];
}
