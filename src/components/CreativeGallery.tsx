import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Film, Image as ImageIcon, Layers, Play, Search, SlidersHorizontal, X } from "lucide-react";
import {
  filterGalleryCreatives,
  type CreativeGalleryFilters,
  type DemoGalleryCreative,
} from "../../shared/creative-gallery";
import { ANGLE_OPTIONS, AUDIO_TYPE_OPTIONS, CLAIM_TYPE_OPTIONS, FORMAT_OPTIONS, HOOK_TYPE_OPTIONS, OFFER_TYPE_OPTIONS } from "../../shared/creative-taxonomy";
import type { VideoTimestamp } from "../../shared/video-analysis";
import "./creative-gallery.css";

type AnyField = { value: unknown; timestamps?: VideoTimestamp[]; imageIndices?: number[] };
type Option = readonly [string, string];
export const galleryDisplayText = (value: unknown) => String(value ?? "").replace(/[\u2013\u2014]/g, "-");
export const galleryFieldLabel = (value: string | null | undefined, options: readonly Option[]) => options.find(([key]) => key === value)?.[1] || value || "Not labelled";
export const creativeMediaLabel = (creative: DemoGalleryCreative) => creative.mediaKind === "video"
  ? `Video${creative.durationSeconds == null ? "" : ` ${Math.round(creative.durationSeconds)}s`}`
  : creative.mediaKind === "carousel" ? `Carousel${creative.imageCount ? ` · ${creative.imageCount} slides` : ""}` : creative.mediaKind === "image" ? "Image" : "Format unconfirmed";
const usable = (value: unknown) => value !== undefined && value !== null && !["", "unknown", "unsure"].includes(String(value).trim().toLowerCase());
const fieldText = (field?: AnyField) => usable(field?.value) ? galleryDisplayText(field!.value) : "Not recorded";
const seconds = (time: number) => Number.isFinite(time) ? `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, "0")}` : "0:00";
function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(value)) : "Not available";
}
export function metaAdUrl(creative: Pick<DemoGalleryCreative, "nativeId" | "sourceUrl">) {
  if (/^\d+$/.test(creative.nativeId)) return `https://www.facebook.com/ads/library/?id=${creative.nativeId}`;
  try { const source = new URL(creative.sourceUrl || ""); return source.protocol === "https:" && !source.username && !source.password ? source.href : null; } catch { return null; }
}

function EvidenceTimes({ field, onSeek, onSlide }: { field: AnyField; onSeek: (time: number) => void; onSlide: (index: number) => void }) {
  return <span className="cg-evidence-times">
    {field.timestamps?.map((range, index) => <button key={index} type="button" className="cg-time" onClick={() => onSeek(range.startSeconds)} aria-label={`Play from ${seconds(range.startSeconds)}`}>{seconds(range.startSeconds)}-{seconds(range.endSeconds)}</button>)}
    {field.imageIndices?.map(index => <button key={index} type="button" className="cg-time" onClick={() => onSlide(index - 1)}>Image {index}</button>)}
  </span>;
}

export interface CreativeAdDetailProps {
  creative: DemoGalleryCreative;
  creatives: DemoGalleryCreative[];
  onClose: () => void;
  onSelect: (adId: string) => void;
}

export function CreativeAdDetail({ creative, creatives, onClose, onSelect }: CreativeAdDetailProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const [slide, setSlide] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const [time, setTime] = useState(0);
  const index = creatives.findIndex(item => item.adId === creative.adId);
  const previous = index > 0 ? creatives[index - 1] : null;
  const next = index >= 0 && index < creatives.length - 1 ? creatives[index + 1] : null;
  const source = metaAdUrl(creative);
  const analysis = creative.analysis;
  const fields = analysis?.fields;
  const videoFields = analysis?.mediaKind === "video" ? analysis.fields : null;
  const speech = videoFields && !["music-only", "silent"].includes(String(videoFields.audio_type?.value)) ? videoFields.spokenTranscript : [];
  const creatorEvidence = creative.creatorEvidence?.length ? creative.creatorEvidence : videoFields?.creatorEvidence || [];

  useEffect(() => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; active?.focus(); };
  }, []);
  useEffect(() => { setSlide(0); setMediaError(false); setTime(0); pendingSeek.current = null; }, [creative.adId]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.matches("input,textarea,select,[contenteditable='true']")) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" && previous) { event.preventDefault(); onSelect(previous.adId); }
      if (event.key === "ArrowRight" && next) { event.preventDefault(); onSelect(next.adId); }
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],video[controls],[tabindex='0']") || []).filter(element => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [creative.adId, previous?.adId, next?.adId, onClose, onSelect]);

  function seek(position: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(position)) return;
    const target = Math.max(0, position);
    pendingSeek.current = target;
    if (video.readyState >= 1) {
      video.currentTime = Number.isFinite(video.duration) ? Math.min(target, Math.max(0, video.duration - .05)) : target;
      setTime(video.currentTime); pendingSeek.current = null;
      void video.play().catch(() => {});
    }
  }
  function chooseSlide(position: number) { if (creative.imageUrls.length) setSlide(Math.max(0, Math.min(position, creative.imageUrls.length - 1))); }
  const annotation = (field?: AnyField) => field ? <><p>{fieldText(field)}</p><EvidenceTimes field={field} onSeek={seek} onSlide={chooseSlide} /></> : <p className="cg-muted">Not recorded</p>;

  return <div className="cg-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="cg-detail" role="dialog" aria-modal="true" aria-labelledby="cg-detail-title" ref={dialogRef}>
      <header className="cg-detail-header">
        <div><span className="cg-kicker">{creative.brandName}</span><h2 id="cg-detail-title">Ad {creative.nativeId}</h2></div>
        <div className="cg-detail-controls"><span className="cg-position">{index + 1} of {creatives.length}</span><button type="button" onClick={() => previous && onSelect(previous.adId)} disabled={!previous} aria-label="Previous ad" title="Previous ad (left arrow)"><ArrowLeft size={18} /></button><button type="button" onClick={() => next && onSelect(next.adId)} disabled={!next} aria-label="Next ad" title="Next ad (right arrow)"><ArrowRight size={18} /></button><button type="button" onClick={onClose} ref={closeRef} aria-label="Close ad detail"><X size={20} /></button></div>
      </header>
      <div className="cg-detail-layout">
        <div className="cg-detail-media-panel">
          <div className="cg-detail-media">
            {!mediaError && creative.mediaKind === "video" && creative.videoUrl ? <video key={creative.adId} ref={videoRef} controls preload="metadata" playsInline poster={creative.thumbnailUrl || undefined} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onLoadedMetadata={() => { if (pendingSeek.current !== null) seek(pendingSeek.current); }} onError={() => setMediaError(true)}><source src={creative.videoUrl} /></video>
              : !mediaError && creative.imageUrls.length ? <img src={creative.imageUrls[slide] || creative.imageUrls[0]} alt={`${creative.brandName} creative${creative.imageUrls.length > 1 ? `, slide ${slide + 1}` : ""}`} onError={() => setMediaError(true)} />
              : <div className="cg-media-empty"><ImageIcon size={28} /><strong>{mediaError ? "This creative could not be loaded" : "Creative media has not been retained"}</strong><p>You can still view the source ad and its available analysis.</p>{source && <a href={source} target="_blank" rel="noopener noreferrer">View original ad <ArrowUpRight size={14} /></a>}</div>}
          </div>
          {creative.mediaKind === "video" && creative.videoUrl && !mediaError && <p className="cg-player-position">{seconds(time)}{creative.durationSeconds == null ? "" : ` / ${seconds(creative.durationSeconds)}`}</p>}
          {creative.imageUrls.length > 1 && <div className="cg-slide-controls"><button type="button" onClick={() => chooseSlide(slide - 1)} disabled={slide === 0} aria-label="Previous slide"><ChevronLeft size={17} /></button><span>Slide {slide + 1} of {creative.imageUrls.length}</span><button type="button" onClick={() => chooseSlide(slide + 1)} disabled={slide === creative.imageUrls.length - 1} aria-label="Next slide"><ChevronRight size={17} /></button></div>}
          <div className="cg-detail-source"><span className="cg-format-badge">{creativeMediaLabel(creative)}</span>{source && <a href={source} target="_blank" rel="noopener noreferrer" className="cg-source-button">View in Meta Ad Library <ArrowUpRight size={15} /></a>}</div>
          <details className="cg-source-history"><summary>Source and running history</summary><dl><div><dt>Listed start</dt><dd>{date(creative.deliveryStartAt)}</dd></div><div><dt>Observed</dt><dd>{date(creative.observedAt)}</dd></div><div><dt>Days since listed start</dt><dd>{creative.daysRunning == null ? "Not available" : creative.daysRunning}</dd></div></dl><p>{creative.daysRunningBasis || "Delivery history is not available for this creative. A collection date does not establish continuous delivery."}</p></details>
          {creative.copy && <details className="cg-original-copy"><summary>Original ad copy</summary><p>{galleryDisplayText(creative.copy)}</p></details>}
        </div>
        <div className="cg-detail-analysis">
          {!fields ? <div className="cg-analysis-empty"><h3>Analysis not available yet</h3><p>This ad has been collected. Creative findings will appear after it is analysed.</p>{source && <a href={source} target="_blank" rel="noopener noreferrer">Open the original ad <ArrowUpRight size={14} /></a>}</div> : <>
            <div className="cg-analysis-overview"><h3>Creative analysis</h3><dl>
              <div><dt>Hook</dt><dd>{annotation(fields.hook)}{fields.hook_type && <span className="cg-chip">{galleryFieldLabel(String(fields.hook_type.value), HOOK_TYPE_OPTIONS)}</span>}</dd></div>
              <div><dt>Creative format</dt><dd>{galleryFieldLabel(String(fields.format.value), FORMAT_OPTIONS)}</dd></div>
              <div><dt>Angle</dt><dd>{galleryFieldLabel(String(fields.angle.value), ANGLE_OPTIONS)}{fields.angle_explanation && <p className="cg-muted">{fieldText(fields.angle_explanation)}</p>}</dd></div>
              <div><dt>Offer</dt><dd>{fields.offer_type ? galleryFieldLabel(String(fields.offer_type.value), OFFER_TYPE_OPTIONS) : "Not classified"}{annotation("offer" in fields ? fields.offer : fields.offer_explanation)}</dd></div>
              <div><dt>CTA</dt><dd>{annotation(fields.cta)}</dd></div>
            </dl></div>
            <section className="cg-analysis-section"><h3>Claims</h3>{fields.keyClaims.filter(claim => usable(claim.value)).length ? <ul className="cg-claim-list">{fields.keyClaims.filter(claim => usable(claim.value)).map((claim, claimIndex) => <li key={claimIndex}><p>{galleryDisplayText(claim.value)}</p><div className="cg-chips">{claim.claim_type?.map(type => <span className="cg-chip" key={type}>{galleryFieldLabel(type, CLAIM_TYPE_OPTIONS)}</span>)}{(claim.may_need_substantiation_asa || claim.claim_type?.some(type => type === "comparative" || type === "superlative")) && <span className="cg-review-flag">may need substantiation (ASA)</span>}</div><EvidenceTimes field={claim} onSeek={seek} onSlide={chooseSlide} /></li>)}</ul> : <p className="cg-muted">No supported claims recorded.</p>}</section>
            {videoFields && <section className="cg-analysis-section"><h3>Spoken transcript</h3>{videoFields.audio_type && <p className="cg-audio-type">{galleryFieldLabel(String(videoFields.audio_type.value), AUDIO_TYPE_OPTIONS)}{videoFields.music_lyrics_present?.value === true ? " · Song lyrics present, excluded from speech" : ""}</p>}{speech.filter(segment => usable(segment.value)).length ? <ol className="cg-transcript">{speech.filter(segment => usable(segment.value)).map((segment, segmentIndex) => <li key={segmentIndex}><EvidenceTimes field={segment} onSeek={seek} onSlide={chooseSlide} /><p>{galleryDisplayText(segment.value)}</p></li>)}</ol> : <p className="cg-muted">No spoken voiceover or on-camera speech recorded.</p>}</section>}
            <section className="cg-analysis-section"><h3>On-screen text</h3>{fields.onScreenText.filter(segment => usable(segment.value)).length ? <ol className="cg-transcript">{fields.onScreenText.filter(segment => usable(segment.value)).map((segment, segmentIndex) => <li key={segmentIndex}><EvidenceTimes field={segment} onSeek={seek} onSlide={chooseSlide} /><p>{galleryDisplayText(segment.value)}</p></li>)}</ol> : <p className="cg-muted">No supported on-screen text recorded.</p>}</section>
          </>}
          <section className="cg-analysis-section"><h3>UGC and creator evidence</h3><p className="cg-ugc-status">{creative.ugc === true ? "UGC classification supported by recorded evidence" : creative.ugc === false ? "Not classified as UGC" : "UGC origin is unconfirmed"}</p>
            {creative.partnershipAttribution && <div className="cg-creator-evidence"><strong>Branded-content credit: {creative.partnershipAttribution.name}</strong><p>Source: Meta branded-content attribution</p>{creative.partnershipAttribution.profileUrl && <a href={creative.partnershipAttribution.profileUrl} target="_blank" rel="noopener noreferrer">Creator profile <ArrowUpRight size={13} /></a>}{source && <a href={source} target="_blank" rel="noopener noreferrer">Source ad {creative.nativeId} <ArrowUpRight size={13} /></a>}</div>}
            {creatorEvidence.map((evidence, evidenceIndex) => <div className="cg-creator-evidence" key={evidenceIndex}><strong>{galleryDisplayText(evidence.value)}</strong><p>{evidence.source === "ad-library" ? "Source: ad-library attribution" : "Source: visible evidence in the creative"}</p><EvidenceTimes field={{ value: evidence.value, timestamps: evidence.timestamps }} onSeek={seek} onSlide={chooseSlide} />{evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">View evidence source <ArrowUpRight size={13} /></a>}</div>)}
            {!creatorEvidence.length && !creative.partnershipAttribution && <p className="cg-muted">No qualifying partnership credit or third-party creator handle has been recorded. A person on camera does not establish creator origin.</p>}
          </section>
        </div>
      </div>
      <footer className="cg-detail-footer"><span>Use left and right arrow keys to move between ads.</span><div><button type="button" disabled={!previous} onClick={() => previous && onSelect(previous.adId)}><ArrowLeft size={16} /> Previous ad</button><button type="button" disabled={!next} onClick={() => next && onSelect(next.adId)}>Next ad <ArrowRight size={16} /></button></div></footer>
    </div>
  </div>;
}

export interface CreativeGalleryProps {
  creatives: DemoGalleryCreative[];
  filters?: CreativeGalleryFilters;
  initialFilters?: CreativeGalleryFilters;
  onFiltersChange?: (filters: CreativeGalleryFilters) => void;
  openAdId?: string | null;
  onOpenAd?: (adId: string | null) => void;
  brandControl?: React.ReactNode;
  emptyAction?: { label: string; href: string };
}

export function CreativeGallery({ creatives, filters: controlledFilters, initialFilters, onFiltersChange, openAdId, onOpenAd, brandControl, emptyAction }: CreativeGalleryProps) {
  const [localFilters, setLocalFilters] = useState<CreativeGalleryFilters>(initialFilters || {});
  const [localOpenId, setLocalOpenId] = useState<string | null>(null);
  const [storedOnly, setStoredOnly] = useState(false);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const filters = controlledFilters || localFilters;
  const selectedId = openAdId === undefined ? localOpenId : openAdId;
  useEffect(() => { if (initialFilters) setLocalFilters(initialFilters); }, [initialFilters]);
  useEffect(() => { setFailedThumbnails(new Set()); }, [creatives]);
  const selected = creatives.find(creative => creative.adId === selectedId) || null;
  const ordered = useMemo(() => [...creatives].sort((left, right) => {
    const priority = (item: DemoGalleryCreative) => item.mediaAvailable ? item.analysis ? 2 : 1 : 0;
    return priority(right) - priority(left);
  }), [creatives]);
  const filtered = useMemo(() => filterGalleryCreatives(ordered, filters).filter(creative => !storedOnly || creative.mediaAvailable), [ordered, filters, storedOnly]);
  const optionValues = (key: "creativeFormat" | "hookType" | "angle" | "offerType") => [...new Set(creatives.map(creative => creative[key]).filter((value): value is string => Boolean(value)))].sort();
  function change(next: CreativeGalleryFilters) { setLocalFilters(next); onFiltersChange?.(next); }
  function select(adId: string | null) { setLocalOpenId(adId); onOpenAd?.(adId); }
  function dropdown(label: string, key: keyof CreativeGalleryFilters, values: string[], labels: readonly Option[] = []) {
    return <label>{label}<select aria-label={label} value={filters[key] || "all"} onChange={event => change({ ...filters, [key]: event.target.value === "all" ? undefined : event.target.value })}><option value="all">All {label.toLowerCase()}s</option>{values.map(value => <option key={value} value={value}>{galleryFieldLabel(value, labels)}</option>)}</select></label>;
  }
  const activeFilters = storedOnly || Object.values(filters).some(value => Boolean(value) && value !== "all");
  const detailSequence = selected && filtered.some(item => item.adId === selected.adId) ? filtered : ordered;
  function clearFilters() { setStoredOnly(false); change({}); }
  return <div className="creative-gallery">
    <div className="cg-filters" aria-label="Creative filters">
      {brandControl}
      {dropdown("Media format", "mediaKind", ["video", "image", "carousel", "unknown"], [["video", "Video"], ["image", "Image"], ["carousel", "Carousel"], ["unknown", "Unconfirmed"]])}
      {dropdown("Hook type", "hookType", optionValues("hookType"), HOOK_TYPE_OPTIONS)}
      {dropdown("Angle", "angle", optionValues("angle"), ANGLE_OPTIONS)}
      {dropdown("Offer type", "offerType", optionValues("offerType"), OFFER_TYPE_OPTIONS)}
      <label>UGC<select aria-label="UGC" value={filters.ugc || "all"} onChange={event => change({ ...filters, ugc: event.target.value === "all" ? undefined : event.target.value as CreativeGalleryFilters["ugc"] })}><option value="all">All creatives</option><option value="yes">Yes, supported</option><option value="no">No</option><option value="unknown">Unconfirmed</option></select></label>
      <label className="cg-search">Search creative text<span><Search size={16} /><input value={filters.search || ""} onChange={event => change({ ...filters, search: event.target.value })} placeholder="Transcript or on-screen text" aria-label="Search transcript and on-screen text" /></span></label>
    </div>
    <div className="cg-results-line"><span><SlidersHorizontal size={15} /> {filtered.length} of {creatives.length} {creatives.length === 1 ? "creative" : "creatives"}{filters.format && filters.format !== "all" && <span className="cg-chip">{galleryFieldLabel(filters.format, FORMAT_OPTIONS)}</span>}</span><div className="cg-availability"><label>Media<select aria-label="Media availability" value={storedOnly ? "stored" : "all"} onChange={event => setStoredOnly(event.target.value === "stored")}><option value="all">All collected</option><option value="stored">Stored and viewable</option></select></label>{activeFilters && <button type="button" onClick={clearFilters}>Clear filters <X size={14} /></button>}</div></div>
    {filtered.length ? <div className="cg-grid">{filtered.map(creative => {
      const source = metaAdUrl(creative);
      const chips = [creative.hookType ? galleryFieldLabel(creative.hookType, HOOK_TYPE_OPTIONS) : null, creative.angle ? galleryFieldLabel(creative.angle, ANGLE_OPTIONS) : null, creative.offerType ? galleryFieldLabel(creative.offerType, OFFER_TYPE_OPTIONS) : null].filter((value): value is string => Boolean(value));
      return <article className="cg-card" key={creative.adId}>
        <button className="cg-card-open" type="button" onClick={() => select(creative.adId)} aria-label={`Open ad ${creative.nativeId}`}>
          <div className="cg-thumbnail">
            {creative.thumbnailUrl && !failedThumbnails.has(creative.adId) ? <img loading="lazy" decoding="async" src={creative.thumbnailUrl} alt={`${creative.brandName} ad ${creative.nativeId}`} onError={() => setFailedThumbnails(current => new Set([...current, creative.adId]))} /> : <div className="cg-thumbnail-empty">{creative.mediaKind === "video" ? <Film size={28} /> : creative.mediaKind === "carousel" ? <Layers size={28} /> : <ImageIcon size={28} />}<span>{creative.mediaAvailable ? "Preview unavailable" : "View source creative"}</span></div>}
            <span className="cg-card-media-badge">{creativeMediaLabel(creative)}</span>
            {creative.mediaKind === "video" && creative.videoUrl && <span className="cg-play-icon" aria-hidden="true"><Play size={22} fill="currentColor" /></span>}
          </div>
          <div className="cg-card-content"><div className="cg-card-meta"><span>{creative.brandName}</span><span title={creative.daysRunningBasis || "Running history is not available"}>{creative.daysRunning == null ? "Running days unknown" : `${creative.daysRunning}d since listed start`}</span></div><h4>{creative.title && !/^.+ ad \d+$/.test(creative.title) ? galleryDisplayText(creative.title) : `Ad ${creative.nativeId}`}</h4><div className="cg-chips">{chips.length ? chips.map((chip, chipIndex) => <span className="cg-chip" key={chipIndex} title={chip}>{chip}</span>) : <span className="cg-unanalysed">{creative.analysis ? "Labels not recorded" : "Awaiting analysis"}</span>}</div></div>
        </button>
        <div className="cg-card-footer"><button type="button" onClick={() => select(creative.adId)}>View creative & analysis <ChevronRight size={14} /></button>{source && <a href={source} target="_blank" rel="noopener noreferrer" aria-label={`View ad ${creative.nativeId} in Meta Ad Library`} title="View in Meta Ad Library"><ArrowUpRight size={16} /></a>}</div>
      </article>;
    })}</div> : <div className="cg-empty"><ImageIcon size={26} /><h4>{creatives.length ? "No creatives match these filters" : "No collected creatives yet"}</h4><p>{creatives.length ? "Clear a filter or try a different search." : "Collect the brand's public ads to explore its creative evidence."}</p>{activeFilters ? <button type="button" onClick={clearFilters}>Clear filters</button> : emptyAction && <a href={emptyAction.href}>{emptyAction.label} <ArrowUpRight size={14} /></a>}</div>}
    {selected && <CreativeAdDetail creative={selected} creatives={detailSequence} onClose={() => select(null)} onSelect={select} />}
  </div>;
}
