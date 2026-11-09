import {useEffect,useState} from "react";
import type {CreativeBrowserResponse} from "../../../shared/creative-browser";
import {publicMediaCoverage} from "../../../shared/ad-media";
import {ukDate} from "../../../shared/creative-presentation";
import {workspaceRead} from "../../lib/workspace-read";
import {SectionCard,DataLabel,DataTable} from "../ui";
interface Batch {id:string;status:string;error:string|null;createdAt:string;finishedAt:string|null;ads:number;costGbp:number|null;costStatus:string|null}
interface Status {enabled:boolean;configured:boolean;batches:Batch[]}
const errors:Record<string,string>={configuration:"Tagging needs its key, exchange rate and request reserve.",budget:"Tagging is paused by the inference budget.",uncertain:"A paid batch start needs review before retrying.",partial:"Some ads could not be tagged. They will retry tomorrow.",provider:"The tagging request failed. It will retry later.",output:"The tagging response could not be read."};
export function CategoryTaggingStatus({library,sample=false}:{library:CreativeBrowserResponse;sample?:boolean}){
 const [status,setStatus]=useState<Status|null>(null),[failed,setFailed]=useState(false),total=publicMediaCoverage(library.creatives).ads,tagged=publicMediaCoverage(library.creatives.filter(row=>Boolean(row.productCategories?.length))).ads;
 useEffect(()=>{if(sample)return;let active=true;const leases=new Set<{release:()=>void}>();const read=()=>{const lease=workspaceRead<Status>(`/api/public-categories/status?${new URLSearchParams({workspaceId:library.brand.id})}`);leases.add(lease);void lease.promise.then(value=>{if(active){setStatus(value);setFailed(false);}}).catch(()=>{if(active)setFailed(true);}).finally(()=>{lease.release();leases.delete(lease);});};read();const timer=setInterval(read,30000);return()=>{active=false;clearInterval(timer);for(const lease of leases)lease.release();};},[library.brand.id,sample]);
 return <div id="public-category-status"><SectionCard title="Category tagging" help="Product categories are Modelled from copy, headlines and landing-page paths.">
  <p>{library.categoryReadStatus==="unavailable"?"Category tags could not be read.":`${tagged.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")} public ads have categories.`} <DataLabel basis="Modelled"/></p>
  {sample?<p className="reference-muted">Sample classifications. No provider calls run.</p>:failed?<p className="reference-muted">Tagging status could not be read.</p>:!status?<p role="status">Reading tagging status…</p>:<>
   <p className="reference-muted">{!status.enabled?"Automatic tagging is off.":!status.configured?errors.configuration:"New and changed ads are tagged automatically in low-cost batches."}</p>
   {status.batches.length>0&&<DataTable caption="Category tagging batches" basis="Observed" showBasis={false} rows={status.batches} rowKey={row=>row.id} columns={[{key:"status",label:"Status",value:row=>({queued:"Queued",starting:"Starting",running:"Running",paused:"Paused",uncertain:"Needs review",complete:"Complete",failed:"Failed"})[row.status]||"Pending"},{key:"ads",label:"Ads",value:row=>row.ads},{key:"when",label:"Last update",value:row=>ukDate(row.finishedAt||row.createdAt,true)},{key:"cost",label:"Cost",align:"number",value:row=>row.costGbp===null?null:row.costStatus==="reserved"?`Up to £${row.costGbp.toFixed(2)} held`:row.costGbp>0&&row.costGbp<.01?"Less than £0.01":`£${row.costGbp.toFixed(2)}`},{key:"detail",label:"Detail",value:row=>row.error?errors[row.error]||errors.provider:""}]}/>}</>}
 </SectionCard></div>;
}
