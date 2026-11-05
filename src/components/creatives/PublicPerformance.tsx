import type {BrowserCreative} from "../../../shared/creative-browser";
import {publicSignalTiles,publicAudienceBars} from "../../../shared/public-signals";
import {MetricTile,BarList} from "../ui";
import "./PublicPerformance.css";
export function PublicPerformance({row,creatives,onEvidence}:{row:BrowserCreative;creatives:readonly BrowserCreative[];onEvidence:()=>void}){
  const tiles=publicSignalTiles(row,creatives),audience=publicAudienceBars(row),format=(value:number)=>new Intl.NumberFormat("en-GB",{maximumFractionDigits:1}).format(value);
  return <div className="public-signals">{tiles.length>0&&<div className="creative-performance">{tiles.map(tile=><MetricTile key={tile.id} label={tile.label} value={typeof tile.value==="number"?format(tile.value):tile.value} basis={tile.basis} valueKind={tile.text?"text":"number"} tooltip={tile.tooltip} note={tile.note} onEvidence={onEvidence}/>)}</div>}{audience.length>0&&<BarList label="Reach by age and gender" items={audience} basis="Observed" onSelect={onEvidence} formatValue={format}/>}</div>;
}
