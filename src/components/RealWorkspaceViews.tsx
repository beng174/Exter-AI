import { openCreativeRoute, closeCreativeRoute, resolveNavigation, NAVIGATION_EVENT } from "../navigation";
import { Unavailable } from "./ui/Unavailable";
import { workspaceEvidence } from "../../shared/workspace-evidence";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Brand } from "../../shared/types";
import type { ReactNode } from "react";
import { ArrowUpRight, ChevronRight, Info, LoaderCircle, RefreshCw } from "lucide-react";
import type { BrandDemoReport, DemoPattern } from "../../shared/brand-demo";
import type { BrandResearch } from "../../shared/brand-research";
import type { CreativeGalleryFilters, CreativeGalleryResponse, DemoGalleryCreative } from "../../shared/creative-gallery";
import type { CreatorCandidate, CreatorResearchSnapshot } from "../../shared/creator-research";
import type { DemoCollectionSnapshot } from "../../shared/demo-collection";
import { ANGLE_OPTIONS, FORMAT_OPTIONS, HOOK_TYPE_OPTIONS, OFFER_TYPE_OPTIONS } from "../../shared/creative-taxonomy";
import { api } from "../lib/api";
import { CreativeAdDetail, CreativeGallery } from "./CreativeGallery";
import { creatorEligibility } from "../../shared/creator-eligibility";
import { CreatorEvidenceCharts, ObservationDatesChart, PatternDistribution, SampleEvidenceCharts, ScoreDistributionChart } from "./EvidenceCharts";
import { AudienceVoiceInsights, CompetitorComparison, CreativeLandscape, CreativeNextSteps, OwnedResults } from "./WorkspaceInsights";
import { ScoreBreakdown } from "./ScoreBreakdown";
import "./real-workspace-views.css";

export type RealWorkspacePage = "overview" | "ads" | "formats" | "brand" | "creators" | "competitors" | "audiences";
export interface RealWorkspaceViewProps {
  brandId: string;
  view: RealWorkspacePage;
  brands?: Brand[];
  onSelectBrand?: (id: string) => void;
  onOpenSettings?: () => void;
  onOpenSources?: () => void;
}
interface WorkspaceEvidence {
  report: BrandDemoReport | null;
  gallery: CreativeGalleryResponse | null;
  creators: CreatorResearchSnapshot | null;
  research: BrandResearch | null;
  competitors: DemoCollectionSnapshot | null;
}
const emptyEvidence = (): WorkspaceEvidence => ({ report: null, gallery: null, creators: null, research: null, competitors: null });
const numeric = (value: number | null | undefined) => value == null ? "Not available" : value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(value)) : "Not available";
const mediaLabels = { video: "Video", image: "Image", carousel: "Carousel", unknown: "Unconfirmed format" } as const;
const activeCollectionStates = new Set(["queued", "collecting", "preparing", "analysing", "running"]);

function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function ExternalSource({ url, children }: { url: string | null | undefined; children: ReactNode }) {
  const href = safeHref(url);
  return href ? <a className="rws-source" href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={13} /></a> : <span className="rws-secondary">{children}</span>;
}
function Maturity(_props: { children?: "Live" | "Beta" | "Preview" }) { return null; }

function Empty({ title, children, action, actionLabel }: { title: string; children?: ReactNode; action?: () => void; actionLabel?: string }) {
  return <div className="rws-empty"><h3>{title}</h3>{children && <p>{children}</p>}{action && actionLabel && <button className="rws-secondary-button" type="button" onClick={action}>{actionLabel}<ChevronRight size={14} /></button>}</div>;
}
function SectionTitle({ title, maturity = "Live", children }: { title: string; maturity?: "Live" | "Beta" | "Preview"; children?: ReactNode }) {
  return <div className="rws-section-heading"><div><h2>{title}</h2>{children}</div><Maturity>{maturity}</Maturity></div>;
}
function categoryLabel(value: string, options: readonly (readonly [string, string])[]) {
  return options.find(option => option[0] === value)?.[1] || value;
}
function CreatorRates({ creator }: { creator: CreatorCandidate }) {
  const { metrics } = creator;
  return <details className="rws-about"><summary>Public post measures</summary><div>
    <p>{metrics.postsSampled} posts sampled. Dated window: {date(metrics.windowStart)} to {date(metrics.windowEnd)}.</p>
    <p>Engagement per view: {metrics.engagementPerView.valuePercent == null ? "Not available" : `${metrics.engagementPerView.valuePercent.toFixed(2)}%`}. Sum of likes and comments / sum of views on {metrics.engagementPerView.eligiblePosts} eligible posts.</p>
    <p>Engagement per follower: {metrics.engagementPerFollower.valuePercent == null ? "Not available" : `${metrics.engagementPerFollower.valuePercent.toFixed(2)}%`}. Sum of likes and comments / (current observed followers × {metrics.engagementPerFollower.eligiblePosts} eligible posts).</p>
    <p>{metrics.caveat}</p>
  </div></details>;
}

/** The real-source workspace never falls back to the sample dashboard or a rolling date filter. */
export function RealWorkspaceView({ brandId, view, brands = [], onSelectBrand, onOpenSettings, onOpenSources }: RealWorkspaceViewProps) {
  const [data, setData] = useState<WorkspaceEvidence>(emptyEvidence);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [filters, setFilters] = useState<CreativeGalleryFilters>({});
  const [evidenceAdIds, setEvidenceAdIds] = useState<string[] | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [openAdId, setOpenAdId] = useState<string | null>(null);
  const [competitorBrandId, setCompetitorBrandId] = useState<string | null>(null);
  const [competitorGallery, setCompetitorGallery] = useState<CreativeGalleryResponse | null>(null);
  const [checkedAt,setCheckedAt] = useState<string | null>(null);
  useEffect(()=>{const timer=window.setInterval(()=>{if(document.visibilityState==="visible")setRefresh(value=>value+1);},60000);return()=>window.clearInterval(timer);},[]);
  const loadedBrand = useRef<string | null>(null);
  const currentBrand = useRef(brandId);
  const galleryRef = useRef<HTMLElement>(null);
  currentBrand.current = brandId;

  useEffect(() => { setFilters({}); setEvidenceAdIds(null); setShowGallery(false); setOpenAdId(null); }, [view]);

  useEffect(() => {
    let current = true;
    if (loadedBrand.current !== brandId) {
      setLoading(true); setData(emptyEvidence()); setUnavailable([]); setNotice(""); setActionError("");
      setFilters({}); setEvidenceAdIds(null); setShowGallery(false); setOpenAdId(null); setCompetitorBrandId(null); setCompetitorGallery(null);
      loadedBrand.current = brandId;
    }
    const base = `/api/brands/${encodeURIComponent(brandId)}/demo`;
    void Promise.allSettled([
      api<BrandDemoReport>(base), api<CreativeGalleryResponse>(`${base}/creatives`),
      api<CreatorResearchSnapshot>(`/api/creator-research?${new URLSearchParams({ brandId })}`),
      api<BrandResearch | null>(`/api/brand-research?${new URLSearchParams({ brandId })}`),
      api<DemoCollectionSnapshot>(`/api/demo-collection?${new URLSearchParams({ brandId })}`),
    ]).then(results => {
      if (!current) return;
      const value = <T,>(result: PromiseSettledResult<T>): T | null => result.status === "fulfilled" ? result.value : null;
      setData({ report: value(results[0]), gallery: value(results[1]), creators: value(results[2]), research: value(results[3]), competitors: value(results[4]) });
      setUnavailable(results.flatMap((result, index) => result.status === "rejected" ? [`${["report", "creatives", "creators", "website", "competitors"][index]}: ${result.reason instanceof Error ? result.reason.message : "Saved source could not be read"}`] : []));
      setCheckedAt(new Date().toISOString()); setLoading(false);
    });
    return () => { current = false; };
  }, [brandId, refresh]);

  const competitorRunning = data.competitors?.competitors.some(competitor => activeCollectionStates.has(competitor.status)) ?? false;
  useEffect(() => {
    if (!competitorRunning) return;
    let current = true;
    const timer = window.setInterval(() => {
      void api<DemoCollectionSnapshot>(`/api/demo-collection?${new URLSearchParams({ brandId })}`).then(result => {
        if (current && currentBrand.current === brandId) setData(existing => ({ ...existing, competitors: result }));
      }).catch(() => {});
    }, 3000);
    return () => { current = false; window.clearInterval(timer); };
  }, [brandId, competitorRunning]);

  const competitorCounts = data.competitors?.competitors.map(competitor => `${competitor.brandId}:${competitor.collectedCount}:${competitor.analysedCount}`).join("|") || "";
  useEffect(() => {
    if (!competitorBrandId) { setCompetitorGallery(null); return; }
    let current = true;
    void api<CreativeGalleryResponse>(`/api/brands/${encodeURIComponent(competitorBrandId)}/demo/creatives`).then(result => {
      if (current) setCompetitorGallery(result);
    }).catch(() => { if (current) setActionError("These competitor creatives could not be loaded. Refresh to try again."); });
    return () => { current = false; };
  }, [competitorBrandId, competitorCounts]);

  const creatives = data.gallery?.creatives || [];
  const snapshot = workspaceEvidence(creatives);
  const brandName = data.gallery?.brand.name || data.report?.brand.name || data.creators?.brandName || "This brand";
  const collected = data.gallery?.collectedAdsCount ?? (data.report ? data.report.analysedAdsCount + data.report.sample.excludedUnanalysed : null);
  const analysed = data.gallery?.analysedAdsCount ?? data.report?.analysedAdsCount ?? null;
  const stored = data.gallery?.storedMediaCount ?? null;
  const creators = useMemo(() => (data.creators?.candidates || []).filter(creator => creatorEligibility(creator).status === "eligible"), [data.creators]);
  const attributedCreators = data.creators?.seeds || [];
  const detail = creatives.find(creative => creative.adId === openAdId) || null;
  useEffect(()=>{
    function syncDetail() {
      const route=resolveNavigation(window.location.href);
      const target=route.brandId===brandId ? creatives.find(creative=>creative.adId===route.adId||creative.nativeId===route.adId):null;
      setOpenAdId(target?.adId || null);
    }
    syncDetail();window.addEventListener("popstate",syncDetail);window.addEventListener(NAVIGATION_EVENT,syncDetail);
    return()=>{window.removeEventListener("popstate",syncDetail);window.removeEventListener(NAVIGATION_EVENT,syncDetail);};
  },[data.gallery,brandId]);
  function selectCreative(id:string|null) {if(id)openCreativeRoute(id,brandId);else closeCreativeRoute(brandId);}


  function revealGallery(next: CreativeGalleryFilters = {}, supporting?: DemoGalleryCreative[]) {
    setFilters(next); setEvidenceAdIds(supporting ? supporting.map(creative => creative.adId) : null); setShowGallery(true);
    window.setTimeout(() => galleryRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
  }
  function openCreative(adId: string) {
    const creative = creatives.find(value => value.adId === adId || value.nativeId === adId);
    if (creative) selectCreative(creative.adId);
  }
  function AdReferences({ ads, limit = 5 }: { ads: DemoGalleryCreative[]; limit?: number }) {
    return <div className="rws-ad-references">{ads.slice(0, limit).map(ad => <button key={ad.adId} className="rws-source" type="button" onClick={() => openCreative(ad.adId)}>Ad {ad.nativeId}</button>)}{ads.length > limit && <button className="rws-source" type="button" onClick={() => revealGallery({}, ads)}>View all {ads.length} supporting ads</button>}</div>;
  }
  function PatternSummary({ title, patterns, field }: { title: string; patterns: DemoPattern[]; field: "hookType" | "angle" | "offerType" | "format"; options?: readonly (readonly [string, string])[] }) {
    return <PatternDistribution title={title} patterns={patterns} legacyPatterns={data.report?.legacyPatterns?.[field]} coverage={data.report?.patternCoverage?.[field]} totalAnalysed={data.report?.analysedAdsCount || 0} onSelect={(pattern, basis) => {
      const matching = creatives.filter(creative => pattern.evidence.some(source => source.adId === creative.adId || source.adId === creative.nativeId || Boolean(source.sourceUrl && source.sourceUrl === creative.sourceUrl)));
      if (basis === "legacy") revealGallery({}, matching); else revealGallery({ [field]: pattern.value });
    }} renderSources={pattern => <AdReferences ads={creatives.filter(creative => pattern.evidence.some(source => source.adId === creative.adId || source.adId === creative.nativeId || Boolean(source.sourceUrl && source.sourceUrl === creative.sourceUrl)))} limit={3} />} action={onOpenSettings && <a className="evidence-pattern-action" href={`/?${new URLSearchParams({ view: "settings", brandId })}#pattern-labels`}>Update pattern labels</a>} />;
  }

  function showPatternAds(pattern: DemoPattern, basis: "canonical" | "legacy" = "legacy", dimension: "format" | "hookType" | "angle" | "offerType" = "angle") {
    const matching = creatives.filter(creative => pattern.evidence.some(source => source.adId === creative.adId || source.adId === creative.nativeId || Boolean(source.sourceUrl && source.sourceUrl === creative.sourceUrl)));
    if (basis === "canonical") revealGallery({ [dimension]: pattern.value }); else revealGallery({}, matching);
  }

  async function runWebsiteResearch() {
    const requestedBrand = brandId;
    setBusy("website"); setActionError(""); setNotice("");
    try {
      const result = await api<BrandResearch>("/api/brand-research", { brandId });
      if (currentBrand.current === requestedBrand) { setData(current => ({ ...current, research: result })); setNotice("Website research saved."); }
    } catch (error) { if (currentBrand.current === requestedBrand) setActionError(error instanceof Error ? error.message : "Website research could not finish. Earlier evidence was preserved."); }
    finally { if (currentBrand.current === requestedBrand) setBusy(null); }
  }
  async function collectCompetitors(competitorId?: string) {
    const requestedBrand = brandId;
    setBusy(competitorId || "competitors"); setActionError(""); setNotice("");
    try {
      await api("/api/demo-collection/start", { brandId, ...(competitorId ? { competitorId } : {}) });
      const snapshot = await api<DemoCollectionSnapshot>(`/api/demo-collection?${new URLSearchParams({ brandId })}`);
      if (currentBrand.current === requestedBrand) { setData(current => ({ ...current, competitors: snapshot })); setNotice("Competitor collection started. Counts update as source evidence is stored."); }
    } catch (error) { if (currentBrand.current === requestedBrand) setActionError(error instanceof Error ? error.message : "Competitor collection could not start. Existing evidence was preserved."); }
    finally { if (currentBrand.current === requestedBrand) setBusy(null); }
  }
  function collectionStatus(status: string) {
    const labels: Record<string, string> = { "not-started": "Not collected", queued: "Queued", collecting: "Collecting ads", preparing: "Preparing media", analysing: "Analysing creatives", complete: "Complete", paused: "Paused", interrupted: "Interrupted", failed: "Needs attention" };
    return labels[status] || status.replaceAll("-", " ");
  }
  function snapshotSection() {
    return <section className="rws-section m1-snapshot" aria-label="Stored evidence summary"><h2>Stored source evidence</h2><p><strong>Observed</strong> · {creatives.length} ads in this sample · {date(snapshot.from)} to {date(snapshot.lastCheck)}. Last successful source check: {date(snapshot.lastCheck)}.</p><p>Activity status is known for {snapshot.activeKnown} of {creatives.length} ads. Activity describes the recorded capture, not current delivery. Creative interpretations are modelled and have not passed the 200-ad client validation gate.</p><div className="m1-evidence-actions">{[["Active at capture", snapshot.activeKnown ? snapshot.active : null], ["Launched in the recorded week", snapshot.startsKnown ? snapshot.launched : null], ["Stopped in the recorded week", snapshot.stopsKnown ? snapshot.stopped : null]].map(([label, ads]) => <button type="button" className="button secondary" key={String(label)} disabled={!Array.isArray(ads)} onClick={() => Array.isArray(ads) && revealGallery({}, ads as DemoGalleryCreative[])}>{String(label)}: {Array.isArray(ads) ? ads.length : "Unavailable"}</button>)}</div><p>Recorded week: {date(snapshot.weekFrom)} to {date(snapshot.lastCheck)}. Start dates known for {snapshot.startsKnown} ads; stop dates known for {snapshot.stopsKnown}. Missing dates are unavailable, not zero changes.</p></section>;
  }
  function gallerySection() {
    const supportingCreatives = evidenceAdIds ? creatives.filter(creative => evidenceAdIds.includes(creative.adId)) : creatives;
    return <section id="workspace-creatives" ref={galleryRef} className="rws-gallery-section" aria-label="Creative library">
      {view !== "ads" && <SectionTitle title="Creatives" />}
      {evidenceAdIds && <div className="rws-brand-actions"><p className="rws-secondary">Showing {supportingCreatives.length} supporting ads.</p><button type="button" className="rws-source" onClick={() => revealGallery({})}>Show all collected ads</button></div>}
      {data.gallery && creatives.length ? <CreativeGallery brandControl={<label>Brand<select aria-label="Brand" value={brandId} onChange={event => onSelectBrand?.(event.target.value)}>{brands.length ? brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>) : <option value={brandId}>{brandName}</option>}</select></label>} creatives={supportingCreatives} filters={filters} onFiltersChange={setFilters} openAdId={openAdId} onOpenAd={selectCreative} />
        : data.gallery ? <Empty title="No source creatives collected yet" action={onOpenSettings} actionLabel="Collect or prepare source ads">Collected ads and their available media appear here. No sample creatives are substituted.</Empty>
        : <Empty title="Creatives are temporarily unavailable" action={() => setRefresh(value => value + 1)} actionLabel="Refresh creative data">Your saved sources have not been replaced with sample content.</Empty>}
    </section>;
  }

  if (loading) return <div className="rws-loading" role="status"><LoaderCircle size={18} className="spin" />Loading saved source evidence…</div>;
  return <div className="real-workspace-view">
    <div className="rws-page-tools"><span className="rws-source-note">Auto-refresh every minute{checkedAt ? ` · checked ${new Date(checkedAt).toLocaleTimeString("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit"})}` : ""} · source dates retained</span><button type="button" className="rws-secondary-button" onClick={() => setRefresh(value => value + 1)} disabled={Boolean(busy)}><RefreshCw size={14} />Refresh</button></div>
    {resolveNavigation(window.location.href).id==="creative" && !detail && <Unavailable reason="This ad is not available in the selected workspace." unlock="Choose an ad from the stored Creative library." href={`/?${new URLSearchParams({view:"creatives",brandId})}`} linkLabel="Creatives"/>}
    {notice && <p className="rws-notice" role="status">{notice}</p>}
    {actionError && <p className="rws-error" role="alert">{actionError}</p>}

    <nav className="rws-section-nav" aria-label="Evidence workflow">{[["overview", "Creative overview"], ["ads", "Creative library"], ["competitors", "Competitor comparison"], ["audiences", "Audience & voice"]].map(([page,label]) => <a key={page} href={`/?${new URLSearchParams({view:page,brandId})}`} aria-current={view===page?"page":undefined}>{label}</a>)}</nav>

    {["overview", "ads", "brand", "competitors"].includes(view) && snapshotSection()}
    {view === "overview" && <>
      <section className="rws-kpis" aria-label="Workspace counts">
        {[
          ["Ads collected", collected, () => revealGallery({})], ["Ads analysed", analysed, () => revealGallery({}, creatives.filter(creative => Boolean(creative.analysis)))],
          ["Stored creatives", stored, () => revealGallery({}, creatives.filter(creative => creative.mediaAvailable))], ["Attributed creators", data.creators ? data.creators.seeds.length : null, () => revealGallery({}, creatives.filter(creative => Boolean(creative.partnershipAttribution)))],
        ].map(([label, value, action]) => <article className="rws-kpi" key={String(label)}><span>{String(label)} · Observed</span><strong>{numeric(value as number | null)}</strong>{typeof action === "function" && <button type="button" className="rws-source" onClick={action as () => void}>View evidence<ChevronRight size={13} /></button>}</article>)}
      </section>
      {data.report ? <section className="rws-section" id="creative-landscape"><SectionTitle title="Creative landscape" maturity="Beta"><p className="rws-secondary">A visual breakdown of the saved analyses, with the full sample represented.</p></SectionTitle><CreativeLandscape report={data.report} onSelect={showPatternAds} /></section>
        : <Empty title="Creative analysis is unavailable" action={() => setRefresh(value=>value+1)} actionLabel="Refresh analyses">Collected ads and saved source evidence remain available in the content library.</Empty>}
      <OwnedResults brandId={brandId} onSources={onOpenSources} />
      {data.report && <CreativeNextSteps report={data.report} onEvidence={pattern=>showPatternAds(pattern)} />}
      <details className="rws-coverage-disclosure"><summary>Source coverage, media & collection dates</summary><section className="rws-section"><p>{data.gallery?.dateRange.from || data.gallery?.dateRange.to ? `Source observations: ${date(data.gallery?.dateRange.from)} to ${date(data.gallery?.dateRange.to)}.` : "Capture dates are not available yet."}</p>
        {data.gallery ? <><SampleEvidenceCharts gallery={data.gallery} onSelect={ads => revealGallery({}, ads)} /><ObservationDatesChart creatives={creatives} onSelect={ads => revealGallery({}, ads)} /></> : <p className="rws-secondary">Source coverage is unavailable. Refresh the saved data to retry.</p>}
      </section></details>
      {data.report && <section className="rws-section" id="creative-scores"><SectionTitle title="Scores & subscore explanations" /><ScoreBreakdown scores={data.report.scores} onAd={openCreative} /></section>}
      {showGallery && gallerySection()}
    </>}

    {view === "audiences" && <><AudienceVoiceInsights brandId={brandId} creatives={creatives} onSelect={ads=>revealGallery({},ads)} />{showGallery && gallerySection()}</>}

    {view === "ads" && <><OwnedResults brandId={brandId} onSources={onOpenSources} />{gallerySection()}</>}

    {view === "formats" && <>
      <section className="rws-section"><SectionTitle title="Formats" />{data.gallery && <SampleEvidenceCharts gallery={data.gallery} onSelect={ads => revealGallery({}, ads)} />}<div className="rws-media-formats">{(["video", "image", "carousel", "unknown"] as const).map(kind => {
        const matches = creatives.filter(creative => creative.mediaKind === kind);
        return <article key={kind}><h3>{mediaLabels[kind]}</h3><strong className="rws-format-count">{data.gallery ? matches.length : "Not available"}</strong><p>{matches.filter(creative => creative.analysis).length} analysed</p>{matches.length > 0 && <><AdReferences ads={matches} limit={2} /><button type="button" className="rws-source" onClick={() => revealGallery({ mediaKind: kind })}>View {matches.length} {kind === "unknown" ? "source ads" : `${kind} ads`}<ChevronRight size={13} /></button></>}</article>;
      })}</div></section>
      {data.report && <section className="rws-section"><SectionTitle title="Creative production formats" maturity="Beta" /><PatternSummary title="Supported classifications" patterns={data.report.patterns.format} field="format" options={FORMAT_OPTIONS} /></section>}
      {!creatives.length && <Empty title="No source creatives to compare yet" action={onOpenSettings} actionLabel="Collect source ads">Format counts and examples appear when ads are collected.</Empty>}
      {showGallery && gallerySection()}
    </>}

    {view === "brand" && <>
      <section className="rws-section"><h2>Brand workspaces</h2><div className="m1-evidence-actions">{brands.map(brand => <button type="button" className="button secondary" key={brand.id} onClick={() => onSelectBrand?.(brand.id)}>{brand.name}{brand.id === brandId ? " · Selected" : " · Open stored evidence"}</button>)}</div></section>
      {gallerySection()}
      <section className="rws-section"><SectionTitle title={brandName}><p className="rws-secondary">Published website positioning, offers and claims.</p></SectionTitle>
        <div className="rws-brand-actions"><button className="rws-primary-button" type="button" disabled={Boolean(busy)} onClick={() => void runWebsiteResearch()}>{busy === "website" ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}{busy === "website" ? "Researching website…" : data.research || data.report?.website.status === "available" ? "Refresh website research" : "Research brand website"}</button>{safeHref(data.research?.domain ? `https://${data.research.domain}` : data.report?.website.url) && <ExternalSource url={data.research?.domain ? `https://${data.research.domain}` : data.report?.website.url}>Open brand website</ExternalSource>}</div>
        {data.research ? <><p className="rws-secondary">Observed {date(data.research.observedAt)}.</p><dl className="rws-brand-facts">{data.research.facts.map((fact, index) => <div key={`${fact.label}-${index}`}><dt>{fact.label}</dt><dd><p>{fact.value}</p><ExternalSource url={fact.sourceUrl}>Website source</ExternalSource><small>{fact.kind === "brand_claim" ? "Publisher claim" : "Website observation"}</small></dd></div>)}</dl>{data.research.socialProfiles.length > 0 && <div className="rws-brand-socials"><h3>Published social profiles</h3>{data.research.socialProfiles.map(profile => <ExternalSource key={profile.url} url={profile.url}>{profile.platform}</ExternalSource>)}</div>}</>
          : data.report?.website.status === "available" ? <><p className="rws-secondary">Website evidence observed {date(data.report.website.fetchedAt)}. Refresh research to build the full brand profile.</p><ul className="rws-website-excerpts">{data.report.website.excerpts.map((source, index) => <li key={index}><blockquote>{source.quote}</blockquote><ExternalSource url={source.sourceUrl}>Website source</ExternalSource></li>)}</ul></>
            : <Empty title="Website research has not been collected">Use Research brand website to save the brand's actual public positioning.</Empty>}
      </section>
      {data.research && <section className="rws-section"><SectionTitle title="Research sources" /><div className="rws-source-cards">{data.research.sources.map(source => <article key={source.id}><h3>{source.title}</h3><p>{source.textExcerpt || "No public excerpt was retained."}</p><ExternalSource url={source.url}>Open source</ExternalSource><small>Observed {date(source.observedAt)}</small></article>)}</div></section>}
    </>}

    {view === "creators" && <section className="rws-section"><SectionTitle title="Creators" maturity="Beta"><p className="rws-secondary">Instagram recommendations require more than 40,000 observed followers. Ad attributions are separate evidence.</p></SectionTitle>
      {data.creators && <CreatorEvidenceCharts snapshot={data.creators} />}
      <div className="evidence-creator-section"><h3>Eligible Instagram recommendations</h3><p>Only dated, verified Instagram profiles above 40,000 followers appear here.</p></div>
      {creators.length ? <div className="rws-creator-list">{creators.map(creator => <article key={creator.id} className="rws-creator"><div className="rws-creator-heading"><div><h3>{creator.handle ? `@${creator.handle.replace(/^@/, "")}` : creator.displayName}</h3><p className="rws-secondary">{creator.seedEvidence.length ? "Meta branded-content attribution" : "Collected public profile"}{creator.shortlisted ? " · Shortlisted" : ""}</p></div><ExternalSource url={creator.profile?.profileUrl || creator.profileUrl}>Open profile</ExternalSource></div>
        {creator.seedEvidence.length > 0 && <div className="rws-creator-ads"><h4>Appears in these ads</h4>{creator.seedEvidence.map(source => {
          const match = creatives.find(creative => creative.adId === source.adId || creative.nativeId === source.providerAdId);
          return match ? <button className="rws-source" type="button" key={`${source.adId}:${source.partnerPageId}`} onClick={() => openCreative(match.adId)}>Ad {source.providerAdId || source.adId}</button>
            : <ExternalSource key={`${source.adId}:${source.partnerPageId}`} url={source.adUrl}>Ad {source.providerAdId || source.adId}</ExternalSource>;
        })}</div>}
        <dl className="rws-creator-metrics"><div><dt>Observed followers</dt><dd>{numeric(creator.profile?.followers)}</dd></div><div><dt>Public posts sampled</dt><dd>{creator.profile ? creator.metrics.postsSampled : "Not collected"}</dd></div><div><dt>Observed</dt><dd>{date(creator.metrics.observedAt)}</dd></div></dl>
        {creator.fit?.status === "complete" ? <div><p>Category relevance: <strong>{creator.fit.categoryRelevance}</strong>. Tone fit: <strong>{creator.fit.toneFit}</strong>.</p><p>{creator.fit.reason}</p><div className="rws-ad-references">{creator.fit.evidencePostUrls.map((url, index) => <ExternalSource key={url} url={url}>Example post {index + 1}</ExternalSource>)}</div></div> : <p className="rws-secondary">Fit has not been assessed.</p>}
        {creator.profile && <><CreatorRates creator={creator} /><ul className="rws-recent-posts">{creator.profile.recentPosts.slice(0, 3).map(post => <li key={post.id}><ExternalSource url={post.url}>Post {post.id}</ExternalSource><p>{post.caption || "Caption unavailable"}</p><small>Views {numeric(post.views)} · Likes {numeric(post.likes)} · Comments {numeric(post.comments)}</small></li>)}</ul></>}
      </article>)}</div> : <Empty title="No verified Instagram recommendations yet" action={onOpenSettings} actionLabel="Research Instagram creators">Collect public Instagram profiles to verify follower counts. Unknown counts and profiles at 40,000 or below do not meet the requirement.</Empty>}
      {onOpenSettings && creators.length > 0 && <button className="rws-secondary-button" type="button" onClick={onOpenSettings}>Research public profiles<ChevronRight size={14} /></button>}
      {attributedCreators.length > 0 && <div className="evidence-creator-section"><h3>Source ad attributions</h3><p>These credits confirm appearances in collected ads. They do not by themselves verify Instagram follower counts.</p><div className="rws-source-cards">{attributedCreators.map(creator => <article key={creator.id}><h4>{creator.displayName}</h4><ExternalSource url={creator.profileUrl}>Attributed public profile</ExternalSource><div className="rws-ad-references">{creator.seedEvidence.map(source => { const match = creatives.find(creative => creative.adId === source.adId || creative.nativeId === source.providerAdId); return match ? <button className="rws-source" type="button" key={source.adId} onClick={() => openCreative(match.adId)}>Ad {source.providerAdId || source.adId}</button> : <ExternalSource key={source.adId} url={source.adUrl}>Ad {source.providerAdId || source.adId}</ExternalSource>; })}</div><p className="rws-secondary">{creatorEligibility(creator).status === "eligible" ? "Instagram follower requirement verified." : "Instagram follower eligibility remains unverified by this ad credit."}</p></article>)}</div></div>}
    </section>}

    {view === "competitors" && <>
      <CompetitorComparison brandId={brandId} report={data.report} competition={data.competitors} onExplore={id=>{if(id===brandId)revealGallery({});else {setCompetitorBrandId(id);window.setTimeout(()=>document.getElementById("competitor-creatives")?.scrollIntoView({behavior:"smooth",block:"start"}),0);}}} />
      {showGallery && gallerySection()}
      <section id="competitor-collection" className="rws-section"><SectionTitle title="Competitors" maturity="Beta"><p className="rws-secondary">Public collection and creative analysis for the requested comparison brands.</p></SectionTitle>
        <div className="rws-brand-actions"><button className="rws-primary-button" type="button" disabled={Boolean(busy) || competitorRunning || data.competitors?.hosted === false} onClick={() => void collectCompetitors()}>{busy || competitorRunning ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}{competitorRunning ? "Collecting competitor ads…" : "Collect competitor ads"}</button>{data.competitors?.hosted === false && <span className="rws-secondary">Collection is available in the hosted app.</span>}</div>
        {data.competitors?.competitors.length ? <div className="rws-competitors">{data.competitors.competitors.map(competitor => <article key={competitor.id}><div className="rws-competitor-heading"><h3>{competitor.name}</h3><span className="rws-status">{collectionStatus(competitor.status)}</span></div><ExternalSource url={`https://${competitor.domain}`}>{competitor.domain}</ExternalSource><dl className="rws-competitor-counts"><div><dt>Ads collected</dt><dd>{competitor.collectedCount}</dd></div><div><dt>Stored creatives</dt><dd>{competitor.storedCount}</dd></div><div><dt>Analysed</dt><dd>{competitor.analysedCount}</dd></div></dl><div className="rws-competitor-actions">{competitor.brandId && competitor.collectedCount > 0 && <button className="rws-secondary-button" type="button" onClick={() => setCompetitorBrandId(competitor.brandId)}>View collected ads<ChevronRight size={14} /></button>}{!activeCollectionStates.has(competitor.status) && <button className="rws-source" type="button" disabled={Boolean(busy) || data.competitors?.hosted === false} onClick={() => void collectCompetitors(competitor.id)}>{competitor.collectedCount ? "Continue collection" : "Collect ads"}</button>}</div></article>)}</div>
          : <Empty title="Competitor ads have not been collected">Collect the requested comparison brands to see actual counts, creatives and analyses here.</Empty>}
      </section>
      {competitorBrandId && <section id="competitor-creatives" className="rws-section"><SectionTitle title={competitorGallery?.brand.name || "Competitor creatives"} />{competitorGallery ? <CreativeGallery creatives={competitorGallery.creatives} emptyAction={{ label: "Continue competitor collection", href: "#competitor-collection" }} /> : <p className="rws-secondary">Loading collected competitor ads…</p>}</section>}
    </>}

    <details className="rws-about"><summary><Info size={14} />About this data</summary><div><p>This workspace uses all saved real-source records. It does not apply the sample dashboard's rolling date filter.</p><p>Ad collection, stored media and completed analysis are separate counts. Missing metrics remain unavailable. Repeated source observations do not prove continuous delivery or ad performance.</p>{unavailable.length > 0 && <p>Some source sections could not be loaded: {unavailable.join(", ")}. Refresh to retry.</p>}</div></details>
    {detail && view !== "ads" && !showGallery && <CreativeAdDetail creative={detail} creatives={creatives} onClose={() => selectCreative(null)} onSelect={selectCreative} />}
  </div>;
}
