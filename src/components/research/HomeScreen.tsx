import { HomeReadModel } from "./ResearchReadModels";
import { Caveat } from "../ui/Caveat";
import { useState } from "react";
import { brandSnapshots, competitorAverage, evidenceUrl, longestRunning, selectResearchAds, staleCapture, type EvidenceMeasure } from "../../../shared/creative-research";
import { analysisUrl, plainEnum, ukDate } from "../../../shared/creative-presentation";
import { SectionCard, DataTable, DataLabel, hasValue, MetricTile, Unavailable } from "../ui";
import { metricText, metricReason } from "../creatives/presentation";
import { CreativeRow } from "../ui/CreativeRow";
import { Measure, metadata, number, type ScreenProps } from "./common";
import type { CreativePerformance } from "../../../shared/creative-browser";

export function HomeScreen({data,selection,refresh}:ScreenProps) {
  if(data.library.presentation)return <HomeReadModel library={data.library} model={data.library.presentation}/>;
  const brands=brandSnapshots(data.library,data.window,selection.platform),you=brands[0],top=longestRunning(data.library.creatives,selection,5);
  const collection={href:`/?view=settings&brandId=${encodeURIComponent(data.library.brand.id)}#demo-collection`,linkLabel:"Collect competitor ads"};
  const source={href:`/?view=data&brandId=${encodeURIComponent(data.library.brand.id)}`,linkLabel:"Data sources"};
  const rows=([['Active ads','active'],['New ads this week','launched'],['Stopped this week','stopped'],['Median days running','medianDays'],['Share of voice','shareActive']] as const).map(([label,key])=>{
    const average=competitorAverage(brands,key);average.selection={...average.selection,asOf:data.window.asOf||undefined,platform:selection.platform,...(key==="launched"||key==="stopped"?{activityFrom:data.window.from||undefined,activityTo:data.window.to||undefined}:{})};
    return {label,key,yours:you[key],average,previous:key==="launched"?you.previousLaunches:null};
  });
  return <>
    <SectionCard title="What to work on" actions={<a href={`/?view=briefs&brandId=${encodeURIComponent(data.library.brand.id)}`}>All opportunities</a>} empty={{reason:"Recommendations appear once creative results and customer needs can be compared."}}/>
    <div className="research-grid-two">
      <SectionCard title="You against the market" help="Weekly scorecard" actions={<a href={`/?view=competitors&brandId=${encodeURIComponent(data.library.brand.id)}`}>Full scorecard</a>} meta={metadata(data,selection)}>
        <DataTable caption="Saved activity scorecard" basis="Observed" rowBasis={row=>[row.yours.value,row.average.value,row.previous?.value].some(hasValue)?"Observed":"Unavailable"} rows={rows} rowKey={row=>row.key} onRow={row=>window.location.assign(evidenceUrl(data.library.brand.id,row.yours.selection))} columns={[
          {key:"measure",label:"Measure",value:row=>row.label},
          {key:"you",label:"You",value:row=>row.yours.value,render:row=><Measure data={data} metric={row.yours} suffix={row.key==="shareActive"?"%":""}/>},
          {key:"average",label:"Competitor average",value:row=>row.average.value,render:row=><Measure data={data} metric={row.average} suffix={row.key==="shareActive"?"%":""}/>},
          {key:"previous",label:"Previous window",value:row=>row.previous?.value,render:row=><Measure data={data} metric={row.previous!}/>,unavailable:()=>({reason:"No matching historical status snapshot is saved. Only explicit launch dates support the previous-window count."})}
        ]}/>

      </SectionCard>
      <AccountPanel data={data}/>
    </div>
    <div className="research-grid-two">
      <SectionCard title="Longest running" help="Observed days running, you and competitors" meta={metadata(data,{...selection,kind:"running"})} actions={<a href={`/?view=winners&brandId=${encodeURIComponent(data.library.brand.id)}`}>Open Winners</a>} empty={!top.length&&{reason:"No source-linked running durations are saved.",...collection}}>
        <div className="reference-longest-list">{top.map(row=><a className="reference-longest-row" key={row.adId} href={evidenceUrl(data.library.brand.id,{...selection,ad:row.adId})}><CreativeRow row={row}/><strong>{row.daysRunning} days</strong></a>)}</div>
      </SectionCard>
      <SectionCard title="What changed" help="Observed source activity" actions={<a href={`/?view=competitors&brandId=${encodeURIComponent(data.library.brand.id)}`}>Open Competitors</a>} meta={metadata(data,selection)}>
        <div className="research-change-row"><span>Ads launched</span><Measure data={data} metric={you.launched}/></div>
        <div className="research-change-row"><span>Ads stopped</span><Measure data={data} metric={you.stopped}/></div>
        <Unavailable reason="Concept and offer shifts need saved grouping history." href={`/?view=patterns&brandId=${encodeURIComponent(data.library.brand.id)}`} linkLabel="View current patterns"/>
      </SectionCard>
    </div>
    <SectionCard title="Needs attention">
      <div className="research-attention-list">
        {!data.infrastructure?<Unavailable reason="Source health could not be read." action={{label:"Retry",onClick:refresh}}/>:data.infrastructure.meta?.status!=="connected"?<p>Public collection is waiting for connection. <a href={source.href}>Review source health</a></p>:null}
        {staleCapture(data.library.lastChecked)&&<p>Saved captures need a fresh check. Last saved evidence: {ukDate(data.library.lastChecked)}. <a href={`/?view=settings&brandId=${encodeURIComponent(data.library.brand.id)}#demo-collection`}>Review collection</a></p>}
        {data.budgets===null?<Unavailable reason="Budget status could not be read." href={`/?view=settings&brandId=${encodeURIComponent(data.library.brand.id)}#monthly-budgets`} linkLabel="Review budgets"/>:data.budgets.filter(item=>item.paused).map(item=><p key={item.cost_type}>{plainEnum(item.cost_type)} is paused by the existing budget guard. <a href={`/?view=settings&brandId=${encodeURIComponent(data.library.brand.id)}#monthly-budgets`}>Review budget</a></p>)}
        {data.connections?.some(item=>!["connected","not_connected"].includes(item.status))&&<p>A source is waiting or needs attention. <a href={source.href}>Review connections</a></p>}
        {data.infrastructure?.meta?.status==="connected"&&staleCapture(data.library.lastChecked)===false&&data.budgets&&!data.budgets.some(item=>item.paused)&&data.connections?.every(item=>item.status==="connected")&&<p>No saved source or budget alert is active.</p>}
      </div>
    </SectionCard>
  </>;
}
export function AccountPanel({data}:{data:ScreenProps["data"]}) {
  const [scope,setScope]=useState("");
  const scopes=[...new Map(data.library.creatives.filter(row=>row.workspaceBrand&&row.owned).flatMap(row=>row.performance).map(item=>[item.id,item])).values()];
  const cohort=scopes.find(item=>item.id===scope)||(scopes.length===1?scopes[0]:undefined);
  const gap=data.library.ownedStatus==="error"?{reason:"Saved owned metrics could not be read.",href:`/?view=data&brandId=${encodeURIComponent(data.library.brand.id)}`,linkLabel:"Review source health"}:data.library.ownedStatus==="not_configured"?{reason:"No owned account metrics are synced.",href:`/?view=data&brandId=${encodeURIComponent(data.library.brand.id)}`,linkLabel:"Connect your ad account"}:{reason:"No owned metrics are saved in the selected dates.",href:evidenceUrl(data.library.brand.id,{show:"yours"}),linkLabel:"Review your creatives"};
  return <SectionCard title="Your account" help="Your saved account outcomes" meta={cohort?{sampleSize:cohort.benchmarkSampleSize,from:cohort.from,to:cohort.to,lastChecked:cohort.lastChecked,href:evidenceUrl(data.library.brand.id,{show:"yours"},{cohort:cohort.id,from:cohort.from,to:cohort.to})}:undefined} empty={!scopes.length&&gap}>
    <label className="research-scope">Account scope<select aria-label="Account scope" value={cohort?.id||""} onChange={event=>setScope(event.target.value)}><option value="">Choose one account scope</option>{scopes.map(item=><option key={item.id} value={item.id}>{item.platform} · {item.accountId} · {item.currency} · {plainEnum(item.attribution)} · {plainEnum(item.conversionEvent)}</option>)}</select></label>
    {cohort?<div className="research-metric-grid">{(["Spend","ROAS","CPA","Hook rate"] as const).map(name=><MetricTile key={name} label={name} value={metricText(cohort.benchmark[name],name,cohort.currency)} basis="Observed" reason={metricReason(cohort.benchmark[name])} onEvidence={()=>window.location.assign(evidenceUrl(data.library.brand.id,{show:"yours"},{cohort:cohort.id,from:cohort.from,to:cohort.to}))}/>)}</div>:<Unavailable reason="Choose one account scope; accounts and currencies are never combined." label=""/>}
  </SectionCard>;
}
