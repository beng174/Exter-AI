import { useEffect, useState } from "react";
import type { Brand } from "../../../shared/types";
import type { BrandResearch } from "../../../shared/brand-research";
import type { CreativeBrowserResponse } from "../../../shared/creative-browser";
import { researchWindow, type ResearchWindow } from "../../../shared/creative-research";
import { api } from "../../lib/api";
import type {DatabaseStorageHealth} from "../../../shared/storage-health";
export type Watchlist=import("../../../shared/meta-public").MetaWatchlist;
export interface BudgetState {cost_type:string;monthly_budget_gbp:number;used_gbp:number;paused:boolean;pause_reason:string|null}
export interface InfrastructureState {meta?:{status:string};tiktok?:{status:string};database?:string;storage?:DatabaseStorageHealth;budgets?:BudgetState[]}
export interface ResearchData {library:CreativeBrowserResponse;window:ResearchWindow;brand:Brand|undefined;research:BrandResearch|null;researchFailed:boolean;watchlists:Watchlist[]|null;infrastructure:InfrastructureState|null;connections:{status:string;platform?:string;name?:string}[]|null;budgets:BudgetState[]|null}
export function useResearchData(brandId:string,brands:Brand[],from:string|undefined,to:string|undefined,refresh:number) {
  const [data,setData]=useState<ResearchData|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;setLoading(true);setError(false);
    async function load(){
      const query=new URLSearchParams();if(from)query.set("from",from);if(to)query.set("to",to);
      let library=await api<CreativeBrowserResponse>(`/api/brands/${encodeURIComponent(brandId)}/creatives?${query}`);
      const window=researchWindow(library.creatives,from,to);
      if(window.from&&window.to&&(library.reportingRange.from!==window.from||library.reportingRange.to!==window.to))library=await api<CreativeBrowserResponse>(`/api/brands/${encodeURIComponent(brandId)}/creatives?${new URLSearchParams({from:window.from,to:window.to})}`);
      const id=library.brand.id;
      const results=await Promise.allSettled([
        api<BrandResearch|null>(`/api/brand-research?${new URLSearchParams({brandId:id})}`),
        api<Watchlist[]>(`/api/public/meta/watchlists?${new URLSearchParams({workspaceId:id})}`),
        api<InfrastructureState>("/api/infrastructure/status"),
        api<{connections:ResearchData["connections"]}>(`/api/connections?${new URLSearchParams({brandId:id})}`),
        api<{budgets:BudgetState[]}>("/api/budgets")
      ]);
      const research=results[0].status==="fulfilled"?results[0].value:null;
      if(active)setData({library,window,brand:brands.find(item=>item.id===id||item.id===brandId),research:research?.analysis?.provenance==="sample"?{...research,analysis:null}:research,researchFailed:results[0].status==="rejected",watchlists:results[1].status==="fulfilled"?results[1].value:null,infrastructure:results[2].status==="fulfilled"?results[2].value:null,connections:results[3].status==="fulfilled"?results[3].value.connections:null,budgets:results[4].status==="fulfilled"?results[4].value.budgets:null});
    }
    void load().catch(()=>{if(active){setError(true);setData(null);}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[brandId,from,to,refresh]);
  return {data:data?{...data,brand:brands.find(item=>item.id===data.library.brand.id)||data.brand}:null,error,loading};
}
