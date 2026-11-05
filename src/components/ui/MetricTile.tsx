import type { DisplayValue, DataBasis } from "./value";
import { hasValue, displayValue } from "./value";
import { DataLabel } from "./DataLabel";
import { Unavailable, type UnavailableProps } from "./Unavailable";
import "./MetricTile.css";
export function MetricTile({label,value,basis,change,onEvidence,tooltip,note,valueKind="number",...missing}:{label:string;value:DisplayValue;basis:DataBasis;change?:DisplayValue;onEvidence?:()=>void;tooltip?:string;note?:string;valueKind?:"number"|"text"}&Omit<UnavailableProps,"label">) {
  const known=hasValue(value)&&basis!=="Unavailable";
  return <article className={`ui-metric-tile${valueKind==="text"?" ui-metric-text":""}`} aria-label={label} title={tooltip}><h3>{label}</h3>{known&&<DataLabel basis={basis}/>}{known?<>{onEvidence?<button className="ui-metric-value" title={tooltip} onClick={onEvidence}>{displayValue(value)}</button>:<strong className="ui-metric-value">{displayValue(value)}</strong>}{hasValue(change)?<p>{displayValue(change)} against the previous period</p>:note&&<p>{note}</p>}</>:<Unavailable {...missing} compact/>}</article>;
}
