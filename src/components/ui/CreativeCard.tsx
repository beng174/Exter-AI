import { BrandText } from "./BrandIdentity";
import type { CreativePresentation } from "../../../shared/workspace-presentation";
import { StatusChip } from "./StatusChip";
import { useState } from "react";
import type { DisplayValue, DataBasis } from "./value";
import { hasValue, displayValue } from "./value";
import { DataLabel } from "./DataLabel";
import { Unavailable } from "./Unavailable";
import type { MetaLineProps } from "./MetaLine";
import { videoLength, creativeTags } from "../../../shared/creative-presentation";
import "./CreativeCard.css";
export interface CreativeCardProps {title:string;presentation?:CreativePresentation;secondary?:string|null;thumbnail?:string|null;duration?:number|null;source:string;format?:string|null;facts?:string|null;tags?:readonly string[];metrics?:readonly {label:string;value:DisplayValue;basis:DataBasis;reason?:string;missingLabel?:"Unavailable"|"Not synced"}[];meta?:MetaLineProps;onOpen:()=>void}
export function CreativeCard({title,secondary,thumbnail,duration,source,format,facts,tags=[],metrics=[],onOpen,presentation}:CreativeCardProps) {
  const [broken,setBroken]=useState(false);
  const shownMetrics=metrics.filter(metric=>hasValue(metric.value)&&metric.basis!=="Unavailable");
  const shownTags=creativeTags(presentation?.tags||tags),length=videoLength(duration);
  const metricBases=[...new Set(metrics.filter(metric=>hasValue(metric.value)&&metric.basis!=="Unavailable").map(metric=>metric.basis))];
  const knownFormat=!presentation&&hasValue(format)&&!/^none$/i.test(format!);
  return <article className="ui-creative-card"><button onClick={onOpen} aria-label={`Open ${title}`} className="ui-creative-open" title={!thumbnail||broken?"Retained media is missing. Open the creative to view the original ad.":undefined}><span className={`ui-creative-poster ${!thumbnail||broken?"ui-creative-no-poster":""}`}>{thumbnail&&!broken?<img src={thumbnail} alt="" loading="lazy" onError={()=>setBroken(true)}/>:<span className="ui-creative-missing"><Unavailable compact focusable={false} reason="Retained media is missing. Open the creative to view the original ad."/></span>}<span className={`ui-creative-source ${/^you/i.test(source)?"ui-creative-yours":""}`}><BrandText>{/^you/i.test(source)?"Yours":source}</BrandText></span>{(length||presentation)&&<span className="ui-creative-duration">{length||"Image"}</span>}{presentation?.status&&<span className="read-model-card-status" data-tone={presentation.tone}><StatusChip status={presentation.status}/></span>}</span><span className="ui-creative-body"><h3 title={title}>{title}</h3>{(presentation?.facts||facts)&&<small className="ui-creative-facts">{presentation?.facts||facts}</small>}{secondary&&<small className="ui-creative-id">{secondary}</small>}{knownFormat&&<span className="ui-creative-format">{format}</span>}{(shownTags.length>0||metricBases.length>0)&&<span className="ui-creative-tags">{shownTags.map(tag=><span key={tag}>{tag}</span>)}{!presentation&&shownTags.length>0&&<DataLabel basis="Modelled"/>}{metricBases.filter(basis=>!presentation&&basis!=="Modelled"||!shownTags.length).map(basis=><DataLabel key={basis} basis={basis}/>)}</span>}</span></button><dl className={shownMetrics.length<=1?"ui-creative-single-metric":undefined}>{shownMetrics.map(metric=><div key={metric.label}><dt>{metric.label}</dt><dd>{hasValue(metric.value)&&metric.basis!=="Unavailable"?<button onClick={onOpen}>{displayValue(metric.value)} <DataLabel basis={metric.basis}/></button>:<Unavailable compact label={metric.missingLabel||"Unavailable"} reason={metric.reason||"This metric has not been recorded."}/>}</dd></div>)}{metrics.length>0&&!shownMetrics.length&&<div><dt>Metrics</dt><dd><Unavailable compact label={metrics.some(metric=>metric.missingLabel==="Not synced")?"Not synced":"Unavailable"} reason={metrics[0].reason||"These metrics have not been recorded."}/></dd></div>}</dl></article>;
}
