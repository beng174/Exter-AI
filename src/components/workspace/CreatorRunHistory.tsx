import {useState} from "react";
import {DataTable,DataLabel,StatusChip} from "../ui";
import {ukDate} from "../../../shared/creative-presentation";
import type {DiscoveryRun,CreatorProviderRunView} from "../../../shared/creator-discovery";
type Act=(name:string,path:string,body:unknown)=>Promise<boolean>;
const actorLink=(r:CreatorProviderRunView)=>r.runId?<a href={`https://console.apify.com/actors/runs/${r.runId}`} target="_blank" rel="noopener noreferrer">{r.runId}</a>:<span title="The earlier request did not save its provider run ID.">Run ID not saved</span>;
const records=(run:DiscoveryRun)=>run.providerRuns?.at(-1)?.found??null;
export function CreatorRunHistory({runs,busy,act}:{runs:DiscoveryRun[];busy:boolean;act:Act}){
 return <><DataTable caption="Creator search runs" basis="Observed" showBasis={false} rows={runs} rowKey={r=>r.id} columns={[
 {key:"date",label:"Started",value:r=>ukDate(r.createdAt,true)},
 {key:"status",label:"Status",value:r=>r.status,render:r=><><StatusChip status={r.stopRequested&&["queued","running"].includes(r.status)?"Stopping":r.status==="cancelled"&&r.stopRequested?"Stopped":r.status.charAt(0).toUpperCase()+r.status.slice(1)}/>{r.error&&<small className="accuracy-detail">{r.error}</small>}</>},
 {key:"found",label:"Creators found",align:"number",value:r=>r.found},
 {key:"records",label:"Latest run records",align:"number",value:records,render:r=><span title="The linked run’s live dataset records. Posts and repeated creators can count.">{records(r)?.toLocaleString("en-GB")} <DataLabel basis="Observed"/></span>},
 {key:"verified",label:"Verified",align:"number",value:r=>r.verified},
 {key:"provider",label:"Apify run",value:r=>r.providerRuns?.at(-1)?.runId??null,missing:()=> <span title="Confirm the earlier run ID in Details to check its charge.">Run ID not saved</span>,render:r=>actorLink(r.providerRuns!.at(-1)!)},
 {key:"action",label:"Action",value:r=>r.id,render:r=><div className="reference-actions">{["queued","running"].includes(r.status)&&<button className="button secondary" disabled={busy||r.stopRequested} onClick={()=>void act("stop","/api/creator-discovery/stop",{searchId:r.id})}>{r.stopRequested?"Stopping…":"Stop search"}</button>}<button className="button secondary" disabled={busy||r.reconcilePending||r.kind==="refresh"} onClick={()=>void act("reconcile","/api/creator-discovery/reconcile",{searchId:r.id})}>{r.reconcilePending?"Checking charges":"Reconcile"}</button></div>}
 ]}/>{runs.map(run=><CreatorRunDetails key={run.id} run={run} busy={busy} act={act}/>)}</>;
}
export function CreatorRunDetails({run,busy,act}:{run:DiscoveryRun;busy:boolean;act:Act}){
 const [hold,setHold]=useState(""),[providerId,setProviderId]=useState("");
 return <details className="creator-run-details"><summary>Details · {ukDate(run.createdAt,true)} · {run.status}</summary>
 {run.reconcileNote&&<p role="status" className="reference-muted">{run.reconcileNote}</p>}
 {run.providerRuns?.length?<DataTable caption={`Provider runs for search ${run.id}`} basis="Observed" showBasis={false} rows={run.providerRuns} rowKey={r=>r.reservationId} columns={[
 {key:"id",label:"Apify run",value:r=>r.runId,render:actorLink},
 {key:"status",label:"Status",value:r=>r.status},
 {key:"found",label:"Records found",align:"number",value:r=>r.found},
 {key:"cost",label:"Actual charge (USD)",align:"number",value:r=>r.usageUsd,render:r=><>${r.usageUsd!.toFixed(4)} <DataLabel basis="Observed"/></>},
 {key:"gbp",label:"Converted cost (GBP)",align:"number",value:r=>r.costGbp,render:r=><span title="Uses the exchange rate saved when this run started.">£{r.costGbp!.toFixed(4)} <DataLabel basis="Estimated"/></span>},
 {key:"held",label:"Budget hold (GBP)",align:"number",value:r=>r.heldGbp,render:r=>`£${r.heldGbp.toFixed(2)}`},
 {key:"checked",label:"Last checked",value:r=>r.checkedAt?ukDate(r.checkedAt,true):null}
 ]}/>:<p className="reference-muted">This earlier search did not save its provider run IDs.</p>}
 {Boolean(run.legacyHolds?.length)&&<form className="creator-reconcile-form" onSubmit={async e=>{e.preventDefault();if(await act("reconcile-legacy","/api/creator-discovery/reconcile",{searchId:run.id,mappings:[{reservationId:hold,actorRunId:providerId.trim()}]}))setProviderId("");}}><p className="reference-muted">Confirm the run and hold. Exter checks its actor, input and charge.</p><label>Budget hold<select required value={hold} onChange={e=>setHold(e.target.value)}><option value="">Choose a hold</option>{run.legacyHolds!.map(h=><option key={h.reservationId} value={h.reservationId}>£{h.heldGbp.toFixed(2)} · {ukDate(h.createdAt,true)} · {h.reservationId.slice(0,8)}</option>)}</select></label><label>Apify run ID<input required maxLength={100} pattern="[A-Za-z0-9_-]+" value={providerId} onChange={e=>setProviderId(e.target.value)} autoComplete="off"/></label><button className="button secondary" disabled={busy||run.reconcilePending||!hold||!providerId.trim()}>Confirm and reconcile</button></form>}
 </details>;
}
