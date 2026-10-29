import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Layers,
  UsersRound,
  Heart,
  MousePointer2,
  TrendingUp,
  Lightbulb,
  Info,
} from "lucide-react";
import type { Dashboard, Ad, Page } from "../../shared/types";
import { number, percent } from "../lib/api";
import { AdCard } from "./Creative";
import ConversionEvidence from "./ConversionEvidence";

function TrendChart({ dashboard }: { dashboard: Dashboard }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = dashboard.trend;
  if (!points.length)
    return (
      <div className="chart-empty">
        Import dated ad records to see engagement over time.
      </div>
    );
  const max =
    Math.max(...points.flatMap((p) => [p.brand, p.competitors]), 1) * 1.2;
  const x = (i: number) => 48 + i * (665 / Math.max(points.length - 1, 1));
  const y = (v: number) => 177 - (v / max) * 145;
  const line = (key: "brand" | "competitors") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p[key])}`)
      .join(" ");
  return (
    <div className="trend-chart" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox="0 0 740 218"
        role="img"
        aria-label="Daily observed engagements for your brand and competitors"
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7ca28a" stopOpacity=".23" />
            <stop offset="100%" stopColor="#7ca28a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <g key={i}>
            <line
              x1="48"
              x2="713"
              y1={y(max * v)}
              y2={y(max * v)}
              stroke="#edf0eb"
              strokeDasharray={v ? "3 5" : undefined}
            />
            <text x="35" y={y(max * v) + 4} textAnchor="end">
              {number(max * v)}
            </text>
          </g>
        ))}
        <path
          d={`${line("brand")} L${x(points.length - 1)},177 L48,177 Z`}
          fill="url(#chart-fill)"
        />
        <path
          d={line("competitors")}
          fill="none"
          stroke="#b8b3e3"
          strokeWidth="2.3"
          strokeDasharray="5 5"
          strokeLinejoin="round"
        />
        <path
          d={line("brand")}
          fill="none"
          stroke="#3b7255"
          strokeWidth="2.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points
          .filter(
            (_, i) =>
              i % Math.max(1, Math.floor(points.length / 6)) === 0 ||
              i === points.length - 1,
          )
          .map((p) => (
            <text
              key={p.date}
              x={x(points.indexOf(p))}
              y="207"
              textAnchor="middle"
            >
              {p.label}
            </text>
          ))}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={x(i) - 12}
            y="18"
            width="25"
            height="166"
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1="22"
              y2="177"
              stroke="#a6b4a9"
            />
            <circle
              cx={x(hover)}
              cy={y(points[hover].brand)}
              r="5"
              fill="#37684f"
              stroke="white"
              strokeWidth="3"
            />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `${Math.min(72, Math.max(6, (hover / points.length) * 90))}%`,
          }}
        >
          <strong>{points[hover].label}</strong>
          <span>
            {dashboard.brand.name}: {number(points[hover].brand)}
          </span>
          <span>Competitor average: {number(points[hover].competitors)}</span>
        </div>
      )}
    </div>
  );
}
export default function Overview({
  dashboard,
  onPage,
  onAd,
}: {
  dashboard: Dashboard;
  onPage: (page: Page) => void;
  onAd: (ad: Ad) => void;
}) {
  const m = dashboard.metrics;
  const metrics = [
    {
      label: "Ads in your landscape",
      value: number(m.ads),
      detail: `Across ${m.brands} monitored brands`,
      icon: Layers,
      tone: "sage",
    },
    {
      label: "Observed engagements",
      value: number(m.engagements),
      detail: `${number(m.impressions)} observed impressions`,
      icon: Heart,
      tone: "peach",
    },
    {
      label: "Engagement rate",
      value: percent(m.engagementRate),
      detail: "Engagements ÷ impressions",
      icon: MousePointer2,
      tone: "lavender",
    },
    {
      label: "Matched creators",
      value: number(m.creators),
      detail: "Discover your next collaboration",
      icon: UsersRound,
      tone: "sand",
    },
  ];
  return (
    <>
      <div className="metrics-grid">
        {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
          <section className="metric-card" key={label}>
            <div className="metric-label">
              {label}
              <span className={`metric-icon ${tone}`}>
                <Icon size={16} />
              </span>
            </div>
            <div className="metric-value">{value}</div>
            <p>{detail}</p>
          </section>
        ))}
      </div>
      <div className="overview-middle">
        <section className="panel trend-panel">
          <div className="panel-heading">
            <div>
              <h2>Attention, over time</h2>
              <p>Observed engagements, grouped by ad publication date.</p>
            </div>
            <span className="mini-tag">Publication cohorts</span>
          </div>
          <div className="chart-legend">
            <span>
              <i />
              {dashboard.brand.name}
            </span>
            <span>
              <i className="purple" />
              Competitor average
            </span>
          </div>
          <TrendChart dashboard={dashboard} />
        </section>
        <section className="opportunity-panel">
          <div className="opportunity-title">
            <span>
              <Sparkles size={17} />
            </span>
            <span>YOUR NEXT MOVE</span>
            <ArrowUpRight size={17} />
          </div>
          <h2>
            {dashboard.angles[0] ? (
              <>
                The angle worth
                <br />
                your attention.
              </>
            ) : (
              <>
                Your next insight
                <br />
                starts with data.
              </>
            )}
          </h2>
          <p>
            {dashboard.angles[0] ? (
              <>
                <strong>{dashboard.angles[0].name}</strong> leads observed
                engagement in your landscape at{" "}
                <strong>{percent(dashboard.angles[0].engagementRate)}</strong>.
                Explore the creative behind the signal.
              </>
            ) : (
              "Connect your research through an ad-data import to start comparing creative angles and audiences."
            )}
          </p>
          <div className="opportunity-foot">
            <span className="small-dot" />
            {dashboard.mode === "demo"
              ? "Based on sample creative data"
              : "Based on your imported records"}
          </div>
          <button
            onClick={() => onPage(dashboard.angles.length ? "ads" : "sources")}
          >
            {dashboard.angles.length ? "Explore the angle" : "Import your data"}
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <div className="heading-with-label">
              <h2>Creative catching attention</h2>
              <span className="count-pill">{m.ads.toLocaleString()} ads</span>
            </div>
            <p>A closer look at the ads driving the conversation.</p>
          </div>
          <button className="text-button" onClick={() => onPage("ads")}>
            Explore ad library <ArrowRight size={15} />
          </button>
        </div>
        {dashboard.ads.length ? (
          <div className="creative-grid">
            {dashboard.ads.slice(0, 4).map((ad) => (
              <AdCard key={ad.id} ad={ad} onOpen={onAd} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Layers />
            <h3>Your creative landscape is a blank canvas</h3>
            <p>Import ad records to discover what’s earning attention.</p>
            <button
              className="button primary"
              onClick={() => onPage("sources")}
            >
              Add a data source
            </button>
          </div>
        )}
      </section>
      <div className="overview-bottom">
        <section className="panel angle-panel">
          <div className="panel-heading">
            <div>
              <h2>Angles with momentum</h2>
              <p>Ranked by engagement rate, not estimated sales.</p>
            </div>
            <TrendingUp size={19} />
          </div>
          <div className="angle-table">
            <div className="angle-table-head">
              <span>CREATIVE ANGLE</span>
              <span>ADS</span>
              <span>ENG. RATE</span>
              <span>SHARE OF ADS</span>
            </div>
            {dashboard.angles.slice(0, 4).map((a, i) => (
              <div className="angle-row" key={a.name}>
                <span>
                  <b className={`rank rank-${i}`}>
                    {String(i + 1).padStart(2, "0")}
                  </b>
                  {a.name}
                </span>
                <span>{a.ads}</span>
                <strong>{percent(a.engagementRate)}</strong>
                <span className="share-bar">
                  <i style={{ width: `${a.share}%` }} />
                  <em>{a.share.toFixed(0)}%</em>
                </span>
              </div>
            ))}
          </div>
          {!dashboard.angles.length && (
            <p className="muted padded">No angles to compare yet.</p>
          )}
        </section>
        <section className="panel insight-panel">
          <div className="panel-heading">
            <h2>
              <Lightbulb size={18} /> A little more context
            </h2>
          </div>
          {dashboard.insights.slice(0, 2).map((i, n) => (
            <div className="insight-item" key={n}>
              <span className={n ? "lavender" : "sage"}>
                {n ? <UsersRound size={17} /> : <TrendingUp size={17} />}
              </span>
              <div>
                <h3>{i.title}</h3>
                <p>{i.text}</p>
              </div>
            </div>
          ))}
          <div className="data-caveat">
            <Info size={14} />
            <span>
              Public attention signals don’t reveal competitor conversions.
            </span>
          </div>
        </section>
      </div>
      <ConversionEvidence dashboard={dashboard} />
    </>
  );
}
