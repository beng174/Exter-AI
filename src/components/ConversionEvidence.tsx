import { CircleHelp, MousePointer2, Target } from "lucide-react";
import type { Angle, Dashboard } from "../../shared/types";
import { number } from "../lib/api";

function EvidenceTable({ rows, label }: { rows: Angle[]; label: string }) {
  const measured = rows
    .filter((row) => row.conversions !== null)
    .sort(
      (a, b) =>
        (a.cpa ?? Infinity) - (b.cpa ?? Infinity) ||
        (b.conversions ?? 0) - (a.conversions ?? 0),
    );
  return (
    <section className="evidence-table">
      <h3>{label}</h3>
      <div className="evidence-head">
        <span>{label === "By audience" ? "AUDIENCE" : "AD ANGLE"}</span>
        <span>CONVERSIONS</span>
        <span>CPA*</span>
      </div>
      {measured.slice(0, 4).map((row, i) => (
        <div className="evidence-row" key={row.name}>
          <span>
            <b>{i + 1}</b>
            {row.name}
          </span>
          <strong>{number(row.conversions ?? 0)}</strong>
          <span>{row.cpa === null ? "Unavailable" : row.cpa.toFixed(2)}</span>
        </div>
      ))}
      {!measured.length && (
        <p className="muted">No owned conversion records in this selection.</p>
      )}
    </section>
  );
}
export default function ConversionEvidence({
  dashboard,
}: {
  dashboard: Dashboard;
}) {
  if (dashboard.metrics.conversions === null) return null;
  return (
    <section className="panel conversion-evidence">
      <div className="panel-heading">
        <div>
          <h2>
            <Target size={17} /> Owned conversion evidence
          </h2>
          <p>
            {dashboard.mode === "demo"
              ? "Illustrative sample metrics"
              : "Reported owned-account metrics"}{" "}
            · Lowest reported CPA first, where available.
          </p>
        </div>
        <span className="mini-tag">Your brand only</span>
      </div>
      <div className="evidence-tables">
        <EvidenceTable rows={dashboard.angles} label="By creative angle" />
        <EvidenceTable
          rows={dashboard.audiencePerformance || []}
          label="By audience"
        />
      </div>
      <div className="evidence-note">
        <CircleHelp size={14} />
        <p>
          *CPA = reported spend / reported conversions on records with both
          fields. Currency, conversion event and attribution windows are
          supplied by your source; compare only compatible records. This is
          observed performance, not proof of incremental lift.
        </p>
      </div>
    </section>
  );
}
