import { adCount, ukDate } from "../../../shared/creative-presentation";
import "./MetaLine.css";
export interface MetaLineProps {sampleSize?:number|null;from?:string|null;to?:string|null;lastChecked?:string|null}
export function evidenceDate(value:string|null|undefined,withTime=false) {return ukDate(value,withTime)||"Unavailable";}
export function hasCompleteMeta(meta:MetaLineProps|undefined):meta is Required<MetaLineProps> {
  return Boolean(meta&&typeof meta.sampleSize==="number"&&Number.isFinite(meta.sampleSize)&&meta.sampleSize>=0&&ukDate(meta.from)&&ukDate(meta.to)&&ukDate(meta.lastChecked));
}
export function MetaLine(props:MetaLineProps) {
  if(!hasCompleteMeta(props))return null;
  const from=ukDate(props.from),to=ukDate(props.to);
  return <div className="ui-meta-line">n = {adCount(props.sampleSize!)} · {from===to?from:`${from} to ${to}`} · checked {ukDate(props.lastChecked,true)}</div>;
}
