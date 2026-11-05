import { BrandText } from "./BrandIdentity";
import type { CSSProperties } from "react";
import { hasValue } from "./value";
import type { DataBasis } from "./value";
import { DataLabel } from "./DataLabel";
import { Unavailable } from "./Unavailable";
import { MetaLine, type MetaLineProps } from "./MetaLine";
import "./Heatmap.css";
export function Heatmap({label,columns,rows,basis,onSelect,meta}:{label:string;columns:readonly string[];rows:readonly {id:string;label:string;values:readonly (number|null)[]}[];basis:DataBasis;onSelect:(rowId:string,column:number)=>void;meta?:MetaLineProps}) {
  const max=Math.max(0,...rows.flatMap(row=>row.values.filter((value):value is number=>hasValue(value))));
  return <section className="ui-heatmap" aria-label={label}><DataLabel basis={basis}/><div className="ui-heatmap-scroll"><table><caption>{label}</caption><thead><tr><th scope="col">Group</th>{columns.map(c=><th key={c} scope="col"><BrandText size={16}>{c}</BrandText></th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row"><BrandText size={16}>{row.label}</BrandText></th>{columns.map((column,index)=>{const value=row.values[index];return <td key={column}>{hasValue(value)&&basis!=="Unavailable"?<button onClick={()=>onSelect(row.id,index)} style={{"--cell-opacity":max ? .04+.2*Math.max(0,value)/max : .04} as CSSProperties} aria-label={`${row.label}, ${column}: ${value}`}>{value}</button>:<Unavailable compact/>}</td>;})}</tr>)}</tbody></table></div>{!rows.length&&<Unavailable compact/>}<MetaLine {...meta}/></section>;
}
