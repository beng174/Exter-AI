import {comparableBriefs,comparisonEvidenceIds,cohortLabel} from "../../../shared/public-comparisons";
import {ComparisonFilters} from "../ui/ComparisonFilters";
import {NAVIGATION_EVENT} from "../../navigation";
import { BrandText } from "../ui/BrandIdentity";
import { scoreCheckLabel } from "../../../shared/creative-score-presentation";
import { CreativeScoreBreakdown, ScoreHeadline } from "../ui/CreativeScoreBreakdown";
import { BriefsReadModel, ScoresReadModel, ReportsReadModel } from "./ActionReadModels";
import { publicCaptureCount,savedScoreRows,safeEvidenceHref } from "../../../shared/workspace-screens";
import { useState } from "react";
import { Upload } from "lucide-react";
import type { DemoEvidence, DemoPoint } from "../../../shared/brand-demo";
import type { Report } from "../../../shared/types";
import { SectionCard, DataLabel, StatusChip, DataTable, Unavailable } from "../ui";
import { CreativeRow } from "../ui/CreativeRow";
import { evidenceUrl } from "../../../shared/creative-research";
import { creativeTitle,ukDate } from "../../../shared/creative-presentation";
import { api } from "../../lib/api";
import { openCreativeRoute } from "../../navigation";
import { metadata } from "../research/common";
import { Disabled,type ActionProps } from "./ActionWorkspace";
function Evidence({items,workspaceId}:{items:DemoEvidence[];workspaceId:string}) {return <div className="brief-evidence-links">{items.map((item,index)=>item.adId?<a key={index} href={evidenceUrl(workspaceId,{ad:item.adId})}><BrandText>{item.quote||"Supporting creative"}</BrandText></a>:item.sourceUrl&&safeEvidenceHref(item.sourceUrl)?<a key={index} href={item.sourceUrl} target="_blank" rel="noopener noreferrer"><BrandText>{item.quote||"Source"}</BrandText></a>:null)}</div>;}
function Point({point,workspaceId}:{point:DemoPoint;workspaceId:string}) {return <><p><BrandText>{point.text}</BrandText></p><Evidence items={point.evidence} workspaceId={workspaceId}/></>;}
export function BriefsPage({data,header}:ActionProps) {
  const [selected,setSelected]=useState("");const {base,drafts}=data,id=base.library.brand.id;
  const filter={category:new URLSearchParams(typeof window==="undefined"?"":window.location.search).get("category")||"mine",adFormat:new URLSearchParams(typeof window==="undefined"?"":window.location.search).get("adFormat")||"same"};
  const source=(drafts.value?.opportunities||[]).map(brief=>({...brief,evidence:comparisonEvidenceIds(brief).map(adId=>({adId}))}));
  const matched=comparableBriefs(source,base.library.creatives,base.library.brand.primaryCategories||[],filter),opportunities=matched.map(item=>(drafts.value?.opportunities||[]).find(brief=>brief.id===item.brief.id)!),chosen=opportunities.find(item=>item.id===selected)||opportunities[0];
  const change=(patch:Record<string,string>)=>{const url=new URL(window.location.href);for(const [key,value]of Object.entries(patch))url.searchParams.set(key,value);window.history.pushState({},"",url);window.dispatchEvent(new Event(NAVIGATION_EVENT));};

  if(base.library.presentation&&matched.length){const group=matched[0].group,library={...base.library,creatives:group.rows},model=base.library.presentation;return <>{header()}<ComparisonFilters filter={filter} onChange={change}/><p className="reference-muted">{cohortLabel(group)}</p><BriefsReadModel library={library} model={{...model,Briefs:{...model.Briefs,proof:model.Briefs.proof.filter(item=>group.rows.some(row=>row.title===item.title))}}}/></>;}
  const gap="Ranked opportunities appear once creative results and customer needs can be compared.";
  const draftGap=drafts.failed?"Saved briefs could not be read.":"No evidence-backed brief is saved yet.";
  return <>{header()}<ComparisonFilters filter={filter} onChange={change}/><div className="reference-rail-layout brief-layout">
    <SectionCard title="Opportunities this week"><p className="reference-muted">{gap}</p><div className="brief-options">{opportunities.map(item=><button key={item.id} aria-pressed={chosen?.id===item.id} onClick={()=>setSelected(item.id)}><StatusChip status="Draft"/><strong>{item.title}</strong><small>{matched.find(match=>match.brief.id===item.id)?cohortLabel(matched.find(match=>match.brief.id===item.id)!.group):"Draft recommendation"}</small></button>)}</div></SectionCard>
    <div className="reference-stack">
      <SectionCard title={chosen?.title||"Selected opportunity"} actions={<div className="reference-actions"><Disabled reason="Editing saved briefs is not available yet.">Edit</Disabled><Disabled reason="PDF export is not available yet.">Export PDF</Disabled><Disabled reason="Approval storage is not available yet.">Approve</Disabled><Disabled primary reason="Creator delivery is not available yet.">Send to creator</Disabled></div>}>
        {chosen?<>
        {chosen?<><StatusChip status="Draft"/><Point point={chosen.rationale} workspaceId={id}/></>:<p className="reference-muted">{draftGap}</p>}
        <div className="reference-three">{["Usage gap","Category win rate","Customer demand"].map(label=><div className="reference-metric" key={label}><span>{label}</span><Unavailable compact reason="The complete opportunity calculation is not available yet."/></div>)}</div>
        <div className="reference-two"><div><h3>Proof from the category</h3>{chosen?<Evidence items={chosen.evidence} workspaceId={id}/>:<p className="reference-muted">Select an evidence-backed brief to see its source ads.</p>}</div><div><h3>What customers say</h3><p className="reference-muted">Customer quotes have not been linked to this brief.</p></div></div></>:<p className="reference-muted">{draftGap}</p>}
      </SectionCard>
      <SectionCard title="The brief">{chosen?<><div className="reference-two"><div><h3>Hooks to test</h3>{chosen?<ol>{chosen.brief.hooks.map((point,index)=><li key={index}><Point point={point} workspaceId={id}/></li>)}</ol>:<p className="reference-muted">{draftGap}</p>}</div><div><h3>Format</h3>{chosen?<Point point={chosen.brief.format} workspaceId={id}/>:<p className="reference-muted">A saved brief supplies its format.</p>}</div></div><h3>Script beats</h3>{chosen?<ol>{chosen.brief.scriptBeats.map((point,index)=><li key={index}><Point point={point} workspaceId={id}/></li>)}</ol>:<p className="reference-muted">A saved brief supplies its script beats.</p>}<div className="reference-two"><div><h3>Proof points</h3>{chosen?chosen.brief.proof.map((point,index)=><Point key={index} point={point} workspaceId={id}/>):<p className="reference-muted">No proof points are saved.</p>}</div><div><h3>Creator profile</h3>{chosen?<Point point={chosen.brief.creatorProfile} workspaceId={id}/>:<p className="reference-muted">No creator profile is saved.</p>}</div></div><h3>Variants</h3><p className="reference-muted">No production variants are saved.</p></>:<p className="reference-muted">{draftGap}</p>}</SectionCard>
    </div>
  </div></>;
}
export function ScoresPage({data,header}:ActionProps) {
  const [selected,setSelected]=useState("");const rows=savedScoreRows(data.base.library.creatives),chosen=rows.find(row=>row.adId===selected)||rows[0],id=data.base.library.brand.id;
  if(data.base.library.presentation)return <>{header()}<ScoresReadModel library={data.base.library} model={data.base.library.presentation}/></>;
  return <>{header()}<div className="score-layout">
    <SectionCard title="Score a draft"><label className="score-upload" title="Draft uploads are not supported by the current reading pipeline."><Upload size={28}/><strong>Drop a video or image, or choose a file</strong><span>MP4, MOV, JPG or PNG · up to 200 MB</span><input type="file" disabled aria-label="Choose a draft file"/></label><label>Which brief is it for?<select disabled aria-label="Brief for draft"><option>No brief</option></select></label><Disabled primary reason="The reading pipeline accepts retained ads only; draft uploads are not available yet.">Score draft</Disabled><p className="reference-muted">Draft scoring is not available yet.</p></SectionCard>
    <SectionCard title="Selected result">
      {chosen?.score?<><label>Saved creative<select aria-label="Select saved score" value={chosen.adId} onChange={event=>setSelected(event.target.value)}>{rows.map(row=><option key={row.adId} value={row.adId}>{creativeTitle(row)}</option>)}</select></label><CreativeRow row={chosen}/><CreativeScoreBreakdown score={chosen.score} workspaceId={id}/></>:<p className="reference-muted">Select a saved creative score to see its checklist.</p>}
    </SectionCard>
  </div><SectionCard title="Recent scores" meta={metadata(data.base)} empty={!rows.length&&{reason:"No creative checklist scores are saved.",href:`/?view=settings&brandId=${encodeURIComponent(id)}#gemini-smoke-test`,linkLabel:"Run analysis"}}><DataTable caption="Recent creative scores" basis="Estimated" rows={rows} rowKey={row=>row.adId} onRow={row=>openCreativeRoute(row.adId,id)} columns={[{key:"creative",label:"Creative",value:row=>row.adId,render:row=><CreativeRow row={row}/>},{key:"type",label:"Type",value:()=>"Saved ad"},{key:"score",label:"Creative score",value:row=>row.score?row.score.score??"Not assessed":null,render:row=><ScoreHeadline score={row.score!} compact/>},{key:"missing",label:"Checks to review",value:row=>row.score?.criteria.filter(item=>item.status!=="met").map(scoreCheckLabel).join(", ")||"All checks met"},{key:"working",label:"Working Score",value:()=>null}]}/></SectionCard><SectionCard title="Predictive score" actions={<StatusChip status="Not validated yet"/>}><p className="reference-muted">Not validated yet.</p></SectionCard></>;
}
const sectionNames=["Headline","Top working ads","Rising this week","What changed","You against competitors","What to work on","Last week's tests","Data coverage"];
export function ReportsPage({data,header,refresh}:ActionProps) {
  const [selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const reports=(data.reports.value||[]).filter(report=>report.mode!=="demo"||data.base.brand?.mode==="demo"),chosen=reports.find(report=>report.id===selected)||reports[0],id=data.base.library.brand.id;
  if(data.base.library.presentation)return <>{header(<><Disabled reason="Sample workspace is read-only.">Download data pack</Disabled><Disabled reason="Sample workspace is read-only.">Export PDF</Disabled><Disabled primary reason="Sample workspace is read-only.">Share client link</Disabled></>)}<ReportsReadModel library={data.base.library} model={data.base.library.presentation}/></>;
  const generate=async()=>{setBusy(true);setError("");try{const report=await api<Report>("/api/reports",{brandId:id});setSelected(report.id);refresh();}catch{setError("The report could not be generated. Earlier reports are preserved.");}finally{setBusy(false);}};
  return <>{header(<><Disabled reason="Weekly data packs are not available yet.">Download data pack</Disabled><Disabled reason="PDF export is not available yet.">Export PDF</Disabled><Disabled primary reason="Read-only client links are not available yet.">Share client link</Disabled></>)}{error&&<p role="alert">{error}</p>}<div className="reference-rail-layout reports-layout"><div className="reference-stack"><SectionCard title="Weekly packs"><p className="reference-muted">Weekly packs are not available yet.</p>{reports.map(report=><button className="saved-report-choice" key={report.id} aria-pressed={chosen?.id===report.id} onClick={()=>setSelected(report.id)}><strong>{report.title}</strong><small>{ukDate(report.createdAt)}</small></button>)}<button className="button secondary" onClick={()=>void generate()} disabled={busy}>{busy?"Generating…":"Generate report"}</button>{chosen&&<a className="button secondary" href={`/api/reports/${encodeURIComponent(chosen.id)}/download`}>Download saved report</a>}</SectionCard><SectionCard title="Client link" actions={<Disabled reason="Client-link access is not available yet.">Revoke link</Disabled>}><p className="reference-muted">Read-only client links are not available yet.</p></SectionCard></div><SectionCard title={chosen?.title||data.base.library.brand.name} actions={<div className="reference-actions"><StatusChip status="Live"/><StatusChip status="Beta"/><StatusChip status="Preview"/></div>}>
      {chosen&&<details className="saved-report-content"><summary>Saved report · {ukDate(chosen.createdAt)}</summary><pre><BrandText>{chosen.content}</BrandText></pre></details>}
      <div className="report-sections">{sectionNames.map((name,index)=><section key={name}><h3>{index+1}. {name} <StatusChip status={index===7?"Live":"Preview"}/></h3>{index===7?<><p className="reference-muted">Saved source captures and checks.</p><a href={evidenceUrl(id,{kind:"all"})}>{publicCaptureCount(data.base.library.creatives)} saved ads</a> <DataLabel basis="Observed"/></>:<p className="reference-muted">{name==="Top working ads"?<a href={`/?view=winners&brandId=${encodeURIComponent(id)}`}>View longest-running ads</a>:"No weekly report result is saved for this section."}</p>}</section>)}</div>
    </SectionCard></div></>;
}
