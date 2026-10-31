import { useEffect, useState } from "react";
import { api } from "../lib/api";
interface Status {
  meta?: { message: string; coverage: string };
  database?: string;
  message?: string;
  budgets?: { cost_type: string; paused: boolean; used_gbp: number; monthly_budget_gbp: number }[];
  runs?: { id: string; status: string; errors: { message: string }[]; last_successful_check: string | null }[];
}
export function InfrastructureStatus() {
  const [status,setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let active = true;
    const update = () => api<Status>("/api/infrastructure/status").then(s => { if (active) setStatus(s); }).catch(() => { if (active) setStatus({ message: "Collection status unavailable. Check the collection database and service logs." }); });
    void update();
    const timer = setInterval(() => void update(),30000);
    return () => { active = false; clearInterval(timer); };
  },[]);
  if (!status) return null;
  return <aside aria-label="Collection and budget status" style={{ padding: "12px 18px", marginBottom: 16, border: "1px solid #d5d9df", borderRadius: 8 }}>
    <strong>{status.meta?.message || "Collection status"}</strong>
    {status.meta && <p>{status.meta.coverage}</p>}
    {status.message && <p role="status">{status.message}</p>}
    {status.budgets?.filter(b => b.paused).map(b => <p role="alert" key={b.cost_type}>Jobs paused: {b.cost_type} is at its 90% monthly budget threshold, the next reserved call would exceed it, or no budget is set. Reserved/estimated usage £{b.used_gbp.toFixed(2)} of £{b.monthly_budget_gbp.toFixed(2)}.</p>)}
    {status.runs?.slice(0,3).map(run => <p key={run.id}>Meta run: {run.status}. Last successful check: {run.last_successful_check || "Not yet completed"}. {run.errors?.map(e => e.message).join(" ")}</p>)}
  </aside>;
}
