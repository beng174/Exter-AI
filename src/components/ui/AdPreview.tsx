import type {BrowserCreative} from '../../../shared/creative-browser';
import {MEDIA_REASON_LABELS,type MediaMissingReason,previewMessage} from '../../../shared/ad-media';
import {BrandName} from './BrandIdentity';
import './AdPreview.css';
export function AdPreview({row,compact=false,interactive=true}:{row:Pick<BrowserCreative,'brandName'|'platform'|'copy'|'sourceUrl'|'deliveryStartAt'|'previewState'> & Partial<Pick<BrowserCreative,'adFormat'|'mediaKind'|'mediaAvailable'|'brandId'>>;compact?:boolean;interactive?:boolean}){
 const reason=MEDIA_REASON_LABELS[row.previewState?.reason as MediaMissingReason]||MEDIA_REASON_LABELS.not_requested;
 const waiting=row.previewState?.reason==='budget'?'When budget is available':row.previewState?.reason==='queued'?'After this batch finishes':row.previewState?.reason==='not_requested'||!row.previewState?.reason?'During this backfill':'Next daily retry, within budget';
 const message=previewMessage(row.previewState)==='No preview from Meta'?'No preview from Meta':'Preview loading';
 return <span role="group" aria-label={message} className={`ui-ad-preview ${compact?'ui-ad-preview-compact':''}`} title={`${reason}. ${waiting}.`}>
  {!compact&&<BrandName name={row.brandName} size={20}>{row.brandName}</BrandName>}
  <svg aria-hidden="true" width={compact?20:32} height={compact?20:32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4-4L6 21"/></svg><strong>{message}</strong>
  {!compact&&<><small>{reason}</small><small>{waiting}</small>{interactive&&row.sourceUrl&&<a href={row.sourceUrl} target="_blank" rel="noreferrer">Open in Ad Library</a>}</>}
 </span>;
}
