import { useState, type ReactNode } from "react";
import type { DemoAdScore, DemoPattern, DemoPatternCoverage } from "../../shared/brand-demo";
import type { CreativeGalleryResponse, DemoGalleryCreative } from "../../shared/creative-gallery";
import type { CreatorCandidate, CreatorResearchSnapshot } from "../../shared/creator-research";
import { galleryDisplayText } from "./CreativeGallery";
import { creatorEligibility } from "../../shared/creator-eligibility";
import "./evidence-charts.css";

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
const percent = (value: number, denominator: number) => denominator > 0 ? `${number(100 * value / denominator)}%` : "Unavailable";
const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(value)) : "Unavailable";

export interface EvidenceBarRow {
  id: string;
  label: string;
  value: number | null;
  denominator?: number;
  detail?: string;
  muted?: boolean;
  onSelect?: () => void;
  sources?: ReactNode;
}

/** Values always come from the saved evidence; zero and unavailable stay distinct. */
export function EvidenceBarChart({ title, rows, basis = "Observed", description, emptyText = "No observations are available for this chart yet.", valueSuffix = "", footer, initialLimit }: {
  title: string; rows: EvidenceBarRow[]; basis?: "Observed" | "Modelled"; description?: string; emptyText?: string; valueSuffix?: string; footer?: ReactNode; initialLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const valid = rows.filter(row => row.value !== null && Number.isFinite(row.value) && row.value >= 0);
  const max = Math.max(1, ...valid.map(row => row.denominator ?? row.value!));
  const displayedRows = initialLimit && !expanded ? rows.slice(0, initialLimit) : rows;
  return <article className="evidence-chart" aria-label={title}>
    <header className="evidence-chart-heading"><h3>{title}</h3><span className="evidence-basis">{valid.length ? basis : "Unavailable"}</span></header>
    {description && <p className="evidence-chart-description">{description}</p>}
    {rows.length ? <ul className="evidence-bars">{displayedRows.map(row => {
      const known = row.value !== null && Number.isFinite(row.value) && row.value >= 0;
      const scale = row.denominator === undefined ? max : row.denominator;
      const width = known && scale > 0 ? Math.min(100, 100 * row.value! / scale) : 0;
      const contents = <><span className="evidence-bar-label" title={row.label}>{galleryDisplayText(row.label)}</span><span className="evidence-bar-value">{known ? `${number(row.value!)}${valueSuffix}` : "Unavailable"}{known && row.denominator !== undefined && <small>{row.denominator > 0 ? `${percent(row.value!, row.denominator)} of ${number(row.denominator)}` : "No eligible sample"}</small>}</span><span className={`evidence-bar-track${row.muted ? " is-muted" : ""}`} aria-hidden="true"><span style={{ width: `${width}%` }} /></span>{row.detail && <span className="evidence-bar-detail">{galleryDisplayText(row.detail)}</span>}</>;
      return <li key={row.id}>{row.onSelect && known ? <button type="button" className="evidence-bar" onClick={row.onSelect}>{contents}</button> : <div className="evidence-bar">{contents}</div>}{row.sources}</li>;
    })}</ul> : <p className="evidence-chart-empty">{emptyText}</p>}
    {initialLimit && rows.length > initialLimit && <button className="evidence-more-values" type="button" onClick={() => setExpanded(value => !value)}>{expanded ? `Show first ${initialLimit}` : `Show all ${rows.length} descriptions`}</button>}
    {footer && <div className="evidence-chart-footer">{footer}</div>}
  </article>;
}

export function EvidenceCoverage({ title, classified, total, legacy = 0, onClassified, onUnclassified }: {
  title: string; classified: number; total: number; legacy?: number; onClassified?: () => void; onUnclassified?: () => void;
}) {
  const known = Math.max(0, Math.min(total, classified));
  const unclassified = Math.max(0, total - known);
  const content = (value: number, label: string) => <><strong>{number(value)}</strong><span>{label}</span></>;
  return <div className="evidence-coverage" aria-label={`${title} label coverage`}>
    <div className="evidence-coverage-heading"><span>{title}</span><strong>{total > 0 ? `${percent(known, total)} classified` : "No analysed sample"}</strong></div>
    <div className="evidence-coverage-track" role="img" aria-label={`${known} classified and ${unclassified} without fixed labels out of ${total} analysed ads`}><span style={{ width: `${total > 0 ? 100 * known / total : 0}%` }} /></div>
    <div className="evidence-coverage-legend">{onClassified ? <button type="button" onClick={onClassified}>{content(known, "fixed labels")}</button> : <span>{content(known, "fixed labels")}</span>}{onUnclassified ? <button type="button" onClick={onUnclassified}>{content(unclassified, "without fixed labels")}</button> : <span>{content(unclassified, "without fixed labels")}</span>}</div>
    {legacy > 0 && <p>{number(legacy)} of these ads have an earlier description, shown separately below.</p>}
  </div>;
}

export function PatternDistribution({ title, patterns, legacyPatterns = [], coverage, totalAnalysed, onSelect, renderSources, action }: {
  title: string; patterns: DemoPattern[]; legacyPatterns?: DemoPattern[]; coverage?: DemoPatternCoverage; totalAnalysed: number;
  onSelect?: (pattern: DemoPattern, basis: "canonical" | "legacy") => void; renderSources?: (pattern: DemoPattern) => ReactNode; action?: ReactNode;
}) {
  const observed = patterns.filter(pattern => pattern.count > 0);
  const classified = coverage?.classified ?? patterns[0]?.denominator ?? 0;
  const total = coverage?.totalAnalysed ?? totalAnalysed;
  const recorded = legacyPatterns.filter(pattern => pattern.count > 0);
  const legacyTitle = title === "Hook type" || title === "Hook types" ? "Recorded opening messages" : title === "Angle" || title === "Angles" ? "Recorded angle descriptions" : title === "Offer type" || title === "Offers" ? "Recorded offer descriptions" : "Recorded format descriptions";
  const rows = (items: DemoPattern[], basis: "canonical" | "legacy") => items.map(pattern => ({ id: pattern.value, label: pattern.label, value: pattern.count, denominator: pattern.denominator, onSelect: onSelect ? () => onSelect(pattern, basis) : undefined, sources: renderSources?.(pattern) }));
  return <div className="evidence-pattern">
    <EvidenceCoverage title={title} classified={classified} total={total} legacy={coverage?.legacy ?? (recorded[0]?.denominator || 0)} />
    {observed.length > 0 ? <EvidenceBarChart title="Fixed taxonomy" rows={rows(observed, "canonical")} description={`Observed counts of modelled labels. Shares use ${number(classified)} classified ads; missing labels are excluded.`} />
      : <div className="evidence-chart-empty"><p>No fixed {title.toLowerCase()} labels have been saved for these {number(total)} analysed ads.</p>{action}</div>}
    {recorded.length > 0 && <details className="evidence-legacy" open={observed.length === 0}><summary>{legacyTitle}<span>{number(recorded[0].denominator)} ads</span></summary><EvidenceBarChart title={legacyTitle} rows={rows(recorded, "legacy")} description="Observed counts of exact descriptions from earlier model analyses. These are not grouped into the current taxonomy." initialLimit={5} /></details>}
    {!observed.length && !recorded.length && total > 0 && <p className="evidence-chart-description">The creative can still be opened and reviewed. A missing label is not evidence that this pattern is absent.</p>}
  </div>;
}

const mediaNames = { video: "Video", image: "Image", carousel: "Carousel", unknown: "Unconfirmed media" } as const;
export function SampleEvidenceCharts({ gallery, onSelect }: { gallery: CreativeGalleryResponse; onSelect?: (ads: DemoGalleryCreative[]) => void }) {
  const ads = gallery.creatives;
  const total = gallery.collectedAdsCount;
  const classified = ads.filter(ad => ad.creativeFormat || ad.hookType || ad.angle || ad.offerType);
  const rows: EvidenceBarRow[] = [
    { id: "collected", label: "Collected source ads", value: total, denominator: total, onSelect: onSelect ? () => onSelect(ads) : undefined },
    { id: "retained", label: "Stored creative media", value: gallery.storedMediaCount, denominator: total, onSelect: onSelect ? () => onSelect(ads.filter(ad => ad.mediaAvailable)) : undefined },
    { id: "analysed", label: "Completed creative analyses", value: gallery.analysedAdsCount, denominator: total, onSelect: onSelect ? () => onSelect(ads.filter(ad => ad.analysis)) : undefined },
    { id: "labelled", label: "At least one fixed pattern label", value: classified.length, denominator: total, onSelect: onSelect ? () => onSelect(classified) : undefined },
  ];
  return <div className="evidence-chart-grid">
    <EvidenceBarChart title="Sample coverage" rows={rows} description={`Population: ${number(total)} collected ads. Each measure uses the same saved sample; stages can overlap.`} />
    <EvidenceBarChart title="Collected media mix" rows={(["video", "image", "carousel", "unknown"] as const).map(kind => ({ id: kind, label: mediaNames[kind], value: gallery.mediaCounts[kind], denominator: total, muted: kind === "unknown", onSelect: onSelect ? () => onSelect(ads.filter(ad => ad.mediaKind === kind)) : undefined }))} description="Source-listed or retained media format. Unconfirmed records stay visible in the population." />
  </div>;
}

export function ObservationDatesChart({ creatives, onSelect }: { creatives: DemoGalleryCreative[]; onSelect?: (ads: DemoGalleryCreative[]) => void }) {
  const dated = new Map<string, DemoGalleryCreative[]>();
  const missing: DemoGalleryCreative[] = [];
  for (const ad of creatives) {
    if (!ad.observedAt || !Number.isFinite(Date.parse(ad.observedAt))) { missing.push(ad); continue; }
    const day = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/London" }).format(new Date(ad.observedAt));
    dated.set(day, [...(dated.get(day) || []), ad]);
  }
  const rows = [...dated.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, ads]) => ({ id: day, label: date(ads[0].observedAt), value: ads.length, denominator: creatives.length, onSelect: onSelect ? () => onSelect(ads) : undefined }));
  return <EvidenceBarChart title="Recorded source dates" rows={[...rows, ...(missing.length ? [{ id: "missing", label: "Observation date unavailable", value: missing.length, denominator: creatives.length, muted: true, onSelect: onSelect ? () => onSelect(missing) : undefined }] : [])]} description="Latest saved source date per collected ad. A date gap does not imply zero ads or uninterrupted monitoring." footer={<span>{number(creatives.length - missing.length)} dated records / {number(creatives.length)} collected ads.</span>} />;
}

export function ScoreDistributionChart({ scores, onSelect }: { scores: DemoAdScore[]; onSelect?: (scores: DemoAdScore[]) => void }) {
  const assessed = scores.filter(score => score.score !== null && Number.isFinite(score.score));
  const bands = [[0, 24], [25, 49], [50, 74], [75, 100]] as const;
  return <EvidenceBarChart title="Best-practice score distribution" basis="Modelled" rows={assessed.length ? bands.map(([from, to]) => {
    const matches = assessed.filter(score => Math.round(score.score!) >= from && Math.round(score.score!) <= to);
    return { id: `${from}-${to}`, label: `${from} to ${to} / 100`, value: matches.length, denominator: assessed.length, onSelect: onSelect ? () => onSelect(matches) : undefined };
  }) : []} description={`${number(assessed.length)} scored ads / ${number(scores.length)} analysed score records. Scores describe a creative checklist, not predicted performance.`} footer={scores.length > assessed.length ? <span>{number(scores.length - assessed.length)} ads have insufficient rubric evidence for a score.</span> : undefined} />;
}

export function CreatorEvidenceCharts({ snapshot, onSelect }: { snapshot: CreatorResearchSnapshot; onSelect?: (candidate: CreatorCandidate) => void }) {
  const eligible = snapshot.candidates.filter(candidate => creatorEligibility(candidate).status === "eligible");
  const summary = snapshot.eligibility;
  const followers = <EvidenceBarChart title="Observed Instagram followers" rows={eligible.map(candidate => ({ id: candidate.id, label: candidate.handle ? `@${candidate.handle.replace(/^@/, "")}` : candidate.displayName, value: candidate.profile!.followers, detail: `Observed ${date(candidate.profile!.observedAt)}`, onSelect: onSelect ? () => onSelect(candidate) : undefined }))} description={`${number(eligible.length)} displayed recommendations with verified Instagram profiles above 40,000 followers. Bars are relative to the largest observed profile in this saved shortlist.`} emptyText="No saved Instagram profile meets the verified follower requirement yet. Unknown counts and profiles at 40,000 or below are not recommendations." />;
  return summary ? <div className="evidence-chart-grid"><EvidenceBarChart title="Creator evidence coverage" rows={[
    { id: "eligible", label: "Eligible Instagram recommendations", value: summary.eligibleCount, denominator: summary.observedCount },
    { id: "excluded", label: "Outside the Instagram / follower requirement", value: summary.excludedCount, denominator: summary.observedCount, muted: true },
    { id: "unverified", label: "Follower eligibility not verified", value: summary.unverifiedCount, denominator: summary.observedCount, muted: true },
  ]} description={`Population: ${number(summary.observedCount)} saved source candidates, including ad credits. This is not a count of Instagram profiles visited or a wider creator population.`} />{followers}</div> : followers;
}
