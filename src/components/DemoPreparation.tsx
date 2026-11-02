import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { Brand } from "../../shared/types";
import type { CreatorResearchSnapshot, CreatorPlatform } from "../../shared/creator-research";
import "./demo-preparation.css";

/** Explicit operator actions live here; the client report never starts paid work. */
export function DemoPreparation({ brandId }: { brandId: string }) {
  const [snapshot, setSnapshot] = useState<CreatorResearchSnapshot | null>(null);
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("GB");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<CreatorPlatform>("instagram");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const refresh = () => api<CreatorResearchSnapshot>(`/api/creator-research?${new URLSearchParams({ brandId })}`).then(setSnapshot);
  useEffect(() => {
    let active = true;
    Promise.all([api<Brand[]>("/api/brands"), api<CreatorResearchSnapshot>(`/api/creator-research?${new URLSearchParams({ brandId })}`)])
      .then(([brands, result]) => { if (active) { const brand = brands.find(brand => brand.id === brandId); setCategory(brand?.domain.replace(/^www\./, "") === "ion8.co.uk" ? "Reusable bottles & hydration" : brand?.category || ""); setSnapshot(result); } })
      .catch(() => { if (active) setError("Demo preparation is unavailable. Try refreshing the page."); });
    return () => { active = false; };
  }, [brandId]);
  async function action(name: string, path: string, body: unknown, success: string) {
    if (busy) return;
    setBusy(name); setError(""); setMessage("");
    try { await api(path, body); await refresh(); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "This preparation did not finish; previous evidence was preserved."); }
    finally { setBusy(""); }
  }
  function search(event: FormEvent) {
    event.preventDefault();
    void action("search", "/api/creator-research/search", { brandId, platform, country, category, ...(query.trim() ? { query: query.trim() } : {}) }, "Public creator search saved. Review actual profile evidence before shortlisting.");
  }
  return <section className="demo-preparation" aria-labelledby="demo-preparation-title">
    <header><div><span className="demo-preparation-badge">Beta</span><h2 id="demo-preparation-title">Prepare the brand demo</h2></div><a className="button secondary" href={`/demo/${encodeURIComponent(brandId)}`} target="_blank" rel="noopener noreferrer">Open read-only client view</a></header>
    <p>For {snapshot?.brandName || "the selected brand"}. The client view reads saved evidence. These buttons explicitly collect sources or run budgeted research.</p>
    {error && <p className="demo-preparation-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <div className="demo-preparation-website"><div><strong>Brand website evidence</strong><p>Refresh the saved homepage excerpt used to ground opportunity briefs.</p></div><button className="button secondary" disabled={Boolean(busy)} onClick={() => void action("website", `/api/brands/${encodeURIComponent(brandId)}/demo/website`, {}, "Website evidence refreshed. Open the report to see the saved sources.")}>{busy === "website" ? "Refreshing…" : "Refresh website evidence"}</button></div>
    <form onSubmit={search}>
      <h3>Search public creators</h3>
      <p>Uses the data providers budget. Gemini fit checks below use the inference budget. Country/category are search criteria; they do not prove audience location.</p>
      {snapshot?.providerStatus.message && <p className="demo-preparation-note">{snapshot.providerStatus.message}</p>}
      <div className="demo-preparation-fields">
        <label>Platform<select value={platform} onChange={event => setPlatform(event.target.value as CreatorPlatform)}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select></label>
        <label>Country<input value={country} onChange={event => setCountry(event.target.value.toUpperCase())} minLength={2} maxLength={2} required placeholder="GB" /></label>
        <label>Category<input value={category} onChange={event => setCategory(event.target.value)} maxLength={160} required /></label>
        <label>Search terms (optional)<input value={query} onChange={event => setQuery(event.target.value)} maxLength={300} /></label>
      </div>
      <button className="button primary" disabled={Boolean(busy) || !snapshot?.providerStatus.configured}>{busy === "search" ? "Searching public profiles…" : "Run budgeted creator search"}</button>
    </form>
    <div className="demo-preparation-candidates">
      <h3>Saved candidates and Meta attribution seeds</h3>
      {!snapshot?.candidates.length && <p>No public creator profiles or attributed partners have been saved yet.</p>}
      {snapshot?.candidates.map(candidate => <article key={candidate.id}><div><strong>{candidate.displayName}</strong><p>{candidate.platform} · {candidate.profile?.followers === null || !candidate.profile ? "Followers unavailable" : `${candidate.profile.followers.toLocaleString()} observed followers`}</p>{candidate.profileUrl && <a href={candidate.profileUrl} target="_blank" rel="noopener noreferrer">Public profile</a>}</div><div className="demo-preparation-candidate-actions"><button className="button secondary" disabled={Boolean(busy) || !candidate.profile?.recentPosts.some(post => post.caption)} onClick={() => void action(`fit:${candidate.id}`, "/api/creator-research/fit", { brandId, candidateId: candidate.id }, "Fit assessment saved with example post evidence.")}>{busy === `fit:${candidate.id}` ? "Assessing…" : "Run Gemini fit check"}</button><button className="button secondary" disabled={Boolean(busy)} onClick={() => void action(`shortlist:${candidate.id}`, "/api/creator-research/shortlist", { brandId, candidateId: candidate.id, selected: !candidate.shortlisted }, "Shortlist updated.")}>{candidate.shortlisted ? "Remove from shortlist" : "Shortlist"}</button></div></article>)}
    </div>
  </section>;
}
