import { useCallback, useEffect, useState } from "react";
import { Download, Film, RefreshCw } from "lucide-react";
import type { SmokeItem, SmokeRun, SmokeStatus } from "../../shared/gemini-smoke";
import type { MediaResolution } from "../../shared/inference-config";
import type { VideoProcessingMode } from "../../shared/video-analysis";
import { api } from "../lib/api";
import "./gemini-smoke-test.css";

const activeRun = (run: SmokeRun | null) => Boolean(run && ["queued", "preparing", "analysing"].includes(run.status));
const tokenCount = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString("en-GB");
const cost = (value: number | null | undefined) => value == null ? "Unavailable" : `£${value.toFixed(6)}`;
const modeLabel = (value?: string) => value === "agentic" ? "Agentic (preview)" : value === "static-high-fps-hook" ? "Static · 3 fps for short ads" : value === "image" ? "Image input" : value === "carousel" ? "Carousel image inputs" : "Awaiting analysis";
const mediaLabel = (value?: string) => value === "video" ? "Video" : value === "image" ? "Image" : value === "carousel" ? "Carousel" : "Unresolved format";
const formatCounts = (value?: { video: number; image: number; carousel: number }) => value ? `${value.video} videos · ${value.image} images · ${value.carousel} carousels` : "Format breakdown unavailable";
const failureLabel = (value?: string) => value === "expired_video_link" ? "Expired or removed video link" : value === "expired_media_link" ? "Expired or removed media/source link" : value === "blocked_restricted" ? "Blocked or restricted" : value === "other" ? "Other source issue" : null;
const resolutionLabel = (value?: MediaResolution) => value === "low" ? "Low" : value === "default" ? "Default" : "Not recorded";
interface RetainedCreative {
  adId: string;
  brandId: string;
  nativeId: string;
  mediaKind: string;
  imageCount?: number;
  durationSeconds?: number;
}
interface RetainedCreatives {
  creatives: RetainedCreative[];
  defaultVideoMode: VideoProcessingMode;
}
const creativeKey = (creative: RetainedCreative) => JSON.stringify([creative.brandId, creative.adId]);
const costTotal = (items: SmokeItem[], key: "reservedCostGbp" | "tokenCostGbp" | "billedCostGbp" | "estimatedCostGbp") =>
  items.length && items.every(item => typeof item[key] === "number" && Number.isFinite(item[key]))
    ? items.reduce((sum, item) => sum + (item[key] as number), 0) : null;
function GeminiDiagnostic({ item }: { item: SmokeItem }) {
  const diagnostic = item.geminiDiagnostic;
  if (!diagnostic) return null;
  const details = diagnostic.details == null ? null : typeof diagnostic.details === "string" ? diagnostic.details : JSON.stringify(diagnostic.details, null, 2);
  return <div className="gemini-smoke-provider-diagnostic" aria-label="Sanitised Gemini error">
    <strong>Gemini error · {diagnostic.stage}{diagnostic.httpStatus ? ` · HTTP ${diagnostic.httpStatus}` : ""}</strong>
    {diagnostic.providerStatus && <span className="gemini-smoke-cell-note">{diagnostic.providerStatus}</span>}
    <pre>{diagnostic.message}</pre>
    {details && <details><summary>Provider error details</summary><pre>{details}</pre></details>}
    {diagnostic.requestId && <span className="gemini-smoke-cell-note">Request ID: {diagnostic.requestId}</span>}
    {diagnostic.retryAfterMs != null && <span className="gemini-smoke-cell-note">Retry after: {Math.ceil(diagnostic.retryAfterMs / 1000)} seconds</span>}
  </div>;
}
function InferenceProvenance({ item }: { item: SmokeItem }) {
  const generation = item.generation;
  const sampling = item.sampling;
  const pricingModels = [...new Set(item.accounting?.flatMap(accounting => accounting.pricing?.model ? [accounting.pricing.model] : []) ?? [])];
  const dimensions = (width?: number | null, height?: number | null) => width && height ? `${width} × ${height} px` : "Not recorded";
  return <details className="gemini-smoke-inference-provenance">
    <summary>Model and media details</summary>
    <dl>
      <div><dt>Requested model</dt><dd>{item.requestedModel || "Not recorded"}</dd></div>
      <div><dt>Served model</dt><dd>{item.servedModel || "Not recorded in this result"}</dd></div>
      <div><dt>Pricing model</dt><dd>{pricingModels.length ? pricingModels.join(" · ") : "Unavailable"}</dd></div>
      <div><dt>Temperature</dt><dd>{generation ? generation.temperature : "Not recorded"}</dd></div>
      <div><dt>Seed</dt><dd>{generation ? `${generation.seedRequested} · ${generation.seedApplied ? "applied to request" : "not applied; unsupported by this mode"}` : "Not recorded"}</dd></div>
      <div><dt>Requested resolution</dt><dd>{generation ? `${resolutionLabel(generation.mediaResolutionRequested)} · ${generation.mediaResolutionApplied ? "explicit provider setting" : "provider default"}` : "Not recorded"}</dd></div>
      <div><dt>Provider-reported resolution</dt><dd>{generation?.providerMediaResolution || "Not reported"}</dd></div>
      {item.mediaKind === "video" && <>
        <div><dt>Stored dimensions</dt><dd>{dimensions(item.normalization?.originalWidth, item.normalization?.originalHeight)}</dd></div>
        <div><dt>Upload dimensions</dt><dd>{dimensions(item.normalization?.uploadWidth, item.normalization?.uploadHeight)}</dd></div>
        <div><dt>Requested FPS</dt><dd>{sampling?.requestedFps.length ? sampling.requestedFps.join(" / ") : "No fixed FPS reported"}</dd></div>
        <div><dt>Scheduled frame estimate</dt><dd>{sampling?.estimatedFrames == null ? "Unavailable" : `${sampling.estimatedFrames} · duration × FPS; not observed frames`}</dd></div>
        <div><dt>Actual frames sampled</dt><dd>{sampling?.actualFrames == null ? "Not reported by provider" : sampling.actualFrames}</dd></div>
      </>}
    </dl>
  </details>;
}
const date = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" });

export function GeminiSmokeTest() {
  const [status, setStatus] = useState<SmokeStatus | null>(null);
  const [run, setRun] = useState<SmokeRun | null>(null);
  // Agentic is a preview: neither an old run nor browser storage can opt in.
  const [mode, setMode] = useState<VideoProcessingMode>("static-high-fps-hook");
  const [mediaResolution, setMediaResolution] = useState<MediaResolution>("default");
  const [creatives, setCreatives] = useState<RetainedCreative[]>([]);
  const [selectedCreativeKey, setSelectedCreativeKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const receiveCreatives = useCallback((value: RetainedCreatives) => {
    setCreatives(value.creatives);
    setSelectedCreativeKey(current => value.creatives.some(creative => creativeKey(creative) === current) ? current : value.creatives[0] ? creativeKey(value.creatives[0]) : "");
  }, []);

  const refresh = useCallback(async () => {
    const [value, retained] = await Promise.all([
      api<SmokeStatus>("/api/gemini-smoke/status"),
      api<RetainedCreatives>("/api/gemini-smoke/creatives"),
    ]);
    setStatus(value);
    setRun(value.run);
    receiveCreatives(retained);
  }, [receiveCreatives]);

  useEffect(() => {
    let mounted = true;
    api<SmokeStatus>("/api/gemini-smoke/status").then(value => {
      if (mounted) { setStatus(value); setRun(value.run); }
    }).catch(cause => { if (mounted) setError(cause instanceof Error ? cause.message : "Smoke test status unavailable."); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    api<RetainedCreatives>("/api/gemini-smoke/creatives").then(value => {
      if (mounted) receiveCreatives(value);
    }).catch(cause => { if (mounted) setError(cause instanceof Error ? cause.message : "Retained creative list unavailable. Refresh to reconnect."); });
    return () => { mounted = false; };
  }, [receiveCreatives]);

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
    Promise.all([api<SmokeStatus>("/api/gemini-smoke/status"), api<RetainedCreatives>("/api/gemini-smoke/creatives")]).then(([value, retained]) => {
      if (mounted) { setStatus(value); receiveCreatives(retained); }
    }).catch(cause => { if (mounted) setError(cause instanceof Error ? cause.message : "Stored input status unavailable."); });
    return () => { mounted = false; };
  }, [run?.id, run?.status, receiveCreatives]);

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
  // A one-ad diagnostic has its own target; it never changes batch preparation.
  const targetSampleSize = status?.targetSampleSize ?? run?.targetSampleSize ?? 25;
  const availableSampleSize = status?.storedCount ?? 0;
  const actualSampleSize = run && run.kind !== "prepare" ? run.sampleSize ?? run.items.length : 0;
  const mixedSample = run?.kind === "smoke" && Boolean(run.sampleCounts && run.sampleCounts.image + run.sampleCounts.carousel > 0);
  const nextSampleIncludesImages = Boolean(status?.storedCounts && status.storedCounts.video < availableSampleSize && status.storedCounts.image + status.storedCounts.carousel > 0);
  const checkedCandidates = run?.items.filter(item => item.status !== "pending").length || 0;
  const unsupportedSettings = mode === "agentic" && mediaResolution === "low";
  const canRun = Boolean(status?.hosted && status.configured && !status.configurationErrors.length && availableSampleSize >= minimumSampleSize && !busy && !running && !unsupportedSettings);
  const selectedCreative = creatives.find(creative => creativeKey(creative) === selectedCreativeKey);
  const canTestOne = Boolean(status?.hosted && status.configured && !status.configurationErrors.length && selectedCreative && !busy && !running && !unsupportedSettings);
  const canResume = Boolean(status?.hosted && status.configured && !status.configurationErrors.length && !busy && !running);
  const resumeModeMismatch = Boolean(run && run.kind !== "prepare" && run.requestedMode !== mode);
  const resumeResolutionMismatch = Boolean(run && run.kind !== "prepare" && (run.mediaResolution ?? "default") !== mediaResolution);
  const progress = run?.kind === "prepare" ? stored : completed + failed + unavailable;
  const progressMaximum = run?.kind === "prepare" ? targetSampleSize : Math.max(1, actualSampleSize);

  return <section id="gemini-smoke-test" className="gemini-smoke" aria-labelledby="gemini-smoke-heading">
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
    <p><a href="#brand-demo-preparation">Go to website evidence & client demo controls</a></p>
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
            <option value="static-high-fps-hook">Static · 3 fps for short ads</option>
            <option value="agentic" disabled={mediaResolution === "low"}>Agentic (preview · explicit opt-in)</option>
          </select>
        </label>
        <label htmlFor="gemini-smoke-resolution">Media resolution
          <select id="gemini-smoke-resolution" aria-label="Media resolution" value={mediaResolution} disabled={busy || running} onChange={event => setMediaResolution(event.target.value as MediaResolution)}>
            <option value="default">Default · provider setting</option>
            <option value="low" disabled={mode === "agentic"}>Low · compare on labelled set</option>
          </select>
        </label>
        <button type="button" disabled={!status.hosted || busy || running} onClick={() => void submit("/api/gemini-smoke/prepare", { processingMode: mode })}>Prepare Valentte creatives</button>
        <button type="button" disabled={!status.hosted || busy || running} onClick={() => void submit("/api/gemini-smoke/prepare", { processingMode: mode, refreshFailed: true })}>Refresh failed media links</button>
        <button type="button" className="gemini-smoke-primary" disabled={!canRun} onClick={() => void submit("/api/gemini-smoke/runs", { processingMode: mode, mediaResolution })}>Run Gemini smoke test{availableSampleSize >= minimumSampleSize ? ` · ${availableSampleSize} stored inputs` : ""}</button>
      </div>
      <p className="gemini-smoke-note">Mode and media resolution apply to the next test, including the one-ad test. Saved runs keep their submitted settings. Low resolution requires Static; the Agentic preview does not support this override. Default leaves resolution to the provider. Compare both settings on the same human-labelled set.</p>
      <div className="gemini-smoke-single-test" aria-labelledby="gemini-smoke-single-heading">
        <div><h3 id="gemini-smoke-single-heading">Test one retained creative</h3><p>Check one input and read the full sanitised Gemini response before starting a batch.</p></div>
        <div className="gemini-smoke-single-controls">
          <label htmlFor="gemini-smoke-creative">Retained creative
            <select id="gemini-smoke-creative" aria-label="Retained creative" value={selectedCreativeKey} disabled={busy || running || !creatives.length} onChange={event => setSelectedCreativeKey(event.target.value)}>
              {!creatives.length && <option value="">No verified retained creatives</option>}
              {creatives.map(creative => <option key={creativeKey(creative)} value={creativeKey(creative)}>{creative.nativeId || creative.adId} · {mediaLabel(creative.mediaKind)}{creative.durationSeconds != null ? ` · ${creative.durationSeconds.toFixed(1)} s` : ""}{creative.imageCount ? ` · ${creative.imageCount} ${creative.imageCount === 1 ? "image" : "images"}` : ""}</option>)}
            </select>
          </label>
          <button type="button" className="gemini-smoke-primary" disabled={!canTestOne} onClick={() => selectedCreative && void submit("/api/gemini-smoke/test-one", { adId: selectedCreative.adId, brandId: selectedCreative.brandId, processingMode: mode, mediaResolution })}>Test one ad</button>
        </div>
        <p className="gemini-smoke-note">One verified input is enough for this diagnostic. It uses the selected mode, {resolutionLabel(mediaResolution)} media resolution and the same inference budget. Static is the default; Agentic preview runs only when explicitly chosen.</p>
      </div>
      {availableSampleSize < minimumSampleSize && <p className="gemini-smoke-note" role="status">At least {minimumSampleSize} verified stored inputs are required to run the test. {status.storedCount == null ? "Refresh to check the retained media." : `${status.storedCount} currently available.`}</p>}
      {availableSampleSize >= minimumSampleSize && (availableSampleSize !== 25 || nextSampleIncludesImages) && <p className="gemini-smoke-sample-note" role="status">The next test will use {availableSampleSize} retained inputs. {nextSampleIncludesImages ? "Images and carousels are valid inputs; this mixed-format sample is exploratory and does not establish the original 25-video Phase 1 acceptance target." : "This sample size is exploratory and does not establish the original 25-video Phase 1 acceptance target."}</p>}
      <p className="gemini-smoke-note">Preparation checks all {status.candidateCount} candidates until {targetSampleSize} verified inputs are retained, recording each failed download. Refresh failed media links reopens the ad snapshots for fresh media URLs and keeps existing stored inputs. Preparation makes no Gemini inference requests. The selected video mode applies only to videos; image and carousel inputs use their own modes. Static mode processes video ads up to 60 seconds at 3 fps throughout; longer ads use a higher frame rate for the opening hook. A live run reserves budget before dispatch and pauses when the next reservation would exceed the 90% threshold. Reserved budget and token estimates are shown separately from confirmed billing. Missing usage and billed charges remain unavailable.</p>
    </>}
    {error && <p className="gemini-smoke-error" role="alert">{error}</p>}
    {run && <div className="gemini-smoke-run">
      <div className="gemini-smoke-run-heading">
        <div>
          <h3>{run.kind === "prepare" ? "Creative preparation" : run.kind === "diagnostic" ? "Single-ad test" : "Live test"} <span className={`gemini-smoke-badge gemini-smoke-${run.status}`}>{run.status}</span></h3>
          <p>Started {date(run.createdAt)} · {run.kind === "prepare" ? "Selected video mode for test" : "Requested video mode"}: {modeLabel(run.requestedMode)}</p>
          {run.kind !== "prepare" && <p>Requested media resolution: {resolutionLabel(run.mediaResolution)}{run.mediaResolution === undefined ? " · historical run" : ""}</p>}
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
      {run.kind !== "prepare" && <>
        <dl className="gemini-smoke-costs" aria-label="Run cost summary">
          <div><dt>Reserved budget</dt><dd>{cost(costTotal(run.items, "reservedCostGbp"))}</dd></div>
          <div><dt>Token-based estimate</dt><dd>{cost(costTotal(run.items, "tokenCostGbp"))}</dd></div>
          <div><dt>Actually billed</dt><dd>{cost(costTotal(run.items, "billedCostGbp"))}</dd></div>
        </dl>
        <p className="gemini-smoke-note">A reservation holds budget; it is not a Google bill. Token costs are estimates. Confirmed billed cost is unavailable until provider billing data is reconciled.</p>
      </>}
      {["paused", "interrupted"].includes(run.status) && <div className="gemini-smoke-resume">
        <div><p>Resume continues pending items. An interrupted paid item is retained for review and will not be replayed.</p>
          {resumeModeMismatch && <p className="gemini-smoke-resume-mode" role="status">This run recorded {modeLabel(run.requestedMode)}; the dropdown currently selects {modeLabel(mode)}. Select the recorded mode explicitly to resume, or start a new one-ad test using the current selection.</p>}
          {resumeResolutionMismatch && <p className="gemini-smoke-resume-mode" role="status">This run recorded {resolutionLabel(run.mediaResolution ?? "default")} media resolution. Select that resolution to resume, or start a new test to compare the selected setting.</p>}
        </div>
        <button type="button" disabled={!status?.hosted || busy || (run.kind !== "prepare" && (!canResume || resumeModeMismatch || resumeResolutionMismatch || unsupportedSettings))} onClick={() => void submit(`/api/gemini-smoke/runs/${encodeURIComponent(run.id)}/resume`, { processingMode: mode, mediaResolution })}>Resume pending items</button>
      </div>}
      <div className="gemini-smoke-table-wrap">
        <table className="gemini-smoke-table">
          <caption>Per-ad results for this {run.kind === "prepare" ? "preparation" : run.kind === "diagnostic" ? "single-ad test" : "live test"}</caption>
          <thead><tr><th scope="col">Ad ID</th><th scope="col">Format</th><th scope="col">Status</th><th scope="col">Source / failure details</th><th scope="col">Model / mode</th><th scope="col">Tokens</th><th scope="col">Reserved budget</th><th scope="col">Token estimate</th><th scope="col">Actually billed</th></tr></thead>
          <tbody>{run.items.map(item => <tr key={item.adId}>
            <th scope="row">{item.nativeId || item.adId}</th>
            <td>{mediaLabel(item.mediaKind)}
              {(item.mediaKind === "image" || item.mediaKind === "carousel") && item.mediaId && (item.imageCount ?? 0) > 0 && <div className="gemini-smoke-media-links">{Array.from({ length: item.mediaKind === "carousel" ? Math.min(10, item.imageCount!) : 1 }, (_, index) => <a key={index} href={`/api/gemini-smoke/image-media/${encodeURIComponent(item.mediaId!)}/${index}?${new URLSearchParams({ brandId: item.brandId, adId: item.adId })}`} target="_blank" rel="noreferrer">{item.mediaKind === "carousel" ? `View slide ${index + 1}` : "View image"}</a>)}</div>}
            </td>
            <td><span>{item.status === "unavailable" ? "Source unavailable" : item.status}</span></td>
            <td>{item.error ? <>{failureLabel(item.failureCategory) && <strong className="gemini-smoke-failure-category">{failureLabel(item.failureCategory)}</strong>}<p className="gemini-smoke-item-error">{item.error}</p><span className="gemini-smoke-cell-note">{item.errorCode}{item.sourceHttpStatus ? ` · HTTP ${item.sourceHttpStatus}` : ""}</span></> : <span className="gemini-smoke-cell-note">{item.status === "pending" ? "Not attempted" : "No current source issue"}</span>}
              {run.kind !== "prepare" && <GeminiDiagnostic item={item} />}
              {Boolean(item.preparationAttempts?.length) && <details className="gemini-smoke-attempts"><summary>Preparation attempts ({item.preparationAttempts!.length})</summary><ul>{item.preparationAttempts!.map((attempt, index) => <li key={index}><strong>{attempt.source === "refreshed_snapshot" ? "Fresh snapshot" : attempt.source === "snapshot" ? "Snapshot" : "Stored media"}</strong>{attempt.httpStatus ? ` · HTTP ${attempt.httpStatus}` : ""}{attempt.error ? <><span>{attempt.error}</span><code>{attempt.errorCode}</code></> : <span>Creative input retained.</span>}</li>)}</ul></details>}
            </td>
            <td>{run.kind === "prepare" ? "No inference" : item.servedModel || item.model || "Awaiting analysis"}<span className="gemini-smoke-cell-note">{run.kind === "prepare" ? `Selected video mode: ${modeLabel(run.requestedMode)}` : modeLabel(item.processingMode)}</span>{run.kind !== "prepare" && <InferenceProvenance item={item} />}</td>
            <td>{run.kind === "prepare" ? "No inference" : <><span className="gemini-smoke-token-line">Input: {tokenCount(item.usage?.inputTokens)}</span><span className="gemini-smoke-token-line">Output: {tokenCount(item.usage?.outputTokens)}</span><span className="gemini-smoke-token-line">Total: {tokenCount(item.usage?.totalTokens)}</span></>}</td>
            <td>{run.kind === "prepare" ? "No inference" : cost(item.reservedCostGbp)}</td>
            <td>{run.kind === "prepare" ? "No inference" : cost(item.tokenCostGbp)}</td>
            <td>{run.kind === "prepare" ? "No inference" : cost(item.billedCostGbp)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="gemini-smoke-note">The original Phase 1 video acceptance target requires at least 24 successful video analyses from a 25-video sample, with cost accounting and stored raw responses. Mixed-format runs remain exploratory. The report states the actual sample size and format counts, includes source issues and up to five full successful outputs for review.</p>
    </div>}
  </section>;
}
