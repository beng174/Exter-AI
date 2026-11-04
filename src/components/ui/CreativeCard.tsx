import { useState } from "react";
import type { DisplayValue, DataBasis } from "./value";
import { hasValue, displayValue } from "./value";
import { DataLabel } from "./DataLabel";
import { Unavailable } from "./Unavailable";
import type { MetaLineProps } from "./MetaLine";
import { videoLength, creativeTags } from "../../../shared/creative-presentation";
import "./CreativeCard.css";
export interface CreativeCardProps {title:string;secondary?:string|null;thumbnail?:string|null;duration?:number|null;source:string;format?:string|null;tags?:readonly string[];metrics?:readonly {label:string;value:DisplayValue;basis:DataBasis;reason?:string;missingLabel?:"Unavailable"|"Not synced"}[];meta?:MetaLineProps;onOpen:()=>void}
export function CreativeCard({title,secondary,thumbnail,duration,source,format,tags=[],metrics=[],onOpen}:CreativeCardProps) {
  const [broken,setBroken]=useState(false);
  const shownTags=creativeTags(tags),length=videoLength(duration);
  const knownFormat=hasValue(format)&&!/^none$/i.test(format!);
  return <article className="ui-creative-card"><button onClick={onOpen} aria-label={`Open ${title}`} className="ui-creative-open" title={!thumbnail||broken?"Retained media is missing. Open the creative to view the original ad.":undefined}><span className={`ui-creative-poster ${!thumbnail||broken?"ui-creative-no-poster":""}`}>{thumbnail&&!broken?<img src={thumbnail} alt="" loading="lazy" onError={()=>setBroken(true)}/>:<span className="ui-creative-missing"><Unavailable compact focusable={false} reason="Retained media is missing. Open the creative to view the original ad."/></span>}<span className="ui-creative-source">{source}</span>{length&&<span className="ui-creative-duration">{length} · Observed</span>}</span><span className="ui-creative-body"><h3 title={title}>{title}</h3>{secondary&&<small className="ui-creative-id">{secondary}</small>}{knownFormat&&<span className="ui-creative-format">{format}</span>}{shownTags.length>0&&<span className="ui-creative-tags">{shownTags.map(tag=><span key={tag}>{tag}</span>)}<DataLabel basis="Modelled"/></span>}</span></button><dl className={metrics.length===1?"ui-creative-single-metric":undefined}>{metrics.map(metric=><div key={metric.label}><dt>{metric.label}</dt><dd>{hasValue(metric.value)&&metric.basis!=="Unavailable"?<button onClick={onOpen}>{displayValue(metric.value)} <DataLabel basis={metric.basis}/></button>:<Unavailable compact label={metric.missingLabel||"Unavailable"} reason={metric.reason||"This metric has not been recorded."}/>}</dd></div>)}</dl></article>;
}
