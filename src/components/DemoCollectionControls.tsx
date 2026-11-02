import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import type { DemoCollectionSnapshot, DemoCompetitorId } from "../../shared/demo-collection";
import { api } from "../lib/api";
import "./demo-collection-controls.css";

const active = new Set(["queued", "collecting", "preparing", "analysing"]);
const statusLabel = (status: string) => ({ "not-started": "Not collected", queued: "Queued", collecting: "Collecting ads", preparing: "Preparing media", analysing: "Analysing creatives", complete: "Complete", paused: "Paused", interrupted: "Interrupted", failed: "Needs attention" }[status] || status.replaceAll("-", " "));

/** Operator controls only. Read-only reports never mount or invoke these actions. */
export function DemoCollectionControls({ brandId }: { brandId: string }) {
  const [snapshot, setSnapshot] = useState<DemoCollectionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const currentBrand = useRef(brandId);
  currentBrand.current = brandId;

  async function load(showLoading = false) {
    const requested = brandId;
    if (showLoading) setLoading(true);
    try {
      const result = await api<DemoCollectionSnapshot>(`/api/demo-collection?${new URLSearchParams({ brandId })}`);
      if (currentBrand.current === requested) setSnapshot(result);
    } finally { if (showLoading && currentBrand.current === requested) setLoading(false); }
  }
  useEffect(() => {
    let current = true;
    setSnapshot(null); setLoading(true); setError(""); setMessage(""); setStarting(null);
    void api<DemoCollectionSnapshot>(`/api/demo-collection?${new URLSearchParams({ brandId })}`).then(result => {
      if (current) setSnapshot(result);
    }).catch(() => { if (current) setError("Competitor collection status is unavailable. Refresh to try again."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [brandId]);
  const running = snapshot?.competitors.some(competitor => active.has(competitor.status)) ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { void load().catch(() => {}); }, 3000);
    return () => window.clearInterval(timer);
  }, [brandId, running]);

  async function start(competitorId?: DemoCompetitorId) {
    if (starting) return;
    const requested = brandId;
    setStarting(competitorId || "all"); setError(""); setMessage("");
    try {
      await api("/api/demo-collection/start", { brandId, ...(competitorId ? { competitorId } : {}) });
      await load();
      if (currentBrand.current === requested) setMessage("Competitor collection started. Counts update as ads, media and analyses are saved.");
    } catch (failure) {
      if (currentBrand.current === requested) setError(failure instanceof Error ? failure.message : "Collection could not start. Existing results were preserved.");
      await load().catch(() => {});
    } finally { if (currentBrand.current === requested) setStarting(null); }
  }

  return <section id="demo-collection" className="demo-collection-controls" aria-labelledby="demo-collection-heading">
    <header className="dcc-heading"><div><span className="dcc-beta">Beta</span><h2 id="demo-collection-heading">Competitor collection</h2><p>Collect public ads and analyse up to 25 creatives for each comparison brand.</p></div><button type="button" className="dcc-button" disabled={loading} onClick={() => { setError(""); void load(true).catch(() => setError("Collection status could not be refreshed.")); }}><RefreshCw size={14} />Refresh counts</button></header>
    {error && <p className="dcc-error" role="alert">{error}</p>}
    {message && <p className="dcc-message" role="status">{message}</p>}
    {loading && !snapshot ? <p className="dcc-loading" role="status"><LoaderCircle size={16} className="spin" />Loading source counts…</p> : snapshot && <>
      <div className="dcc-actions"><button type="button" className="dcc-button" disabled={Boolean(starting) || running || !snapshot.hosted} onClick={() => void start()}>{starting === "all" || running ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}{running ? "Collection in progress" : "Collect competitor ads"}</button><a className="dcc-button" href={`/api/demo-readiness?${new URLSearchParams({ brandId, download: "1" })}`} download><Download size={14} />Download page counts</a></div>
      {!snapshot.hosted && <p className="dcc-note">Collection is available in the hosted app.</p>}
      <div className="dcc-table-wrap"><table><thead><tr><th scope="col">Brand</th><th scope="col">Ads collected</th><th scope="col">Stored creatives</th><th scope="col">Analysed</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{snapshot.competitors.map(competitor => <tr key={competitor.id}><th scope="row">{competitor.name}</th><td>{competitor.collectedCount}</td><td>{competitor.storedCount}</td><td>{competitor.analysedCount}</td><td><span className="dcc-status">{statusLabel(competitor.status)}</span></td><td><button type="button" className="dcc-text-button" disabled={Boolean(starting) || active.has(competitor.status) || !snapshot.hosted} onClick={() => void start(competitor.id)}>{starting === competitor.id ? "Starting…" : competitor.lastRun ? "Continue unfinished work" : "Collect ads"}</button></td></tr>)}</tbody></table></div>
      <details className="dcc-about"><summary>About this collection</summary><div><p>Public browser collection is bounded. Source restrictions may leave fewer than 25 usable creatives per brand. No access challenge is bypassed.</p><p>Gemini analysis uses the inference budget. Public ad availability does not establish spend, conversions, audience fit or continuous delivery.</p><p>Completed outputs are retained. Restarting continues safe unfinished work and does not silently replay uncertain paid requests.</p>{snapshot.competitors.filter(competitor => competitor.lastRun?.message || competitor.identityNote).map(competitor => <p key={competitor.id}><strong>{competitor.name}:</strong> {competitor.lastRun?.message || competitor.identityNote}</p>)}</div></details>
    </>}
  </section>;
}
