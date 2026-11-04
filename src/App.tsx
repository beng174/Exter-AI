import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Globe2, LoaderCircle, Menu, MessageSquareText, Plus, Search, X } from "lucide-react";
import type { Brand, Category, Page } from "../shared/types";
import { canonicaliseLocation, navigateTo, NAVIGATION_EVENT, resolveNavigation, navigation, type ViewId } from "./navigation";
import { api } from "./lib/api";
import { Sidebar } from "./components/Sidebar";
import { PageHeader, PageHeaderContext } from "./components/ui/PageHeader";
import { ResearchWorkspace, REBUILT_RESEARCH_VIEWS } from "./components/research/ResearchWorkspace";
import { CreativeBrowserPage } from "./components/creatives/CreativeBrowserPage";
import { ActionWorkspace, ACTION_VIEWS } from "./components/workspace/ActionWorkspace";
import { DemoPreparation } from "./components/DemoPreparation";
import { PatternLabelControls } from "./components/PatternLabelControls";
import { DemoCollectionControls } from "./components/DemoCollectionControls";
import { GeminiSmokeTest } from "./components/GeminiSmokeTest";
import { LabellingTool } from "./components/LabellingTool";
import { InfrastructureStatus } from "./components/InfrastructureStatus";
import { BrandDemoReport } from "./components/BrandDemoReport";
import { BrandLogo } from "./components/BrandLogo";
import "./shell.css";
import "./reference.css";

function BrandModal({
  brands,
  current,
  onClose,
  onSelect,
  onCreated,
}: {
  brands: Brand[];
  current: string;
  onClose: () => void;
  onSelect: (b: Brand) => void;
  onCreated: (b: Brand) => void;
}) {
  const [name, setName] = useState(""),
    [domain, setDomain] = useState(""),
    [category, setCategory] = useState<Category>("Beauty & skincare"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(
        await api<Brand>("/api/brands", {
          name: name.trim(),
          domain: domain.trim(),
          category,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal brand-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Brand workspace"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Close workspace selection"
        >
          <X size={19} />
        </button>
        <span className="eyebrow">YOUR WORKSPACES</span>
        <h2>A new perspective starts here.</h2>
        <p>Choose a brand or create a workspace for retained evidence.</p>
        <div className="brand-options">
          {brands.map((b) => (
            <button key={b.id} onClick={() => onSelect(b)}>
              <span
                className="workspace-avatar"
                style={{ background: b.color }}
              >
                {b.initials}
              </span>
              <span>
                <strong>{b.name}</strong>
                <small>
                  {b.category} ·{" "}
                  {b.mode === "demo" ? "Sample data" : "Imported data"}
                </small>
              </span>
              {b.id === current ? (
                <Check size={17} />
              ) : (
                <ChevronRight size={17} />
              )}
            </button>
          ))}
        </div>
        <form onSubmit={create}>
          <h3>Add your own brand</h3>
          <div className="form-row">
            <label>
              Brand name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Your brand"
                required
                maxLength={80}
              />
            </label>
            <label>
              Website <span className="muted">(optional)</span>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="yourbrand.com"
                maxLength={180}
              />
            </label>
          </div>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {[
                "Beauty & skincare",
                "Fashion",
                "Wellness",
                "Food & beverage",
                "Home fragrance & gifting",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="form-hint">
            A new brand starts with an empty workspace. Import real ad data to
            build its competitive landscape.
          </p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary"
            type="submit"
            disabled={busy || !name.trim()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Plus size={16} />
            )}{" "}
            Create workspace
          </button>
        </form>
      </section>
    </div>
  );
}

function WorkspaceApp() {
  const [route,setRoute]=useState(()=>resolveNavigation(window.location.href));
  const [brandId,setBrandId]=useState(()=>new URLSearchParams(window.location.search).get("brandId")||localStorage.getItem("exter-brand")||"valentte");
  const [brands,setBrands]=useState<Brand[]>([]),[brandOpen,setBrandOpen]=useState(false),[menuOpen,setMenuOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false),[error,setError]=useState("");
  const demoEnabled=route.url.searchParams.get("demo")==="1",brand=brands.find(item=>item.id===brandId);
  const page=route.screen,current=navigation.find(item=>item.id===route.id)!;
  useEffect(()=>{const sync=()=>{const next=canonicaliseLocation();setRoute(next);if(next.brandId)setBrandId(next.brandId);setMenuOpen(false);};sync();window.addEventListener("popstate",sync);window.addEventListener(NAVIGATION_EVENT,sync);return()=>{window.removeEventListener("popstate",sync);window.removeEventListener(NAVIGATION_EVENT,sync);};},[]);
  useEffect(()=>{let active=true;api<Brand[]>("/api/brands").then(list=>{if(!active)return;const available=list.filter(item=>item.mode!=="demo"||demoEnabled);setBrands(available);if(!available.some(item=>item.id===brandId)&&available.length)setBrandId((available.find(item=>item.domain.replace(/^www\./,"")==="valentte.com")||available[0]).id);}).catch(()=>setError("Saved brands could not be read."));return()=>{active=false;};},[demoEnabled]);
  useEffect(()=>{localStorage.setItem("exter-brand",brandId);const url=new URL(window.location.href);if(url.searchParams.get("brandId")!==brandId){url.searchParams.set("brandId",brandId);window.history.replaceState({},"",url);setRoute(resolveNavigation(url.href));}},[brandId]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){setBrandOpen(false);setHelpOpen(false);setMenuOpen(false);}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
  const modalIsOpen=brandOpen||helpOpen;
  useEffect(()=>{if(!modalIsOpen)return;const previous=document.activeElement as HTMLElement|null,dialog=document.querySelector<HTMLElement>('[role="dialog"]');if(!dialog)return;const targets=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')).filter(el=>el.getClientRects().length);targets()[0]?.focus();const trap=(event:KeyboardEvent)=>{if(event.key!=="Tab")return;const list=targets(),first=list[0],last=list.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};document.addEventListener("keydown",trap);return()=>{document.removeEventListener("keydown",trap);previous?.focus();};},[modalIsOpen]);
  useEffect(()=>{const id=window.location.hash.slice(1);if(!id)return;const timer=window.setTimeout(()=>document.getElementById(id)?.scrollIntoView({block:"start"}),300);return()=>window.clearTimeout(timer);},[route.id,brandId]);
  function navigate(id:ViewId){navigateTo(id,brandId);window.scrollTo(0,0);}
  function select(b:Brand){navigateTo("brands",b.id);setBrandOpen(false);}
  const context=route.id==="data"?"Settings":route.id==="brands"?"Research":`${brand?.name||"Workspace"} · ${current.group}`;
  const utility=route.id!=="ask"?<button className="reference-ask icon-button" aria-label="Ask Exter" title="Ask Exter" onClick={()=>navigate("ask")}><MessageSquareText size={18}/></button>:null;
  return <div className="app-shell reference-shell">
    <Sidebar brand={brand} brandId={brandId} current={route.id} demo={demoEnabled} open={menuOpen} onNavigate={navigate} onSwitchBrand={()=>setBrandOpen(true)} onHelp={()=>setHelpOpen(true)} onClose={()=>setMenuOpen(false)}/>
    {menuOpen&&<button className="ui-mobile-scrim" aria-label="Close navigation" onClick={()=>setMenuOpen(false)}/>}
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="main-sidebar" onClick={()=>setMenuOpen(!menuOpen)}><Menu size={21}/></button><span>{current.group}</span><ChevronRight size={14}/><strong>{current.label}</strong></div>{utility}</header>
      <PageHeaderContext.Provider value={{eyebrow:context,demo:brand?.mode==="demo"&&demoEnabled,utility}}><main className="reference-ui" data-screen={route.id}>
      {error&&<p role="alert">{error}</p>}
      {(REBUILT_RESEARCH_VIEWS as readonly string[]).includes(route.id)?<ResearchWorkspace key={brandId} brandId={brandId} brands={brands} route={route} onManageBrands={()=>setBrandOpen(true)}/>:route.id==="creatives"||route.id==="creative"?<CreativeBrowserPage key={brandId} brandId={brandId} route={route} refresh={0}/>:ACTION_VIEWS.includes(route.id)?<ActionWorkspace key={brandId} brandId={brandId} brand={brand} route={route}/>:page==="settings"?<div className="reference-page"><PageHeader title="Tests and preparation" subtitle="Existing collection, website evidence and analysis controls."/><nav className="settings-shortcuts" aria-label="Settings sections"><a href="#brand-demo-preparation">Website evidence & client demo</a><a href="#pattern-labels">Pattern labels</a><a href="#demo-collection">Competitor collection</a><a href={`/?view=data&brandId=${encodeURIComponent(brandId)}#monthly-budgets`}>Budgets and schedule</a><a href="#gemini-smoke-test">Gemini smoke test</a></nav><DemoPreparation key={brandId} brandId={brandId} onBrandChange={id=>navigateTo("settings",id)}/><PatternLabelControls brandId={brandId}/><DemoCollectionControls brandId={brandId}/><GeminiSmokeTest/></div>:page==="labelling"?<div className="reference-page"><PageHeader title="Labelling" subtitle="Review saved source ads."/><LabellingTool brandId={brandId}/></div>:page==="demo"?<BrandDemoReport brandId={brandId}/>:null}
      {page!=="demo"&&<footer className="main-footer"><span className="footer-logo">Exter AI</span><details className="workspace-data-note" id="about-data"><summary><CircleHelp size={14}/> About this data</summary><p>Saved source observations only. Unknown values remain unavailable. Public ad activity does not establish sales or performance. Both live checks are still awaiting account-owner confirmation; owned sync remains off unless separately enabled.</p><div id="screen-caveats"/><InfrastructureStatus/></details></footer>}
      </main></PageHeaderContext.Provider>
    </div>
    {brandOpen&&<BrandModal brands={brands} current={brandId} onClose={()=>setBrandOpen(false)} onSelect={select} onCreated={b=>{setBrands(list=>[...list.filter(item=>item.id!==b.id),b]);select(b);}}/>}
    {helpOpen&&<div className="modal-backdrop" onClick={()=>setHelpOpen(false)}><section className="modal help-modal" role="dialog" aria-modal="true" aria-label="Getting started" onClick={event=>event.stopPropagation()}><button className="modal-close icon-button" aria-label="Close help" onClick={()=>setHelpOpen(false)}><X size={20}/></button><h2>Getting started</h2><p>Choose your brand, review its saved sources and open any creative to inspect its evidence.</p><button className="button primary" onClick={()=>{setHelpOpen(false);navigate("data");}}>Explore data sources</button></section></div>}
  </div>;
}

export default function App() {
  const match = /^\/demo\/([^/]+)\/?$/.exec(window.location.pathname);
  if (match) {
    let brandId: string;
    try { brandId = decodeURIComponent(match[1]); } catch { return <main>Invalid brand report link.</main>; }
    return <main className="client-demo-shell"><div className="client-demo-wordmark"><BrandLogo /></div><BrandDemoReport brandId={brandId} /></main>;
  }
  return <WorkspaceApp />;
}
