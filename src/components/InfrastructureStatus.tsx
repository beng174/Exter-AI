import { plainEnum,ukDate } from "../../shared/creative-presentation";
import { useEffect, useState } from "react";
import {workspaceRead} from "../lib/workspace-read";
interface Status {
  meta?: { message: string; coverage: string };
  database?: string;
  message?: string;
  budgets?: { cost_type: string; paused: boolean; pause_reason?: string; used_gbp: number; monthly_budget_gbp: number }[];
  runs?: { id: string; status: string; errors: { message: string }[]; last_successful_check: string | null }[];
}
export function InfrastructureStatus() {
  const [status,setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let active = true;const leases=new Set<{release:()=>void}>();
    const update = () => {const lease=workspaceRead<Status>("/api/infrastructure/status");leases.add(lease);return lease.promise.then(s => { if (active) setStatus(s); }).catch(() => { if (active) setStatus({ message: "Collection status unavailable. Check the collection database and service logs." }); }).finally(()=>{lease.release();leases.delete(lease);});};
    void update();
    const timer = setInterval(() => void update(),30000);
    return () => { active = false; clearInterval(timer); for(const lease of leases)lease.release(); };
  },[]);
  if (!status) return null;
  return <aside aria-label="Collection and budget status" style={{ padding: "12px 18px", marginBottom: 16, border: "1px solid #d5d9df", borderRadius: 8 }}>
    <strong>{status.meta?.message || "Collection status"}</strong>
    {status.meta && <p>{status.meta.coverage}</p>}
    {status.message && <p role="status">{status.message}</p>}
    {status.budgets?.filter(b => b.paused).map(b => <p role="alert" key={b.cost_type}>Jobs paused: {plainEnum(b.cost_type)}. {b.pause_reason === "reserve_not_configured" ? "A per-request inference reserve must be configured in Render." : b.pause_reason === "budget_unset" ? "No monthly budget is set." : b.pause_reason === "next_request_would_exceed" ? "The next reserved request would exceed the 90% monthly safety threshold." : "The 90% monthly safety threshold has been reached."} Reserved/estimated usage £{b.used_gbp.toFixed(2)} of £{b.monthly_budget_gbp.toFixed(2)}. Review the cap in Data sources.</p>)}
    {status.runs?.slice(0,3).map(run => <p key={run.id}>Meta run: {plainEnum(run.status)}. Last successful check: {ukDate(run.last_successful_check,true) || "Not yet completed"}. {run.errors?.map(e => e.message).join(" ")}</p>)}
  </aside>;
}
