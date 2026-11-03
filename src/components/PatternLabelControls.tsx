import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { PatternLabelsSnapshot } from "../../shared/pattern-labelling";
import { api } from "../lib/api";
import "./pattern-label-controls.css";

/** Saved analysis text only. No model request is made until the operator starts it. */
export function PatternLabelControls({ brandId }: { brandId: string }) {
  const [snapshot, setSnapshot] = useState<PatternLabelsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const status = snapshot?.lastRun?.status;
  const running = status === "queued" || status === "running";
  useEffect(() => {
    let current = true;
    setSnapshot(null); setError("");
    void api<PatternLabelsSnapshot>(`/api/pattern-labels?${new URLSearchParams({ brandId })}`)
      .then(value => { if (current) setSnapshot(value); })
      .catch(() => { if (current) setError("Pattern label status could not be loaded. Refresh to try again."); });
    return () => { current = false; };
  }, [brandId, refresh]);
  useEffect(() => {
    if (!running) return;
    let current = true;
    const timer = window.setInterval(() => {
      void api<PatternLabelsSnapshot>(`/api/pattern-labels?${new URLSearchParams({ brandId })}`)
        .then(value => { if (current) setSnapshot(value); }).catch(() => {});
    }, 2500);
    return () => { current = false; window.clearInterval(timer); };
  }, [brandId, running]);
  async function start() {
    setBusy(true); setError("");
    try { setSnapshot(await api<PatternLabelsSnapshot>("/api/pattern-labels/start", { brandId })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Pattern labels could not be updated. Existing analyses were preserved."); }
    finally { setBusy(false); }
  }
  return <section id="pattern-labels" className="pattern-label-controls" aria-labelledby="pattern-labels-heading">
    <header><div><span className="plc-badge">Beta</span><h2 id="pattern-labels-heading">Pattern labels</h2></div><button type="button" className="button secondary" disabled={busy || running} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} />Refresh counts</button></header>
    <p>Classify saved creative analysis text into the shared hook, angle, offer and format categories. Uses the inference budget.</p>
    {error && <p className="plc-error" role="alert">{error}</p>}
    {snapshot ? <><dl className="plc-counts"><div><dt>Saved analyses</dt><dd>{snapshot.sourceAnalysedCount}</dd></div><div><dt>Legacy updates saved</dt><dd>{snapshot.labelledCount}</dd></div><div><dt>Updates remaining</dt><dd>{snapshot.remainingCount}</dd></div></dl>
      <div className="plc-actions"><button type="button" className="button secondary" disabled={busy || running || !snapshot.hosted || !snapshot.configured || snapshot.remainingCount === 0} onClick={() => void start()}>{busy || running ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}{running ? "Updating pattern labels…" : "Update pattern labels"}</button>{status && <span className="plc-status" role="status">{status.replaceAll("-", " ")}</span>}</div>
      {!snapshot.hosted && <p className="plc-note">Run this action in the hosted app.</p>}
      {snapshot.hosted && !snapshot.configured && <p className="plc-note">Check Gemini configuration and the inference budget before starting.</p>}
      <details><summary>About these labels</summary><div><p>The original video and image analyses stay unchanged. Only the saved text is sent for category classification, without uploading media again.</p><p>Counts describe the collected sample. Category labels are modelled interpretations, and unknown labels remain outside each category denominator.</p>{snapshot.limitations.map((value, index) => <p key={index}>{value}</p>)}</div></details>
    </> : !error && <p className="plc-note" role="status">Loading saved analysis counts…</p>}
  </section>;
}
