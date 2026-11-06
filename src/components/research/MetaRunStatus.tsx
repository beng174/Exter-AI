import {useState} from "react";
import type {MetaWatchlist} from "../../../shared/meta-public";
import type {MetaRunSummary} from "../../../shared/meta-collection";
import type {ResearchData} from "./useResearchData";
import {ukDate,plainEnum} from "../../../shared/creative-presentation";
import {DataTable,StatusChip} from "../ui";
import {BrandName} from "../ui/BrandIdentity";
import "./MetaRunStatus.css";
const count=(value:number|null)=>value===null?"Unavailable":new Intl.NumberFormat("en-GB").format(value);
const status=(run:MetaRunSummary)=>run.status==="not_connected"?"Paused":run.status==="superseded"?"Replaced":plainEnum(run.status);
const failureNumbers=(failure:NonNullable<MetaRunSummary["failures"]>[number])=>`${failure.graphCode!==null?`Graph code ${failure.graphCode}`:"Graph code not recorded"}${failure.graphSubcode!==null?` · subcode ${failure.graphSubcode}`:""}${failure.httpStatus!==null?` · HTTP ${failure.httpStatus}`:""}${failure.timedOut?" · Timeout":""}${failure.pageSize!==null?` · ${failure.pageSize} ads per page`:""}`;
export function metaRetryReason(data:ResearchData,watchlist?:MetaWatchlist){
  if(data.library.presentation)return "Sample workspace is read-only.";
  if(!watchlist?.enabled||!watchlist.page_ids.length)return "Add and save a Meta Page ID before collecting.";
  if(!data.library.metaSource?.enabled)return "Live collection is off. Enable it in Render before retrying.";
  if(!["configured","connected"].includes(data.infrastructure?.meta?.status||""))return "Add the approved Meta token in Render before retrying.";
  if(!data.budgets?.some(b=>b.cost_type==="data_providers"&&!b.paused))return "Review the data provider budget in Budgets and schedule before retrying.";
  if(["queued","running"].includes(watchlist.latestRun?.status||""))return "Collection is already queued or running.";
  return null;
}
export function MetaRetryButton({data,watchlist,onSaved,disabledReason}:{data:ResearchData;watchlist?:MetaWatchlist;onSaved:()=>void;disabledReason?:string|null}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const reason=disabledReason||metaRetryReason(data,watchlist),run=watchlist?.latestRun;
  const label=!run||run.status==="superseded"?"Collect ads":run.status==="complete"?"Collect again":"Retry collection";
  async function retry(){if(reason||!watchlist)return;setBusy(true);setMessage("");try{
    const response=await fetch("/api/public/meta/collect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({watchlistId:watchlist.id,workspaceId:data.library.brand.id})});
    if(!response.ok)throw new Error();setMessage("Collection queued from its saved progress.");onSaved();
  }catch{setMessage("Collection could not be queued. Check access, the budget and any active request before retrying.");}finally{setBusy(false);}}
  return <span className="meta-retry-control"><button className="button secondary" type="button" disabled={busy||Boolean(reason)} title={reason||"Resume saved progress through the collection guards."} onClick={()=>void retry()}>{busy?"Queueing…":label}</button>{message&&<small role="status">{message}</small>}</span>;
}
export function MetaRunDetails({run,compact=false}:{run:MetaRunSummary|null|undefined;compact?:boolean}){
  if(!run)return <span className="reference-muted">No collection run yet.</span>;
  return <div className="meta-run-details">{!compact&&<><StatusChip status={status(run)}/><dl className="meta-run-counts"><div><dt>Ads saved</dt><dd title="New or changed ad snapshots saved in this run. Unchanged ads are confirmed without adding rows.">{count(run.adsSaved)}</dd></div><div><dt>Pages fetched</dt><dd title="Successfully fetched pages committed at the saved cursor.">{count(run.pagesFetched)}</dd></div><div><dt>Page size</dt><dd>{run.pageSize}</dd></div></dl></>}
    {run.stoppedAt&&<small>{run.status==="complete"?"Finished":"Stopped"} {ukDate(run.stoppedAt,true)}</small>}
    {run.message&&<p>{run.message}</p>}
    {run.failures[0]&&<><small>Latest failure: {failureNumbers(run.failures[0])}</small>{run.failures[0].userTitle&&<strong>{run.failures[0].userTitle}</strong>}{run.failures[0].userMessage&&<p>{run.failures[0].userMessage}</p>}</>}
    {run.failures.length>0&&<details><summary>Failure details ({run.failureCount})</summary><ol>{run.failures.map(failure=><li key={failure.id}><span>{failureNumbers(failure)}</span>{failure.userTitle&&<strong>{failure.userTitle}</strong>}{failure.userMessage&&<p>{failure.userMessage}</p>}<small>{ukDate(failure.at,true)} · {failure.message}</small></li>)}</ol>{run.failureCount>run.failures.length&&<small>Latest {run.failures.length} of {run.failureCount} failures.</small>}</details>}
  </div>;
}
export function MetaRunTable({data,onSaved}:{data:ResearchData;onSaved:()=>void}){
  if(data.library.presentation)return null;
  const watchlists=data.watchlists?.filter(w=>w.purpose==="brand")||[];
  if(!watchlists.length)return null;
  const targets=[{key:data.library.brand.id,name:data.library.brand.name},...data.library.competitors.map(b=>({key:b.brandId||b.key,name:b.name}))];
  const rows=targets.map(target=>({...target,watchlist:watchlists.find(w=>w.brand_key===target.key)}));
  return <div className="meta-run-table"><h3>Meta collection by brand</h3>{data.watchlistPollFailed&&<p className="reference-muted" role="status">Progress could not be refreshed. Saved details are still shown.</p>}<DataTable caption="Meta collection by brand" basis="Observed" showBasis={false} hideUnavailable={false} rows={rows} rowKey={r=>r.key} columns={[
    {key:"brand",label:"Brand",value:r=>r.name,render:r=><BrandName name={r.name} size={16}/>},
    {key:"status",label:"Status",align:"chip",value:r=>r.watchlist?.latestRun?status(r.watchlist.latestRun):"Not collected",render:r=><StatusChip status={r.watchlist?.latestRun?status(r.watchlist.latestRun):"Not collected"}/>},
    {key:"ads",label:"Ads saved",align:"number",header:<span title="New or changed ad snapshots saved in this run; unchanged confirmations add no rows.">Ads saved</span>,value:r=>r.watchlist?.latestRun?.adsSaved,render:r=>count(r.watchlist?.latestRun?.adsSaved??null)},
    {key:"pages",label:"Pages fetched",align:"number",value:r=>r.watchlist?.latestRun?.pagesFetched,render:r=>count(r.watchlist?.latestRun?.pagesFetched??null)},
    {key:"details",label:"Detail",value:()=>"Collection progress",render:r=><MetaRunDetails run={r.watchlist?.latestRun} compact/>},
    {key:"action",label:"Action",value:()=>"Collection action",render:r=><MetaRetryButton data={data} watchlist={r.watchlist} onSaved={onSaved}/>}
  ]}/></div>;
}
