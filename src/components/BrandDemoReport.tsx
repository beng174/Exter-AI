import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, Info, LoaderCircle } from "lucide-react";
import type { BrandDemoReport as DemoReport, DemoBrief, DemoEvidence, DemoPattern, DemoPoint } from "../../shared/brand-demo";
import type { CreatorCandidate, CreatorResearchSnapshot } from "../../shared/creator-research";
import type { CreativeGalleryFilters, CreativeGalleryResponse, DemoGalleryCreative } from "../../shared/creative-gallery";
import type { DemoCollectionSnapshot } from "../../shared/demo-collection";
import type { Brand } from "../../shared/types";
import { CreativeGallery, galleryDisplayText, metaAdUrl } from "./CreativeGallery";
import { api } from "../lib/api";
import "./brand-demo-report.css";

const count = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
function date(value?: string | null, withTime = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not available";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value));
}
function safeSource(value?: string | null) {
  try { const url = new URL(value || ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function nativeId(id?: string, sourceUrl?: string | null) {
  try { const url = new URL(sourceUrl || ""); if (/(^|\.)facebook\.com$/.test(url.hostname) && /^\d+$/.test(url.searchParams.get("id") || "")) return url.searchParams.get("id")!; } catch { /* An unsourced reference keeps its supplied identifier. */ }
  return id || "source";
}
function Status({ value }: { value: "Live" | "Beta" | "Preview" }) { return <span className={`bdr-pill bdr-pill-${value.toLowerCase()}`}>{value}</span>; }
function SourceLink({ url, children }: { url?: string | null; children: ReactNode }) {
  const href = safeSource(url);
  return href ? <a className="bdr-source-link" href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={12} /></a> : <span className="bdr-source-unavailable">{children} · source unavailable</span>;
}
interface Explorer { find: (evidence: Pick<DemoEvidence, "adId" | "sourceUrl">) => DemoGalleryCreative | undefined; open: (adId: string) => void }
const ExplorerContext = createContext<Explorer | null>(null);
function AdLink({ adId, sourceUrl, children }: { adId?: string; sourceUrl?: string | null; children?: ReactNode }) {
  const explorer = useContext(ExplorerContext);
  const creative = explorer?.find({ adId, sourceUrl: sourceUrl || null });
  const href = creative ? metaAdUrl(creative) : safeSource(sourceUrl);
  const label = children || `Ad ${creative?.nativeId || nativeId(adId, sourceUrl)}`;
  return href ? <a className="bdr-ad-link" href={href} target="_blank" rel="noopener noreferrer" title={creative ? "Open creative and analysis" : "View source ad"} onClick={event => {
    if (creative && explorer && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); explorer.open(creative.adId); }
  }}>{label}<ArrowUpRight size={12} /></a> : <span className="bdr-source-unavailable">{label}</span>;
}
function Evidence({ evidence }: { evidence: DemoEvidence[] }) {
  const unique = [...new Map(evidence.map(item => [JSON.stringify([item.kind, item.adId, item.sourceUrl]), item])).values()];
  const link = (item: DemoEvidence, index: number) => <span key={index} title={item.quote}>{item.kind === "ad" ? <AdLink adId={item.adId} sourceUrl={item.sourceUrl} /> : <SourceLink url={item.sourceUrl}>Brand website</SourceLink>}</span>;
  return unique.length ? <div className="bdr-source-list" aria-label="Supporting sources">{unique.slice(0, 3).map(link)}{unique.length > 3 && <details className="bdr-more-sources"><summary>{unique.length - 3} more sources</summary><div>{unique.slice(3).map(link)}</div></details>}</div> : null;
}
function Point({ point }: { point: DemoPoint }) { return <div className="bdr-point"><p>{galleryDisplayText(point.text)}</p><Evidence evidence={point.evidence} /></div>; }
function SectionTitle({ id, title, status, description, action }: { id: string; title: string; status: "Live" | "Beta" | "Preview"; description?: string; action?: ReactNode }) {
  return <div className="bdr-section-heading"><div><div className="bdr-heading-line"><h2 id={id}>{title}</h2><Status value={status} /></div>{description && <p>{description}</p>}</div>{action}</div>;
}
function Brief({ brief }: { brief: DemoBrief }) {
  return <div className="bdr-brief"><p className="bdr-draft-label">{galleryDisplayText(brief.label)}</p><h4>Three hooks to test</h4><ol>{brief.hooks.map((point, index) => <li key={index}><Point point={point} /></li>)}</ol><div className="bdr-brief-columns"><div><h4>Format</h4><Point point={brief.format} /></div><div><h4>Creator profile</h4><Point point={brief.creatorProfile} /></div></div><h4>Script beats</h4><ol>{brief.scriptBeats.map((point, index) => <li key={index}><Point point={point} /></li>)}</ol><h4>Proof to include</h4>{brief.proof.map((point, index) => <Point key={index} point={point} />)}</div>;
}
function Creator({ candidate }: { candidate: CreatorCandidate }) {
  const metrics = candidate.metrics;
  const fit = candidate.fit?.status === "complete" ? candidate.fit : null;
  const evidence: DemoEvidence[] = candidate.seedEvidence.map(item => ({ kind: "ad", adId: item.adId, sourceUrl: item.adUrl, quote: `Branded-content credit: ${item.partnerName}` }));
  return <tr><th scope="row"><SourceLink url={candidate.profile?.profileUrl || candidate.profileUrl}>{candidate.handle ? `@${candidate.handle.replace(/^@/, "")}` : candidate.displayName}</SourceLink><span className="bdr-cell-note">{candidate.platform === "meta" ? "Meta attribution" : candidate.platform === "instagram" ? "Instagram" : "TikTok"}{candidate.shortlisted ? " · Shortlisted" : ""}</span></th><td>{count(metrics.followers)}<span className="bdr-cell-note">Observed {date(metrics.observedAt)}</span></td><td>{evidence.length ? <><span>Branded-content credit</span><Evidence evidence={evidence} /></> : candidate.profile ? <SourceLink url={candidate.profile.evidenceUrl}>Public profile</SourceLink> : "No linked profile measurements"}</td><td>{fit ? <><span>Relevance: {fit.categoryRelevance}</span><span className="bdr-cell-note">Tone: {fit.toneFit}</span><p className="bdr-cell-reason">{galleryDisplayText(fit.reason)}</p><div className="bdr-source-list">{fit.evidencePostUrls.map((url, index) => <SourceLink key={url} url={url}>Example post {index + 1}</SourceLink>)}</div></> : <span className="bdr-cell-note">Not assessed</span>}<details className="bdr-creator-posts"><summary>{metrics.postsSampled ? `${metrics.postsSampled} observed posts and metrics` : "Public post measurements"}</summary><p>{metrics.windowStart && metrics.windowEnd ? `${date(metrics.windowStart)} to ${date(metrics.windowEnd)}` : "Post date range unavailable"}</p><p>{metrics.engagementPerView.valuePercent == null ? "Engagement per view unavailable" : `${metrics.engagementPerView.valuePercent.toFixed(2)}% engagement per view`}: sum(likes + comments) / sum(views) across {metrics.engagementPerView.eligiblePosts} eligible posts.</p><p>{metrics.engagementPerFollower.valuePercent == null ? "Engagement per follower unavailable" : `${metrics.engagementPerFollower.valuePercent.toFixed(2)}% engagement per follower`}: sum(likes + comments) / (current observed followers × {metrics.engagementPerFollower.eligiblePosts} eligible posts).</p><p>{metrics.caveat}</p>{candidate.profile?.recentPosts.slice(0, 3).map(post => <div className="bdr-post" key={post.id}><SourceLink url={post.evidenceUrl || post.url}>Post {post.id}</SourceLink><p>{post.caption ? galleryDisplayText(post.caption) : "Caption unavailable"}</p><span className="bdr-cell-note">Views {count(post.views)} · Likes {count(post.likes)} · Comments {count(post.comments)}</span></div>)}</details></td></tr>;
}
function Pattern({ title, patterns, onFilter }: { title: string; patterns: DemoPattern[]; onFilter: (value: string) => void }) {
  const observed = patterns.filter(pattern => pattern.count > 0);
  const highest = Math.max(1, ...observed.map(pattern => pattern.count));
  return <div className="bdr-distribution"><h3>{title}</h3>{observed.length ? <><p className="bdr-chart-basis">{observed[0].denominator} classified creatives</p><ul>{observed.map(pattern => <li key={pattern.value}><button type="button" className="bdr-pattern-button" onClick={() => onFilter(pattern.value)} aria-label={`Filter creatives by ${title.toLowerCase()}: ${pattern.label}`}><span className="bdr-pattern-label">{galleryDisplayText(pattern.label)}</span><span className="bdr-pattern-value">{pattern.count}</span><span className="bdr-chart-track" aria-hidden="true"><span style={{ width: `${100 * pattern.count / highest}%` }} /></span></button><Evidence evidence={pattern.evidence} /></li>)}</ul></> : <p className="bdr-empty-inline">No consistent labels are available for this field yet.</p>}</div>;
}
function evidenceFor(creative: DemoGalleryCreative): DemoEvidence { return { kind: "ad", adId: creative.adId, sourceUrl: creative.sourceUrl, quote: creative.title || `Ad ${creative.nativeId}` }; }
function overviewFindings(report: DemoReport | null, gallery: CreativeGalleryResponse | null): DemoPoint[] {
  if (!gallery?.creatives.length) return [];
  const analysed = gallery.creatives.filter(creative => creative.analysis);
  const findings: DemoPoint[] = [{ kind: "observation", text: `${gallery.analysedAdsCount} of ${gallery.collectedAdsCount} collected ads have a completed creative analysis.`, evidence: (analysed.length ? analysed : gallery.creatives).map(evidenceFor) }];
  for (const [name, group] of [["creative format", report?.patterns.format], ["hook type", report?.patterns.hookType], ["angle", report?.patterns.angle], ["offer", report?.patterns.offerType]] as const) {
    const top = group?.filter(pattern => pattern.count > 0).sort((a, b) => b.count - a.count)[0];
    if (top && findings.length < 3) findings.push({ kind: "observation", text: `${top.label} is the most observed ${name}: ${top.count} of ${top.denominator} consistently labelled creatives.`, evidence: top.evidence });
  }
  const credited = gallery.creatives.filter(creative => creative.partnershipAttribution || creative.creatorEvidence?.length);
  if (findings.length < 3 && credited.length) findings.push({ kind: "observation", text: `${credited.length} collected ${credited.length === 1 ? "ad contains" : "ads contain"} a recorded creator or branded-content credit.`, evidence: credited.map(evidenceFor) });
  if (findings.length < 3 && gallery.storedMediaCount) findings.push({ kind: "observation", text: `${gallery.storedMediaCount} creative files are retained for viewing in this report.`, evidence: gallery.creatives.filter(creative => creative.mediaAvailable).map(evidenceFor) });
  if (findings.length < 3) findings.push({ kind: "observation", text: `${gallery.collectedAdsCount - gallery.analysedAdsCount} collected ads await creative analysis; their original source links remain available.`, evidence: gallery.creatives.filter(creative => !creative.analysis).map(evidenceFor) });
  return findings.slice(0, 3);
}
const sections = [
  ["overview", "Overview", "Live"], ["creatives", "Creatives", "Live"], ["patterns", "Patterns", "Beta"],
  ["competitors", "Competitors", "Beta"], ["opportunities", "Opportunities & briefs", "Beta"], ["creators", "Creators", "Beta"], ["scores", "Scores", "Beta"],
] as const;

export function BrandDemoReport({ brandId, onBrandChange }: { brandId: string; onBrandChange?: (brandId: string) => void }) {
  const [selectedBrandId, setSelectedBrandId] = useState(brandId);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [report, setReport] = useState<DemoReport | null>(null);
  const [gallery, setGallery] = useState<CreativeGalleryResponse | null>(null);
  const [creators, setCreators] = useState<CreatorResearchSnapshot | null>(null);
  const [competition, setCompetition] = useState<DemoCollectionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState<CreativeGalleryFilters>({});
  const [openAdId, setOpenAdId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const beforeDetailHash = useRef("");
  useEffect(() => { setSelectedBrandId(brandId); }, [brandId]);
  useEffect(() => {
    let current = true;
    setReport(null); setGallery(null); setCreators(null); setCompetition(null); setLoading(true); setError(false); setFilters({}); setOpenAdId(null);
    Promise.allSettled([
      api<DemoReport>(`/api/brands/${encodeURIComponent(selectedBrandId)}/demo`),
      api<CreativeGalleryResponse>(`/api/brands/${encodeURIComponent(selectedBrandId)}/demo/creatives`),
      api<CreatorResearchSnapshot>(`/api/creator-research?${new URLSearchParams({ brandId: selectedBrandId })}`),
      api<DemoCollectionSnapshot>(`/api/demo-collection?${new URLSearchParams({ brandId: selectedBrandId })}`),
      api<Brand[]>("/api/brands"),
    ]).then(([brandResult, galleryResult, creatorResult, competitionResult, brandsResult]) => {
      if (!current) return;
      if (brandResult.status === "fulfilled") setReport(brandResult.value);
      if (galleryResult.status === "fulfilled") setGallery(galleryResult.value);
      if (creatorResult.status === "fulfilled") setCreators(creatorResult.value);
      if (competitionResult.status === "fulfilled") setCompetition(competitionResult.value);
      if (brandsResult.status === "fulfilled") setBrands(brandsResult.value.filter(brand => brand.mode === "imported"));
      setError(brandResult.status !== "fulfilled" && galleryResult.status !== "fulfilled"); setLoading(false);
    });
    return () => { current = false; };
  }, [selectedBrandId, reload]);
  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveSection(visible.target.getAttribute("data-report-section") || "overview");
    }, { rootMargin: "-80px 0px -55% 0px", threshold: 0 });
    document.querySelectorAll(".brand-demo [data-report-section]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [loading, selectedBrandId]);
  useEffect(() => {
    if (!gallery?.creatives.length || !window.location.hash.startsWith("#ad=")) return;
    let wanted: string;
    try { wanted = decodeURIComponent(window.location.hash.slice(4)); } catch { return; }
    const creative = gallery.creatives.find(item => item.nativeId === wanted || item.adId === wanted);
    if (creative) setOpenAdId(creative.adId);
  }, [gallery]);
  const creativeList = gallery?.creatives || [];
  const findCreative = (evidence: Pick<DemoEvidence, "adId" | "sourceUrl">) => creativeList.find(creative => creative.adId === evidence.adId || creative.nativeId === evidence.adId || creative.nativeId === nativeId(evidence.adId, evidence.sourceUrl));
  function openCreative(id: string | null) {
    if (id) {
      const creative = creativeList.find(item => item.adId === id);
      if (!creative) return;
      if (!openAdId) beforeDetailHash.current = window.location.hash.startsWith("#ad=") ? "#creatives" : window.location.hash;
      setOpenAdId(id);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#ad=${encodeURIComponent(creative.nativeId)}`);
    } else { setOpenAdId(null); window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${beforeDetailHash.current}`); }
  }
  function changeBrand(id: string) {
    setSelectedBrandId(id); setOpenAdId(null); setFilters({}); onBrandChange?.(id);
    if (window.location.pathname.startsWith("/demo/")) window.history.replaceState(null, "", `/demo/${encodeURIComponent(id)}`);
  }
  function filterFromPattern(key: keyof CreativeGalleryFilters, value: string) {
    setFilters({ [key]: value }); setActiveSection("creatives");
    document.getElementById("bdr-creatives")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const candidates = useMemo(() => [...(creators?.candidates || []), ...(creators?.seeds.filter(seed => !creators.candidates.some(candidate => candidate.id === seed.id)) || [])].slice(0, 10), [creators]);
  const findings = useMemo(() => overviewFindings(report, gallery), [report, gallery]);
  const currentBrand = gallery?.brand || report?.brand;
  const importedBrands = currentBrand && !brands.some(brand => brand.id === currentBrand.id) ? [...brands, { ...currentBrand, mode: "imported" } as Brand] : brands;
  const adminLink = (anchor: string) => `/?${new URLSearchParams({ view: "settings", brandId: selectedBrandId })}#${anchor}`;

  if (loading) return <div className="bdr-loading" role="status"><LoaderCircle size={18} className="spin" />Loading brand report…</div>;
  if (error || !currentBrand) return <div className="bdr-error" role="alert"><h2>Brand report unavailable</h2><p>The saved report could not be opened. Please try again.</p><button type="button" onClick={() => setReload(value => value + 1)}>Reload report</button></div>;
  const collectedCount = gallery?.collectedAdsCount ?? (report ? report.analysedAdsCount + report.sample.excludedUnanalysed : 0);
  const analysedCount = gallery?.analysedAdsCount ?? report?.analysedAdsCount ?? 0;
  const retainedCount = gallery?.storedMediaCount ?? null;
  const attributedCount = gallery ? gallery.creatives.filter(creative => creative.partnershipAttribution).length : null;
  const brandControl = <label>Brand<select aria-label="Filter brand" value={currentBrand.id} onChange={event => changeBrand(event.target.value)}>{importedBrands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>;
  const empty = (title: string, text: string, action?: { label: string; href: string }) => <div className="bdr-empty"><h3>{title}</h3><p>{text}</p>{action && <a href={action.href}>{action.label} <ArrowRight size={14} /></a>}</div>;

  return <ExplorerContext.Provider value={{ find: findCreative, open: id => openCreative(id) }}><article className="brand-demo" aria-label={`${currentBrand.name} brand report`}>
    <header className="bdr-page-header"><div><p className="bdr-eyebrow">Brand report</p><h1>{currentBrand.name}</h1><p className="bdr-page-meta"><SourceLink url={`https://${currentBrand.domain}`}>{currentBrand.domain}</SourceLink><span>{date(report?.generatedAt || gallery?.dateRange.to, true)}</span></p></div><a className="bdr-primary" href="#bdr-creatives" onClick={() => setActiveSection("creatives")}>Explore creatives <ArrowRight size={15} /></a></header>
    <nav className="bdr-nav" aria-label="Report sections">{sections.map(([id, label, status]) => <a key={id} href={`#bdr-${id}`} className={activeSection === id ? "is-active" : ""} aria-current={activeSection === id ? "location" : undefined} onClick={() => setActiveSection(id)}>{label}<Status value={status} /></a>)}</nav>

    <section id="bdr-overview" data-report-section="overview" aria-labelledby="bdr-overview-title" className="bdr-section">
      <SectionTitle id="bdr-overview-title" title="Overview" status="Live" />
      <div className="bdr-kpi-grid"><div className="bdr-kpi"><span>Ads collected</span><strong>{count(collectedCount)}</strong><a href="#bdr-creatives" onClick={() => setFilters({})}>Browse source ads</a></div><div className="bdr-kpi"><span>Ads analysed</span><strong>{count(analysedCount)}</strong><span>Completed creative reviews</span></div><div className="bdr-kpi"><span>Stored creatives</span><strong>{count(retainedCount)}</strong><span>Available to watch or view</span></div><div className="bdr-kpi"><span>Ads with creator credits</span><strong>{count(attributedCount)}</strong><span>Source attribution recorded</span></div></div>
      {gallery && <div className="bdr-format-summary"><span>Collected formats</span>{(["video", "image", "carousel", "unknown"] as const).filter(kind => gallery.mediaCounts[kind] > 0).map(kind => <button key={kind} type="button" onClick={() => filterFromPattern("mediaKind", kind)}><span className={`bdr-format-dot bdr-format-${kind}`} />{kind === "unknown" ? "Unconfirmed" : kind === "video" ? "Video" : kind === "image" ? "Image" : "Carousel"} <strong>{gallery.mediaCounts[kind]}</strong></button>)}{gallery.dateRange.from && <span className="bdr-range">Source dates {date(gallery.dateRange.from)} to {date(gallery.dateRange.to)}</span>}</div>}
      {findings.length ? <div className="bdr-findings">{findings.map((finding, index) => <div key={index} className="bdr-finding"><span className="bdr-finding-number">0{index + 1}</span><Point point={finding} /></div>)}</div> : empty("Creative findings are still building", "Collect and analyse the brand's ads to create source-backed findings.", { label: "Prepare brand evidence", href: adminLink("brand-demo-preparation") })}
      <details className="bdr-about"><summary><Info size={14} /> About this data</summary><div><p>This is a bounded sample of collected ads. Counts describe the saved evidence, not the complete market. Running days use the source-listed start and observed date; continuous delivery and ad performance are unconfirmed.</p><p>Labels and transcripts are model interpretations. Confidence scores are uncalibrated and do not filter these findings.</p>{report?.website.status === "available" ? <><h3>Brand website evidence</h3><p>Observed {date(report.website.fetchedAt, true)} · <SourceLink url={report.website.url}>{report.website.title || currentBrand.domain}</SourceLink></p>{report.website.excerpts.slice(0, 5).map((item, index) => <blockquote key={index}>{galleryDisplayText(item.quote)}<SourceLink url={item.sourceUrl}>Website source</SourceLink></blockquote>)}<p>Website statements are publisher claims, not independently verified facts.</p></> : <p>Website evidence has not been added. <a href={adminLink("brand-demo-preparation")}>Refresh website evidence</a></p>}</div></details>
    </section>

    <section id="bdr-creatives" data-report-section="creatives" aria-labelledby="bdr-creatives-title" className="bdr-section">
      <SectionTitle id="bdr-creatives-title" title="Creatives" status="Live" description="Open any ad to watch or view its creative, read the analysis and follow its original source." />
      <CreativeGallery creatives={creativeList} filters={filters} onFiltersChange={setFilters} openAdId={openAdId} onOpenAd={openCreative} brandControl={brandControl} emptyAction={{ label: "Collect brand ads", href: adminLink("brand-demo-preparation") }} />
    </section>

    <section id="bdr-patterns" data-report-section="patterns" aria-labelledby="bdr-patterns-title" className="bdr-section">
      <SectionTitle id="bdr-patterns-title" title="Patterns" status="Beta" description="Click a bar to explore the creatives behind it. Unknown labels stay outside that field's denominator." />
      {report && analysedCount ? <div className="bdr-pattern-grid"><Pattern title="Hook type" patterns={report.patterns.hookType} onFilter={value => filterFromPattern("hookType", value)} /><Pattern title="Angle" patterns={report.patterns.angle} onFilter={value => filterFromPattern("angle", value)} /><Pattern title="Offer type" patterns={report.patterns.offerType} onFilter={value => filterFromPattern("offerType", value)} /><Pattern title="Creative format" patterns={report.patterns.format} onFilter={value => filterFromPattern("format", value)} /></div> : empty("Pattern labels are not available yet", "Analyse retained creatives to compare hooks, angles, offers and formats.", { label: "Analyse stored creatives", href: adminLink("gemini-smoke-test") })}
    </section>

    <section id="bdr-competitors" data-report-section="competitors" aria-labelledby="bdr-competitors-title" className="bdr-section">
      <SectionTitle id="bdr-competitors-title" title="Competitors" status="Beta" description="Source-backed competitor collections. Missing evidence is shown explicitly." />
      {competition?.competitors.length ? <div className="bdr-competitor-grid">{competition.competitors.map(competitor => <article key={competitor.id} className="bdr-competitor-card"><h3>{competitor.name}</h3><SourceLink url={`https://${competitor.domain}`}>{competitor.domain}</SourceLink><dl><div><dt>Collected</dt><dd>{competitor.collectedCount}</dd></div><div><dt>Stored</dt><dd>{competitor.storedCount}</dd></div><div><dt>Analysed</dt><dd>{competitor.analysedCount}</dd></div></dl>{competitor.collectedCount && competitor.brandId ? <button type="button" onClick={() => changeBrand(competitor.brandId!)}>Explore creatives <ArrowRight size={14} /></button> : <><p>Competitor ads have not been collected yet.</p><a href={adminLink("demo-collection")}>Collect competitor ads <ArrowRight size={14} /></a></>}{competitor.lastRun?.sourceUrl && <div className="bdr-competitor-source"><SourceLink url={competitor.lastRun.sourceUrl}>Collection source</SourceLink><span>{date(competitor.lastRun.observedAt)}</span></div>}</article>)}</div> : empty("No competitor collections yet", "Collect Aery Living, The White Company and NEOM to compare their actual creatives.", { label: "Collect competitor ads", href: adminLink("demo-collection") })}
    </section>

    <section id="bdr-opportunities" data-report-section="opportunities" aria-labelledby="bdr-opportunities-title" className="bdr-section">
      <SectionTitle id="bdr-opportunities-title" title="Opportunities & briefs" status="Beta" description="Draft directions to test, with the source ads that motivate each point." />
      {report?.opportunities.length ? <div className="bdr-opportunities">{report.opportunities.map(opportunity => <article key={opportunity.id} className="bdr-opportunity"><div className="bdr-opportunity-heading"><h3>{galleryDisplayText(opportunity.title)}</h3><span className="bdr-opportunity-status">{opportunity.status === "saturated" ? "Repeated in this sample" : opportunity.status === "gap" ? "Candidate gap" : "Evidence still building"}</span></div><Point point={opportunity.rationale} /><details><summary>Read the creative brief <ChevronDown size={14} /></summary><Brief brief={opportunity.brief} /></details></article>)}</div> : empty("Briefs need analysed creative evidence", "Analyse the collected ads to generate cited opportunity angles and draft briefs.", { label: "Analyse stored creatives", href: adminLink("gemini-smoke-test") })}
    </section>

    <section id="bdr-creators" data-report-section="creators" aria-labelledby="bdr-creators-title" className="bdr-section">
      <SectionTitle id="bdr-creators-title" title="Creators" status="Beta" description="Branded-content credits and public creator evidence, linked to their source ads." />
      {candidates.length ? <div className="bdr-table-wrap"><table className="bdr-table"><thead><tr><th>Creator</th><th>Followers</th><th>Source ads</th><th>Public evidence & fit</th></tr></thead><tbody>{candidates.map(candidate => <Creator key={candidate.id} candidate={candidate} />)}</tbody></table></div> : empty("No creator credits or profiles collected yet", "Creator candidates appear from Meta branded-content credits and explicit public profile research.", { label: "Collect creator evidence", href: adminLink("brand-demo-preparation") })}
      {candidates.length > 0 && <details className="bdr-about"><summary><Info size={14} /> About creator measurements</summary><div><p>Public engagement uses declared denominators and excludes posts with missing required counts. Search country and category are research criteria, not verified audience demographics. Creator fit uses the cited public captions and brand context; it does not predict ad results.</p></div></details>}
    </section>

    <section id="bdr-scores" data-report-section="scores" aria-labelledby="bdr-scores-title" className="bdr-section">
      <SectionTitle id="bdr-scores-title" title="Scores" status="Beta" description="Best-practice score, not a performance prediction." />
      {report?.scores.length ? <div className="bdr-table-wrap"><table className="bdr-table"><thead><tr><th>Creative</th><th>Score / 100</th><th>Coverage</th><th>Assessment</th></tr></thead><tbody>{report.scores.map(score => <tr key={score.analysisId}><th scope="row"><AdLink adId={score.adId} sourceUrl={score.sourceUrl}>Ad {score.nativeId}</AdLink><span className="bdr-cell-note">{score.mediaKind === "video" ? "Video" : score.mediaKind === "carousel" ? "Carousel" : "Image"}</span></th><td><strong className="bdr-score">{score.score == null ? "Unavailable" : Math.round(score.score)}</strong>{score.provisional && <span className="bdr-cell-note">Provisional</span>}</td><td>{Math.round(score.coverage * 100)}%<span className="bdr-cell-note">{score.assessedWeight} / {score.totalWeight} rubric weight</span></td><td><details className="bdr-assessment"><summary>View criteria</summary><p>{score.method}</p><ul>{score.criteria.map(criterion => <li key={criterion.id}><strong>{criterion.label}</strong><span>{criterion.status === "met" ? "Observed" : criterion.status === "not-met" ? "Not observed" : "Unknown"}</span><p>{galleryDisplayText(criterion.explanation)}</p><Evidence evidence={criterion.evidence} /></li>)}</ul></details></td></tr>)}</tbody></table></div> : empty("No scores available yet", "Scores require a completed analysis of a real creative.", { label: "Analyse stored creatives", href: adminLink("gemini-smoke-test") })}
      <details className="bdr-about"><summary><Info size={14} /> About scores and prediction preview</summary><div><p>Scores measure an explicit creative checklist. Unknown checks are excluded and coverage is shown, so a high partial score is not a complete assessment. No conversion, sales or performance outcome is inferred.</p><div className="bdr-heading-line"><h3>Future proven-ad likelihood</h3><Status value="Preview" /></div><p>Trains as collection history builds.</p>{report?.prediction.observations.length ? <><p>The spans below record source capture endpoints. They do not establish continuous delivery or a proven winner.</p><ul>{report.prediction.observations.slice(0, 10).map(observation => <li key={observation.adId}><AdLink adId={observation.adId} sourceUrl={observation.sourceUrl} /> · {date(observation.firstObservedAt)} to {date(observation.lastObservedAt)} · {count(observation.observedSpanDays)} observed days</li>)}</ul></> : <p>Repeated source observations are needed before longevity can be described.</p>}</div></details>
    </section>
    <footer className="bdr-footer"><span>{currentBrand.name} · Saved source evidence</span><span>Prepared {date(report?.generatedAt, true)}</span></footer>
  </article></ExplorerContext.Provider>;
}
