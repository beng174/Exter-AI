import {ComparisonFilters} from "../ui/ComparisonFilters";
import {ComparisonContext,scopedResearch,ComparisonNotice} from "./comparison";
import {invalidateWorkspaceReads} from "../../lib/read-cache";
import {MetaWatchlistDialog} from "./MetaWatchlistEditor";
import { BrandName } from "../ui/BrandIdentity";
import { Caveat } from "../ui/Caveat";
import { publicCaptureCount } from "../../../shared/workspace-screens";
import { useState } from "react";
import type { Brand } from "../../../shared/types";
import { selectionFromParams, evidenceUrl, type ResearchDimension } from "../../../shared/creative-research";
import { ukDate } from "../../../shared/creative-presentation";
import { navigateTo, NAVIGATION_EVENT, navigation, type resolveNavigation } from "../../navigation";
import { PageHeader, StatusChip, SectionCard } from "../ui";
import { DateControl } from "../ui/DateControl";
import { Disabled } from "../workspace/ActionWorkspace";
import { useResearchData } from "./useResearchData";
import { HomeScreen } from "./HomeScreen";
import { BrandScreen } from "./BrandScreen";
import { CompetitorsScreen, FormatsScreen, PatternsScreen, AudienceScreen, WinnersScreen } from "./ResearchScreens";
import "../creatives/CreativeBrowserPage.css";
import "./ResearchWorkspace.css";
export const REBUILT_RESEARCH_VIEWS=["overview","brands","competitors","formats","patterns","audience","winners"] as const;
export type ResearchView=(typeof REBUILT_RESEARCH_VIEWS)[number];
const titles:Record<ResearchView,string>={overview:"This week",brands:"Brand research",competitors:"Competitors",formats:"Formats",patterns:"Patterns",audience:"Audience and voice",winners:"Winners"};
const subtitles:Record<ResearchView,string>={overview:"",brands:"Who each brand is, what its public sources say, and who it competes with.",competitors:"You against your competitors on the same measures, every week.",formats:"Which formats win in your category, how winning ads are built, and how your mix compares.",patterns:"What the category does, what wins, where you differ, and what to do about it.",audience:"What customers say, who competitors' ads reach, and how each brand talks.",winners:"Longest-running public ads."};
export function ResearchWorkspace({brandId,brands,route,onManageBrands}:{brandId:string;brands:Brand[];route:ReturnType<typeof resolveNavigation>;onManageBrands:()=>void}) {
  const view=route.id as ResearchView,params=route.url.searchParams;
  const [refresh,setRefresh]=useState(0),[editingWatchlist,setEditingWatchlist]=useState(false);
  const from=params.get("from")||undefined,to=params.get("to")||undefined;
  const {data,error,loading}=useResearchData(brandId,brands,from,to,refresh);
  const retry=()=>{invalidateWorkspaceReads();setRefresh(value=>value+1);};
  const update=(patch:Record<string,string>)=>{const url=new URL(window.location.href);for(const [key,value] of Object.entries(patch)){if(value&&(value!=="all"||key==="category"))url.searchParams.set(key,value);else url.searchParams.delete(key);}window.history.pushState({},"",url);window.dispatchEvent(new Event(NAVIGATION_EVENT));};
  const dimension=(params.get("dimension")||(view==="patterns"?"hook":"format")) as ResearchDimension;
  const selection={asOf:data?.window.asOf||undefined,platform:params.get("platform")||undefined,...(view==="winners"&&params.get("brand")?{brand:params.get("brand")!}:{})};

  const filter={category:params.get("category")||"mine",adFormat:params.get("adFormat")||"same"};
  const hasComparisons=view!=="brands"&&view!=="audience";
  const compared=data?(hasComparisons?scopedResearch(data,filter,params.get("chartFormat"),format=>update({chartFormat:format})):data):null;
  const shared={data:compared!,selection,refresh:retry,onManageBrands};
  const actions=view==="overview"?<><a className="button secondary" href={`/?view=reports&brandId=${encodeURIComponent(brandId)}`}>Weekly report</a><Disabled primary reason="Read-only client sharing is not available yet.">Share client view</Disabled></>:view==="brands"?<><Disabled reason="Prospect teardown sharing is not available yet.">Prospect teardown</Disabled><button className="button primary" disabled={Boolean(data?.library.presentation)} title={data?.library.presentation?"Sample workspace is read-only.":undefined} onClick={onManageBrands}>Add brand</button></>:view==="audience"?<Disabled reason="An independent review feed is not connected.">Add review source</Disabled>:<><DateControl from={from||data?.window.from} to={to||data?.window.to} onChange={update} label={view==="competitors"||view==="winners"?"Week":""}/>{view==="competitors"?<button className="button secondary" disabled={Boolean(data?.library.presentation)} onClick={()=>setEditingWatchlist(true)}>Edit watchlist</button>:view==="winners"&&data?<><label className="reference-brand-filter">Sort<select aria-label="Winners sort" value={params.get("sort")||"days"} onChange={event=>update({sort:event.target.value})}><option value="days">Days running</option><option value="likelihood">Winner likelihood (experimental)</option></select></label><label className="reference-brand-filter">Brand<select aria-label="Brand" value={params.get("brand")||"all"} onChange={event=>update({brand:event.target.value})}><option value="all">All brands</option><option value={data.library.brand.id}>You · {data.library.brand.name}</option>{data.library.competitors.filter(item=>item.brandId).map(item=><option key={item.key} value={item.brandId!}>{item.name}</option>)}</select></label></>:null}</>;
  const subtitle=view==="overview"?data?.window.from&&data.window.to?`${ukDate(data.window.from)} to ${ukDate(data.window.to)}, compared with the week before`:"Saved activity compared with the week before":subtitles[view];
  return <div className="creative-browser research-workspace" data-view={view} data-read-model={data?.library.presentation?"complete":undefined}>
    <PageHeader title={titles[view]} eyebrow={data&&view!=="brands"?<><BrandName name={data.library.brand.name} size={32}/> · {navigation.find(item=>item.id===view)!.group}</>:undefined} subtitle={data?.library.presentation&&view==="winners"?"Which ads are working, why, and what your own account confirms.":subtitle} actions={actions}/>
    {editingWatchlist&&data&&<MetaWatchlistDialog data={data} onSaved={retry} onClose={()=>setEditingWatchlist(false)}/>}
    <Caveat><p>Counts describe the latest saved public capture, not a verified live feed. A running duration stops at the saved source endpoint and does not establish continuous delivery or sales.</p><p>Share of voice by reach is an Estimated proxy based on published UK reach in the watchlist. Lifetime ad reach is summed without deduplicating people between ads. Ads without published UK reach are excluded. This is not weekly reach, impressions or sales. Unknown classifications stay in the full sample denominator; claim types can overlap.</p><p>Previous active snapshots are not reconstructed. Launch-share trends compare explicit source start dates in two equal windows. Competitor averages exclude uncollected brands; tooltips identify eligible and excluded records.</p><p>Saved website quotes are published by the brand, not independently verified reviews. Saved positioning and creative labels are machine interpretations. They do not establish audience demographics or paid creator partnerships.</p></Caveat>
    {error?<SectionCard title="Saved evidence" empty={{reason:"Saved evidence could not be read.",action:{label:"Retry",onClick:retry}}}/>:loading||!data?<p role="status" aria-busy="true">Reading saved evidence…</p>:<>
      {view==="overview"&&<div className="reference-source-pills"><StatusChip status={data.library.presentation?data.library.presentation.Main.sources[0].text:data.library.ownedStatus==="available"?"Your Meta account · saved metrics":"Your Meta account · not synced"}/><a className="reference-source-count" href={evidenceUrl(data.library.brand.id,{kind:"all"})} title="Observed saved public ads"><StatusChip status={data.library.presentation?data.library.presentation.Main.sources[1].text:data.library.sources.some(source=>source.status==="error")?"Market · source error":`Market · ${publicCaptureCount(data.library.creatives)} saved ads`}/></a><StatusChip status={data.library.presentation?data.library.presentation.Main.sources[2].text:data.research?"Customer reviews · saved website quotes":"Customer reviews · not collected"}/><a href="#about-data" onClick={()=>{const details=document.getElementById("about-data") as HTMLDetailsElement|null;if(details)details.open=true;}}>About this data</a></div>}
      {view==="brands"&&<div className="reference-brand-strip">{brands.map(brand=><button key={brand.id} aria-pressed={brand.id===brandId||brand.id===data.library.brand.id} onClick={()=>navigateTo("brands",brand.id)}><strong><BrandName name={brand.name} size={32}/></strong><small>{brand.domain}</small></button>)}</div>}
      {hasComparisons&&<><ComparisonFilters categories={data?.library.brand.primaryCategories} filter={filter} onChange={update}/>{view!=="winners"&&<ComparisonNotice data={compared!}/>}</>}<ComparisonContext.Provider value={compared!.comparison||null}>
      {view==="overview"?<HomeScreen {...shared}/>:view==="brands"?<BrandScreen {...shared}/>:view==="competitors"?<CompetitorsScreen {...shared} dimension={dimension} onDimension={value=>update({dimension:value})}/>:view==="formats"?<FormatsScreen {...shared}/>:view==="patterns"?<PatternsScreen {...shared} dimension={dimension} onDimension={value=>update({dimension:value})}/>:view==="audience"?<AudienceScreen {...shared}/>:<WinnersScreen {...shared}/>}
      </ComparisonContext.Provider>
    </>}
  </div>;
}
