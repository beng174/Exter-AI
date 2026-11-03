import { useState, type ReactNode } from "react";
import { treemap } from "../../shared/creative-insights";
import "./population-chart.css";

export interface PopulationRow { id: string; label: string; value: number; muted?: boolean; detail?: string; onSelect?: () => void }
const colours = ["#087F88", "#0C1F96", "#526DC2", "#755F9A", "#476E65", "#8C651D", "#50627A", "#A04936"];
const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
export function PopulationChart({ title, rows, total, description, compact = false, unit = "ads", allowMap = true, footer, emptyText = "No saved observations yet." }: {
  title: string; rows: PopulationRow[]; total: number; description?: string; compact?: boolean; unit?: string; allowMap?: boolean; footer?: ReactNode; emptyText?: string;
}) {
  const [mode,setMode] = useState<"map" | "bars">(compact ? "bars" : "map");
  const present = rows.filter(row => row.value > 0 && Number.isFinite(row.value));
  const tiles = treemap(present.map(row => ({ id: row.id, value: row.value })));
  const share = (value:number) => total > 0 ? `${number(100*value/total)}%` : "Unavailable";
  return <article className={`population-chart ${compact ? "population-compact" : ""}`} aria-label={title}>
    <header className="population-heading"><div><h3>{title}</h3><p><strong>{number(total)}</strong> {unit === "ads" && total === 1 ? "ad" : unit} in this sample</p></div>{allowMap && <div className="population-mode" role="group" aria-label={`${title} chart display`}><button type="button" aria-pressed={mode === "map"} onClick={()=>setMode("map")}>Treemap</button><button type="button" aria-pressed={mode === "bars"} onClick={()=>setMode("bars")}>Bars</button></div>}</header>
    {description && <p className="population-description">{description}</p>}
    {present.length ? <div className={`population-body population-layout-${mode}`}>
      <div className="population-table-wrap"><table className="population-table"><thead><tr><th scope="col">Segment</th><th scope="col">{unit === "ads" ? "Ads" : "Count"}</th><th scope="col">Share</th></tr></thead><tbody>{present.map((row,index) => <tr key={row.id} className={row.muted ? "population-missing" : ""}><th scope="row">{row.onSelect ? <button type="button" onClick={row.onSelect}><i style={{background:row.muted ? "#B5BDC8" : colours[index % colours.length]}} />{row.label}</button> : <span><i style={{background:row.muted ? "#B5BDC8" : colours[index % colours.length]}} />{row.label}</span>}{row.detail && <small>{row.detail}</small>}{mode === "bars" && <span className="population-bar-track" aria-hidden="true"><span style={{width:`${Math.min(100,total>0?100*row.value/total:0)}%`,background:row.muted ? "#B5BDC8" : colours[index%colours.length]}} /></span>}</th><td>{number(row.value)}</td><td>{share(row.value)}</td></tr>)}</tbody></table></div>
      {mode === "map" && <div className="population-map" aria-label={`${title} treemap; area represents number of ads`}>{tiles.map(tile => {
        const index = present.findIndex(row=>row.id===tile.id), row=present[index];
        const style = {left:`${tile.x}%`,top:`${tile.y}%`,width:`${tile.width}%`,height:`${tile.height}%`,background:row.muted ? "#E5E7EB" : colours[index%colours.length]};
        const label = `${row.label}: ${number(row.value)} ads, ${share(row.value)} of ${number(total)} analysed ads`;
        const content=<><span className="population-tile-label">{row.label}</span><strong>{number(row.value)} <small>{share(row.value)}</small></strong></>;
        const cls=`population-tile${row.muted ? " is-muted" : ""}${tile.width*tile.height<600 ? " is-small" : ""}`;
        return row.onSelect ? <button key={row.id} type="button" className={cls} style={style} onClick={row.onSelect} aria-label={label} title={label}>{content}</button> : <div key={row.id} className={cls} style={style} role="img" aria-label={label} title={label}>{content}</div>;
      })}</div>}
    </div> : <div className="population-empty"><strong>No chart data yet</strong><p>{emptyText}</p></div>}
    {footer && <footer className="population-footer">{footer}</footer>}
  </article>;
}
