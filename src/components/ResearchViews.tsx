import { PublicMonitorPanel } from "./PublicMonitorPanel";
import { ConnectionPanel } from "./ConnectionPanel";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  Check,
  CheckCircle2,
  FileText,
  Globe,
  Link2,
  LoaderCircle,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { Brand, Creator, Dashboard, Report } from "../../shared/types";
import "./research.css";

const count = (value: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const percent = (value: number) => `${value.toFixed(2)}%`;
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}
const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rv-empty">
      <BarChart3 size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="rv-error">
      {error}
    </p>
  ) : null;
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="rv-dialog"
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="rv-dialog-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="rv-icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function CompetitorsView({ dashboard }: { dashboard: Dashboard }) {
  const competitors = dashboard.competitors;
  if (!competitors.length)
    return (
      <Empty
        title="Your competitive landscape starts here"
        text="Import ad data for your brand and competitors to compare their creative strategies."
      />
    );
  const maximum = Math.max(
    ...competitors.map((competitor) => competitor.ads),
    1,
  );
  return (
    <div className="rv-stack">
      <div className="rv-grid-two">
        <section className="rv-card">
          <div className="rv-section-head">
            <div>
              <h2>Share of the conversation</h2>
              <p>Ad volume across the selected dataset</p>
            </div>
            <BarChart3 size={19} />
          </div>
          <div className="rv-share-list">
            {competitors.map((competitor) => (
              <div className="rv-share-row" key={competitor.name}>
                <div className="rv-share-label">
                  <span
                    className="rv-brand-square"
                    style={{ background: competitor.color }}
                  >
                    {competitor.initials}
                  </span>
                  <strong>{competitor.name}</strong>
                  {competitor.owned && (
                    <span className="rv-pill">Your brand</span>
                  )}
                  <b>{competitor.share.toFixed(1)}%</b>
                </div>
                <div className="rv-progress">
                  <span
                    style={{
                      width: `${(competitor.ads / maximum) * 100}%`,
                      background: competitor.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rv-card rv-opportunity">
          <span className="rv-eyebrow">
            <Sparkles size={15} /> THE BIG PICTURE
          </span>
          <h2>
            Understand the context.
            <br />
            Find your opening.
          </h2>
          <p>
            Your tracked landscape includes{" "}
            <strong>{competitors.length} brands</strong> and{" "}
            <strong>{count(dashboard.metrics.ads)} ads</strong>. Compare
            creative angles and observable engagement before deciding what to
            test next.
          </p>
          <div className="rv-insight-note">
            <ShieldCheck size={18} />
            <p>
              Engagement is a directional signal. Competitor spend, sales and
              conversion rates are not available from public ad activity.
            </p>
          </div>
          <div className="rv-opportunity-bottom">
            <span>{dashboard.brand.category}</span>
            <span>
              {dashboard.mode === "demo"
                ? "Illustrative dataset"
                : "Imported dataset"}
            </span>
          </div>
        </section>
      </div>
      <section className="rv-card rv-table-card">
        <div className="rv-section-head">
          <div>
            <h2>The competitive landscape</h2>
            <p>Compare the brands shaping your category</p>
          </div>
          <span className="rv-muted">{competitors.length} brands tracked</span>
        </div>
        <div className="rv-table-scroll">
          <table className="rv-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Ads in dataset</th>
                <th>Engagement rate</th>
                <th>Ad share</th>
                <th>Leading creative angle</th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((competitor) => (
                <tr key={competitor.name}>
                  <td>
                    <span className="rv-inline">
                      <span
                        className="rv-brand-square"
                        style={{ background: competitor.color }}
                      >
                        {competitor.initials}
                      </span>
                      <strong>{competitor.name}</strong>
                      {competitor.owned && <span className="rv-pill">You</span>}
                    </span>
                  </td>
                  <td>{competitor.ads.toLocaleString()}</td>
                  <td>
                    <span className="rv-rate">
                      {percent(competitor.engagementRate)}
                    </span>
                  </td>
                  <td>{competitor.share.toFixed(1)}%</td>
                  <td>{competitor.topAngle || "Not enough data"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function AudiencesView({ dashboard }: { dashboard: Dashboard }) {
  const audienceGroups = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; count: number; engagements: number; impressions: number }
    >();
    for (const ad of dashboard.ads) {
      const group = groups.get(ad.audience) || {
        name: ad.audience,
        count: 0,
        engagements: 0,
        impressions: 0,
      };
      group.count++;
      group.engagements += ad.engagements;
      group.impressions += ad.impressions;
      groups.set(ad.audience, group);
    }
    return [...groups.values()]
      .sort((a, b) => b.engagements - a.engagements)
      .slice(0, 4);
  }, [dashboard.ads]);
  const themes = useMemo(() => {
    const grouped = new Map<string, number>();
    dashboard.reviews.forEach((review) =>
      grouped.set(review.theme, (grouped.get(review.theme) || 0) + 1),
    );
    return [...grouped].sort((a, b) => b[1] - a[1]);
  }, [dashboard.reviews]);
  const positive = dashboard.reviews.filter(
    (review) => review.sentiment === "positive",
  ).length;
  return (
    <div className="rv-stack">
      <div className="rv-grid-two">
        <section className="rv-card">
          <div className="rv-section-head">
            <div>
              <h2>Who the creative speaks to</h2>
              <p>Audience labels in the displayed ad selection</p>
            </div>
            <Users size={19} />
          </div>
          {audienceGroups.length ? (
            <div className="rv-audience-list">
              {audienceGroups.map((audience, i) => (
                <div className="rv-audience-row" key={audience.name}>
                  <span className="rv-audience-icon">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{audience.name}</h3>
                    <p>
                      {audience.count} ads · {count(audience.engagements)}{" "}
                      engagements
                    </p>
                  </div>
                  <strong>
                    {percent(
                      audience.impressions
                        ? (audience.engagements / audience.impressions) * 100
                        : 0,
                    )}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No audience signals yet"
              text="Import ads with audience labels to explore your creative positioning."
            />
          )}
          <p className="rv-footnote">
            These are creative audience labels, not verified demographic or
            targeting data.
          </p>
        </section>
        <section className="rv-card rv-voice-card">
          <span className="rv-eyebrow">
            <MessageSquare size={15} /> BRAND VOICE
          </span>
          <h2>
            Make it sound
            <br />
            like {dashboard.brand.name}.
          </h2>
          <p>
            A shared voice gives your creative and creator partnerships a
            consistent starting point.
          </p>
          <div className="rv-voice-tags">
            {dashboard.brand.voice.length ? (
              dashboard.brand.voice.map((voice) => (
                <span key={voice}>{voice}</span>
              ))
            ) : (
              <span>No voice profile imported</span>
            )}
          </div>
          <p className="rv-footnote">
            {dashboard.mode === "demo"
              ? "Illustrative voice profile from the sample workspace."
              : "Voice profile available only when supplied; no model-based inference is running."}
          </p>
        </section>
      </div>
      <section className="rv-card">
        <div className="rv-section-head">
          <div>
            <h2>What customers are saying</h2>
            <p>Review themes, in their own words</p>
          </div>
          <span className="rv-pill">{dashboard.reviews.length} reviews</span>
        </div>
        {dashboard.reviews.length ? (
          <>
            <div className="rv-review-summary">
              <div>
                <strong>
                  {Math.round((positive / dashboard.reviews.length) * 100)}%
                </strong>
                <span>positive in this dataset</span>
              </div>
              <div className="rv-theme-list">
                {themes.map(([theme, total]) => (
                  <span key={theme}>
                    {theme}
                    <b>{total}</b>
                  </span>
                ))}
              </div>
            </div>
            <div className="rv-review-grid">
              {dashboard.reviews.slice(0, 6).map((review) => (
                <article className="rv-review" key={review.id}>
                  <div className="rv-inline rv-review-top">
                    <span
                      className="rv-stars"
                      aria-label={`${review.rating} out of 5 stars`}
                    >
                      {"★".repeat(review.rating)}
                      {"☆".repeat(5 - review.rating)}
                    </span>
                    <span className={`rv-sentiment rv-${review.sentiment}`}>
                      {review.sentiment}
                    </span>
                  </div>
                  <blockquote>“{review.text}”</blockquote>
                  <div className="rv-review-meta">
                    <strong>{review.author}</strong>
                    <span>{review.source}</span>
                  </div>
                  <span className="rv-review-theme">{review.theme}</span>
                </article>
              ))}
            </div>
          </>
        ) : (
          <Empty
            title="Review research is not connected"
            text="This workspace does not contain customer reviews yet. Review ingestion is a future integration."
          />
        )}
      </section>
    </div>
  );
}

export function CreatorsView({
  dashboard,
  brandId,
}: {
  dashboard: Dashboard;
  brandId: string;
}) {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("All platforms");
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Creator | null>(null);
  useEffect(() => {
    let live = true;
    setShortlist([]);
    setError("");
    api<{ ids: string[] }>(
      `/api/shortlist?brandId=${encodeURIComponent(brandId)}`,
    )
      .then((result) => {
        if (live) setShortlist(result.ids);
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [brandId]);
  const creators = dashboard.creators.filter(
    (creator) =>
      `${creator.name} ${creator.handle} ${creator.audience}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (platform === "All platforms" ||
        creator.platforms.includes(platform as "Meta" | "TikTok" | "Google")),
  );
  async function toggle(creator: Creator) {
    setBusy(creator.id);
    setError("");
    try {
      const result = await api<{ ids: string[] }>(
        "/api/shortlist",
        post({ brandId, creatorId: creator.id }),
      );
      setShortlist(result.ids);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="rv-stack">
      <div className="rv-creator-intro">
        <div>
          <span className="rv-eyebrow">
            <Sparkles size={14} /> MADE FOR YOUR BRAND
          </span>
          <h2>The right voice. The right people.</h2>
          <p>
            Discover creators aligned with your category, audience and creative
            direction.
          </p>
        </div>
        <span className="rv-shortlist-count">
          <Bookmark size={16} /> {shortlist.length} shortlisted
        </span>
      </div>
      <div className="rv-toolbar">
        <label className="rv-search">
          <Search size={17} />
          <input
            aria-label="Search creators"
            placeholder="Search creators, handles or audiences..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="rv-select"
          aria-label="Creator platform"
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
        >
          {["All platforms", "Meta", "TikTok", "Google"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <ErrorNotice error={error} />
      {creators.length ? (
        <div className="rv-creators-grid">
          {creators.map((creator, index) => (
            <article className="rv-creator-card" key={creator.id}>
              <div
                className="rv-creator-cover"
                style={{ background: creator.color }}
              >
                <img
                  src={creator.image || `/images/creator-${index + 1}.jpg`}
                  alt={creator.name}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
                <span className="rv-match">
                  <Sparkles size={12} /> {creator.match}% match
                </span>
                <button
                  type="button"
                  className={`rv-bookmark ${shortlist.includes(creator.id) ? "rv-saved" : ""}`}
                  aria-label={`${shortlist.includes(creator.id) ? "Remove" : "Add"} ${creator.name} ${shortlist.includes(creator.id) ? "from" : "to"} shortlist`}
                  disabled={busy !== null}
                  onClick={() => toggle(creator)}
                >
                  {busy === creator.id ? (
                    <LoaderCircle className="rv-spin" size={17} />
                  ) : (
                    <Bookmark
                      size={17}
                      fill={
                        shortlist.includes(creator.id) ? "currentColor" : "none"
                      }
                    />
                  )}
                </button>
              </div>
              <div className="rv-creator-body">
                <div className="rv-creator-name">
                  <h3>{creator.name}</h3>
                  <CheckCircle2 size={15} />
                </div>
                <p className="rv-creator-handle">
                  {creator.handle} <span>·</span> {creator.location}
                </p>
                <div className="rv-creator-stats">
                  <div>
                    <strong>{count(creator.followers)}</strong>
                    <span>Followers</span>
                  </div>
                  <div>
                    <strong>{percent(creator.engagementRate)}</strong>
                    <span>Engagement</span>
                  </div>
                  <div>
                    <strong>{creator.platforms.join(" / ")}</strong>
                    <span>Platforms</span>
                  </div>
                </div>
                <div className="rv-creator-tags">
                  {creator.voice.slice(0, 3).map((voice) => (
                    <span key={voice}>{voice}</span>
                  ))}
                </div>
                <p className="rv-creator-reason">{creator.reason}</p>
                <button
                  className="rv-profile-btn"
                  type="button"
                  onClick={() => setSelected(creator)}
                >
                  View match details <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No matching creators"
          text={
            dashboard.creators.length
              ? "Try another search or platform."
              : "Creator recommendations need a supported brand profile. No creator discovery provider is connected."
          }
        />
      )}
      <p className="rv-footnote">
        {dashboard.mode === "demo"
          ? "Sample creator profiles and illustrative match scores. Images are for demonstration; no identity or partnership is verified."
          : "Recommendations are based on the available creator profiles, not live availability or verified conversion results."}
      </p>
      {selected && (
        <Dialog title="Creator match" onClose={() => setSelected(null)}>
          <div className="rv-dialog-content">
            <span className="rv-pill">{selected.match}% profile match</span>
            <h2>{selected.name}</h2>
            <p>
              {selected.handle} · {selected.location}
            </p>
            <h3>Why the fit</h3>
            <p>{selected.reason}</p>
            <h3>Audience</h3>
            <p>{selected.audience}</p>
            <h3>Creative direction</h3>
            <p>
              Explore a {selected.voice.join(", ").toLowerCase()} concept for{" "}
              {dashboard.brand.name}. Use your validated ad and customer
              insights to write the final brief.
            </p>
            <div className="rv-insight-note">
              <ShieldCheck size={18} />
              <p>
                This is a planning profile. Shortlisting does not contact a
                creator or establish an endorsement.
              </p>
            </div>
            <button
              className="rv-primary"
              disabled={busy !== null}
              onClick={() => toggle(selected)}
            >
              {shortlist.includes(selected.id) ? (
                <Check size={16} />
              ) : (
                <Plus size={16} />
              )}
              {shortlist.includes(selected.id)
                ? "Shortlisted — click to remove"
                : "Add to shortlist"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function ReportsView({
  brandId,
  brandName,
  mode,
}: {
  brandId: string;
  brandName: string;
  mode: string;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Report | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setReports([]);
    setError("");
    api<Report[]>(`/api/reports?brandId=${encodeURIComponent(brandId)}`)
      .then((result) => {
        if (live) setReports(result);
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [brandId]);
  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const report = await api<Report>("/api/reports", post({ brandId }));
      setReports((previous) => [report, ...previous]);
      setSelected(report);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }
  return (
    <div className="rv-stack">
      <section className="rv-report-hero">
        <div>
          <span className="rv-eyebrow">
            <FileText size={15} /> FROM SIGNALS TO STRATEGY
          </span>
          <h2>
            Your next move,
            <br />
            in one clear report.
          </h2>
          <p>
            Bring the competitive landscape, creative angles and audience
            signals for {brandName} into a shareable research snapshot. Reports
            cover the last 30 days across all platforms.
          </p>
          <button
            className="rv-primary"
            onClick={generate}
            disabled={generating || loading}
          >
            {generating ? (
              <LoaderCircle size={17} className="rv-spin" />
            ) : (
              <Sparkles size={17} />
            )}
            {generating ? "Preparing report..." : "Generate research report"}
          </button>
          <span className="rv-report-disclosure">
            {mode === "demo"
              ? "Generated from illustrative sample data"
              : "Generated from imported data"}{" "}
            · No external AI model connected
          </span>
        </div>
        <div className="rv-report-paper" aria-hidden="true">
          <span>
            EXTER<span className="rv-paper-dot">●</span>
          </span>
          <p>INTELLIGENCE REPORT</p>
          <h3>
            {brandName}
            <br />
            Competitive landscape
          </h3>
          <div className="rv-paper-chart">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="rv-paper-line" />
          <div className="rv-paper-line short" />
          <div className="rv-paper-line" />
          <span className="rv-paper-footer">
            A clearer picture. A better next move.
          </span>
        </div>
      </section>
      <ErrorNotice error={error} />
      <section className="rv-card">
        <div className="rv-section-head">
          <div>
            <h2>Your reports</h2>
            <p>Saved snapshots of your brand intelligence</p>
          </div>
          <span className="rv-pill">{reports.length} reports</span>
        </div>
        {loading ? (
          <p className="rv-muted">Loading reports...</p>
        ) : reports.length ? (
          <div className="rv-report-list">
            {reports.map((report) => (
              <article className="rv-report-row" key={report.id}>
                <span className="rv-file-icon">
                  <FileText size={22} />
                </span>
                <div>
                  <h3>{report.title}</h3>
                  <p>
                    {new Date(report.createdAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {report.mode === "demo" ? "Sample data" : "Imported data"}
                  </p>
                </div>
                <button
                  type="button"
                  className="rv-secondary"
                  onClick={() => setSelected(report)}
                >
                  Read report <ArrowRight size={15} />
                </button>
                <a
                  className="rv-icon-btn"
                  href={`/api/reports/${encodeURIComponent(report.id)}/download`}
                  aria-label={`Download ${report.title}`}
                  download
                >
                  <ArrowDownToLine size={18} />
                </a>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Your first insight report is one click away"
            text="Generate a report to save the current landscape and research findings."
          />
        )}
      </section>
      {selected && (
        <Dialog title="Research report" onClose={() => setSelected(null)}>
          <div className="rv-dialog-content">
            <a
              className="rv-secondary"
              href={`/api/reports/${encodeURIComponent(selected.id)}/download`}
              download
            >
              <ArrowDownToLine size={16} /> Download Markdown
            </a>
            <pre className="rv-report-content">{selected.content}</pre>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function SourcesView({
  brand,
  onImported,
}: {
  brand: Brand;
  onImported: () => void;
}) {
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setJson("");
    setError("");
    setSuccess("");
  }, [brand.id]);
  const template = [
    {
      brand: brand.name,
      platform: "Meta",
      title: "Your campaign creative",
      format: "Video",
      creativeFormats: ["UGC", "Reviews & testimonials"],
      analysis: {
        provenance: "provided",
        topic: "Your product",
        keyMessage: "Your verified product message",
        inferredAudience: ["Your intended audience"],
      },
      angle: "Product education",
      audience: "Skincare enthusiasts",
      impressions: 10000,
      engagements: 450,
      publishedAt: new Date().toISOString(),
      owned: true,
      spend: 100,
      conversions: 10,
      revenue: 350,
    },
  ];
  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(template, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "exter-ad-import-template.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function readFile(file?: File) {
    if (!file) return;
    setSuccess("");
    setError("");
    if (file.size > 8 * 1024 * 1024) {
      setError("Please choose a JSON file smaller than 8 MB.");
      return;
    }
    try {
      setJson(await file.text());
    } catch {
      setError("Could not read this file. Please try a JSON text export.");
    }
  }
  async function importAds() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(json);
      const ads = Array.isArray(parsed)
        ? parsed
        : (parsed as { ads?: unknown })?.ads;
      if (!Array.isArray(ads) || !ads.length)
        throw new Error(
          "The file must contain a non-empty JSON array of ad records, or an object with an ads array.",
        );
      const result = await api<{ imported: number }>(
        "/api/import",
        post({ brandId: brand.id, ads }),
      );
      setSuccess(
        `${result.imported.toLocaleString()} ads imported. Your workspace now analyses imported data separately from the sample dataset.`,
      );
      setJson("");
      onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rv-stack">
      <PublicMonitorPanel brandId={brand.id} onUpdated={onImported} />
      <ConnectionPanel brandId={brand.id} onSynced={onImported} mode="claude" />
      <details className="optional-client-connections">
        <summary>
          Phase 2 (optional): connect client accounts after winning the account
        </summary>
        <ConnectionPanel
          brandId={brand.id}
          onSynced={onImported}
          mode="accounts"
        />
      </details>
      <section className="rv-card">
        <div className="rv-section-head">
          <div>
            <h2>Bring your own ad data</h2>
            <p>
              Import authorised exports for {brand.name} and its competitors
            </p>
          </div>
          <button
            type="button"
            className="rv-secondary"
            onClick={downloadTemplate}
          >
            <ArrowDownToLine size={15} /> Download template
          </button>
        </div>
        <div className="rv-import-grid">
          <div>
            <div
              className="rv-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void readFile(event.dataTransfer.files[0]);
              }}
            >
              <Upload size={28} />
              <h3>Drop your JSON export here</h3>
              <p>Up to 10,000 records · 8 MB maximum</p>
              <button
                type="button"
                className="rv-secondary"
                onClick={() => fileInput.current?.click()}
              >
                Choose file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                aria-label="Choose ad data JSON file"
                hidden
                onChange={(event) => {
                  void readFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="rv-insight-note">
              <ShieldCheck size={18} />
              <p>
                Only import data you have permission to use. Conversion and
                revenue metrics are accepted for owned ads only; competitor
                results cannot be inferred.
              </p>
            </div>
          </div>
          <div className="rv-import-editor">
            <label htmlFor="ad-import-json">Or paste your JSON data</label>
            <textarea
              id="ad-import-json"
              spellCheck={false}
              value={json}
              onChange={(event) => setJson(event.target.value)}
              placeholder={
                '[\n  {\n    "brand": "' +
                brand.name +
                '",\n    "platform": "Meta",\n    "title": "Your ad",\n    ...\n  }\n]'
              }
            />
            <p className="rv-footnote">
              Required: brand, platform, title, angle, audience, impressions,
              engagements and publishedAt (ISO date). See the template for
              optional owned-account metrics.
            </p>
            <button
              type="button"
              className="rv-primary"
              onClick={importAds}
              disabled={!json.trim() || busy}
            >
              {busy ? (
                <LoaderCircle size={16} className="rv-spin" />
              ) : (
                <Upload size={16} />
              )}
              {busy ? "Validating import..." : "Import and analyse"}
            </button>
          </div>
        </div>
        <ErrorNotice error={error} />
        {success && (
          <p role="status" className="rv-success">
            <CheckCircle2 size={17} />
            {success}
          </p>
        )}
      </section>
    </div>
  );
}
