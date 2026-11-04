import { displayValue } from "./value";
import "./MetaLine.css";
export interface MetaLineProps {sampleSize?:number|null;from?:string|null;to?:string|null;lastChecked?:string|null}
export function MetaLine({sampleSize,from,to,lastChecked}:MetaLineProps) {
  return <div className="ui-meta-line">n = {displayValue(sampleSize)} ads · {displayValue(from)} to {displayValue(to)} · checked {displayValue(lastChecked)}</div>;
}
