import { useEffect, useRef, useState } from "react";
import { LABELLING_FIELDS, type BlindLabellingAd, type HumanCreativeLabels, type LabellingSession } from "../../shared/labelling";
import { api } from "../lib/api";
import "./labelling-tool.css";

interface Queue {
  items: BlindLabellingAd[];
  total: number;
  offset: number;
  limit: number;
}
const emptyLabels = () => Object.fromEntries(LABELLING_FIELDS.map(field => [field.key, ""])) as HumanCreativeLabels;

export function LabellingTool({ brandId }: { brandId: string }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [labeller, setLabeller] = useState("");
  const [session, setSession] = useState<LabellingSession | null>(null);
  const [reviewAd, setReviewAd] = useState<BlindLabellingAd | null>(null);
  const [labels, setLabels] = useState<HumanCreativeLabels>(emptyLabels);
  const [notes, setNotes] = useState("");
  const [sourceVideoUrl, setSourceVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const activeBrand = useRef(brandId);
  activeBrand.current = brandId;

  useEffect(() => {
    generation.current++;
    setOffset(0); setSelectedId(""); setSession(null); setReviewAd(null); setQueue(null);
    setLabels(emptyLabels()); setNotes(""); setSourceVideoUrl(""); setError(""); setMessage(""); setBusy(false);
  }, [brandId]);

  useEffect(() => {
    let active = true;
    setQueue(null);
    api<Queue>(`/api/labelling/queue?brandId=${encodeURIComponent(brandId)}&offset=${offset}`).then(result => {
      if (!active) return;
      setQueue(result); setSelectedId(current => result.items.some(ad => ad.id === current) ? current : result.items[0]?.id || "");
    }).catch(cause => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [brandId, offset]);

  const selected = queue?.items.find(ad => ad.id === selectedId) || null;
  const ad = session ? reviewAd : selected;
  const videoUrl = ad?.storedVideo ? `/api/video/media/${encodeURIComponent(ad.storedVideo.mediaId)}?brandId=${encodeURIComponent(brandId)}&adId=${encodeURIComponent(ad.id)}` : null;
  const scope = `brandId=${encodeURIComponent(brandId)}`;

  const run = async (action: () => Promise<void>) => {
    const revision = generation.current;
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (cause) { if (generation.current === revision) setError((cause as Error).message); }
    finally { if (generation.current === revision) setBusy(false); }
  };
  const start = () => void run(async () => {
    if (!selected) return;
    const requestedBrand = brandId;
    const result = await api<{ session: LabellingSession; ad: BlindLabellingAd }>("/api/labelling/sessions", { brandId, adId: selected.id, labeller });
    if (activeBrand.current !== requestedBrand) return;
    setSession(result.session); setReviewAd(result.ad); setLabels(emptyLabels()); setNotes("");
    setMessage("Review started. Watch the complete creative and choose all seven labels.");
  });
  const store = () => void run(async () => {
    if (!selected) return;
    const requestedBrand = brandId;
    const retained = await api<BlindLabellingAd>("/api/labelling/store-video", { brandId, adId: selected.id, ...(sourceVideoUrl.trim() ? { sourceVideoUrl: sourceVideoUrl.trim() } : {}) });
    if (activeBrand.current !== requestedBrand) return;
    setQueue(current => current && ({ ...current, items: current.items.map(item => item.id === retained.id ? retained : item) }));
    setSourceVideoUrl(""); setMessage("Video retained on the hosted disk. You can now start a review.");
  });
  const save = () => void run(async () => {
    if (!session) return;
    const requestedBrand = brandId;
    await api(`/api/labelling/sessions/${encodeURIComponent(session.id)}/labels`, { brandId, labels, notes });
    if (activeBrand.current !== requestedBrand) return;
    setQueue(current => current && ({ ...current, items: current.items.map(item => item.id === session.adId ? { ...item, completedReviews: item.completedReviews + 1 } : item) }));
    setSession(null); setReviewAd(null); setLabels(emptyLabels()); setNotes("");
    setMessage("Human review saved. You can choose another ad or start a separate repeat review.");
  });

  return <section className="labelling-tool" aria-labelledby="labelling-title">
    <header className="labelling-header">
      <div><p className="labelling-eyebrow">Human review</p><h2 id="labelling-title">Labelling tool</h2>
        <p>Review the original creative and ad copy. Model predictions and previous human labels are hidden here.</p></div>
      <div className="labelling-exports">
        <a href={`/api/labelling/export?${scope}`}>Export JSON</a>
        <a href={`/api/labelling/export?${scope}&format=csv`}>Export CSV</a>
      </div>
    </header>
    <aside className="labelling-draft"><strong>Guide is a draft for Benjamin’s review.</strong> Review and edit the definitions before starting the real label set. This tool does not certify approval. <a href="/api/labelling/guide" target="_blank" rel="noreferrer">Read the draft guide</a></aside>
    {error && <p className="labelling-error" role="alert">{error}</p>}
    {message && <p className="labelling-message" role="status">{message}</p>}
    <div className="labelling-toolbar">
      <label>Labeller name<input value={labeller} maxLength={120} autoComplete="name" placeholder="Your name" disabled={Boolean(session) || busy} onChange={event => setLabeller(event.target.value)} /></label>
      <label>Source ad<select aria-label="Source ad" value={selectedId} disabled={Boolean(session) || busy || !queue?.items.length} onChange={event => { setSelectedId(event.target.value); setSourceVideoUrl(""); setMessage(""); setError(""); }}>
        {!queue?.items.length && <option value="">{queue ? "No real source ads" : "Loading ads…"}</option>}
        {queue?.items.map(item => <option key={item.id} value={item.id}>{item.advertiser} · {item.id} · {item.completedReviews} {item.completedReviews === 1 ? "review" : "reviews"}</option>)}
      </select></label>
      <div className="labelling-pagination">
        <button type="button" disabled={Boolean(session) || busy || offset === 0} onClick={() => setOffset(current => Math.max(0, current - 50))}>Previous page</button>
        <span>{queue ? `${queue.total ? queue.offset + 1 : 0}-${Math.min(queue.offset + queue.limit, queue.total)} of ${queue.total}` : "Loading…"}</span>
        <button type="button" disabled={Boolean(session) || busy || !queue || offset + queue.limit >= queue.total} onClick={() => setOffset(current => current + 50)}>Next page</button>
      </div>
    </div>
    {queue && !queue.total && <p className="labelling-empty">This workspace has no real source ads to label. Import or collect original ads first; fictional demo ads are excluded.</p>}
    {ad && <div className="labelling-layout">
      <article className="labelling-source" aria-label="Original source creative">
        <div className="labelling-source-heading"><strong>{ad.advertiser}</strong><span>{ad.platform}</span></div>
        {videoUrl ? <video key={videoUrl} controls preload="metadata" src={videoUrl} aria-label="Retained source video" />
          : ad.imageUrl ? <img src={ad.imageUrl} alt="Original ad creative" /> : <p>No original creative is currently available.</p>}
        {ad.isVideo && !ad.storedVideo && <p className="labelling-caution">This is a video ad. Store its full source video before reviewing it; a thumbnail is insufficient.</p>}
        {ad.creativeKind === "unknown" && <p className="labelling-caution">This source may contain a dynamic or video creative. A thumbnail does not establish the complete ad. Retain the actual video or refresh source metadata to confirm a still image before reviewing.</p>}
        <h3>Ad copy</h3><p className="labelling-copy">{ad.copy || "No source ad copy was supplied."}</p>
        {ad.partnershipAttribution && <p>Ad-library partnership attribution: {ad.partnershipAttribution}</p>}
        {ad.sourceUrl && <a href={ad.sourceUrl} target="_blank" rel="noreferrer">Open original ad source</a>}
        {ad.storedVideo && <p className="labelling-hash">Video SHA-256: <code>{ad.storedVideo.sha256}</code></p>}
      </article>
      <div className="labelling-review">
        {!session ? <>
          <h3>Start a blind review</h3><p>Start a separate review for each judgement. Time taken is measured on the server from start to save, including pauses.</p>
          {ad.creativeKind !== "image" && <details className="labelling-store" open={!ad.storedVideo}>
            <summary>{ad.storedVideo ? "Verify or restore retained video" : "Retain the video first"}</summary>
            <p>The app downloads to its hosted media disk without running inference. A current approved video URL is needed if the disk has no copy.</p>
            <label>Current video URL (optional when already stored)<input type="password" value={sourceVideoUrl} autoComplete="off" placeholder="https://…" disabled={busy} onChange={event => setSourceVideoUrl(event.target.value)} /></label>
            <button type="button" onClick={store} disabled={busy}>{busy ? "Working…" : "Verify or store video"}</button>
          </details>}
          <button type="button" className="labelling-primary" onClick={start} disabled={busy || !labeller.trim() || ad.creativeKind === "unknown" || (ad.isVideo ? !ad.storedVideo : !ad.imageUrl)}>{busy ? "Working…" : "Start review"}</button>
        </> : <form onSubmit={event => { event.preventDefault(); save(); }}>
          <h3>Record your judgement</h3><p>Choose Unsure when the evidence is insufficient. For a video, watch it to the end with sound. Opening hook refers to the first three seconds.</p>
          <div className="labelling-fields">{LABELLING_FIELDS.map(field => <label key={field.key}>{field.label}<select aria-label={field.label} required value={labels[field.key]} disabled={busy} onChange={event => setLabels(current => ({ ...current, [field.key]: event.target.value }))}>
            <option value="">Choose a label…</option>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>)}</div>
          <p className="labelling-caution">A person on camera or a casual filming style does not prove UGC. Select UGC only with qualifying creator evidence.</p>
          <label>Notes (optional)<textarea maxLength={4000} rows={4} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} placeholder="Record uncertainty, visible evidence and useful timestamps." /></label>
          <div className="labelling-actions"><button className="labelling-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save human labels"}</button>
            <button type="button" disabled={busy} onClick={() => { setSession(null); setReviewAd(null); setLabels(emptyLabels()); setNotes(""); setMessage("Review ended without saving labels."); }}>End without saving</button></div>
        </form>}
      </div>
    </div>}
  </section>;
}
