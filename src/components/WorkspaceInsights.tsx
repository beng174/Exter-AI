import { useEffect, useMemo, useState } from "react";
import type { BrandDemoReport, DemoPattern } from "../../shared/brand-demo";
import type { DemoGalleryCreative } from "../../shared/creative-gallery";
import type { DemoCollectionSnapshot } from "../../shared/demo-collection";
import { messageSignals, patternPopulation, type MessageSignal } from "../../shared/creative-insights";
import type { PatternDimension } from "../../shared/demo-patterns";
import type { OwnedOutcomeEvidence } from "../../shared/owned-outcomes";
import { api } from "../lib/api";
import { PatternDistribution } from "./EvidenceCharts";
import { PopulationChart } from "./PopulationChart";
import "./workspace-insights.css";

const count=(value:number)=>value.toLocaleString("en-GB",{maximumFractionDigits:1});
const dimensions: readonly [PatternDimension,string][]=[["hookType","Hooks"],["angle","Angles"],["offerType","Offers"],["format","Formats"]];
interface Intelligence { voice:string[]; audienceTotal:number; audienceLabels:MessageSignal[]; performance:OwnedOutcomeEvidence }
function useIntelligence(brandId:string) {
  const [data,setData]=useState<Intelligence|null>(null),[error,setError]=useState(false);
  useEffect(()=>{let current=true;setData(null);setError(false);void api<Intelligence>(`/api/brands/${encodeURIComponent(brandId)}/demo/intelligence`).then(value=>{if(current)setData(value);}).catch(()=>{if(current)setError(true);});return()=>{current=false;};},[brandId]);
  return {data,error};
}
function DimensionTabs({value,onChange,label}:{value:PatternDimension;onChange:(value:PatternDimension)=>void;label:string}) {
  return <div className="insight-chart-tabs" role="group" aria-label={label}>{dimensions.map(([id,title])=><button type="button" key={id} aria-pressed={value===id} onClick={()=>onChange(id)}>{title}</button>)}</div>;
}
export function CreativeLandscape({report,onSelect}:{report:BrandDemoReport;onSelect:(pattern:DemoPattern,basis:"canonical"|"legacy",dimension:PatternDimension)=>void}) {
  const [dimension,setDimension]=useState<PatternDimension>("hookType");
  return <div className="creative-landscape"><DimensionTabs value={dimension} onChange={setDimension} label="Creative pattern dimension"/>
    <PatternDistribution key={dimension} title={dimensions.find(([id])=>id===dimension)![1]} dimension={dimension} patterns={report.patterns[dimension]} legacyPatterns={report.legacyPatterns?.[dimension]} coverage={report.patternCoverage?.[dimension]} totalAnalysed={report.analysedAdsCount} compact={false} onSelect={(pattern,basis)=>onSelect(pattern,basis,dimension)} />
  </div>;
}
export function AudienceVoiceInsights({brandId,creatives,onSelect}:{brandId:string;creatives:DemoGalleryCreative[];onSelect:(ads:DemoGalleryCreative[])=>void}) {
  const {data,error}=useIntelligence(brandId);
  const signals=useMemo(()=>messageSignals(creatives),[creatives]);
  const rows=(items:MessageSignal[],unrecorded:string[])=>[...items.filter(g=>g.adIds.length).map(g=>({id:g.id,label:g.label,value:g.adIds.length,onSelect:()=>onSelect(creatives.filter(c=>g.adIds.includes(c.adId)))})),...(unrecorded.length?[{id:"unrecorded",label:"Other / not recorded",value:unrecorded.length,muted:true,onSelect:()=>onSelect(creatives.filter(c=>unrecorded.includes(c.adId)))}]:[])];
  return <div className="insights-stack">
    <div className="insights-intro"><div><span className="insights-eyebrow">AUDIENCE & VOICE</span><h2>Who the message is for. How it speaks.</h2><p>Explore the needs and messaging styles recorded in {count(signals.total)} analysed ads. Select any segment to review the creative.</p></div><div className="insights-sample"><strong>{count(signals.total)}</strong><span>analysed ads</span></div></div>
    <PopulationChart title="Audience needs in the creative" total={signals.total} rows={rows(signals.audience,signals.audienceUnrecorded)} description="Ads grouped by the first matching need in their saved analysis. Each ad counts once. These are message themes, not measured audience demographics or reach." emptyText="Audience themes need saved ad analyses. Collect and analyse the brand's creatives to populate this view." />
    <PopulationChart title="Messaging styles" total={signals.total} rows={rows(signals.voice,signals.voiceUnrecorded)} description="Observable text patterns in saved hooks, claims and on-screen text. Each ad counts once; a missing style stays visible."/>
    {Boolean(data?.audienceLabels.length) && <PopulationChart title="Provided audience labels" total={data!.audienceTotal} compact allowMap={false} rows={data!.audienceLabels.map(g=>({id:g.id,label:g.label,value:g.adIds.length,onSelect:()=>onSelect(creatives.filter(c=>g.adIds.includes(c.adId)))}))} description="Labels supplied with the saved records, not verified targeting. An ad can have several labels; shares can overlap." footer="The chart counts saved records carrying each label. It does not estimate the number of people in an audience." />}
    <section className="insights-voice"><h3>Provided brand voice</h3>{data?.voice.length ? <div className="insights-tags">{data.voice.map(word=><span key={word}>{word}</span>)}</div> : <p>{error ? "The saved voice profile could not be loaded. Refresh to retry." : data ? "No brand voice profile has been supplied. The messaging charts above still use the saved ad analyses." : "Loading the saved brand voice profile…"}</p>}</section>
  </div>;
}

export function OwnedResults({brandId,onSources}:{brandId:string;onSources?:()=>void}) {
  const {data,error}=useIntelligence(brandId);
  const [selected,setSelected]=useState("");
  const cohorts=data?.performance.cohorts||[],cohort=cohorts.find(c=>c.id===selected)||cohorts[0];
  const money=(value:number|null)=>value===null ? "Unavailable" : `${cohort?.currency || "Unspecified currency"} ${count(value)}`;
  return <section className="owned-results" aria-label="Owned ad conversion results"><header><div><span className="insights-eyebrow">MEASURED RESULTS</span><h2>Which of your ads are converting?</h2><p>Conversion results from your authorised account records.</p></div>{onSources&&<button type="button" className="rws-secondary-button" onClick={onSources}>Manage performance data</button>}</header>
    {!data && !error ? <p role="status">Loading saved performance records…</p> : !cohort ? <div className="owned-results-empty"><div><h3>{error ? "Performance records could not be loaded" : "Conversion data is not connected yet"}</h3><p>{error ? "Refresh to retry. Your saved creative evidence is still available." : "The public ad library supplies creatives, not sales. Import owned-account results to compare conversions, cost per acquisition and return on ad spend."}</p></div><div className="owned-results-requirements"><strong>Required for a fair comparison</strong><span>Ad ID · reporting day · conversion event</span><span>Conversions · spend · currency</span><span>Revenue to calculate ROAS</span></div></div> : <>
      <label className="outcome-cohort-select">Compare the same reporting day and conversion event<select aria-label="Performance comparison cohort" value={cohort.id} onChange={event=>setSelected(event.target.value)}>{cohorts.map(c=><option key={c.id} value={c.id}>{c.platform} · {c.date||"Date missing"} · {c.conversionEvent||"Event missing"} · {c.currency||"Currency missing"}</option>)}</select></label>
      {!cohort.comparable && <p className="insights-data-note">These records need a reporting day, currency and conversion event before a like-for-like ranking is available.</p>}
      <div className="owned-results-kpis"><div><span>Ads with results</span><strong>{count(cohort.rows.length)}</strong></div><div><span>Reported conversions</span><strong>{count(cohort.conversions)}</strong></div><div><span>Reported spend</span><strong>{money(cohort.spend)}</strong></div><div><span>CPA on matched records</span><strong>{cohort.comparable?money(cohort.cpa):"Unavailable"}</strong></div></div>
      <PopulationChart title="Reported conversions by ad" total={cohort.conversions} compact unit="conversions" allowMap={false} rows={cohort.rows.map(row=>({id:row.adId,label:row.title,value:row.conversions}))} description={`Each bar counts ${cohort.conversionEvent||"reported conversions"} on ${cohort.date||"an unspecified reporting day"}. Shares use total conversions in this selection.`} emptyText="The measured records report zero conversions for this selection." />
      <div className="insights-table-scroll"><table className="insights-table"><caption>Reported owned results. Compare costs only when attribution settings also match.</caption><thead><tr><th>Ad</th><th>Conversions</th><th>Spend</th><th>CPA</th><th>ROAS</th></tr></thead><tbody>{cohort.rows.map(row=><tr key={row.adId}><th scope="row">{row.title}<small>{row.nativeId}</small></th><td>{count(row.conversions)}</td><td>{money(row.spend)}</td><td>{cohort.comparable?money(row.cpa):"Unavailable"}</td><td>{cohort.comparable&&row.roas!==null?`${count(row.roas)}×`:"Unavailable"}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

export function CompetitorComparison({brandId,report,competition,onExplore}:{brandId:string;report:BrandDemoReport|null;competition:DemoCollectionSnapshot|null;onExplore:(brandId:string)=>void}) {
  const [dimension,setDimension]=useState<PatternDimension>("angle");
  const [reports,setReports]=useState<Record<string,BrandDemoReport|null>>({}),[done,setDone]=useState(false);
  const ids=(competition?.competitors||[]).flatMap(c=>c.brandId&&c.collectedCount>0?[c.brandId]:[]).join("|");
  useEffect(()=>{let current=true;setReports({});setDone(false);void Promise.allSettled(ids.split("|").filter(Boolean).map(async id=>({id,report:await api<BrandDemoReport>(`/api/brands/${encodeURIComponent(id)}/demo`)}))).then(results=>{if(!current)return;setReports(Object.fromEntries(results.flatMap(r=>r.status==="fulfilled"?[[r.value.id,r.value.report]]:[])));setDone(true);});return()=>{current=false;};},[brandId,ids]);
  const columns=[{id:brandId,name:report?.brand.name||"Your brand",report,collected:true},...(competition?.competitors||[]).map(c=>({id:c.brandId||c.id,name:c.name,report:c.brandId?reports[c.brandId]||null:null,collected:c.collectedCount>0}))];
  const populations=columns.map(c=>c.report?patternPopulation(dimension,c.report.patterns[dimension],c.report.legacyPatterns?.[dimension],c.report.patternCoverage?.[dimension],c.report.analysedAdsCount):null);
  const groups=[...new Map(populations.flatMap(p=>p?.groups||[]).map(g=>[g.id,g])).values()].sort((a,b)=>Number(a.basis==="missing")-Number(b.basis==="missing")||populations.reduce((n,p)=>n+(p?.groups.find(g=>g.id===b.id)?.count||0)-(p?.groups.find(g=>g.id===a.id)?.count||0),0));
  return <section className="competitor-comparison"><header><span className="insights-eyebrow">BRAND VS COMPETITORS</span><h2>Compare the creative landscape</h2><p>See which messages each brand uses in its analysed sample. This compares creative presence; competitor conversions are unavailable from public libraries.</p>{!competition && <p className="insights-data-note">No saved competitor collection could be loaded for this workspace. The brand sample is shown below.</p>}</header><DimensionTabs value={dimension} onChange={setDimension} label="Competitor comparison dimension"/>
    <div className="insights-table-scroll"><table className="insights-table comparison-matrix"><caption>Each column uses that brand's full analysed sample. Different collection windows and sample sizes can affect the comparison.</caption><thead><tr><th scope="col">{dimensions.find(([id])=>id===dimension)![1]}</th>{columns.map((c,i)=><th scope="col" key={c.id}>{c.name}<small>{populations[i] ? `${populations[i]!.total} analysed ads` : !c.collected ? "Not collected" : !done ? "Loading…" : "Analysis unavailable"}</small></th>)}</tr></thead><tbody>{groups.length?groups.map(group=><tr key={group.id}><th scope="row">{group.label}<small>{group.basis==="description-theme"?"Description theme":group.basis==="saved-label"?"Saved label":"No recorded evidence"}</small></th>{columns.map((c,i)=>{const population=populations[i],value=population?.groups.find(g=>g.id===group.id)?.count||0,share=population?.total?100*value/population.total:null;return <td key={c.id}>{share===null?<span className="comparison-unavailable">Unavailable</span>:<button type="button" onClick={()=>onExplore(c.id)} aria-label={`${c.name}, ${group.label}: ${value} of ${population!.total} ads`} style={{background:`rgba(0,192,203,${.04+.24*share/100})`}}><strong>{count(share)}%</strong><small>{value} / {population!.total} ads</small></button>}</td>;})}</tr>):<tr><td colSpan={columns.length+1}>Creative comparison needs saved ad analyses. Collected ads remain available below.</td></tr>}</tbody></table></div>
  </section>;
}

export function CreativeNextSteps({report,onEvidence}:{report:BrandDemoReport;onEvidence:(pattern:DemoPattern)=>void}) {
  const population=patternPopulation("angle",report.patterns.angle,report.legacyPatterns?.angle,report.patternCoverage?.angle,report.analysedAdsCount);
  const observed=population.groups.filter(g=>g.basis!=="missing").slice(0,3);
  return <section className="creative-next-steps"><header><span className="insights-eyebrow">CREATE NEXT</span><h2>Turn observations into creative tests</h2><p>Draft hypotheses from the saved sample. Validate them with owned conversion results before scaling spend.</p></header>
    {report.opportunities.length ? <div className="next-step-grid">{report.opportunities.slice(0,3).map(opportunity=><article key={opportunity.id}><span className="insights-chip">{opportunity.status==="gap"?"Candidate gap":opportunity.status==="saturated"?"Try a new execution":"Test hypothesis"}</span><h3>{opportunity.title}</h3><p>{opportunity.denominator > 0 ? opportunity.rationale.text : "Test a fresh execution of this message. The cited ads motivate the draft; an owned-account experiment is needed to measure conversion lift."}</p><button type="button" className="rws-source" onClick={()=>onEvidence({value:opportunity.id,label:opportunity.title,count:opportunity.count,denominator:opportunity.denominator,totalAnalysed:report.analysedAdsCount,share:null,evidence:opportunity.evidence})}>Review supporting ads</button><details><summary>Hooks & production brief</summary><p>{opportunity.rationale.text}</p><ol>{opportunity.brief.hooks.map((hook,i)=><li key={i}>{hook.text}</li>)}</ol><h4>Format</h4><p>{opportunity.brief.format.text}</p><h4>Script beats</h4><ol>{opportunity.brief.scriptBeats.map((beat,i)=><li key={i}>{beat.text}</li>)}</ol><button type="button" className="rws-source" onClick={()=>onEvidence({value:opportunity.id,label:opportunity.title,count:opportunity.count,denominator:opportunity.denominator,totalAnalysed:report.analysedAdsCount,share:null,evidence:opportunity.evidence})}>Review supporting ads</button></details></article>)}</div>
      : observed.length ? <div className="next-step-grid">{observed.map(group=><article key={group.id}><span className="insights-chip">Test hypothesis</span><h3>Test another execution of {group.label.toLowerCase()}</h3><p>This theme appears in {group.count} of {population.total} analysed ads. Keep the message constant and vary the hook or format; compare CPA on the same conversion event.</p><button type="button" className="rws-source" onClick={()=>onEvidence({value:group.id,label:group.label,count:group.count,denominator:population.total,totalAnalysed:population.total,share:null,evidence:group.evidence})}>Review {group.count} supporting ads</button></article>)}</div>
      : <p>Saved creative analyses are needed to support a production recommendation.</p>}
  </section>;
}
