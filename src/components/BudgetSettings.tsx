import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import { api } from "../lib/api";
import "./budget-settings.css";

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

export function BudgetSettings() {
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
  return <section className="budget-settings" aria-labelledby="budget-settings-title">
    <div className="budget-heading">
      <div><span className="budget-eyebrow"><Wallet size={14} aria-hidden="true" /> SETTINGS</span><h2 id="budget-settings-title">Monthly budgets</h2><p>Control the monthly GBP caps shared by this deployment.</p></div>
      <button className="budget-refresh" onClick={() => void refresh()} disabled={loading || saving !== null}><RefreshCw size={14} aria-hidden="true" />{loading ? "Loading…" : "Refresh usage"}</button>
    </div>
    <div className="budget-policy"><strong>{month} · UTC</strong><p>Paid jobs pause at 90% of each cap, or earlier when the next request reserve would exceed it. Usage includes estimated charges and reservations for requests whose final cost is unknown. Budgets renew on the first day of each month in UTC.</p></div>
    {error && <p className="budget-error" role="alert">{error}</p>}
    {message && <p className="budget-success" role="status">{message}</p>}
    {loading && !data && <p role="status">Loading budget settings…</p>}
    {!loading && !data && <p className="budget-unavailable">Budget settings are unavailable. Check the database configuration and migrations in Render, then refresh.</p>}
    {data && <div className="budget-grid">{types.map(type => {
      const budget = data.budgets.find(row => row.cost_type === type);
      if (!budget) return <article key={type} className="budget-card"><h3>{labels[type]}</h3><p>Budget setting unavailable. Apply the database migrations in Render, then refresh.</p></article>;
      const fraction = budget.monthly_budget_gbp > 0 ? budget.used_gbp / budget.monthly_budget_gbp : 0;
      return <article key={type} className="budget-card">
        <div className="budget-card-heading"><h3>{labels[type]}</h3><span className={`budget-state ${budget.paused ? "is-paused" : "is-active"}`}>{budget.paused ? "Paused" : "Available"}</span></div>
        <p className="budget-description">{descriptions[type]}</p>
        <div className="budget-usage"><strong>{money(budget.used_gbp,true)}</strong><span>of {money(budget.monthly_budget_gbp)} monthly cap</span></div>
        <div className="budget-meter"><progress aria-label={`${labels[type]} usage against monthly cap`} max={1} value={Math.min(1,Math.max(0,fraction))} /><span aria-hidden="true" /></div>
        <p className="budget-threshold">Safety threshold: {money(budget.threshold_gbp,true)} · Available before threshold: {money(budget.remaining_gbp,true)}</p>
        {budget.request_reserve_gbp !== null && <p className="budget-threshold">Reserved before each paid request: {money(budget.request_reserve_gbp,true)}</p>}
        <p className={`budget-pause-note ${budget.paused ? "is-paused" : ""}`}>{budget.paused ? pauseReasons[budget.pause_reason || "threshold_reached"] : "Paid requests can run while each reservation fits within the safety threshold."}</p>
        <form onSubmit={event => void save(event,type)}>
          <label htmlFor={`budget-${type}`}>Monthly cap (GBP)</label>
          <div className="budget-input-row"><span aria-hidden="true">£</span><input id={`budget-${type}`} type="number" min="0" step="0.01" inputMode="decimal" required value={drafts[type] ?? ""} disabled={loading || saving !== null} onChange={event => setDrafts(current => ({ ...current,[type]: event.target.value }))} /><button type="submit" disabled={loading || saving !== null}>{saving === type ? "Saving…" : "Save budget"}</button></div>
        </form>
      </article>;
    })}</div>}
  </section>;
}
