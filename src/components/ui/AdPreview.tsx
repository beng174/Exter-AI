import type {BrowserCreative} from "../../../shared/creative-browser";
import {MEDIA_REASON_LABELS,type MediaMissingReason} from "../../../shared/ad-media";
import {mediaFormat,formatName} from "../../../shared/public-comparisons";
import {ukDate} from "../../../shared/creative-presentation";
import {BrandName,BrandMark} from "./BrandIdentity";
import {sourceProviders} from "./SourceLabel";
import "./AdPreview.css";
export function AdPreview({row,compact=false,interactive=true}:{row:Pick<BrowserCreative,"brandName"|"platform"|"copy"|"sourceUrl"|"deliveryStartAt"|"previewState"> & Partial<Pick<BrowserCreative,"adFormat"|"mediaKind"|"mediaAvailable">>;compact?:boolean;interactive?:boolean}){
 const message="Media not collected yet",reason=MEDIA_REASON_LABELS[row.previewState?.reason as MediaMissingReason]||MEDIA_REASON_LABELS.not_requested,format=mediaFormat(row as BrowserCreative);
 return <span role="group" aria-label="Ad copy preview" className={`ui-ad-preview ${compact?"ui-ad-preview-compact":""}`} title={`${message}. ${reason}`}>
  {compact?<BrandMark name={row.brandName} size={16} nameBeside/>:<BrandName name={row.brandName} size={20}/>}
  {!compact&&<span className="ui-ad-preview-platform">{sourceProviders(row.platform).map(provider=><img key={provider} src={`/providers/${provider}.svg`} alt=""/>)}{row.platform}</span>}
  <span className="ui-ad-preview-copy">{row.copy.trim()||"Ad copy not provided."}</span>
  {!compact&&<><small>{format?formatName(format):"Unknown format"}{row.deliveryStartAt?` · Started ${ukDate(row.deliveryStartAt)}`:""}</small><small className="ui-ad-preview-reason"><strong>{message}</strong><span>{reason}</span></small>
  {interactive&&row.sourceUrl&&<a href={row.sourceUrl} target="_blank" rel="noreferrer">Open in Ad Library</a>}</>}
 </span>;
}
