import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Clock3,
  Eye,
  Info,
  Layers3,
  LoaderCircle,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import type { Ad } from "../../shared/types";
import type {
  FormatAnalysis,
  FormatMetric,
  FormatPerformance,
  FormatPlatformAnalysis,
} from "../../shared/format-types";
import { api, number, percent } from "../lib/api";
import { PlatformIcon } from "./Creative";
import "./formats.css";

const metricOptions: {
  value: FormatMetric;
  label: string;
  description: string;
}[] = [
  {
    value: "engagement",
    label: "Engagement rate",
    description: "Weighted engagements ÷ stated observation basis",
  },
  {
    value: "cpa",
    label: "Owned cost per conversion",
    description: "Reported spend ÷ reported conversions",
  },
  {
    value: "conversionRate",
    label: "Owned conversion rate",
    description: "Reported conversions ÷ measured owned impressions",
  },
];

function readableTime(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not available";
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    }).format(new Date(value)) + " London"
  );
}
function metricValue(row: FormatPerformance, metric: FormatMetric) {
  if (metric === "cpa")
    return row.cpa === null ? "Unavailable" : row.cpa.toFixed(2);
  if (metric === "conversionRate")
    return row.conversionRate === null
      ? "Unavailable"
      : percent(row.conversionRate);
  return row.engagementDenominator > 0
    ? percent(row.engagementRate)
    : "Unavailable";
}
function dataLabel(analysis: FormatAnalysis) {
  return analysis.dataMode === "sample"
    ? "Illustrative sample data"
    : analysis.dataMode === "live"
      ? "Live-sourced records"
      : analysis.dataMode === "mixed"
        ? "Mixed source records"
        : analysis.dataMode === "empty"
          ? "No records yet"
          : "Imported records";
}

function PlatformFormats({
  result,
  metric,
  brandId,
  onAd,
}: {
  result: FormatPlatformAnalysis;
  metric: FormatMetric;
  brandId: string;
  onAd?: (ad: Ad) => void;
}) {
  const [opening, setOpening] = useState<string | null>(null),
    [error, setError] = useState("");
  const winner = result.winner;
  const metricName = metricOptions.find((option) => option.value === metric)!;
  async function inspect(row: FormatPerformance) {
    if (!onAd || !row.adIds.length || opening) return;
    setOpening(row.name);
    setError("");
    try {
      const ad = await api<Ad>(
        `/api/ads/${encodeURIComponent(row.adIds[0])}?brandId=${encodeURIComponent(brandId)}`,
      );
      onAd(ad);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setOpening(null);
    }
  }
  return (
    <section
      className="fmt-platform-card"
      aria-label={`${result.platform} creative-format performance`}
    >
      <div className="fmt-platform-header">
        <div className="fmt-platform-name">
          <PlatformIcon platform={result.platform} />
          <h2>{result.platform}</h2>
        </div>
        <span>
          {number(result.ads)} creatives · {number(result.classifiedAds)}{" "}
          classified
        </span>
      </div>
      <div className={`fmt-platform-lead ${winner ? "" : "fmt-no-winner"}`}>
        <div className="fmt-lead-copy">
          <span className="fmt-eyebrow">
            {winner ? "LEADING OBSERVED FORMAT" : "MORE EVIDENCE NEEDED"}
          </span>
          <h3>{winner ? winner.name : "No supported winner yet."}</h3>
          <p>
            {winner
              ? `${number(winner.ads)} creatives · ${number(winner.impressions)} impressions${metric !== "engagement" ? " · owned metrics only" : ""}`
              : result.missingMetric ||
                "Add annotated ad records to compare creative formats."}
          </p>
        </div>
        {winner && (
          <div className="fmt-leading-value">
            <strong>{metricValue(winner, metric)}</strong>
            <span>
              {metric === "cpa"
                ? "reported CPA*"
                : metric === "conversionRate"
                  ? "owned conversion rate*"
                  : "weighted engagement rate"}
            </span>
          </div>
        )}
      </div>
      {winner?.limitedSample && (
        <div className="fmt-limited-note">
          <TriangleAlert size={13} />
          <span>
            Limited sample: this format has fewer than three creatives. Treat
            the ranking as a research signal.
          </span>
        </div>
      )}
      {result.rankings.length ? (
        <>
          <div className="fmt-table-scroll">
            <table className="fmt-table">
              <thead>
                <tr>
                  <th scope="col">Creative format</th>
                  <th scope="col">Creatives</th>
                  <th scope="col">Observation basis</th>
                  <th
                    scope="col"
                    className={
                      metric === "engagement" ? "fmt-active-column" : ""
                    }
                  >
                    Eng. rate
                  </th>
                  <th scope="col">Owned conv.</th>
                  <th
                    scope="col"
                    className={metric === "cpa" ? "fmt-active-column" : ""}
                  >
                    Owned CPA*
                  </th>
                  <th
                    scope="col"
                    className={
                      metric === "conversionRate" ? "fmt-active-column" : ""
                    }
                  >
                    Owned CVR*
                  </th>
                  {onAd && (
                    <th scope="col">
                      <span className="fmt-visually-hidden">Evidence</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {result.rankings.map((row) => (
                  <tr
                    key={row.name}
                    className={`fmt-performance-row ${row.rank === 1 ? "fmt-winner-row" : ""} ${row.rank === null ? "fmt-unranked-row" : ""}`}
                  >
                    <th scope="row">
                      <span className="fmt-format-name">
                        <span className="fmt-rank">
                          {row.rank === null
                            ? "—"
                            : String(row.rank).padStart(2, "0")}
                        </span>
                        <span>
                          {row.name}
                          {row.limitedSample && <small>Limited sample</small>}
                        </span>
                      </span>
                    </th>
                    <td>{number(row.ads)}</td>
                    <td>
                      {number(row.engagementDenominator)}{" "}
                      {row.engagementRateBasis}
                    </td>
                    <td
                      className={
                        metric === "engagement" ? "fmt-active-column" : ""
                      }
                    >
                      {row.engagementDenominator
                        ? percent(row.engagementRate)
                        : "—"}
                    </td>
                    <td>
                      {row.conversions === null ? "—" : number(row.conversions)}
                    </td>
                    <td className={metric === "cpa" ? "fmt-active-column" : ""}>
                      {row.cpa === null ? "—" : row.cpa.toFixed(2)}
                    </td>
                    <td
                      className={
                        metric === "conversionRate" ? "fmt-active-column" : ""
                      }
                    >
                      {row.conversionRate === null
                        ? "—"
                        : percent(row.conversionRate)}
                    </td>
                    {onAd && (
                      <td>
                        <button
                          type="button"
                          className="fmt-example-button"
                          disabled={Boolean(opening) || !row.adIds.length}
                          onClick={() => inspect(row)}
                          aria-label={`Inspect ${result.platform} ${row.name} example`}
                        >
                          {opening === row.name ? (
                            <LoaderCircle size={14} className="spin" />
                          ) : (
                            <Eye size={14} />
                          )}
                          <span>Example</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fmt-table-footer">
            <span>
              <ShieldCheck size={13} />
              Ranked within {result.platform} by{" "}
              {metricName.label.toLowerCase()}.
            </span>
            {result.unclassifiedAds > 0 && (
              <span>
                {number(result.unclassifiedAds)} creatives need a style
                annotation.
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="fmt-empty-platform">
          <Layers3 size={24} />
          <p>No {result.platform} records in this category and date window.</p>
        </div>
      )}
      {error && (
        <p className="fmt-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function FormatsView({
  brandId,
  platform,
  range,
  onAd,
}: {
  brandId: string;
  platform: string;
  range: string;
  onAd?: (ad: Ad) => void;
}) {
  const [metric, setMetric] = useState<FormatMetric>("engagement"),
    [analysis, setAnalysis] = useState<FormatAnalysis | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [contentSource, setContentSource] = useState("all");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api<FormatAnalysis>(
      `/api/formats?${new URLSearchParams({ brandId, platform, range, metric, contentSource })}`,
    )
      .then((result) => {
        if (!cancelled) setAnalysis(result);
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, platform, range, metric, refresh, contentSource]);
  const basis = metricOptions.find((option) => option.value === metric)!;
  const coverage = analysis?.totalAds
    ? Math.round((analysis.classifiedAds / analysis.totalAds) * 100)
    : 0;
  const sourceConnected = Boolean(analysis?.sourceStatus?.connected);
  return (
    <div className="fmt-view">
      <section className="fmt-intro">
        <div className="fmt-intro-copy">
          <span className="fmt-eyebrow">
            <Sparkles size={14} /> CREATIVE FORMAT INTELLIGENCE
          </span>
          <h2>
            {metric === "engagement"
              ? "Which formats earn attention?"
              : metric === "cpa"
                ? "Which formats have the lowest reported cost?"
                : "Which formats have measured conversions?"}
          </h2>
          <p>
            UGC, influencer, static, before & after, reviews, and
            platform-native creative. Compare them within each platform in your
            category.
          </p>
        </div>
        <div className="fmt-metric-control">
          <label htmlFor="format-ranking-metric">
            Rank creative formats by
          </label>
          <select
            id="format-ranking-metric"
            value={metric}
            onChange={(event) => setMetric(event.target.value as FormatMetric)}
          >
            {metricOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span>{basis.description}</span>
        </div>
      </section>
      <div className="fmt-scope-bar">
        <label className="fmt-source-select">
          Content source
          <select
            aria-label="Format content source"
            value={contentSource}
            onChange={(e) => setContentSource(e.target.value)}
          >
            <option value="all">Paid & organic</option>
            <option value="paid">Paid ads</option>
            <option value="organic">Organic posts</option>
          </select>
        </label>
        <div>
          <span className="fmt-scope-label">CATEGORY</span>
          <strong>{analysis?.category || "Your selected category"}</strong>
          <span className="fmt-scope-divider" />
          <span>Last {range} days</span>
          <span className="fmt-scope-divider" />
          <span>
            {platform === "all"
              ? "Each platform separately"
              : platform + " only"}
          </span>
        </div>
        <button
          className="fmt-refresh"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={loading}
          aria-label="Refresh creative format analysis"
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Refresh analysis
        </button>
      </div>
      {error && (
        <div className="fmt-error" role="alert">
          {error}
          <button onClick={() => setRefresh((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}
      {loading && !analysis ? (
        <div className="fmt-loading">
          <LoaderCircle size={23} className="spin" />
          <p>Comparing formats within your category…</p>
        </div>
      ) : (
        analysis && (
          <>
            <div
              className={`fmt-provenance ${analysis.dataMode === "sample" ? "fmt-sample-provenance" : ""}`}
            >
              <span className="fmt-provenance-icon">
                {analysis.dataMode === "sample" ? (
                  <Info size={17} />
                ) : sourceConnected ? (
                  <Radio size={17} />
                ) : (
                  <Clock3 size={17} />
                )}
              </span>
              <div>
                <strong>{dataLabel(analysis)}</strong>
                <p>
                  {analysis.dataMode === "sample"
                    ? "These rankings describe fictional sample records. They do not identify what is winning in the live market."
                    : sourceConnected
                      ? "A source connection was reported. Read the actual sync and observation times below; this page does not establish continuous monitoring."
                      : "No verified live connection is available for this selection. Refreshing analysis reads saved records; it does not fetch the market."}
                </p>
              </div>
              <span className="fmt-provenance-badge">
                {analysis.dataMode === "sample"
                  ? "SAMPLE"
                  : sourceConnected
                    ? "SOURCE CONNECTED"
                    : "SAVED DATA"}
              </span>
            </div>
            <div className="fmt-coverage-grid">
              <div className="fmt-coverage-card">
                <span>
                  <Layers3 size={15} />
                  Creative coverage
                </span>
                <strong>
                  {number(analysis.totalAds)}
                  <small>creatives in scope</small>
                </strong>
                <p>
                  {number(analysis.classifiedAds)} classified ·{" "}
                  {number(analysis.unclassifiedAds)} unclassified
                </p>
              </div>
              <div className="fmt-coverage-card">
                <span>
                  <BarChart3 size={15} />
                  Format annotation coverage
                </span>
                <strong>
                  {coverage}%<small>of selected creatives</small>
                </strong>
                <div className="fmt-coverage-track">
                  <i style={{ width: `${coverage}%` }} />
                </div>
              </div>
              <div className="fmt-coverage-card fmt-freshness-card">
                <span>
                  <Clock3 size={15} />
                  Source freshness
                </span>
                <strong>{readableTime(analysis.lastObservedAt)}</strong>
                <p>
                  Latest observation · Sync:{" "}
                  {readableTime(analysis.sourceStatus?.lastSuccessfulSyncAt)}
                </p>
              </div>
            </div>
            <div className="fmt-platform-list" aria-busy={loading}>
              {analysis.platforms.map((result) => (
                <PlatformFormats
                  key={`${brandId}-${result.platform}`}
                  result={result}
                  metric={analysis.metric}
                  brandId={brandId}
                  onAd={onAd}
                />
              ))}
            </div>
            <section className="fmt-method">
              <h2>
                <CircleHelp size={17} />
                How to read this comparison
              </h2>
              <div>
                {analysis.notes.map((note, index) => (
                  <p key={index}>{note}</p>
                ))}
              </div>
              <p className="fmt-method-foot">
                The ranking covers your selected records, not an exhaustive view
                of the category. A creative style can have multiple labels, so
                format-group totals can overlap. *CPA is in the source’s
                reported spend units; conversion rate is conversions per
                measured owned impression. Currency and attribution windows must
                be comparable.
              </p>
            </section>
          </>
        )
      )}
    </div>
  );
}
