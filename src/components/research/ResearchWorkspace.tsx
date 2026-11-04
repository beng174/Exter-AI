import { useState } from "react";
import type { Brand } from "../../../shared/types";
import { selectionFromParams, evidenceUrl, type ResearchDimension } from "../../../shared/creative-research";
import { ukDate } from "../../../shared/creative-presentation";
import { NAVIGATION_EVENT, type resolveNavigation } from "../../navigation";
import { PageHeader, FilterBar, SectionCard } from "../ui";
import { useResearchData } from "./useResearchData";
import { HomeScreen } from "./HomeScreen";
import { BrandScreen } from "./BrandScreen";
import { CompetitorsScreen, FormatsScreen, PatternsScreen, AudienceScreen, WinnersScreen } from "./ResearchScreens";
import "../creatives/CreativeBrowserPage.css";
import "./ResearchWorkspace.css";
export const REBUILT_RESEARCH_VIEWS=["overview","brands","competitors","formats","patterns","audience","winners"] as const;
export type ResearchView=(typeof REBUILT_RESEARCH_VIEWS)[number];
const titles:Record<ResearchView,string>={overview:"This week",brands:"Brand research",competitors:"Competitors",formats:"Formats",patterns:"Patterns",audience:"Audience and voice",winners:"Winners"};
const subtitles:Record<ResearchView,string>={overview:"Saved activity, account results and what needs attention.",brands:"Who the brand is, what its public sources say, and who it competes with.",competitors:"You and your configured competitors on the same saved measures.",formats:"How formats are used, how long they run and how your mix compares.",patterns:"What the captured category does and where your creative mix differs.",audience:"What customers say, what sources publish, and how each brand talks.",winners:"Longest-running saved ads while the Working Score is unavailable."};
export function ResearchWorkspace({brandId,brands,route,onManageBrands}:{brandId:string;brands:Brand[];route:ReturnType<typeof resolveNavigation>;onManageBrands:()=>void}) {
  const view=route.id as ResearchView,params=route.url.searchParams;
  const [refresh,setRefresh]=useState(0);
  const from=params.get("from")||undefined,to=params.get("to")||undefined;
  const {data,error,loading}=useResearchData(brandId,brands,from,to,refresh);
  const retry=()=>setRefresh(value=>value+1);
  const update=(patch:Record<string,string>)=>{const url=new URL(window.location.href);for(const [key,value] of Object.entries(patch)){if(value&&value!=="all")url.searchParams.set(key,value);else url.searchParams.delete(key);}window.history.pushState({},"",url);window.dispatchEvent(new Event(NAVIGATION_EVENT));};
  const dimension=(params.get("dimension")||"format") as ResearchDimension;
  const selection={asOf:data?.window.asOf||undefined,platform:params.get("platform")||undefined,...(view==="winners"&&params.get("brand")?{brand:params.get("brand")!}:{})};

  const shared={data:data!,selection,refresh:retry,onManageBrands};
  return <div className="creative-browser research-workspace" data-view={view}>
    <PageHeader title={titles[view]} subtitle={subtitles[view]} actions={view==="brands"?<button className="button secondary" onClick={onManageBrands}>Add brand</button>:<button className="button secondary" onClick={retry}>Refresh saved data</button>}/>
    {error?<SectionCard title="Saved evidence" empty={{reason:"Saved evidence could not be read.",action:{label:"Retry",onClick:retry}}}/>:loading||!data?<p role="status" aria-busy="true">Reading saved evidence…</p>:<>
      <FilterBar label="Research filters"><strong>{data.library.brand.name}</strong><label>Platform<select aria-label="Platform" value={params.get("platform")||"all"} onChange={event=>update({platform:event.target.value})}><option value="all">All platforms</option>{[...new Set(data.library.creatives.map(row=>row.platform))].filter(value=>value!=="Unavailable").map(value=><option key={value}>{value}</option>)}</select></label><label>From<input aria-label="From" type="date" value={from||data.window.from||""} max={to||data.window.to||undefined} onChange={event=>update({from:event.target.value})}/></label><label>To<input aria-label="To" type="date" value={to||data.window.to||""} min={from||data.window.from||undefined} onChange={event=>update({to:event.target.value})}/></label>{view==="winners"&&<label>Brand<select aria-label="Brand" value={params.get("brand")||"all"} onChange={event=>update({brand:event.target.value})}><option value="all">All configured brands</option><option value={data.library.brand.id}>You · {data.library.brand.name}</option>{data.library.competitors.filter(item=>item.brandId).map(item=><option key={item.key} value={item.brandId!}>{item.name}</option>)}</select></label>}<a className="button secondary" href={evidenceUrl(data.library.brand.id,selection)}>Open Creatives</a></FilterBar>
      <p className="research-period">{data.window.to?`Saved window: ${ukDate(data.window.from)} to ${ukDate(data.window.to)}. Activity reflects source captures, not a verified live feed.`:"No dated public capture is saved yet."}</p>
      {data.library.sources.some(source=>source.status==="error")&&<SectionCard title="Source coverage" empty={{reason:"Some saved sources could not be read. Other evidence is preserved.",action:{label:"Retry",onClick:retry}}}/>}
      {view==="overview"?<HomeScreen {...shared}/>:view==="brands"?<BrandScreen {...shared}/>:view==="competitors"?<CompetitorsScreen {...shared} dimension={dimension} onDimension={value=>update({dimension:value})}/>:view==="formats"?<FormatsScreen {...shared}/>:view==="patterns"?<PatternsScreen {...shared} dimension={dimension} onDimension={value=>update({dimension:value})}/>:view==="audience"?<AudienceScreen {...shared}/>:<WinnersScreen {...shared}/>}
    </>}
  </div>;
}
