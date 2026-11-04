import type { ReactNode } from "react";
import type { BrowserCreative } from "../../../shared/creative-browser";
import { evidenceUrl, selectResearchAds, type EvidenceSelection, type EvidenceMeasure, type ResearchDimension } from "../../../shared/creative-research";
import { creativeTitle, creativeSecondary, creativeTags, plainEnum } from "../../../shared/creative-presentation";
import { CreativeCard, DataLabel, Unavailable, type DataBasis, type MetaLineProps } from "../ui";
import { cardMetrics } from "../creatives/presentation";
import { openCreativeRoute } from "../../navigation";
import type { ResearchData } from "./useResearchData";
export interface ScreenProps {data:ResearchData;selection:EvidenceSelection;refresh:()=>void;onManageBrands:()=>void}
export const number=(value:number|null|undefined,digits=1)=>value==null||!Number.isFinite(value)?null:new Intl.NumberFormat("en-GB",{maximumFractionDigits:digits}).format(value);
export const percent=(value:number|null|undefined)=>value==null?null:`${number(value)}%`;
export function dimensionLabel(dimension:ResearchDimension,value:string){if(value==="none")return dimension==="hook"?"No hook":dimension==="offer"?"No offer":"No identified angle";return plainEnum(value);}
export function metadata(data:ResearchData,selection:EvidenceSelection={}):MetaLineProps {
  const rows=selectResearchAds(data.library.creatives,selection),dates=rows.map(row=>row.observedAt).filter((date):date is string=>Boolean(date)).sort();
  return {sampleSize:rows.length,from:data.window.from,to:data.window.to,lastChecked:dates.at(-1)||null,href:evidenceUrl(data.library.brand.id,{...selection,kind:selection.kind||"all"})};
}
export function EvidenceNumber({value,selection,data,basis="Observed",reason="This measurement is not supported by the saved sample.",suffix=""}:{value:number|null|undefined;selection:EvidenceSelection;data:ResearchData;basis?:DataBasis;reason?:string;suffix?:string}) {
  return value==null?<Unavailable compact reason={reason}/>:<a className="research-number" href={evidenceUrl(data.library.brand.id,selection)}>{number(value)}{suffix} <DataLabel basis={basis}/></a>;
}
export function Measure({metric,data,suffix=""}:{metric:EvidenceMeasure;data:ResearchData;suffix?:string}) {
  return <span title={`${metric.known} eligible records; ${metric.excluded} excluded because the required source fields are missing.`}><EvidenceNumber value={metric.value} data={data} selection={metric.selection} suffix={suffix}/></span>;
}
export function CreativeTile({row,workspaceId}:{row:BrowserCreative;workspaceId:string}) {
  return <CreativeCard title={creativeTitle(row)} secondary={creativeSecondary(row)} thumbnail={row.thumbnailUrl} duration={row.durationSeconds} source={row.workspaceBrand?`You · ${row.brandName}`:row.brandName} format={row.creativeFormat?plainEnum(row.creativeFormat):null} tags={creativeTags([row.hookType,row.angle,row.offerType])} metrics={cardMetrics(row)} onOpen={()=>openCreativeRoute(row.adId,workspaceId)}/>;
}
export function SafeLink({href,children}:{href:string|null|undefined;children:ReactNode}) {
  let safe:string|null=null;try{const url=new URL(href||"");if(url.protocol==="https:"&&!url.username&&!url.password)safe=url.href;}catch{}
  return safe?<a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>:<Unavailable compact reason="No verified public source URL is saved."/>;
}
export function DimensionSwitch({value,onChange,label="Group by"}:{value:ResearchDimension;onChange:(value:ResearchDimension)=>void;label?:string}) {
  return <div className="research-dimension-switch" role="group" aria-label={label}>{(["format","hook","angle","offer","claim"] as const).map(item=><button key={item} aria-pressed={value===item} onClick={()=>onChange(item)}>{item==="hook"?"Hook type":item==="claim"?"Claim type":plainEnum(item)}</button>)}</div>;
}
