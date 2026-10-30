import { useId, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Eye,
  FileText,
  Focus,
  Info,
  Layers,
  Link2,
  ScanEye,
  Target,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import type { Ad } from "../../shared/types";
import {
  sampleAdAnalysis,
  type AdAnalysis,
} from "../../shared/ad-intelligence";
import { classifyCreativeFormats } from "../../shared/formats";
import { NativeVideoAnalysis } from "./NativeVideoAnalysis";
import "./ad-intelligence.css";

type EnrichedAd = Ad & {
  analysis?: AdAnalysis;
  observedAt?: string;
  metricDate?: string;
  activeDate?: string;
};
type Tab = "concepts" | "audience" | "attention" | "video";
const tabs: { id: Tab; label: string; icon: typeof Eye }[] = [
  { id: "concepts", label: "Observed concepts", icon: FileText },
  { id: "audience", label: "Inferred audience", icon: UsersRound },
  { id: "attention", label: "Attention map", icon: ScanEye },
  { id: "video", label: "Native video", icon: Video },
];

function dateLabel(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not provided";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}
function engagementLabel(ad: Ad) {
  if (ad.metricsAvailable === false) return "Not available";
  const basis = ad.engagementRateBasis || "impressions";
  const denominator =
    basis === "views"
      ? ad.views
      : basis === "followers"
        ? ad.followers
        : ad.impressions;
  if (!denominator) return "Unavailable";
  const rate = (ad.engagements / denominator) * 100;
  return `${rate.toFixed(rate > 0 && rate < 0.01 ? 4 : 2)}% (${basis})`;
}
function Datum({
  label,
  value,
  inferred = false,
}: {
  label: string;
  value?: string | string[];
  inferred?: boolean;
}) {
  const missing =
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && !value.length);
  return (
    <div className={`adi-datum ${missing ? "adi-missing" : ""}`}>
      <dt>
        {label}
        {inferred && <span>Inferred</span>}
      </dt>
      <dd>
        {missing ? (
          "Not analysed"
        ) : Array.isArray(value) ? (
          <div className="adi-tags">
            {value.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export function AdIntelligence({
  ad,
  onClose,
}: {
  ad: Ad;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("concepts");
  const id = useId().replace(/:/g, "");
  const enriched = ad as EnrichedAd;
  const analysis =
    enriched.analysis ||
    (String(ad.source) === "sample" ? sampleAdAnalysis(ad) : undefined);
  const sample = String(ad.source) === "sample";
  const provenance =
    analysis?.provenance === "sample"
      ? "Illustrative sample annotation"
      : analysis?.provenance === "model"
        ? "Model annotation · interpretation"
        : analysis
          ? "Provided annotation · unverified interpretation"
          : "Content interpretation not supplied";
  const formats = classifyCreativeFormats(ad);
  const sourceName = sample
    ? "Illustrative sample"
    : String(ad.source) === "live"
      ? "Connected source record"
      : ad.source==="public"?"Collected public source"
      : "Imported record";
  function switchTab(direction: number) {
    const index =
      (tabs.findIndex((item) => item.id === tab) + direction + tabs.length) %
      tabs.length;
    setTab(tabs[index].id);
    requestAnimationFrame(() =>
      document.getElementById(`${id}-${tabs[index].id}`)?.focus(),
    );
  }

  return (
    <div className="modal-backdrop adi-backdrop" onClick={onClose}>
      <section
        className="adi-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Creative analysis"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="adi-header">
          <div>
            <span className="adi-eyebrow">
              <Focus size={14} /> AD INTELLIGENCE
            </span>
            <h2>{ad.title}</h2>
            <p>
              {ad.brand} <span>·</span> {ad.platform} <span>·</span>{" "}
              {ad.category}
            </p>
          </div>
          <button
            type="button"
            className="adi-close"
            onClick={onClose}
            aria-label="Close creative"
          >
            <X size={20} />
          </button>
        </header>
        <div className="adi-layout">
          <aside className="adi-context">
            <div className="adi-visual">
              {ad.image ? (
                <img src={ad.image} alt={ad.title} />
              ) : (
                <div className="adi-no-image">
                  <Layers size={34} />
                  <p>No creative image supplied</p>
                </div>
              )}
              <span className="adi-visual-label">
                {sample ? "Sample creative" : "Creative record"}
              </span>
            </div>
            <section className="adi-general">
              <h3>General information</h3>
              <dl>
                <div>
                  <dt>Platform</dt>
                  <dd>{ad.platform}</dd>
                </div>
                <div>
                  <dt>Media format</dt>
                  <dd>{ad.format || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Creative format</dt>
                  <dd>{formats.join(" · ")}</dd>
                </div>
                <div>
                  <dt>Engagement rate</dt>
                  <dd>{engagementLabel(ad)}</dd>
                </div>
                <div>
                  <dt>Observed engagements</dt>
                  <dd>
                    {ad.metricsAvailable === false
                      ? "Not available"
                      : ad.engagements.toLocaleString("en-GB")}
                  </dd>
                </div>
                <div>
                  <dt>Observed impressions</dt>
                  <dd>
                    {ad.metricsAvailable === false
                      ? "Not available"
                      : ad.impressions.toLocaleString("en-GB")}
                  </dd>
                </div>
                <div>
                  <dt>Active / published date</dt>
                  <dd>
                    {ad.dateBasis === "observed"
                      ? "Active date not available"
                      : ad.dateBasis === "report"
                        ? "Report date only: " + dateLabel(ad.publishedAt)
                        : ad.dateBasis === "delivery"
                          ? "Ad delivery started: " + dateLabel(ad.deliveryStartAt || ad.publishedAt)
                        : dateLabel(enriched.activeDate || ad.publishedAt)}
                  </dd>
                </div>
                {enriched.metricDate && (
                  <div>
                    <dt>Performance date</dt>
                    <dd>{dateLabel(enriched.metricDate)}</dd>
                  </div>
                )}
                {enriched.observedAt && (
                  <div>
                    <dt>Source observation</dt>
                    <dd>{dateLabel(enriched.observedAt)}</dd>
                  </div>
                )}
                <div>
                  <dt>Status</dt>
                  <dd className={ad.active ? "adi-active" : ""}>
                    <i />
                    {ad.deliveryStatus === "unknown"
                      ? "Not available"
                      : ad.active
                        ? "Active (reported)"
                        : "Inactive (reported)"}
                  </dd>
                </div>
                <div>
                  <dt>Data source</dt>
                  <dd>{sourceName}</dd>
                </div>
                <div>
                  <dt>Owned conversions</dt>
                  <dd>
                    {ad.owned && ad.conversions !== null
                      ? ad.conversions.toLocaleString("en-GB")
                      : "Not available"}
                  </dd>
                </div>
              </dl>
              {ad.sourceUrl ? (
                <a
                  href={ad.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="adi-source-link"
                >
                  Go to source <ArrowUpRight size={14} />
                </a>
              ) : (
                <p className="adi-source-unavailable">
                  <Link2 size={13} />
                  {sample
                    ? "No source URL — illustrative sample"
                    : "Source URL not supplied"}
                </p>
              )}
              <p className="adi-small-note">
                Engagement rate = engagements ÷ impressions. Attention signals
                do not establish sales or competitor conversions.
              </p>
            </section>
          </aside>
          <div className="adi-research">
            <div className="adi-provenance">
              <span
                className={sample ? "adi-sample-dot" : "adi-provided-dot"}
              />
              <strong>{provenance}</strong>
              {analysis?.model && (
                <small
                  style={{
                    display: "block",
                    overflowWrap: "anywhere",
                    maxWidth: "100%",
                  }}
                >
                  Engine: {analysis.model}
                </small>
              )}
              {analysis?.analyzedAt && (
                <span>
                  <Clock3 size={11} />
                  {dateLabel(analysis.analyzedAt)}
                </span>
              )}
            </div>
            <div
              className="adi-tabs"
              role="tablist"
              aria-label="Ad intelligence sections"
            >
              {tabs.map(({ id: key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  id={`${id}-${key}`}
                  role="tab"
                  aria-selected={tab === key}
                  aria-controls={`${id}-${key}-panel`}
                  tabIndex={tab === key ? 0 : -1}
                  className={`${tab === key ? "adi-tab-active" : ""}${key === "video" ? " nva-tab" : ""}`}
                  onClick={() => setTab(key)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "ArrowRight" ||
                      event.key === "ArrowLeft"
                    ) {
                      event.preventDefault();
                      switchTab(event.key === "ArrowRight" ? 1 : -1);
                    }
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            <div
              className="adi-panel"
              id={`${id}-${tab}-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-${tab}`}
              tabIndex={0}
            >
              {tab === "concepts" && (
                <>
                  <div className="adi-panel-intro">
                    <span className="adi-section-icon">
                      <FileText size={19} />
                    </span>
                    <div>
                      <h3>What is this content about?</h3>
                      <p>
                        Structured observations and interpretations of the
                        creative.
                      </p>
                    </div>
                  </div>
                  <dl className="adi-concepts">
                    <Datum label="Platforms" value={ad.platform} />
                    <Datum label="Topic" value={analysis?.topic} />
                    <Datum label="Theme" value={analysis?.theme} />
                    <Datum label="Content type" value={analysis?.contentType} />
                    <Datum
                      label="Content orientation"
                      value={analysis?.contentOrientation}
                    />
                    <Datum
                      label="Market segment"
                      value={analysis?.marketSegment}
                    />
                    <Datum
                      label="Brand mentions"
                      value={analysis?.brandMentions}
                    />
                    <Datum
                      label="Observed tension"
                      value={analysis?.observedTension}
                    />
                    <Datum
                      label="Observed relevance"
                      value={analysis?.observedRelevance}
                    />
                    <Datum label="Key message" value={analysis?.keyMessage} />
                  </dl>
                  {ad.copy && (
                    <section className="adi-copy">
                      <h4>Recorded ad copy</h4>
                      <p>{ad.copy}</p>
                    </section>
                  )}
                </>
              )}
              {tab === "audience" && (
                <>
                  <div className="adi-panel-intro">
                    <span className="adi-section-icon adi-lilac">
                      <UsersRound size={19} />
                    </span>
                    <div>
                      <h3>Who was being spoken to?</h3>
                      <p>
                        Intended-audience interpretations, not verified viewer
                        demographics.
                      </p>
                    </div>
                  </div>
                  <dl className="adi-concepts">
                    <Datum
                      label="Inferred audience"
                      value={analysis?.inferredAudience}
                      inferred
                    />
                    <Datum label="Gender" value={analysis?.gender} inferred />
                    <Datum
                      label="Profession"
                      value={analysis?.profession}
                      inferred
                    />
                    <Datum
                      label="Marital status"
                      value={analysis?.maritalStatus}
                      inferred
                    />
                    <Datum
                      label="Age group"
                      value={analysis?.ageGroup}
                      inferred
                    />
                    <Datum
                      label="Familial relationship"
                      value={analysis?.familialRelationship}
                      inferred
                    />
                  </dl>
                  <div className="adi-explainer">
                    <Info size={16} />
                    <p>
                      A creative can suggest an intended audience. It does not
                      establish who actually saw or converted from the ad.
                      Missing demographic information stays unknown; it is not
                      inferred from the people pictured.
                    </p>
                  </div>
                </>
              )}
              {tab === "attention" && (
                <>
                  <div className="adi-panel-intro">
                    <span className="adi-section-icon">
                      <Eye size={19} />
                    </span>
                    <div>
                      <h3>Attention map</h3>
                      <p>
                        Keep visual-attention evidence separate from engagement
                        metrics.
                      </p>
                    </div>
                  </div>
                  {analysis?.attentionMap?.imageUrl ? (
                    <figure className="adi-attention-figure">
                      <img
                        src={analysis.attentionMap.imageUrl}
                        alt="Provided attention visualisation"
                        referrerPolicy="no-referrer"
                      />
                      <figcaption>
                        Provided attention visualisation — not validated gaze or
                        eye-tracking data.
                      </figcaption>
                    </figure>
                  ) : (
                    <div className="adi-attention-empty">
                      <ScanEye size={38} />
                      <h4>Attention map not supplied</h4>
                      <p>
                        No visual-attention model or eye-tracking analysis has
                        produced a map for this record. An attractive overlay
                        would not establish measured attention.
                      </p>
                    </div>
                  )}
                  {analysis?.attentionMap?.description && (
                    <section className="adi-copy">
                      <h4>Provided description</h4>
                      <p>{analysis.attentionMap.description}</p>
                    </section>
                  )}
                  {analysis?.attentionMap?.method && (
                    <p className="adi-method">
                      <strong>Reported method:</strong>{" "}
                      {analysis.attentionMap.method}
                    </p>
                  )}
                  <div className="adi-explainer">
                    <Activity size={16} />
                    <p>
                      Likes, comments, views and engagement rate do not reveal
                      where a viewer looked. A supplied map needs a stated
                      method and validation before being treated as evidence.
                    </p>
                  </div>
                </>
              )}
              {tab === "video" && (
                <NativeVideoAnalysis analysis={ad.videoAnalysis} mediaId={ad.videoMediaId} sample={sample} />
              )}
            </div>
            <footer className="adi-footer">
              <Target size={14} />
              <span>
                {analysis || ad.videoAnalysis
                  ? "Interpretations support research; verify important claims against the source."
                  : "No saved content interpretation is available for this record."}
              </span>
              {analysis?.confidence !== undefined && (
                <span>
                  Reported confidence: {Math.round(analysis.confidence * 100)}%
                  · uncalibrated
                </span>
              )}
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}
