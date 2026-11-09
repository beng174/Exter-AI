import type {MediaDiskHealth} from "../../../shared/ad-media";
import { useEffect, useState } from "react";
import type { Brand } from "../../../shared/types";
import type { BrandResearch } from "../../../shared/brand-research";
import type { CreativeBrowserResponse } from "../../../shared/creative-browser";
import { researchWindow, type ResearchWindow } from "../../../shared/creative-research";
import { api } from "../../lib/api";
import {workspaceRead} from "../../lib/workspace-read";
import type {DatabaseStorageHealth} from "../../../shared/storage-health";
import type {MetaSourceHealth} from "../../../shared/meta-public";
export type Watchlist=import("../../../shared/meta-public").MetaWatchlist;
export interface BudgetState {cost_type:string;monthly_budget_gbp:number;used_gbp:number;paused:boolean;pause_reason:string|null}
export interface InfrastructureState {mediaDisk?:MediaDiskHealth;meta?:{status:string};tiktok?:{status:string};database?:string;storage?:DatabaseStorageHealth;budgets?:BudgetState[]}
export interface ResearchData {library:CreativeBrowserResponse;window:ResearchWindow;brand:Brand|undefined;research:BrandResearch|null;researchFailed:boolean;watchlists:Watchlist[]|null;watchlistPollFailed?:boolean;infrastructure:InfrastructureState|null;connections:{status:string;platform?:string;name?:string}[]|null;budgets:BudgetState[]|null}
export function useResearchData(brandId:string,brands:Brand[],from:string|undefined,to:string|undefined,refresh:number) {
  const [data,setData]=useState<ResearchData|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;setLoading(true);setError(false);
    const leases:{release:()=>void}[]=[];
    const read=<T,>(url:string,library=false)=>{const lease=workspaceRead<T>(url,library);leases.push(lease);return lease.promise;};
    const context=(id:string)=>Promise.allSettled([
      read<BrandResearch|null>(`/api/brand-research?${new URLSearchParams({brandId:id})}`),
      read<Watchlist[]>(`/api/public/meta/watchlists?${new URLSearchParams({workspaceId:id})}`),
      read<InfrastructureState>("/api/infrastructure/status"),
      read<{connections:ResearchData["connections"]}>(`/api/connections?${new URLSearchParams({brandId:id})}`),
      read<{budgets:BudgetState[]}>("/api/budgets")
    ]);
    async function load(){
      const query=new URLSearchParams({window:"research"});if(from)query.set("from",from);if(to)query.set("to",to);
      const contextual=context(brandId);
      const library=await read<CreativeBrowserResponse>(`/api/brands/${encodeURIComponent(brandId)}/creatives?${query}`,true);
      const window=researchWindow(library.creatives,from,to);
      const id=library.brand.id;
      const results=await (id===brandId?contextual:context(id));
      const research=results[0].status==="fulfilled"?results[0].value:null;
      if(active)setData({library,window,brand:brands.find(item=>item.id===id||item.id===brandId),research:research?.analysis?.provenance==="sample"?{...research,analysis:null}:research,researchFailed:results[0].status==="rejected",watchlists:results[1].status==="fulfilled"?results[1].value:null,infrastructure:results[2].status==="fulfilled"?results[2].value:null,connections:results[3].status==="fulfilled"?results[3].value.connections:null,budgets:results[4].status==="fulfilled"?results[4].value.budgets:null});
    }
    void load().catch(()=>{if(active){setError(true);setData(null);}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;for(const lease of leases)lease.release();};
  },[brandId,from,to,refresh]);
  const activeWorkspace=data?.watchlists?.some(w=>["queued","running"].includes(w.latestRun?.status||""))?data.library.brand.id:null;
  useEffect(()=>{
    if(!activeWorkspace)return;let active=true,pending=false;
    const timer=window.setInterval(()=>{if(pending)return;pending=true;
      void Promise.allSettled([api<Watchlist[]>(`/api/public/meta/watchlists?${new URLSearchParams({workspaceId:activeWorkspace})}`),api<MetaSourceHealth>(`/api/public/meta/source-status?${new URLSearchParams({workspaceId:activeWorkspace})}`)]).then(([lists,source])=>{if(active)setData(current=>current?.library.brand.id===activeWorkspace?{...current,...(lists.status==="fulfilled"?{watchlists:lists.value}:{}),watchlistPollFailed:lists.status==="rejected"||source.status==="rejected",library:source.status==="fulfilled"?{...current.library,metaSource:source.value}:current.library}:current);}).finally(()=>{pending=false;});
    },5000);return()=>{active=false;window.clearInterval(timer);};
  },[activeWorkspace]);
  return {data:data?{...data,brand:brands.find(item=>item.id===data.library.brand.id)||data.brand}:null,error,loading};
}
