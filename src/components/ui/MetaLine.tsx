import { displayValue } from "./value";
import "./MetaLine.css";
export interface MetaLineProps {sampleSize?:number|null;from?:string|null;to?:string|null;lastChecked?:string|null}
export function evidenceDate(value:string|null|undefined,withTime=false) {
  if(!value)return "Unavailable";
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return "Unavailable";
  return new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC",...(withTime?{hour:"2-digit",minute:"2-digit",timeZoneName:"short"}: {})}).format(date);
}
export function MetaLine({sampleSize,from,to,lastChecked}:MetaLineProps) {
  return <div className="ui-meta-line">n = {displayValue(sampleSize)} ads · {evidenceDate(from)} to {evidenceDate(to)} · checked {evidenceDate(lastChecked,true)}</div>;
}
