import {navigateHref} from "../../navigation";
import { BrandText } from "./BrandIdentity";
import type { ReactNode } from "react";
import type { BrowserCreative, CreativeBrowserResponse } from "../../../shared/creative-browser";
import type { WorkspacePresentation } from "../../../shared/workspace-presentation";
import { evidenceUrl, type EvidenceSelection } from "../../../shared/creative-research";
import { openCreativeRoute } from "../../navigation";
import { DataTable, type DataColumn } from "./DataTable";
import type { MetaLineProps } from "./MetaLine";
import { DataLabel } from "./DataLabel";
import { StatusChip } from "./StatusChip";
import type { DataBasis } from "./value";
import { CreativeRow } from "./CreativeRow";
import "./ReadModel.css";
export type Presentation = WorkspacePresentation;
export const background=(style:string)=>style.match(/background:\s*(#[0-9a-fA-F]{6})/)?.[1]||"#E9E2D6";
export const widthPercent=(style:string)=>Number(style.match(/width:\s*(\d+)/)?.[1]||0);
export function FixtureSafeAction({children}:{children:ReactNode}) {return <button className="button secondary" disabled title="Sample workspace is read-only. No provider or budget action runs.">{children}</button>;}
export function EvidenceLink({library,children,adId,brand,dimension,value,view}:{library:CreativeBrowserResponse;children:ReactNode;adId?:string;brand?:string;dimension?:string;value?:string;view?:string}) {
 const url=new URL(evidenceUrl(library.brand.id,{...(adId?{ad:adId}:{}),...(brand?{brand}:{}),...(dimension?{dimension:dimension as "format",value}:{}),kind:"all"}),"http://exter.local");
 if(view)url.searchParams.set("view",view);url.searchParams.set("demo","1");
 return <a href={url.pathname+url.search}><BrandText>{children}</BrandText></a>;
}
export function openModelEvidence(library:CreativeBrowserResponse,selection:EvidenceSelection={kind:"all"}) {const url=new URL(evidenceUrl(library.brand.id,selection),window.location.origin);url.searchParams.set("demo","1");navigateHref(url);}
export function ModelTable<T>({library,title,rows,columns,basis="Observed",rowBasis,showBasis=true,selection,meta,groupBy}:{library:CreativeBrowserResponse;title:string;rows:readonly T[];columns:readonly DataColumn<T>[];basis?:DataBasis;rowBasis?:(row:T)=>DataBasis;showBasis?:boolean;selection?:(row:T)=>EvidenceSelection;meta?:MetaLineProps;groupBy?:(row:T)=>{key:string;label:string;href?:string}|null}) {
 return <DataTable caption={title} rows={rows} groupBy={groupBy} columns={columns} basis={basis} rowBasis={rowBasis} showBasis={showBasis} hideUnavailable={true} rowKey={row=>String(rows.indexOf(row))} onRow={row=>openModelEvidence(library,selection?.(row))} meta={{sampleSize:library.creatives.length,from:library.dateRange.from,to:library.dateRange.to,lastChecked:library.lastChecked,...meta}}/>;
}
export function ValueTiles({items}:{items:readonly {label:string;value:string;note?:string}[]}) {return <div className="read-model-tiles">{items.map(item=><div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note||""}</small></div>)}</div>;}
export function ColourThumb({style,large=false}:{style:string;large?:boolean}) {return <span className={`read-model-thumb ${large?"thumb-large":""}`} style={{background:background(style)}} aria-hidden="true"/>;}
export function ProofRows({library,items}:{library:CreativeBrowserResponse;items:readonly {title:string;brand:string;thumb?:string;note?:string}[]}) {return <div className="read-model-proof">{items.map((item,index)=><EvidenceLink key={item.title} library={library} adId={library.creatives.find(row=>row.copy.split("\n")[0]===item.title)?.adId||library.creatives[index+1]?.adId}><ColourThumb style={item.thumb||""}/><span><strong>{item.title}</strong><small><BrandText>{item.brand}</BrandText>{item.note?` · ${item.note}`:""}</small></span></EvidenceLink>)}</div>;}
export function ScoreSignals({items}:{items:readonly {k:string;v:string;bar?:string;w?:string}[]}) {return <div className="read-model-signals">{items.map(item=><div key={item.k}><span>{item.k}{item.w?` · ${item.w}`:""}</span><progress max={100} value={item.bar?widthPercent(item.bar):Number(item.v.replace(/[^0-9.]/g,""))}/><strong>{item.v}</strong></div>)}</div>;}
export function RowCreative({library,title,brand}:{library:CreativeBrowserResponse;title:string;brand?:string}) {const row=library.creatives.find(row=>row.copy.split("\n")[0]===title)||library.creatives[0];return <span onClick={()=>openCreativeRoute(row.adId,library.brand.id)}><CreativeRow row={{...row,copy:title,brandName:brand||row.brandName}}/></span>;}
export function Label({value}:{value:string}) {return <StatusChip status={value}/>;}
