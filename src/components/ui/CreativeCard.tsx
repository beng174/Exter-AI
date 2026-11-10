import {LikelihoodValue} from "./Likelihood";
import { BrandText } from "./BrandIdentity";
import {AdPreview} from "./AdPreview";
import {mediaFormat,formatName} from "../../../shared/public-comparisons";
import type {BrowserCreative} from "../../../shared/creative-browser";
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
export interface CreativeCardProps {creative?:BrowserCreative;showLikelihood?:boolean;title:string;presentation?:CreativePresentation;secondary?:string|null;thumbnail?:string|null;duration?:number|null;source:string;format?:string|null;facts?:string|null;tags?:readonly string[];metrics?:readonly {label:string;value:DisplayValue;basis:DataBasis;reason?:string;missingLabel?:"Unavailable"|"Not synced"}[];meta?:MetaLineProps;onOpen:()=>void}
export function CreativeCard({creative,showLikelihood=false,title,secondary,thumbnail,duration,source,format,facts,tags=[],metrics=[],onOpen,presentation}:CreativeCardProps) {
  const [broken,setBroken]=useState(false);
  const hasPoster=Boolean(thumbnail&&!broken);
  const shownMetrics=metrics.filter(metric=>hasValue(metric.value)&&metric.basis!=="Unavailable");
  const shownTags=creativeTags(presentation?.tags||tags),length=videoLength(duration);
  const knownFormat=!presentation&&hasValue(format)&&!/^none$/i.test(format!);
  return <article className="ui-creative-card"><button onClick={onOpen} aria-label={`Open ${title}`} className="ui-creative-open" ><span className={`ui-creative-poster ${!thumbnail||broken?"ui-creative-no-poster":""}`}>{thumbnail&&!broken?<img src={thumbnail} alt="" loading="lazy" onError={()=>setBroken(true)}/>:<AdPreview interactive={false} row={creative||{brandName:source,platform:"",copy:title,sourceUrl:null,deliveryStartAt:null}}/>}{thumbnail&&!broken&&<span className={`ui-creative-source ${/^you/i.test(source)?"ui-creative-yours":""}`}><BrandText>{/^you/i.test(source)?"Yours":source}</BrandText></span>}{hasPoster&&(length||presentation)&&<span className="ui-creative-duration">{length||"Image"}</span>}{hasPoster&&presentation?.status&&<span className="read-model-card-status" data-tone={presentation.tone}><StatusChip status={presentation.status}/></span>}</span><span className="ui-creative-body">{!hasPoster&&length&&<small className="ui-creative-length">{length}</small>}{hasPoster&&<h3 title={title}>{title}</h3>}{(presentation?.facts||facts)&&<small className="ui-creative-facts">{presentation?.facts||facts}</small>}{secondary&&<small className="ui-creative-id">{secondary}</small>}{(knownFormat||creative&&mediaFormat(creative))&&<span className="ui-creative-format">{knownFormat&&<span>{format}</span>}{creative&&mediaFormat(creative)&&<span>{formatName(mediaFormat(creative)!)} <DataLabel basis="Observed"/></span>}</span>}{(shownTags.length>0||Boolean(creative?.productCategories?.length))&&<span className="ui-creative-tags">{[...new Set([...(creative?.productCategories||[]),...shownTags])].map(tag=><span key={tag}>{tag}</span>)}{!presentation&&<DataLabel basis="Modelled"/>}</span>}</span></button><dl style={{gridTemplateColumns:`repeat(${Math.min(Math.max(shownMetrics.length,1),3)},minmax(0,1fr))`}} className={shownMetrics.length<=1?"ui-creative-single-metric":undefined}>{shownMetrics.map(metric=><div key={metric.label}><dt>{metric.label}</dt><dd>{hasValue(metric.value)&&metric.basis!=="Unavailable"?<button onClick={onOpen}><span>{typeof metric.value==="number"?metric.value.toLocaleString("en-GB"):displayValue(metric.value)}</span><DataLabel basis={metric.basis}/></button>:<Unavailable compact label={metric.missingLabel||"Unavailable"} reason={metric.reason||"This metric has not been recorded."}/>}</dd></div>)}{metrics.length>0&&!shownMetrics.length&&<div><dt>Metrics</dt><dd><Unavailable compact label={metrics.some(metric=>metric.missingLabel==="Not synced")?"Not synced":"Unavailable"} reason={metrics[0].reason||"These metrics have not been recorded."}/></dd></div>}</dl>{creative?.sourceUrl&&<a className="ui-card-source-link" href={creative.sourceUrl} target="_blank" rel="noreferrer">Open in Ad Library</a>}{showLikelihood&&creative?.likelihood&&<div className="ui-card-likelihood"><LikelihoodValue estimate={creative.likelihood}/></div>}</article>;
}
