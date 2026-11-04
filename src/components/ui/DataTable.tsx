import { useState, type ReactNode } from "react";
import { DataLabel } from "./DataLabel";
import type { DisplayValue, DataBasis } from "./value";
import { hasValue, displayValue } from "./value";
import { Unavailable, type UnavailableProps } from "./Unavailable";
import { EmptyState } from "./EmptyState";
import { MetaLine, type MetaLineProps } from "./MetaLine";
import "./DataTable.css";
export interface DataColumn<T> {key:string;label:string;value:(row:T)=>DisplayValue;sortable?:boolean;basis?:(row:T)=>DataBasis;render?:(row:T)=>ReactNode;unavailable?:(row:T)=>UnavailableProps}
export function DataTable<T>({caption,columns,rows,rowKey,onRow,meta,basis}:{caption:string;columns:readonly DataColumn<T>[];rows:readonly T[];rowKey:(row:T)=>string;onRow?:(row:T)=>void;meta?:MetaLineProps;basis:DataBasis}) {
  const [sort,setSort]=useState<{key:string;direction:1|-1}|null>(null);
  const column=columns.find(column=>column.key===sort?.key);
  const ordered=column?[...rows].sort((a,b)=>{
    const left=column.value(a),right=column.value(b);
    if(!hasValue(left))return hasValue(right)?1:0;if(!hasValue(right))return -1;
    return (typeof left==="number"&&typeof right==="number"?left-right:String(left).localeCompare(String(right)))*sort!.direction;
  }):rows;
  return <div className="ui-data-table"><DataLabel basis={basis}/>{rows.length?<div className="ui-table-scroll" role="region" aria-label={caption} tabIndex={0}><table><caption>{caption}</caption><thead><tr>{columns.map(c=><th key={c.key} scope="col" aria-sort={sort?.key===c.key?sort.direction===1?"ascending":"descending":undefined}>{c.sortable?<button onClick={()=>setSort({key:c.key,direction:sort?.key===c.key&&sort.direction===1?-1:1})}>{c.label}</button>:c.label}</th>)}</tr></thead><tbody>{ordered.map(row=><tr key={rowKey(row)} tabIndex={onRow?0:undefined} onClick={event=>{if(!(event.target instanceof Element&&event.target.closest("a,button,input,select,textarea")))onRow?.(row);}} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(onRow&&(event.key==="Enter"||event.key===" ")){event.preventDefault();onRow(row);}}}>{columns.map(c=><td key={c.key} data-label={c.label}>{hasValue(c.value(row))&&(c.basis?.(row)||basis)!=="Unavailable"?<>{c.render?c.render(row):displayValue(c.value(row))}{c.basis&&<DataLabel basis={c.basis(row)}/>}</>:<Unavailable {...c.unavailable?.(row)} compact/>}</td>)}</tr>)}</tbody></table></div>:<EmptyState title="No rows match this selection" description="Change the filters to explore other stored records."/>}<MetaLine {...meta}/></div>;
}
