import type { CSSProperties } from "react";
import { Unavailable } from "./Unavailable";
import "./ComparisonBars.css";
export function ComparisonBars({yours,competitors,onYours,onCompetitors,scaleMax=100}:{scaleMax?:number;yours:number|null;competitors:number|null;onYours:()=>void;onCompetitors:()=>void}) {
  return <div className="comparison-bars">{[{label:"Competitors",value:competitors,onClick:onCompetitors},{label:"You",value:yours,onClick:onYours}].map((row,index)=><div key={row.label}>{row.value==null?<Unavailable compact reason="No classified comparison sample is saved."/>:<button aria-label={`${row.label}: ${row.value}%`} onClick={row.onClick}><span className={`comparison-track comparison-${index}`} style={{"--share":`${Math.max(0,Math.min(100,scaleMax===100?row.value:row.value*100/scaleMax))}%`} as CSSProperties}/><small>{new Intl.NumberFormat("en-GB",{maximumFractionDigits:1}).format(row.value)}%</small></button>}</div>)}</div>;
}
