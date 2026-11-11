import {useEffect,useState} from "react";
import {WORKER_JOB_NAMES,type WorkerHealth,type WorkerFailure} from "../../../shared/worker-health";
import {ukDate} from "../../../shared/creative-presentation";
import {api} from "../../lib/api";
import {SectionCard,DataTable,StatusChip} from "../ui";
import "./WorkerHealthPanel.css";

export function WorkerHealthPanel({workspaceId}:{workspaceId:string}){
 const [health,setHealth]=useState<WorkerHealth|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const endpoint=`/api/infrastructure/worker?${new URLSearchParams({workspaceId})}`;
 useEffect(()=>{const controller=new AbortController();const read=()=>void api<WorkerHealth>(endpoint,undefined,{signal:controller.signal}).then(value=>{setHealth(value);setFailed(false);}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});read();const timer=setInterval(read,30000);return()=>{controller.abort();clearInterval(timer);};},[endpoint]);
 async function refresh(){try{setHealth(await api<WorkerHealth>(endpoint));setFailed(false);}catch{setFailed(true);}}
 async function retry(row:WorkerFailure){setBusy(true);setNotice("");try{await api("/api/infrastructure/worker/retry",{workspaceId,type:row.type,jobId:row.jobId});setNotice("The saved step will retry within its existing budget.");await refresh();}catch(error){setNotice(error instanceof Error?error.message:"The saved step could not be retried.");}finally{setBusy(false);}}
 return <div id="worker-jobs" className="worker-health"><SectionCard title="Worker jobs" actions={<button className="button secondary" onClick={()=>void refresh()}>Refresh</button>}>
  {failed?<p className="reference-muted">Worker details could not be read. Refresh to try again.</p>:!health?<p className="reference-muted">Reading worker details…</p>:!health.failures.length?<p className="reference-muted">No worker failures are recorded.</p>:<>
   <p className="reference-muted">Jobs pause after three failed steps. Some steps need review sooner.</p>
   <DataTable caption="Worker jobs needing attention" basis="Observed" showBasis={false} rows={health.failures} rowKey={row=>`${row.type}:${row.jobId}`} columns={[
    {key:"type",label:"Job",value:row=>WORKER_JOB_NAMES[row.type]},
    {key:"id",label:"Job ID",value:row=>row.jobId,render:row=>row.jobId==="@queue"?"Queue setup":<code className="worker-health-id">{row.jobId}</code>},
    {key:"status",label:"Status",value:row=>row.status,render:row=><StatusChip status={row.status==="paused"?"Paused":"Waiting to retry"}/>},
    {key:"failures",label:"Failed steps",align:"number",value:row=>row.failures},
    {key:"reason",label:"Reason",value:row=>row.error.message,render:row=><><span>{row.error.message}</span><details><summary>Details</summary><p>{row.error.name}{row.error.code?` · ${row.error.code}`:""}{row.error.httpStatus?` · HTTP ${row.error.httpStatus}`:""}</p>{row.error.location&&<code>{row.error.location}</code>}<p>Last failed {ukDate(row.lastFailedAt,true)}</p>{row.nextAttemptAt&&<p>Next attempt {ukDate(row.nextAttemptAt,true)}</p>}</details></>},
    {key:"action",label:"Action",value:()=>"Retry saved step",render:row=><button className="button secondary" disabled={busy} onClick={()=>void retry(row)}>Retry saved step</button>},
   ]}/>
  </>}{notice&&<p role="status">{notice}</p>}
 </SectionCard></div>;
}
