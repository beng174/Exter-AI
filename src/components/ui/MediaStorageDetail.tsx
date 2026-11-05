import type {MediaDiskHealth} from "../../../shared/ad-media";
import {storageBytes} from "../../../shared/storage-health";
import {DataLabel} from "./DataLabel";
import "./DatabaseStorageDetail.css";
export function MediaStorageDetail({disk}:{disk?:MediaDiskHealth|null}){
  if(disk?.status!=="available")return <span className="reference-muted">Media disk has not been measured.</span>;
  return <div className="ui-storage-detail"><dl><div><dt>Disk used</dt><dd>{storageBytes(disk.usedBytes)} <DataLabel basis="Observed"/></dd></div><div><dt>Remaining</dt><dd>{storageBytes(disk.remainingBytes)} <DataLabel basis="Observed"/></dd></div></dl><small>{disk.videoDownloadsPaused?"Video downloads are paused at the 80% disk limit.":"Video downloads stop before disk usage reaches 80%."} Disk usage includes all files on the media volume.</small></div>;
}
