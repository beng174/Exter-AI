import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, CircleHelp, Settings2 } from "lucide-react";
import type { Brand } from "../../shared/types";
import { visibleNavigation, type ViewId } from "../navigation";
import { api } from "../lib/api";
import { brandContext } from "../lib/brand-context";
import "./Sidebar.css";

export function Sidebar({brand,brandId,current,demo,open,onNavigate,onSwitchBrand,onHelp,onClose}:{brand?:Brand;brandId:string;current:ViewId;demo:boolean;open:boolean;onNavigate:(id:ViewId)=>void;onSwitchBrand:()=>void;onHelp:()=>void;onClose:()=>void}) {
  const sidebar=useRef<HTMLElement>(null);
  const [attention,setAttention]=useState<string|null>("Source health is waiting for a check");
  useEffect(()=>{
    let active=true;
    async function check() {
      const results=await Promise.allSettled([api<{connections:{status:string}[]}>(`/api/connections?${new URLSearchParams({brandId})}`),api<{meta?:{status:string};tiktok?:{status:string};database?:string}>("/api/infrastructure/status")]);
      if(!active)return;
      if(results[0].status!=="fulfilled"||results[1].status!=="fulfilled"){setAttention("Source health is unavailable");return;}
      const states=[...results[0].value.connections.map(item=>item.status),results[1].value.meta?.status,results[1].value.tiktok?.status];
      setAttention(states.some(state=>!state||state!=="connected")||results[1].value.database==="unavailable"?"Sources are waiting or need attention":null);
    }
    void check();const timer=window.setInterval(()=>void check(),60000);
    return()=>{active=false;window.clearInterval(timer);};
  },[brandId]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
    const links=()=>Array.from(sidebar.current?.querySelectorAll<HTMLElement>("a[href],button")||[]);
    links()[0]?.focus();
    const escape=(event:KeyboardEvent)=>{
      if(event.key==="Escape")onClose();
      if(event.key==="Tab"){
        const targets=links(),first=targets[0],last=targets.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    const breakpoint=window.matchMedia("(min-width:960px)");
    const closeDesktop=()=>{if(breakpoint.matches)onClose();};
    window.addEventListener("keydown",escape);breakpoint.addEventListener("change",closeDesktop);
    return()=>{window.removeEventListener("keydown",escape);breakpoint.removeEventListener("change",closeDesktop);document.body.style.overflow=overflow;previous?.focus();};
  },[open,onClose]);
  const context=brandContext(brand);
  return <aside ref={sidebar} className={`sidebar ui-sidebar ${open?"sidebar-open":""}`} id="main-sidebar">
    <a className="wordmark" href={`/?view=overview&brandId=${encodeURIComponent(brandId)}`} aria-label="Exter AI home" onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onNavigate("overview");}}}><span className="exter-wordmark">EXTER <small>AI</small></span></a>
    <button className="workspace-switch" onClick={()=>{onClose();onSwitchBrand();}} aria-label="Switch brand"><span className="workspace-avatar">{brand?.initials||"?"}</span><span><strong>{brand?.name||"Brand unavailable"}</strong><small>{context}</small></span><ChevronDown size={16}/></button>
    <nav aria-label="Main navigation">{visibleNavigation(demo).map(group=><section className="ui-nav-group" key={group.label} aria-label={group.label}><h2>{group.label}</h2>{group.items.map(item=>{
      const Icon=item.icon,selected=current===item.id || current==="creative"&&item.id==="creatives";
      const href=new URLSearchParams({view:item.id,brandId,...(demo?{demo:"1"}:{})});
      return <a key={item.id} className={`nav-item ${selected?"active":""}`} href={`/?${href}`} aria-current={selected?"page":undefined} onClick={event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onNavigate(item.id);}}><Icon size={18}/><span>{item.label}</span>{item.id==="data"&&attention&&<span className="ui-source-attention" title={attention}><span className="sr-only">{attention}</span></span>}</a>;
    })}</section>)}</nav>
    <div className="sidebar-bottom"><button className="nav-item" onClick={()=>{onClose();onHelp();}}><CircleHelp size={18}/><span>Help</span><ArrowUpRight size={14}/></button><div className="user-profile"><span>EW</span><div><strong>Exter workspace</strong><small>Research edition</small></div><button className="icon-button" aria-label="Workspace settings" onClick={()=>onNavigate("settings")}><Settings2 size={16}/></button></div></div>
  </aside>;
}
