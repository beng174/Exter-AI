import { useCallback, useEffect, useState } from "react";
import { Download, Film, RefreshCw } from "lucide-react";
import type { SmokeRun, SmokeStatus } from "../../shared/gemini-smoke";
import type { VideoProcessingMode } from "../../shared/video-analysis";
import { api } from "../lib/api";
import "./gemini-smoke-test.css";

const activeRun = (run: SmokeRun | null) => Boolean(run && ["queued", "preparing", "analysing"].includes(run.status));
const tokenCount = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString("en-GB");
const cost = (value: number | null | undefined) => value == null ? "Unavailable" : `£${value.toFixed(6)}`;
const modeLabel = (value?: string) => value === "agentic" ? "Agentic" : value === "static-high-fps-hook" ? "Static · 3 fps for short ads" : "Awaiting analysis";
const date = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" });

export function GeminiSmokeTest() {
  const [status, setStatus] = useState<SmokeStatus | null>(null);
  const [run, setRun] = useState<SmokeRun | null>(null);
  const [mode, setMode] = useState<VideoProcessingMode>("agentic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const value = await api<SmokeStatus>("/api/gemini-smoke/status");
    setStatus(value);
    setRun(value.run);
  }, []);

  useEffect(() => {
    let mounted = true;
    api<SmokeStatus>("/api/gemini-smoke/status").then(value => {
      if (mounted) { setStatus(value); setRun(value.run); }
    }).catch(cause => { if (mounted) setError(cause instanceof Error ? cause.message : "Smoke test status unavailable."); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!run || !activeRun(run)) return;
    let mounted = true;
    const timer = setInterval(() => {
      api<SmokeRun>(`/api/gemini-smoke/runs/${encodeURIComponent(run.id)}`).then(value => {
        if (mounted) setRun(value);
      }).catch(cause => { if (mounted) setError(cause instanceof Error ? cause.message : "Run progress unavailable. Refresh to reconnect."); });
    }, 3000);
    return () => { mounted = false; clearInterval(timer); };
  }, [run?.id, run?.status]);

  async function submit(path: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    try { setRun(await api<SmokeRun>(path, body)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The request could not be started."); }
    finally { setBusy(false); }
  }

  const running = activeRun(run);
  const stored = run?.items.filter(item => ["stored", "analysing", "complete"].includes(item.status)).length || 0;
  const completed = run?.items.filter(item => item.status === "complete").length || 0;
  const failed = run?.items.filter(item => ["failed", "interrupted"].includes(item.status)).length || 0;
  const canRun = Boolean(status?.hosted && status.configured && !status.configurationErrors.length && !busy && !running);
  const progress = run?.kind === "prepare" ? stored : completed + failed;

  return <section className="gemini-smoke" aria-labelledby="gemini-smoke-heading">
    <div className="gemini-smoke-heading">
      <div>
        <span className="gemini-smoke-eyebrow"><Film size={14} /> PHASE 1 · LIVE VALIDATION</span>
        <h2 id="gemini-smoke-heading">Gemini smoke test</h2>
      </div>
      <button type="button" className="gemini-smoke-refresh" disabled={busy} onClick={() => {
        setError(""); void refresh().catch(cause => setError(cause instanceof Error ? cause.message : "Status unavailable."));
      }}><RefreshCw size={13} /> Refresh</button>
    </div>
    <p className="gemini-smoke-intro">Analyse 25 real Valentte videos on Render. Videos are downloaded and retained on the hosted disk before inference. The API key stays in Render’s environment.</p>
    {!status && !error && <p role="status">Checking hosted test configuration…</p>}
    {status && <>
      <dl className="gemini-smoke-facts">
        <div><dt>Execution</dt><dd>{status.hosted ? "Render" : "Render required"}</dd></div>
        <div><dt>Configured model</dt><dd>{status.model}</dd></div>
        <div><dt>Valentte candidates</dt><dd>{status.candidateCount}</dd></div>
        <div><dt>Stored videos</dt><dd>{status.storedCount == null ? "Checked during preparation" : status.storedCount}</dd></div>
      </dl>
      {status.configurationErrors.length > 0 && <div className="gemini-smoke-notice" role="status">
        <strong>Before running the live test</strong>
        <ul>{status.configurationErrors.map(message => <li key={message}>{message}</li>)}</ul>
      </div>}
      <div className="gemini-smoke-controls">
        <label htmlFor="gemini-smoke-mode">Processing mode
          <select id="gemini-smoke-mode" value={mode} disabled={busy || running} onChange={event => setMode(event.target.value as VideoProcessingMode)}>
            <option value="agentic">Agentic</option>
            <option value="static-high-fps-hook">Static · 3 fps for short ads</option>
          </select>
        </label>
        <button type="button" disabled={!status.hosted || busy || running} onClick={() => void submit("/api/gemini-smoke/prepare")}>Prepare Valentte videos</button>
        <button type="button" className="gemini-smoke-primary" disabled={!canRun} onClick={() => void submit("/api/gemini-smoke/runs", { processingMode: mode })}>Run Gemini smoke test</button>
      </div>
      <p className="gemini-smoke-note">Preparation downloads media without Gemini inference. Static mode processes ads up to 60 seconds at 3 fps throughout; longer ads use a higher frame rate for the opening hook. A live run makes paid requests and pauses when the next reservation would exceed the inference budget’s 90% threshold. Missing token usage stays unavailable; cost figures are estimates.</p>
    </>}
    {error && <p className="gemini-smoke-error" role="alert">{error}</p>}
    {run && <div className="gemini-smoke-run">
      <div className="gemini-smoke-run-heading">
        <div>
          <h3>{run.kind === "prepare" ? "Video preparation" : "Live test"} <span className={`gemini-smoke-badge gemini-smoke-${run.status}`}>{run.status}</span></h3>
          <p>Started {date(run.createdAt)} · {modeLabel(run.requestedMode)}</p>
        </div>
        <a className="gemini-smoke-download" href={`/api/gemini-smoke/runs/${encodeURIComponent(run.id)}/report`} download="gemini-live-report.md"><Download size={14} /> Download report</a>
      </div>
      <div className="gemini-smoke-progress" role="status">
        <span>{run.kind === "prepare" ? `${stored} of 25 videos stored` : `${completed} of 25 ads analysed · ${failed} failed or interrupted`}</span>
        <progress aria-label={run.kind === "prepare" ? "Videos prepared" : "Smoke test progress"} max={25} value={Math.min(progress, 25)} />
      </div>
      {run.message && <p className="gemini-smoke-notice" role="status">{run.message}</p>}
      {["paused", "interrupted"].includes(run.status) && <div className="gemini-smoke-resume">
        <p>Resume continues pending items. An interrupted paid item is retained for review and will not be replayed.</p>
        <button type="button" disabled={!status?.hosted || busy || (run.kind === "smoke" && !canRun)} onClick={() => void submit(`/api/gemini-smoke/runs/${encodeURIComponent(run.id)}/resume`)}>Resume pending items</button>
      </div>}
      <div className="gemini-smoke-table-wrap">
        <table className="gemini-smoke-table">
          <caption>Per-ad results for this {run.kind === "prepare" ? "preparation" : "live test"}</caption>
          <thead><tr><th scope="col">Ad ID</th><th scope="col">Status</th><th scope="col">Model / mode</th><th scope="col">Tokens</th><th scope="col">Estimated cost</th></tr></thead>
          <tbody>{run.items.map(item => <tr key={item.adId}>
            <th scope="row">{item.nativeId || item.adId}</th>
            <td><span>{item.status}</span>{item.error && <p className="gemini-smoke-item-error">{item.error}</p>}</td>
            <td>{item.model || "Awaiting analysis"}<span className="gemini-smoke-cell-note">{modeLabel(item.processingMode)}</span></td>
            <td><span className="gemini-smoke-token-line">Input: {tokenCount(item.usage?.inputTokens)}</span><span className="gemini-smoke-token-line">Output: {tokenCount(item.usage?.outputTokens)}</span><span className="gemini-smoke-token-line">Total: {tokenCount(item.usage?.totalTokens)}</span></td>
            <td>{cost(item.estimatedCostGbp)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="gemini-smoke-note">Acceptance target: at least 24 of 25 ads analysed, with cost accounting and stored raw responses. The report includes failures and up to five full successful outputs for review.</p>
    </div>}
  </section>;
}
