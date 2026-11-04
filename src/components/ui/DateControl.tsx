import { ChevronDown } from "lucide-react";
import { ukDate } from "../../../shared/creative-presentation";
import "./DateControl.css";
export function DateControl({from,to,onChange,label="Week"}:{from?:string|null;to?:string|null;onChange:(patch:Record<string,string>)=>void;label?:string}) {
  return <div className="reference-date"><span>{label}</span><details><summary>{from&&to?`${ukDate(from)} to ${ukDate(to)}`:"Choose dates"}<ChevronDown size={14} aria-hidden="true"/></summary><div className="reference-date-panel"><label>From<input type="date" aria-label="From" value={from||""} max={to||undefined} onChange={event=>onChange({from:event.target.value})}/></label><label>To<input type="date" aria-label="To" value={to||""} min={from||undefined} onChange={event=>onChange({to:event.target.value})}/></label></div></details></div>;
}
