import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Clock3,
  FileText,
  FlaskConical,
  Layers,
  Lightbulb,
  LoaderCircle,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type {
  BrandDemoReport as DemoReport,
  DemoBrief,
  DemoEvidence,
  DemoPattern,
  DemoPoint,
} from "../../shared/brand-demo";
import type { CreatorCandidate, CreatorResearchSnapshot } from "../../shared/creator-research";
import { api } from "../lib/api";
import "./brand-demo-report.css";

const count = (value: number | null | undefined) => value == null ? "Not available" : value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
const mediaLabel = (value: string) => value === "video" ? "Video" : value === "carousel" ? "Carousel" : "Image";

function date(value?: string | null, withTime = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not available";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function safeSource(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function SourceLink({ url, children }: { url?: string | null; children: string }) {
  const href = safeSource(url);
  return href ? <a className="bdr-source-link" href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={11} /></a>
    : <span className="bdr-source-unavailable">{children} · source link unavailable</span>;
}
function adLabel(id: string | undefined, sourceUrl: string | null) {
  try { const url = new URL(sourceUrl || ""); if (/(^|\.)facebook\.com$/.test(url.hostname) && /^\d+$/.test(url.searchParams.get("id") || "")) return url.searchParams.get("id")!; } catch { /* Source-less evidence keeps its supplied identifier. */ }
  return id || "source";
}

function Status({ value }: { value: "Live" | "Beta" | "Preview" }) {
  return <span className={`bdr-pill bdr-pill-${value.toLowerCase()}`}>{value}</span>;
}

function Evidence({ evidence }: { evidence: DemoEvidence[] }) {
  const unique = [...new Map(evidence.map(item => [JSON.stringify([item.adId, item.sourceUrl, item.field]), item])).values()];
  return unique.length ? <div className="bdr-source-list" aria-label="Supporting sources">{unique.map((item, index) => <span key={index} title={item.quote}>
    <SourceLink url={item.sourceUrl}>{item.kind === "ad" ? `Ad ${adLabel(item.adId, item.sourceUrl)}` : "Brand website"}</SourceLink>
    {item.timestamps?.length ? <small> · {item.timestamps.map(range => `${Number(range.startSeconds.toFixed(1))}-${Number(range.endSeconds.toFixed(1))} s`).join(", ")}</small> : null}
    {item.imageIndices?.length ? <small> · {item.imageIndices.map(index => `image ${index}`).join(", ")}</small> : null}
  </span>)}</div> : <p className="bdr-no-source">Supporting evidence is not available in this snapshot.</p>;
}

function Point({ point }: { point: DemoPoint }) {
  return <div className="bdr-point"><p>{point.text}</p><Evidence evidence={point.evidence} /></div>;
}

function Pattern({ title, patterns }: { title: string; patterns: DemoPattern[] }) {
  const observed = patterns.filter(pattern => pattern.count > 0);
  return <div className="bdr-distribution">
    <h4>{title}</h4>
    {observed.length ? <ul className="bdr-counts">{observed.map(pattern => <li key={pattern.value}>
      <div className="bdr-count-label"><span>{pattern.label}</span><strong>{pattern.count} / {pattern.denominator}</strong></div>
      <div className="bdr-count-bar" aria-hidden="true"><span style={{ width: `${pattern.denominator ? Math.min(100, 100 * pattern.count / pattern.denominator) : 0}%` }} /></div>
      <Evidence evidence={pattern.evidence} />
    </li>)}</ul> : <p className="bdr-subcopy">No supported labels are available yet.</p>}
  </div>;
}

function Brief({ brief }: { brief: DemoBrief }) {
  return <div className="bdr-brief">
    <h4>{brief.label}</h4>
    <h5>Three hook options</h5>
    <ol className="bdr-brief-points">{brief.hooks.map((point, index) => <li key={index}><Point point={point} /></li>)}</ol>
    <dl>
      <div><dt>Format</dt><dd><Point point={brief.format} /></dd></div>
      <div><dt>Creator profile</dt><dd><Point point={brief.creatorProfile} /></dd></div>
    </dl>
    <h5>Script beats</h5>
    <ol className="bdr-brief-points">{brief.scriptBeats.map((point, index) => <li key={index}><Point point={point} /></li>)}</ol>
    <h5>Proof to include</h5>
    <ul className="bdr-brief-points">{brief.proof.map((point, index) => <li key={index}><Point point={point} /></li>)}</ul>
  </div>;
}

function Creator({ candidate }: { candidate: CreatorCandidate }) {
  const metrics = candidate.metrics;
  const fit = candidate.fit?.status === "complete" ? candidate.fit : null;
  const profileUrl = candidate.profile?.profileUrl || candidate.profileUrl;
  const sources = [...new Set(candidate.seedEvidence.map(item => item.adUrl))];
  return <tr>
    <th scope="row"><SourceLink url={profileUrl}>{candidate.handle ? `@${candidate.handle.replace(/^@/, "")}` : candidate.displayName}</SourceLink><small className="bdr-cell-note">{candidate.platform === "meta" ? "Meta-attributed creator" : candidate.platform === "instagram" ? "Instagram" : "TikTok"}{candidate.shortlisted ? " · Shortlisted" : " · Candidate"}</small></th>
    <td><p>{candidate.source === "meta-branded-content" ? "Paid-partnership source attribution" : "Collected public profile"}</p>
      <div className="bdr-source-list">{candidate.seedEvidence.map((source, index) => <SourceLink key={index} url={source.adUrl}>{`Ad ${source.providerAdId || source.adId}`}</SourceLink>)}</div>
      {!sources.length && candidate.profile && <div className="bdr-source-list"><SourceLink url={candidate.profile.evidenceUrl}>Profile evidence</SourceLink></div>}
    </td>
    <td>{count(metrics.followers)}<small>Observed {date(metrics.observedAt)}</small></td>
    <td><p>{count(metrics.averageViews)} average views</p><small>{metrics.postsSampled} public posts sampled{metrics.windowStart && metrics.windowEnd ? ` · ${date(metrics.windowStart)}-${date(metrics.windowEnd)}` : ""}</small>
      <details className="bdr-creator-basis"><summary>Engagement and source coverage</summary>
        <p>{metrics.engagementPerView.valuePercent == null ? "Engagement per view: unavailable" : `${metrics.engagementPerView.valuePercent.toFixed(2)}% engagement per view`} · sum(likes + comments) / sum(views) on {metrics.engagementPerView.eligiblePosts} eligible posts.</p>
        <p>{metrics.engagementPerFollower.valuePercent == null ? "Engagement per follower: unavailable" : `${metrics.engagementPerFollower.valuePercent.toFixed(2)}% engagement per follower`} · sum(likes + comments) / (current observed followers × {metrics.engagementPerFollower.eligiblePosts} eligible posts).</p>
        <p>{metrics.caveat}</p>
        <ul className="bdr-recent-posts">{candidate.profile?.recentPosts.slice(0, 3).map(post => <li key={post.id}><SourceLink url={post.evidenceUrl || post.url}>{`Post ${post.id} · ${date(post.publishedAt)}`}</SourceLink><p>{post.caption?.slice(0, 200) || "Caption unavailable"}</p><small>Views: {count(post.views)} · Likes: {count(post.likes)} · Comments: {count(post.comments)}</small></li>)}</ul>
      </details>
    </td>
    <td>{fit ? <><p>Category relevance: {fit.categoryRelevance}<br />Tone fit: {fit.toneFit}</p><small>{fit.reason}</small><div className="bdr-source-list">{fit.evidencePostUrls.map((url, index) => <SourceLink key={index} url={url}>{`Post evidence ${index + 1}`}</SourceLink>)}{fit.brandSourceUrls.map((url, index) => <SourceLink key={index} url={url}>{`Brand evidence ${index + 1}`}</SourceLink>)}</div></> : <p>Fit not assessed</p>}</td>
  </tr>;
}

export function BrandDemoReport({ brandId }: { brandId: string }) {
  const [report, setReport] = useState<DemoReport | null>(null);
  const [creators, setCreators] = useState<CreatorResearchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setReport(null); setCreators(null); setLoading(true); setError(false);
    Promise.allSettled([
      api<DemoReport>(`/api/brands/${encodeURIComponent(brandId)}/demo`),
      api<CreatorResearchSnapshot>(`/api/creator-research?${new URLSearchParams({ brandId })}`),
    ]).then(([brandResult, creatorResult]) => {
      if (!current) return;
      if (brandResult.status === "fulfilled") setReport(brandResult.value);
      else setError(true);
      if (creatorResult.status === "fulfilled") setCreators(creatorResult.value);
      setLoading(false);
    });
    return () => { current = false; };
  }, [brandId, reload]);

  if (loading) return <div className="bdr-loading" role="status"><LoaderCircle size={18} className="spin" />Loading your brand report…</div>;
  if (error || !report) return <div className="bdr-error" role="alert">This brand report is not available yet. Please try again.<button type="button" onClick={() => setReload(value => value + 1)}>Reload report</button></div>;

  const candidates = [...(creators?.candidates || []), ...(creators?.seeds.filter(seed => !creators.candidates.some(candidate => candidate.id === seed.id)) || [])].slice(0, 10);
  const hasAnalysis = report.analysedAdsCount > 0;
  return <article className="brand-demo" aria-label={`${report.brand.name} brand report`}>
    <header className="bdr-hero">
      <div className="bdr-hero-top"><div><span className="bdr-eyebrow"><BookOpen size={14} /> BRAND INTELLIGENCE REPORT</span><h2>{report.brand.name}</h2></div><Status value="Live" /></div>
      <p className="bdr-hero-copy">Observed creative patterns, new angles to test and a clear view of the supporting evidence.</p>
      <div className="bdr-snapshot"><span><Clock3 size={12} />Report prepared {date(report.generatedAt, true)} London</span><span>Saved source observations</span><SourceLink url={`https://${report.brand.domain}`}>{report.brand.domain}</SourceLink></div>
      <dl className="bdr-metrics">
        <div><dt>Analysed creatives</dt><dd>{count(report.analysedAdsCount)}<small>Source-linked creative reviews</small></dd></div>
        <div><dt>Video ads</dt><dd>{count(report.sample.video)}</dd></div>
        <div><dt>Image ads</dt><dd>{count(report.sample.image)}</dd></div>
        <div><dt>Carousel ads</dt><dd>{count(report.sample.carousel)}</dd></div>
      </dl>
    </header>

    <section className="bdr-section" aria-labelledby="bdr-patterns-title">
      <div className="bdr-section-top"><div className="bdr-section-heading"><span className="bdr-section-icon"><Layers size={17} /></span><div><h3 id="bdr-patterns-title">What the creative sample shows</h3><p className="bdr-section-intro">Counts come from analysed ads. Each denominator includes only creatives with a supported label in that dimension; frequency describes this sample.</p></div></div><Status value="Beta" /></div>
      {hasAnalysis ? <div className="bdr-grid bdr-pattern-grid"><Pattern title="Format" patterns={report.patterns.format} /><Pattern title="Hook type" patterns={report.patterns.hookType} /><Pattern title="Angle" patterns={report.patterns.angle} /><Pattern title="Offer type" patterns={report.patterns.offerType} /></div> : <div className="bdr-empty"><strong>No analysed creatives in this snapshot</strong><p>Observed patterns will appear when real creative analyses are available.</p></div>}
    </section>

    <section className="bdr-section" aria-labelledby="bdr-opportunities-title">
      <div className="bdr-section-top"><div className="bdr-section-heading"><span className="bdr-section-icon"><Lightbulb size={17} /></span><div><h3 id="bdr-opportunities-title">Creative opportunities & briefs</h3><p className="bdr-section-intro">Source-backed directions to test, grounded in this sample. Concentrated angles and possible gaps are starting points for creative research.</p></div></div><Status value="Beta" /></div>
      {hasAnalysis && report.opportunities.length ? <div className="bdr-opportunities">{report.opportunities.map((opportunity, index) => <article className="bdr-angle-card" key={opportunity.id}>
        <div className="bdr-angle-heading"><span className="bdr-angle-number">0{index + 1}</span><span className="bdr-pill bdr-pill-beta">{opportunity.status === "saturated" ? "Saturated in this sample" : opportunity.status === "gap" ? "Candidate gap" : "Evidence still building"}</span></div>
        <h4>{opportunity.title}</h4><Point point={opportunity.rationale} />
        <p className="bdr-evidence-line">{opportunity.count} of {opportunity.denominator} supported angle labels in the analysed sample.</p>
        <Evidence evidence={opportunity.evidence} />
        <details className="bdr-brief-details"><summary>Read the draft brief <FileText size={12} /></summary><Brief brief={opportunity.brief} /></details>
      </article>)}</div> : <div className="bdr-empty"><strong>Creative directions need more source evidence</strong><p>Opportunity angles and draft briefs will appear when the sample provides a useful basis.</p></div>}
    </section>

    <section className="bdr-section" aria-labelledby="bdr-creators-title">
      <div className="bdr-section-top"><div className="bdr-section-heading"><span className="bdr-section-icon"><UsersRound size={17} /></span><div><h3 id="bdr-creators-title">Creator shortlist</h3><p className="bdr-section-intro">{candidates.length ? `${candidates.length} sourced creator ${candidates.length === 1 ? "candidate" : "candidates"}${creators && creators.totalCandidates > candidates.length ? ` from ${creators.totalCandidates} saved candidates` : ""}. Public profile measures and source attribution are shown where available.` : "Real creator candidates and their public evidence."}</p></div></div><Status value="Beta" /></div>
      {candidates.length ? <><div className="bdr-table-wrap"><table className="bdr-table bdr-creators-table"><thead><tr><th scope="col">Creator</th><th scope="col">Source</th><th scope="col">Followers</th><th scope="col">Public post sample</th><th scope="col">Brand fit</th></tr></thead><tbody>{candidates.map(candidate => <Creator key={candidate.id} candidate={candidate} />)}</tbody></table></div><p className="bdr-footnote">Fit is an interpretation of public captions and saved brand context. Public engagement measures describe the cited post sample; they do not establish ad results, audience demographics or a creator’s future performance.</p></> : <div className="bdr-empty"><UsersRound size={24} /><strong>No sourced creator candidates in this snapshot</strong><p>Public creator profiles have not been collected yet, or the saved ads do not establish a creator attribution.</p></div>}
    </section>

    <section className="bdr-section" aria-labelledby="bdr-scores-title">
      <div className="bdr-section-top"><div className="bdr-section-heading"><span className="bdr-section-icon"><ShieldCheck size={17} /></span><div><h3 id="bdr-scores-title">Creative best-practice scores</h3><p className="bdr-section-intro">Best-practice score, not a performance prediction.</p></div></div><Status value="Beta" /></div>
      <p className="bdr-footnote">The 0-100 rubric describes observable creative structure. Unknown criteria are left unassessed. Coverage shows how much of the rubric could be assessed; provisional results need further evidence.</p>
      {report.scores.length ? <div className="bdr-table-wrap"><table className="bdr-table"><thead><tr><th scope="col">Creative</th><th scope="col">Score / 100</th><th scope="col">Assessment coverage</th><th scope="col">Rubric and evidence</th></tr></thead><tbody>{report.scores.map(score => <tr key={score.analysisId}>
        <th scope="row"><SourceLink url={score.sourceUrl}>{`Ad ${score.nativeId || score.adId}`}</SourceLink><small className="bdr-cell-note">{mediaLabel(score.mediaKind)} · analysed {date(score.analysedAt)}</small></th>
        <td>{score.score == null ? "Not enough evidence" : <><span className="bdr-score">{Math.round(score.score)}<small>/ 100</small></span>{score.provisional && <small className="bdr-cell-note">Provisional</small>}</>}</td>
        <td>{Math.round(score.coverage * 100)}%<small>{score.assessedWeight} / {score.totalWeight} rubric weight assessed{score.provisional ? " · provisional" : ""}</small></td>
        <td><details className="bdr-score-details"><summary>View assessment</summary><p>{score.method}</p><ul className="bdr-score-reasons">{score.criteria.map(criterion => <li key={criterion.id}><strong>{criterion.label}</strong> · {criterion.status === "met" ? "Observed" : criterion.status === "not-met" ? "Not observed" : "Unknown"} · weight {criterion.weight}<p>{criterion.explanation}</p><Evidence evidence={criterion.evidence} /></li>)}</ul></details></td>
      </tr>)}</tbody></table></div> : <div className="bdr-empty"><strong>No creative assessments are available yet</strong><p>Scores require supported source observations from real creative analyses.</p></div>}
    </section>

    <section className="bdr-section" aria-labelledby="bdr-prediction-title">
      <div className="bdr-section-top"><div className="bdr-section-heading"><span className="bdr-section-icon"><FlaskConical size={17} /></span><div><h3 id="bdr-prediction-title">Future proven-ad likelihood</h3><p className="bdr-section-intro">Trains as collection history builds.</p></div></div><Status value="Preview" /></div>
      {report.prediction.observations.length ? <><p className="bdr-footnote">The dates below show when an ad was captured in the saved collection. The span between captures does not confirm continuous delivery or advertising performance.</p><div className="bdr-table-wrap"><table className="bdr-table"><thead><tr><th scope="col">Ad</th><th scope="col">First observed</th><th scope="col">Last observed</th><th scope="col">Saved observations</th><th scope="col">Observed span</th></tr></thead><tbody>{report.prediction.observations.map(observation => <tr key={observation.adId}><th scope="row"><SourceLink url={observation.sourceUrl}>{`Ad ${adLabel(observation.adId, observation.sourceUrl)}`}</SourceLink></th><td>{date(observation.firstObservedAt)}</td><td>{date(observation.lastObservedAt)}</td><td>{count(observation.observationCount)}</td><td>{count(observation.observedSpanDays)} days<Evidence evidence={observation.evidence} /></td></tr>)}</tbody></table></div></> : <div className="bdr-empty"><Clock3 size={24} /><strong>Trains as collection history builds.</strong><p>Repeated source observations are needed before longevity can be described. A likelihood estimate is not available.</p></div>}
    </section>

    <section className="bdr-section" aria-labelledby="bdr-website-title">
      <div className="bdr-section-top"><div className="bdr-section-heading"><span className="bdr-section-icon"><BookOpen size={17} /></span><div><h3 id="bdr-website-title">Brand website evidence</h3><p className="bdr-section-intro">Saved public brand context used alongside the creative sample.</p></div></div><Status value="Live" /></div>
      {report.website.status === "available" ? <><p className="bdr-footnote">Observed {date(report.website.fetchedAt, true)} London · <SourceLink url={report.website.url}>{report.website.title || report.brand.domain}</SourceLink></p><ul className="bdr-website-evidence">{report.website.excerpts.map((evidence, index) => <li key={index}><blockquote>{evidence.quote}</blockquote><Evidence evidence={[evidence]} /></li>)}</ul></> : <div className="bdr-empty"><strong>Website observations have not been added to this snapshot</strong><p>Creative findings above cite the available ad evidence.</p></div>}
    </section>

    <details className="bdr-method"><summary>About this evidence</summary><div><p>This report uses source observations and interpretations of real creatives. Pattern counts, creative structure and source longevity do not establish spend, conversion rates or ad performance.</p><p>{report.sample.excludedUnanalysed} source ads await creative review and are excluded from these findings.</p><ul><li>Findings cover the analysed sample shown here, not the entire advertising market.</li><li>Opportunities and briefs are draft directions to test. Repetition does not prove creative fatigue.</li><li>Check product claims, current offers, source permissions and creator suitability before production.</li><li>Scores and collection history do not predict conversions, revenue or return on ad spend.</li></ul></div></details>
  </article>;
}
