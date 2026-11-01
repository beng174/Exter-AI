import { useCallback, useEffect, useState } from "react";
import { Download, Film, RefreshCw } from "lucide-react";
import type { SmokeRun, SmokeStatus } from "../../shared/gemini-smoke";
import type { VideoProcessingMode } from "../../shared/video-analysis";
import { api } from "../lib/api";
import "./gemini-smoke-test.css";

const activeRun = (run: SmokeRun | null) => Boolean(run && ["queued", "preparing", "analysing"].includes(run.status));
const tokenCount = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString("en-GB");
const cost = (value: number | null | undefined) => value == null ? "Unavailable" : `£${value.toFixed(6)}`;
const modeLabel = (value?: string) => value === "agentic" ? "Agentic" : value === "static-high-fps-hook" ? "Static · 3 fps for short ads" : value === "image" ? "Image input" : value === "carousel" ? "Carousel image inputs" : "Awaiting analysis";
const mediaLabel = (value?: string) => value === "video" ? "Video" : value === "image" ? "Image" : value === "carousel" ? "Carousel" : "Unresolved format";
const formatCounts = (value?: { video: number; image: number; carousel: number }) => value ? `${value.video} videos · ${value.image} images · ${value.carousel} carousels` : "Format breakdown unavailable";
const failureLabel = (value?: string) => value === "expired_video_link" ? "Expired or removed video link" : value === "expired_media_link" ? "Expired or removed media/source link" : value === "blocked_restricted" ? "Blocked or restricted" : value === "other" ? "Other source issue" : null;
const MODE_STORAGE_KEY = "exter-gemini-video-mode";
function savedVideoMode(): VideoProcessingMode | null {
  try {
    const value = localStorage.getItem(MODE_STORAGE_KEY);
    return value === "agentic" || value === "static-high-fps-hook" ? value : null;
  } catch { return null; }
}
const date = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" });

export function GeminiSmokeTest() {
  const [status, setStatus] = useState<SmokeStatus | null>(null);
  const [run, setRun] = useState<SmokeRun | null>(null);
  const [initialSavedMode] = useState(savedVideoMode);
  const [mode, setMode] = useState<VideoProcessingMode>(initialSavedMode ?? "agentic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* Browser storage may be unavailable. */ }
  }, [mode]);

  const refresh = useCallback(async () => {
    const value = await api<SmokeStatus>("/api/gemini-smoke/status");
    setStatus(value);
    setRun(value.run);
  }, []);

  useEffect(() => {
    let mounted = true;
    api<SmokeStatus>("/api/gemini-smoke/status").then(value => {
      if (mounted) { setStatus(value); setRun(value.run); if (value.run && !initialSavedMode) setMode(value.run.requestedMode); }
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

  useEffect(() => {
    if (!run || activeRun(run)) return;
    let mounted = true;
    // Preparation changes the verified stored count. Refresh readiness after it
    // finishes, while keeping this run's report and selected mode on screen.
    api<SmokeStatus>("/api/gemini-smoke/status").then(value => {
      if (mounted) setStatus(value);
    }).catch(cause => { if (mounted) setError(cause instanceof Error ? cause.message : "Stored input status unavailable."); });
    return () => { mounted = false; };
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
  const unavailable = run?.items.filter(item => item.status === "unavailable").length || 0;
  const minimumSampleSize = status?.minSampleSize ?? 10;
  const targetSampleSize = run?.targetSampleSize ?? status?.targetSampleSize ?? 25;
  const availableSampleSize = status?.storedCount ?? 0;
  const actualSampleSize = run?.kind === "smoke" ? run.sampleSize ?? run.items.length : 0;
  const mixedSample = run?.kind === "smoke" && Boolean(run.sampleCounts && run.sampleCounts.image + run.sampleCounts.carousel > 0);
  const nextSampleIncludesImages = Boolean(status?.storedCounts && status.storedCounts.video < availableSampleSize && status.storedCounts.image + status.storedCounts.carousel > 0);
  const checkedCandidates = run?.items.filter(item => item.status !== "pending").length || 0;
  const canRun = Boolean(status?.hosted && status.configured && !status.configurationErrors.length && availableSampleSize >= minimumSampleSize && !busy && !running);
  const canResume = Boolean(status?.hosted && status.configured && !status.configurationErrors.length && !busy && !running);
  const progress = run?.kind === "prepare" ? stored : completed + failed + unavailable;
  const progressMaximum = run?.kind === "prepare" ? targetSampleSize : Math.max(1, actualSampleSize);

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
    <p className="gemini-smoke-intro">Prepare up to {targetSampleSize} real Valentte creatives on Render, then run the smoke test on {minimumSampleSize} or more retained inputs. Videos, images and carousels are valid inputs. The API key stays in Render’s environment.</p>
    {!status && !error && <p role="status">Checking hosted test configuration…</p>}
    {status && <>
      <dl className="gemini-smoke-facts">
        <div><dt>Execution</dt><dd>{status.hosted ? "Render" : "Render required"}</dd></div>
        <div><dt>Configured model</dt><dd>{status.model}</dd></div>
        <div><dt>Valentte candidates</dt><dd>{status.candidateCount}</dd></div>
        <div><dt>Stored inputs</dt><dd>{status.storedCount == null ? "Checked during preparation" : status.storedCount}<span className="gemini-smoke-cell-note">{formatCounts(status.storedCounts)}</span></dd></div>
      </dl>
      {status.configurationErrors.length > 0 && <div className="gemini-smoke-notice" role="status">
        <strong>Before running the live test</strong>
        <ul>{status.configurationErrors.map(message => <li key={message}>{message}</li>)}</ul>
      </div>}
      <div className="gemini-smoke-controls">
        <label htmlFor="gemini-smoke-mode">Video processing mode
          <select id="gemini-smoke-mode" aria-label="Processing mode" value={mode} disabled={busy || running} onChange={event => setMode(event.target.value as VideoProcessingMode)}>
            <option value="agentic">Agentic</option>
            <option value="static-high-fps-hook">Static · 3 fps for short ads</option>
          </select>
        </label>
        <button type="button" disabled={!status.hosted || busy || running} onClick={() => void submit("/api/gemini-smoke/prepare", { processingMode: mode })}>Prepare Valentte creatives</button>
        <button type="button" disabled={!status.hosted || busy || running} onClick={() => void submit("/api/gemini-smoke/prepare", { processingMode: mode, refreshFailed: true })}>Refresh failed media links</button>
        <button type="button" className="gemini-smoke-primary" disabled={!canRun} onClick={() => void submit("/api/gemini-smoke/runs", { processingMode: mode })}>Run Gemini smoke test{availableSampleSize >= minimumSampleSize ? ` · ${availableSampleSize} stored inputs` : ""}</button>
      </div>
      {availableSampleSize < minimumSampleSize && <p className="gemini-smoke-note" role="status">At least {minimumSampleSize} verified stored inputs are required to run the test. {status.storedCount == null ? "Refresh to check the retained media." : `${status.storedCount} currently available.`}</p>}
      {availableSampleSize >= minimumSampleSize && (availableSampleSize !== 25 || nextSampleIncludesImages) && <p className="gemini-smoke-sample-note" role="status">The next test will use {availableSampleSize} retained inputs. {nextSampleIncludesImages ? "Images and carousels are valid inputs; this mixed-format sample is exploratory and does not establish the original 25-video Phase 1 acceptance target." : "This sample size is exploratory and does not establish the original 25-video Phase 1 acceptance target."}</p>}
      <p className="gemini-smoke-note">Preparation checks all {status.candidateCount} candidates until {targetSampleSize} verified inputs are retained, recording each failed download. Refresh failed media links reopens the ad snapshots for fresh media URLs and keeps existing stored inputs. Preparation makes no Gemini inference requests. The selected video mode applies only to videos; image and carousel inputs use their own modes. Static mode processes video ads up to 60 seconds at 3 fps throughout; longer ads use a higher frame rate for the opening hook. A live run makes paid requests and pauses when the next reservation would exceed the inference budget’s 90% threshold. Missing token usage stays unavailable; cost figures are estimates.</p>
    </>}
    {error && <p className="gemini-smoke-error" role="alert">{error}</p>}
    {run && <div className="gemini-smoke-run">
      <div className="gemini-smoke-run-heading">
        <div>
          <h3>{run.kind === "prepare" ? "Creative preparation" : "Live test"} <span className={`gemini-smoke-badge gemini-smoke-${run.status}`}>{run.status}</span></h3>
          <p>Started {date(run.createdAt)} · {run.kind === "prepare" ? "Selected video mode for test" : "Requested video mode"}: {modeLabel(run.requestedMode)}</p>
        </div>
        <a className="gemini-smoke-download" href={`/api/gemini-smoke/runs/${encodeURIComponent(run.id)}/report`} download="gemini-live-report.md"><Download size={14} /> Download report</a>
      </div>
      <div className="gemini-smoke-progress" role="status">
        <span>{run.kind === "prepare" ? `${stored} of ${targetSampleSize} target inputs stored · ${checkedCandidates} of ${run.items.length} candidates checked` : `${completed} of ${actualSampleSize} ads analysed · ${failed} failed or interrupted${unavailable ? ` · ${unavailable} source unavailable` : ""}`}</span>
        <progress aria-label={run.kind === "prepare" ? "Creative inputs prepared" : "Smoke test progress"} max={progressMaximum} value={Math.min(progress, progressMaximum)} />
      </div>
      <p className="gemini-smoke-format-summary">{run.kind === "prepare" ? "Retained inputs" : "Actual sample by format"}: {formatCounts(run.sampleCounts)}</p>
      {run.kind === "smoke" && (actualSampleSize !== 25 || mixedSample) && <p className="gemini-smoke-sample-note" role="status">Actual sample: {actualSampleSize} creative inputs. {mixedSample ? "This exploratory mixed-format run does not establish the original 25-video Phase 1 acceptance target." : "This exploratory run uses a different sample size and does not establish the original 25-video Phase 1 acceptance target."}</p>}
      {run.message && <p className="gemini-smoke-notice" role="status">{run.message}</p>}
      {["paused", "interrupted"].includes(run.status) && <div className="gemini-smoke-resume">
        <p>Resume continues pending items. An interrupted paid item is retained for review and will not be replayed.</p>
        <button type="button" disabled={!status?.hosted || busy || (run.kind === "smoke" && !canResume)} onClick={() => void submit(`/api/gemini-smoke/runs/${encodeURIComponent(run.id)}/resume`)}>Resume pending items</button>
      </div>}
      <div className="gemini-smoke-table-wrap">
        <table className="gemini-smoke-table">
          <caption>Per-ad results for this {run.kind === "prepare" ? "preparation" : "live test"}</caption>
          <thead><tr><th scope="col">Ad ID</th><th scope="col">Format</th><th scope="col">Status</th><th scope="col">Source / failure details</th><th scope="col">Model / mode</th><th scope="col">Tokens</th><th scope="col">Estimated cost</th></tr></thead>
          <tbody>{run.items.map(item => <tr key={item.adId}>
            <th scope="row">{item.nativeId || item.adId}</th>
            <td>{mediaLabel(item.mediaKind)}
              {(item.mediaKind === "image" || item.mediaKind === "carousel") && item.mediaId && (item.imageCount ?? 0) > 0 && <div className="gemini-smoke-media-links">{Array.from({ length: item.mediaKind === "carousel" ? Math.min(10, item.imageCount!) : 1 }, (_, index) => <a key={index} href={`/api/gemini-smoke/image-media/${encodeURIComponent(item.mediaId!)}/${index}?${new URLSearchParams({ brandId: item.brandId, adId: item.adId })}`} target="_blank" rel="noreferrer">{item.mediaKind === "carousel" ? `View slide ${index + 1}` : "View image"}</a>)}</div>}
            </td>
            <td><span>{item.status === "unavailable" ? "Source unavailable" : item.status}</span></td>
            <td>{item.error ? <>{failureLabel(item.failureCategory) && <strong className="gemini-smoke-failure-category">{failureLabel(item.failureCategory)}</strong>}<p className="gemini-smoke-item-error">{item.error}</p><span className="gemini-smoke-cell-note">{item.errorCode}{item.sourceHttpStatus ? ` · HTTP ${item.sourceHttpStatus}` : ""}</span></> : <span className="gemini-smoke-cell-note">{item.status === "pending" ? "Not attempted" : "No current source issue"}</span>}
              {Boolean(item.preparationAttempts?.length) && <details className="gemini-smoke-attempts"><summary>Preparation attempts ({item.preparationAttempts!.length})</summary><ul>{item.preparationAttempts!.map((attempt, index) => <li key={index}><strong>{attempt.source === "refreshed_snapshot" ? "Fresh snapshot" : attempt.source === "snapshot" ? "Snapshot" : "Stored media"}</strong>{attempt.httpStatus ? ` · HTTP ${attempt.httpStatus}` : ""}{attempt.error ? <><span>{attempt.error}</span><code>{attempt.errorCode}</code></> : <span>Creative input retained.</span>}</li>)}</ul></details>}
            </td>
            <td>{run.kind === "prepare" ? "No inference" : item.model || "Awaiting analysis"}<span className="gemini-smoke-cell-note">{run.kind === "prepare" ? `Selected video mode: ${modeLabel(run.requestedMode)}` : modeLabel(item.processingMode)}</span></td>
            <td>{run.kind === "prepare" ? "No inference" : <><span className="gemini-smoke-token-line">Input: {tokenCount(item.usage?.inputTokens)}</span><span className="gemini-smoke-token-line">Output: {tokenCount(item.usage?.outputTokens)}</span><span className="gemini-smoke-token-line">Total: {tokenCount(item.usage?.totalTokens)}</span></>}</td>
            <td>{run.kind === "prepare" ? "No inference" : cost(item.estimatedCostGbp)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="gemini-smoke-note">The original Phase 1 video acceptance target requires at least 24 successful video analyses from a 25-video sample, with cost accounting and stored raw responses. Mixed-format runs remain exploratory. The report states the actual sample size and format counts, includes source issues and up to five full successful outputs for review.</p>
    </div>}
  </section>;
}
