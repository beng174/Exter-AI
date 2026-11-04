import { useState, type FormEvent } from "react";
import { brandSnapshots, evidenceUrl } from "../../../shared/creative-research";
import { plainEnum, ukDate } from "../../../shared/creative-presentation";
import { api } from "../../lib/api";
import { SectionCard, DataTable, DataLabel, Unavailable, StatusChip } from "../ui";
import { Measure, SafeLink, metadata, type ScreenProps } from "./common";
export function BrandScreen({data,selection,refresh}:ScreenProps) {
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[allFacts,setAllFacts]=useState(false);
  const [pages,setPages]=useState(data.watchlists?.[0]?.page_ids.join(", ")||""),[terms,setTerms]=useState(data.watchlists?.[0]?.search_terms.join("\n")||""),[countries,setCountries]=useState(data.watchlists?.[0]?.countries.join(", ")||"");
  const profile=data.research,brand=data.brand,competitors=brandSnapshots(data.library,data.window,selection.platform).slice(1);
  const dataSources=`/?view=data&brandId=${encodeURIComponent(data.library.brand.id)}`;
  const refreshResearch=async()=>{setBusy(true);setError("");try{await api("/api/brand-research",{brandId:data.library.brand.id});refresh();}catch{setError("Research did not finish. Earlier evidence is preserved.");}finally{setBusy(false);}};
  async function saveWatchlist(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{
    const response=await fetch(`/api/public/meta/watchlists/${encodeURIComponent(data.watchlists?.[0]?.id||data.library.brand.id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:data.library.brand.id,pageIds:pages.split(/[\s,]+/).filter(Boolean),searchTerms:terms.split("\n").map(value=>value.trim()).filter(Boolean),countries:countries.toUpperCase().split(/[\s,]+/).filter(Boolean)})});
    if(!response.ok)throw new Error();setEditing(false);refresh();
  }catch{setError("The watchlist could not be saved. Check the page IDs, search terms, countries and source connection.");}finally{setBusy(false);}}
  const field=(label:string,value:string|undefined)=><div key={label}><dt>{label}</dt><dd>{value||<Unavailable compact reason={`${label} has not been saved for this brand.`}/>}</dd></div>;
  const positioning=profile?.analysis?[['Key message',profile.analysis.keyMessage],['Topic',profile.analysis.topic],['Observed relevance',profile.analysis.observedRelevance],['Observed tension',profile.analysis.observedTension]].filter(([,value])=>Boolean(value)):[];
  return <>
    {error&&<p role="alert">{error}</p>}
    <div className="research-brand-columns">
      <SectionCard title={data.library.brand.name} actions={<SafeLink href={data.library.brand.domain?`https://${data.library.brand.domain}`:null}>Website</SafeLink>}>
        <dl className="research-profile">{field("Category",brand?.category)}{field("Country",(brand as typeof brand&{country?:string})?.country)}{field("Type",(brand as typeof brand&{role?:string})?.role?plainEnum((brand as typeof brand&{role:string}).role):undefined)}{field("Website",data.library.brand.domain)}</dl>
        <h3>Watchlist</h3>
        {data.watchlists===null?<Unavailable reason="Saved watchlist settings could not be read." href={dataSources} linkLabel="Review data sources"/>:data.watchlists.length?<ul className="research-plain-list">{data.watchlists.map(list=><li key={list.id}><strong>{list.page_ids.length?"Advertiser pages":"Category search"}</strong><p>{list.page_ids.join(", ")||list.search_terms.join(", ")} · {list.countries.join(", ")}</p></li>)}</ul>:<p className="research-note">No watchlist has been saved.</p>}
        <h3>Category keywords</h3><div className="research-tags">{data.watchlists?.flatMap(item=>item.search_terms).map(term=><span key={term}>{term}</span>)}{!data.watchlists?.some(item=>item.search_terms.length)&&<Unavailable compact reason="No category keywords have been saved."/>}</div>
        <button className="button secondary" onClick={()=>setEditing(value=>!value)} disabled={data.watchlists===null}>{editing?"Cancel":"Edit watchlist and keywords"}</button>
        <a className="research-inline-action" href={`/?view=settings&brandId=${encodeURIComponent(data.library.brand.id)}#demo-collection`}>Add or collect configured competitors</a>
        {editing&&<form className="research-watchlist-form" onSubmit={saveWatchlist}><label>Advertiser page IDs<input value={pages} onChange={event=>setPages(event.target.value)} placeholder="Numeric page IDs, comma separated"/></label><label>Category keywords<textarea value={terms} onChange={event=>setTerms(event.target.value)} placeholder="One search term per line"/></label><label>Watchlist countries<input value={countries} onChange={event=>setCountries(event.target.value)} placeholder="Two-letter country codes" required/></label><button className="button primary" disabled={busy}>Save watchlist</button><p className="research-note">Saves the existing watchlist only. Collection is a separate explicit action.</p></form>}
      </SectionCard>
      <div className="research-column">
        <SectionCard title="What the public sources say" help={profile?`Saved website research${ukDate(profile.observedAt)?`, checked ${ukDate(profile.observedAt)}`:""}. Publisher claims are not independently verified.`:undefined} actions={profile?<button className="button secondary" disabled={busy} onClick={()=>void refreshResearch()}>Refresh research</button>:undefined} empty={!profile&&{reason:data.researchFailed?"Saved brand research could not be read.":"No public website research is saved.",action:{label:data.researchFailed?"Retry":"Research website",onClick:data.researchFailed?refresh:()=>void refreshResearch()}}}>
          <div className="research-fact-list">{(allFacts?profile?.facts:profile?.facts.slice(0,5))?.map((fact,index)=><article key={`${fact.label}:${index}`}><strong>{fact.label}</strong><p>{fact.value}</p><blockquote>{fact.quote}</blockquote><SafeLink href={fact.sourceUrl}>Source</SafeLink> <DataLabel basis="Observed"/>{fact.kind==="brand_claim"&&<span className="research-note"> Publisher claim</span>}</article>)}</div>{profile&&profile.facts.length>5&&<button className="button secondary" onClick={()=>setAllFacts(value=>!value)}>{allFacts?"Show fewer sources":"Show more sources"}</button>}
        </SectionCard>

      </div>
    </div>
    <SectionCard title="Positioning signals" help="Saved interpretations to check, not facts or a performance ranking." empty={!positioning.length&&{reason:"No supported positioning analysis is saved.",action:{label:"Research website",onClick:()=>void refreshResearch()}}}>
          <div className="research-positioning">{positioning.map(([label,value])=><article key={label}><h3>{label}</h3><p>{value}</p><DataLabel basis="Modelled"/></article>)}</div>
    </SectionCard>
    <div className="research-grid-two">
      <SectionCard title="Competitor set" help="The same configured set as the sidebar and Creatives. Uncollected brands have no measured ad counts." meta={metadata(data,{...selection,show:"competitors"})} empty={!competitors.length&&{reason:"No competitors are configured.",href:dataSources,linkLabel:"Edit watchlist"}}>
        <DataTable caption="Configured competitor brands" basis="Observed" rows={competitors} rowKey={row=>row.id} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,{...selection,brand:row.id}))} columns={[{key:"brand",label:"Brand",value:row=>row.name},{key:"reason",label:"Why it is a competitor",value:row=>profile?.competitorCandidates.find(candidate=>candidate.name.toLowerCase()===row.name.toLowerCase())?.summary},{key:"active",label:"Active at capture",value:row=>row.active.value,render:row=><Measure metric={row.active} data={data}/>},{key:"checked",label:"Last checked",value:row=>ukDate(row.lastChecked)},{key:"status",label:"Collection",value:row=>row.available?"Saved sample":row.status==="not-started"?"Not collected":plainEnum(row.status)}]}/>
      </SectionCard>
      <SectionCard title="Profiles, creators and limits">
        <div className="research-profile-links">{profile?.socialProfiles.map(item=><p key={item.url}><SafeLink href={item.url}>{plainEnum(item.platform)} profile</SafeLink></p>)}{profile?.creatorFeatures.map(item=><p key={item.url}><SafeLink href={item.url}>{item.handle}</SafeLink><small> Featured on the brand website; paid partnership is not established.</small></p>)}{!profile?.socialProfiles.length&&!profile?.creatorFeatures.length&&<Unavailable reason="No source-linked profiles or creator credits are saved." action={{label:"Research website",onClick:()=>void refreshResearch()}}/>}</div>
        <h3>What this research cannot show</h3><ul><li>Competitors' sales, conversions or ROAS.</li><li>Audience demographics, except where an ad library publishes them.</li><li>Whether a featured creator is a paid partner, without a label or handle.</li></ul>
      </SectionCard>
    </div>
  </>;
}
