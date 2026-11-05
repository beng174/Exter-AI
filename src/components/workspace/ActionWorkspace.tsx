import {BrandName} from "../ui/BrandIdentity";
import { useEffect, useState, type ReactNode } from "react";
import type { Brand, Report } from "../../../shared/types";
import type { BrandDemoReport } from "../../../shared/brand-demo";
import type { CreatorResearchSnapshot } from "../../../shared/creator-research";
import type { OwnedAccount } from "../../../server/owned/types";
import { PageHeader, SectionCard } from "../ui";
import { useResearchData, type ResearchData } from "../research/useResearchData";
import { api } from "../../lib/api";
import {navigation,type ViewId,type resolveNavigation} from "../../navigation";
import { BriefsPage, ScoresPage, ReportsPage } from "./EvidencePages";
import { CreatorsPage } from "./CreatorsPage";
import { AskPage } from "./AskPage";
import { DataSourcesPage } from "./DataSourcesPage";
import "./ActionWorkspace.css";
export const ACTION_VIEWS:ViewId[]=["briefs","creators","scores","ask","reports","data"];
export interface Saved<T>{value:T|null;failed:boolean}
export interface ActionData {base:ResearchData;drafts:Saved<BrandDemoReport>;creators:Saved<CreatorResearchSnapshot>;reports:Saved<Report[]>;owned:Saved<{accounts:OwnedAccount[];liveDispatchEnabled:boolean}>}
export interface ActionProps {data:ActionData;refresh:()=>void;header:(actions?:ReactNode)=>ReactNode}
const titles:Record<string,string>={briefs:"Opportunities and briefs",creators:"Creators",scores:"Scores",ask:"Ask Exter",reports:"Reports",data:"Data sources"};
const subtitles:Record<string,string>={briefs:"Ranked angles with their evidence, and a ready brief for each one.",creators:"Creators who fit the brand and the brief. Each fit measure is shown on its own, never blended into one number.",scores:"Score a draft before it goes live, and see which checks each creative misses.",ask:"Questions answered only from your stored evidence. Every statement links to the ads, reviews or numbers behind it.",reports:"The Monday data pack your team writes the client report from, and the read-only view clients see.",data:"Where every number comes from, whether it is working, and the rules applied to it."};
export function ActionWorkspace({brandId,brand,route}:{brandId:string;brand?:Brand;route:ReturnType<typeof resolveNavigation>}) {
  const [revision,setRevision]=useState(0),[extras,setExtras]=useState<Omit<ActionData,"base">|null>(null);
  const {data:base,error,loading}=useResearchData(brandId,brand?[brand]:[],undefined,undefined,revision);
  const refresh=()=>setRevision(value=>value+1),view=route.id;
  useEffect(()=>{if(!base)return;let active=true;setExtras(null);const id=base.library.brand.id;
    const paths=[`/api/brands/${encodeURIComponent(id)}/demo`,`/api/creator-research?${new URLSearchParams({brandId:id})}`,`/api/reports?${new URLSearchParams({brandId:id})}`,`/api/owned/accounts?${new URLSearchParams({workspaceId:id})}`];
    void Promise.allSettled(paths.map(path=>api(path))).then(results=>{if(!active)return;const saved=<T,>(index:number):Saved<T>=>({value:results[index].status==="fulfilled"?(results[index] as PromiseFulfilledResult<T>).value:null,failed:results[index].status==="rejected"});setExtras({drafts:saved<BrandDemoReport>(0),creators:saved<CreatorResearchSnapshot>(1),reports:saved<Report[]>(2),owned:saved<{accounts:OwnedAccount[];liveDispatchEnabled:boolean}>(3)});});return()=>{active=false;};
  },[base?.library.brand.id,revision]);
  useEffect(()=>{if(!extras||!base)return;const hash=window.location.hash.slice(1);if(!["owned-accounts","monthly-budgets"].includes(hash))return;const frame=requestAnimationFrame(()=>document.getElementById(hash)?.scrollIntoView({block:"start"}));return()=>cancelAnimationFrame(frame);},[extras,base,view]);
  const header=(actions?:ReactNode)=><PageHeader title={titles[view]} eyebrow={view!=="data"&&base?<><BrandName name={base.library.brand.name} size={32}/> · {navigation.find(item=>item.id===view)!.group}</>:undefined} subtitle={subtitles[view]} actions={actions}/>;
  if(error)return <div className="reference-page action-workspace">{header()}<SectionCard title="Saved evidence" empty={{reason:"Saved evidence could not be read.",action:{label:"Retry",onClick:refresh}}}/></div>;
  if(loading||!base||!extras)return <div className="reference-page action-workspace">{header()}<p role="status">Reading saved evidence…</p></div>;
  const props={data:{base,...extras},refresh,header};
  return <div className={`reference-page action-workspace action-${view}`} data-view={view} data-read-model={base.library.presentation?"complete":undefined}>{view==="briefs"?<BriefsPage {...props}/>:view==="creators"?<CreatorsPage {...props}/>:view==="scores"?<ScoresPage {...props}/>:view==="ask"?<AskPage key={base.library.brand.id} {...props}/>:view==="reports"?<ReportsPage {...props}/>:<DataSourcesPage {...props}/>}</div>;
}
export function Disabled({children,reason,primary=false}:{children:ReactNode;reason:string;primary?:boolean}) {return <span title={reason} className="disabled-control"><button type="button" className={`button ${primary?"primary":"secondary"}`} disabled aria-label={typeof children==="string"?`${children}: ${reason}`:undefined}>{children}</button></span>;}
