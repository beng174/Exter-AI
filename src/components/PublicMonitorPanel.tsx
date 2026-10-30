import { useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  Globe2,
  LoaderCircle,
  RefreshCw,
  ScanText,
} from "lucide-react";
import { api } from "../lib/api";
interface Job {
  id: string;
  status: string;
  processed: number;
  total: number;
  error: string | null;
}
export function PublicMonitorPanel({
  brandId,
  onUpdated,
}: {
  brandId: string;
  onUpdated: () => void;
}) {
  const [urls, setUrls] = useState(""),
    [advertiser, setAdvertiser] = useState(""),
    [contentSource, setContentSource] = useState("organic"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [job, setJob] = useState<Job | null>(null),
    [engine, setEngine] = useState<{
      runtime: string;
      claudeRequired: boolean;
    } | null>(null);
  const completed = useRef("");
  useEffect(() => {
    let alive = true;
    setJob(null);
    setMessage("");
    setError("");
    api<{ runtime: string; claudeRequired: boolean }>("/api/brain/status")
      .then((value) => {
        if (alive) setEngine(value);
      })
      .catch(() => {});
    async function poll() {
      try {
        const jobs = await api<Job[]>(
          `/api/brain/jobs?brandId=${encodeURIComponent(brandId)}`,
        );
        if (!alive) return;
        const latest = jobs.at(-1) || null;
        setJob(latest);
        if (latest?.status === "complete" && completed.current !== latest.id) {
          completed.current = latest.id;
          onUpdated();
        }
      } catch {}
    }
    void poll();
    const timer = setInterval(() => void poll(), 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [brandId]);
  async function collect() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{
        collected: number;
        message: string;
        analysisJob?: Job;
      }>("/api/public/collect", {
        brandId,
        urls: urls.split(/\s+/).filter(Boolean),
        advertiser,
        contentSource,
      });
      setMessage(
        `${result.collected} public items collected. ${result.message}`,
      );
      setUrls("");
      if (result.analysisJob) setJob(result.analysisJob);
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function analyse() {
    setError("");
    try {
      setJob(await api<Job>("/api/brain/analyse", { brandId }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="public-monitor">
      <div className="public-monitor-head">
        <span>
          <Globe2 size={21} />
        </span>
        <div>
          <span className="eyebrow">
            PHASE 1 · PUBLIC CATEGORY INTELLIGENCE
          </span>
          <h2>Research the market before you win the account.</h2>
          <p>
            Collect public competitor posts and paid creative. Client account
            access is not required for this research.
          </p>
        </div>
        <span className="cx-tag">Public-first</span>
      </div>
      <div className="public-monitor-body">
        <div>
          <h3>Collect public source URLs</h3>
          <p>
            Direct collection currently supports public TikTok video, YouTube
            video and X post URLs through their embed endpoints. This collects
            source metadata. Meta ad-library records can be collected through
            the full application's separate browser workflow; the Valentte
            sample is in Brand research. Broad discovery and continuous
            multi-platform monitoring remain unfinished.
          </p>
          <label>
            Competitor / publisher <span>(optional)</span>
            <input
              value={advertiser}
              onChange={(e) => setAdvertiser(e.target.value)}
              placeholder="e.g. A competitor brand"
              maxLength={80}
            />
          </label>
          <label>
            Content source
            <select
              value={contentSource}
              onChange={(e) => setContentSource(e.target.value)}
            >
              <option value="organic">Organic posts</option>
              <option value="paid">
                Paid ads — supplied source classification
              </option>
            </select>
          </label>
          <label>
            Public post URLs
            <textarea
              aria-label="Public post URLs"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="Paste full public post URLs, one per line"
              rows={4}
            />
          </label>
          <button
            className="button primary"
            onClick={collect}
            disabled={!urls.trim() || busy}
          >
            {busy ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Globe2 size={14} />
            )}
            Collect public content
          </button>
        </div>
        <div className="public-brain">
          <span className="eyebrow">
            <BrainCircuit size={15} /> EXTER’S INTERNAL BRAIN
          </span>
          <h3>Analysis happens in the platform.</h3>
          <p>
            Exter runs local text and image models, stores the inferred concepts
            and format annotations, and calculates comparisons itself. Claude is
            an optional consumer of those results.
          </p>
          <ul>
            <li>Local semantic concepts and still-image interpretation.</li>
            <li>
              Source text extraction, inferred interests and labelled
              uncertainty.
            </li>
            <li>
              Platform-specific format and measured-performance computation.
            </li>
            <li>No fabricated demographics, conversions or attention maps.</li>
          </ul>
          <p className="cx-footnote">
            {engine?.runtime ||
              "Full application required for local model execution"}
            . Coverage is supplied text and still images/thumbnails; full
            video/audio analysis is not implemented.
          </p>
          <button
            className="button secondary"
            onClick={analyse}
            disabled={["queued", "running"].includes(job?.status || "")}
          >
            <ScanText size={14} />
            Analyse stored content
          </button>
          {job && (
            <div
              className={`brain-job ${job.status === "error" ? "error-text" : ""}`}
              role="status"
            >
              {["queued", "running"].includes(job.status) ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              Analysis {job.status}: {job.processed}/{job.total} items
              {job.error && <p>{job.error}</p>}
            </div>
          )}
        </div>
      </div>
      {message && (
        <p className="rv-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="rv-error" role="alert">
          {error}
        </p>
      )}
      <p className="public-monitor-note">
        Public metrics and active dates are stored only when a source supplies
        them. Embed metadata alone cannot establish engagement performance. A
        collection timestamp is not an active date. Optional client-account
        reporting is below, for post-win benchmarking.
      </p>
    </section>
  );
}
