import {storageBytes,type DatabaseStorageHealth} from "../../../shared/storage-health";
import {ukDate} from "../../../shared/creative-presentation";
import {DataLabel} from "./DataLabel";
import "./DatabaseStorageDetail.css";
export function DatabaseStorageDetail({storage}:{storage?:DatabaseStorageHealth|null}){
  if(storage?.status!=="available")return <span className="reference-muted">{storage?.message||"Database storage has not been measured."}</span>;
  return <div className="ui-storage-detail"><dl><div><dt>Database size</dt><dd>{storageBytes(storage.sizeBytes)} <DataLabel basis="Observed"/></dd></div><div><dt>Growth per day</dt><dd title={storage.message}>{storageBytes(storage.growthBytesPerDay,true)}{storage.growthBytesPerDay!==null&&<> <DataLabel basis="Observed"/></>}</dd></div></dl><small>{storage.baselineAt?`Average since ${ukDate(storage.baselineAt,true)}.`:storage.message} {storage.measuredAt&&`Measured ${ukDate(storage.measuredAt,true)}.`}</small></div>;
}
