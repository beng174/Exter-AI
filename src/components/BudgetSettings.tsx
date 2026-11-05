import {AdMediaRuns} from "./workspace/AdMediaRuns";
import { useEffect, useState, type FormEvent } from "react";
import { CircleHelp, RefreshCw, Wallet } from "lucide-react";
import { api } from "../lib/api";


type CostType = "inference" | "data_providers";
interface Budget {
  cost_type: CostType;
  monthly_budget_gbp: number;
  used_gbp: number;
  paused: boolean;
  pause_reason: "budget_unset" | "threshold_reached" | "reserve_not_configured" | "next_request_would_exceed" | null;
  threshold_gbp: number;
  remaining_gbp: number;
  request_reserve_gbp: number | null;
}
interface BudgetResponse {
  month: string;
  currency: "GBP";
  timezone: "UTC";
  pause_threshold: number;
  budgets: Budget[];
}
const types: CostType[] = ["inference", "data_providers"];
const labels: Record<CostType,string> = { inference: "Inference", data_providers: "Data providers" };
const descriptions: Record<CostType,string> = {
  inference: "Gemini video analysis and other paid model requests.",
  data_providers: "Paid collection and data provider requests.",
};
const pauseReasons: Record<NonNullable<Budget["pause_reason"]>,string> = {
  budget_unset: "Set a monthly budget above £0 to allow paid requests.",
  threshold_reached: "Usage has reached the 90% safety threshold. Increase the cap or wait for the next month to resume.",
  reserve_not_configured: "A conservative per-request inference reserve must be configured in Render before paid requests can run.",
  next_request_would_exceed: "The next reserved inference request would exceed the 90% safety threshold. Increase the cap or wait for the next month to resume.",
};
function money(amount: number, precise = false) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: precise ? 6 : 2 }).format(amount);
}

export function BudgetSettings({workspaceId}:{workspaceId?:string}={}) {
  const [data,setData] = useState<BudgetResponse | null>(null);
  const [drafts,setDrafts] = useState<Partial<Record<CostType,string>>>({});
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState<CostType | null>(null);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");

  function receive(result: BudgetResponse) {
    setData(result);
    setDrafts(current => Object.fromEntries(types.map(type => [type, current[type] ?? result.budgets.find(row => row.cost_type === type)?.monthly_budget_gbp.toFixed(2) ?? ""])));
  }
  useEffect(() => {
    let active = true;
    api<BudgetResponse>("/api/budgets").then(result => { if (active) receive(result); })
      .catch(cause => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[]);

  async function refresh() {
    setLoading(true); setError(""); setMessage("");
    try { receive(await api<BudgetResponse>("/api/budgets")); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  async function save(event: FormEvent, type: CostType) {
    event.preventDefault();
    const value = (drafts[type] || "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 100))) {
      setError("Enter a non-negative GBP amount with at most two decimal places."); return;
    }
    setSaving(type); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/budgets/${type}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly_budget_gbp: Number(value) }) });
      const result = await response.json().catch(() => null) as { error?: string; budget?: Budget } | null;
      if (!response.ok || !result?.budget) throw new Error(result?.error || "The budget could not be saved. Refresh and try again.");
      const budget = result.budget;
      setData(current => current && { ...current, budgets: current.budgets.map(row => row.cost_type === type ? budget : row) });
      setDrafts(current => ({ ...current, [type]: budget.monthly_budget_gbp.toFixed(2) }));
      setMessage(`${labels[type]} monthly budget saved: ${money(budget.monthly_budget_gbp)}.`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(null); }
  }

  const month = data ? new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "Current month";
  return <section id="monthly-budgets" className="ui-section-card reference-budget" aria-label="Budgets and schedule">
    <header><div><h2>Budgets and schedule</h2><p>Paid calls stop when a budget is reached; nothing is silently retried</p></div><button className="button secondary" onClick={()=>void refresh()} disabled={loading||saving!==null}>Refresh usage</button></header>
    {error&&<p role="alert" className="reference-muted">Saved budget usage could not be read.</p>}{message&&<p role="status">{message}</p>}
    {loading&&!data?<p role="status" className="reference-muted">Reading saved budgets…</p>:!data?error?null:<p className="reference-muted">Budget settings are unavailable.</p>:<div className="reference-stack">{types.map(type=>{const budget=data.budgets.find(row=>row.cost_type===type);if(!budget)return <p className="reference-muted" key={type}>{labels[type]} budget is unavailable.</p>;return <article key={type} className="budget-reference-row"><div><strong>{type==="inference"?"AI reading budget":"Data provider budget"}</strong><span>{money(budget.used_gbp)} of {money(budget.monthly_budget_gbp)} this month</span></div><progress aria-label={`${labels[type]} usage against monthly cap`} max={budget.monthly_budget_gbp||1} value={budget.used_gbp}/><small>{budget.paused?"Paid requests are paused.":"Budget available"}</small><details><summary>Edit budget</summary><form onSubmit={event=>void save(event,type)}><label htmlFor={`budget-${type}`}>Monthly cap (GBP)<input id={`budget-${type}`} type="number" min="0" step="0.01" required value={drafts[type]??""} onChange={event=>setDrafts(current=>({...current,[type]:event.target.value}))}/></label><button className="button secondary" disabled={saving!==null}>Save budget</button></form></details></article>;})}</div>}
    {workspaceId&&<AdMediaRuns workspaceId={workspaceId}/>}
    <dl className="reference-schedule"><dt>Collection</dt><dd>Daily, when configured</dd><dt>Your account sync</dt><dd>Daily, when enabled · last 7 days re-pulled</dd><dt>Weekly data pack</dt><dd>Not available yet</dd></dl>
    <details className="reference-muted"><summary>About this data</summary><p>Usage includes estimated charges and uncertain reservations. Existing safety thresholds and request reserves are unchanged. Collection and account sync depend on existing worker configuration. Live account sync remains off unless separately enabled.</p></details>
  </section>;
}
