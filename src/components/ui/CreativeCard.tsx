import type { DisplayValue, DataBasis } from "./value";
import { hasValue, displayValue } from "./value";
import { DataLabel } from "./DataLabel";
import { Unavailable } from "./Unavailable";
import "./CreativeCard.css";
export function CreativeCard({title,thumbnail,duration,source,format,tags=[],metrics=[],onOpen}:{title:string;thumbnail?:string|null;duration?:number|null;source:string;format?:string|null;tags?:readonly string[];metrics?:readonly {label:string;value:DisplayValue;basis:DataBasis}[];onOpen:()=>void}) {
  return <article className="ui-creative-card"><button onClick={onOpen} aria-label={`Open ${title}`} className="ui-creative-open">{thumbnail?<img src={thumbnail} alt={title} loading="lazy"/>:<span className="ui-creative-missing">Unavailable: retained thumbnail is missing.</span>}<span>{hasValue(duration)?`${duration}s`:"Duration unavailable"}</span><h3>{title}</h3><p>{source} · {displayValue(format)}</p><span className="ui-creative-tags">{tags.slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</span></button><dl>{metrics.map(metric=><div key={metric.label}><dt>{metric.label}</dt><dd>{hasValue(metric.value)&&metric.basis!=="Unavailable"?<button onClick={onOpen}>{displayValue(metric.value)} <DataLabel basis={metric.basis}/></button>:<Unavailable/>}</dd></div>)}</dl></article>;
}
