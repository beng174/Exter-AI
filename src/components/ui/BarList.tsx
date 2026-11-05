import { BrandText } from "./BrandIdentity";
import type { CSSProperties } from "react";
import { hasValue } from "./value";
import { DataLabel } from "./DataLabel";
import type { DataBasis } from "./value";
import { Unavailable } from "./Unavailable";
import { MetaLine, type MetaLineProps } from "./MetaLine";
import "./BarList.css";
export function BarList({label,items,basis,onSelect,meta,formatValue}:{label:string;items:readonly {id:string;label:string;value:number|null}[];basis:DataBasis;onSelect:(id:string)=>void;meta?:MetaLineProps;formatValue?:(value:number)=>string}) {
  const max=Math.max(0,...items.flatMap(item=>hasValue(item.value)?[item.value]:[]));
  return <section className="ui-bar-list" aria-label={label}><h3>{label}</h3><DataLabel basis={basis}/>{items.length?<ul>{items.map(item=><li key={item.id}>{hasValue(item.value)&&basis!=="Unavailable"?<button onClick={()=>onSelect(item.id)}><span><BrandText size={16}>{item.label}</BrandText></span><strong>{formatValue?formatValue(item.value):item.value}</strong><i aria-hidden="true" style={{"--bar-width":`${max?100*Math.max(0,item.value)/max:0}%`} as CSSProperties}/></button>:<><span><BrandText size={16}>{item.label}</BrandText></span><Unavailable compact/></>}</li>)}</ul>:<Unavailable compact/>}<MetaLine {...meta}/></section>;
}
