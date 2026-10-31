import { useEffect, useState } from "react";
import { api } from "../lib/api";
interface Observation {
  native_id: string; observed_at: string; active_status: string;
  reach: { eu: { type: string; value: number | null }; locations: { type: string; value: unknown } };
  raw_payload: { page_name?: string; ad_creative_bodies?: string[] };
}
export function MetaCollectionPanel({ workspaceId }: { workspaceId: string }) {
  const [pageIds,setPageIds] = useState("");
  const [terms,setTerms] = useState("");
  const [countries,setCountries] = useState("GB");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [rows,setRows] = useState<Observation[]>([]);
  const [connected,setConnected] = useState(false);
  const [ready,setReady] = useState(false);
  useEffect(() => {
    let active = true;
    setRows([]); setPageIds(""); setTerms(""); setCountries("GB"); setMessage(""); setReady(false); setConnected(false);
    api<{ meta: { status: string }; database: string }>("/api/infrastructure/status").then(status => { if (active) { setConnected(status.meta.status === "configured"); setReady(status.database === "connected"); } }).catch(() => {});
    api<{ id: string; page_ids: string[]; search_terms: string[]; countries: string[] }[]>(`/api/public/meta/watchlists?workspaceId=${encodeURIComponent(workspaceId)}`).then(watches => {
      if (!active) return;
      const watch = watches.find(w => w.id === `${workspaceId}-meta`);
      if (watch) { setPageIds(watch.page_ids.join(", ")); setTerms(watch.search_terms.join("\n")); setCountries(watch.countries.join(", ")); }
    }).catch(() => {});
    return () => { active = false; };
  },[workspaceId]);
  async function collect() {
    setBusy(true); setMessage("");
    try {
      const watchlistId = `${workspaceId}-meta`;
      const response = await fetch(`/api/public/meta/watchlists/${encodeURIComponent(watchlistId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, pageIds: pageIds.split(/[\s,]+/).filter(Boolean), searchTerms: terms.split("\n").map(s => s.trim()).filter(Boolean), countries: countries.toUpperCase().split(/[\s,]+/).filter(Boolean) }) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Watchlist could not be saved."); }
      if (connected) {
        await api("/api/public/meta/collect",{ watchlistId });
        setMessage("Collection queued. The worker will collect every page and retain its progress.");
      } else setMessage("Watchlist saved. Meta not connected; add META_ACCESS_TOKEN to the web and worker environment settings when access is approved.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function load() {
    try { const result = await api<{ observations: Observation[] }>(`/api/public/meta/observations?workspaceId=${encodeURIComponent(workspaceId)}`); setRows(result.observations); setMessage(result.observations.length ? "Latest 100 observations shown; each run is retained separately." : "No Meta observations collected for this workspace yet."); }
    catch (error) { setMessage((error as Error).message); }
  }
  return <details style={{ marginBottom: 16 }}><summary>Meta public collection</summary>
    <p>Commercial ads delivered in the UK or EU are searchable for one year. Reach is observed public data, not conversions or sales. API collection does not download creative media.</p>
    {!ready && <p>Collection database unavailable. Configure DATABASE_URL and apply migrations to enable collection.</p>}
    <label>Advertiser page IDs (comma separated)<input value={pageIds} onChange={e => setPageIds(e.target.value)} placeholder="Numeric Meta page IDs" /></label>
    <label>Category searches (one per line)<textarea value={terms} onChange={e => setTerms(e.target.value)} /></label>
    <label>Reached countries<input value={countries} onChange={e => setCountries(e.target.value)} /></label>
    <button disabled={busy || !ready} onClick={() => void collect()}>{connected ? "Save watchlist and collect" : "Save watchlist"}</button>
    <button disabled={!ready} onClick={() => void load()}>Refresh observations</button>
    <p role="status">{message}</p>
    {rows.map(row => <article key={`${row.native_id}-${row.observed_at}`}>
      <a href={`https://www.facebook.com/ads/library/?id=${encodeURIComponent(row.native_id)}`} target="_blank" rel="noreferrer">{row.raw_payload.page_name || "Meta advertiser"} · {row.native_id}</a>
      <p>{row.raw_payload.ad_creative_bodies?.join(" ")}</p>
      <p>EU reach: {row.reach.eu.value === null ? "Unavailable" : `${row.reach.eu.value.toLocaleString()} (Observed)`}. Delivery status: {row.active_status}. Checked {new Date(row.observed_at).toLocaleString()}.</p>
      <details><summary>Reach by location · {row.reach.locations.type}</summary><pre>{JSON.stringify(row.reach.locations.value,null,2)}</pre></details>
    </article>)}
  </details>;
}
