export interface DatabaseStorageHealth {
  status:"available"|"unavailable"|"not_configured";
  sizeBytes:number|null;measuredAt:string|null;growthBytesPerDay:number|null;
  baselineAt:string|null;intervalHours:number|null;message:string;
}
export function missingStorage(status:DatabaseStorageHealth["status"]="unavailable"):DatabaseStorageHealth {
  return {status,sizeBytes:null,measuredAt:null,growthBytesPerDay:null,baselineAt:null,intervalHours:null,message:status==="not_configured"?"The collection database is not configured.":"Database storage could not be measured. Check database permissions and migrations."};
}
export function storageMeasurement(sizeBytes:number,measuredAt:string,baseline?:{sizeBytes:number;measuredAt:string}|null):DatabaseStorageHealth {
  const measured=Date.parse(measuredAt);
  if(!Number.isSafeInteger(sizeBytes)||sizeBytes<0||!Number.isFinite(measured))return missingStorage();
  const hours=baseline?(measured-Date.parse(baseline.measuredAt))/3600000:NaN;
  const valid=baseline&&Number.isSafeInteger(baseline.sizeBytes)&&baseline.sizeBytes>=0&&Number.isFinite(hours)&&hours>=24;
  return {status:"available",sizeBytes,measuredAt,growthBytesPerDay:valid?(sizeBytes-baseline.sizeBytes)/(hours/24):null,baselineAt:valid?baseline.measuredAt:null,intervalHours:valid?hours:null,message:valid?"Physical Postgres database size; daily growth is averaged over the measured interval.":"Daily growth is available after measurements at least 24 hours apart."};
}
export function storageBytes(value:number|null|undefined,signed=false):string {
  if(value===null||value===undefined||!Number.isFinite(value)||!signed&&value<0)return "Unavailable";
  const magnitude=Math.abs(value),index=magnitude>=1024**3?3:magnitude>=1024**2?2:magnitude>=1024?1:0;
  const number=new Intl.NumberFormat("en-GB",{maximumFractionDigits:index?1:0}).format(magnitude/1024**index);
  return `${value<0?"−":signed&&value>0?"+":""}${number} ${["B","KiB","MiB","GiB"][index]}`;
}
