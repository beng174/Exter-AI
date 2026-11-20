import type {BrowserCreative} from '../../../shared/creative-browser';
import {MEDIA_REASON_LABELS,type MediaMissingReason,previewMessage} from '../../../shared/ad-media';
import {creativeTitle,ukDate} from '../../../shared/creative-presentation';
import {BrandName} from './BrandIdentity';
import {sourceProviders} from './SourceLabel';
import './AdPreview.css';
type PreviewCreative=Pick<BrowserCreative,'brandName'|'platform'|'copy'|'sourceUrl'|'deliveryStartAt'|'previewState'> & Partial<Pick<BrowserCreative,'adFormat'|'mediaKind'|'mediaAvailable'|'brandId'|'nativeId'|'adId'|'catalogueProduct'|'creativeFormat'|'angle'>>;
export function AdPreview({row,compact=false,interactive=true,heading=false}:{row:PreviewCreative;compact?:boolean;interactive?:boolean;heading?:boolean}){
 const state=row.previewState,reason=MEDIA_REASON_LABELS[state?.reason as MediaMissingReason]||'Preview status is not available.';
 const waiting=state?.reason==='budget'?'When budget is available':state?.reason==='queued'?'Waiting for media collection.':state?.reason==='not_requested'?'Collect missing media in Data sources.':state?.reason?'Daily retries follow the media budget.':'See media status in Data sources.';
 const message=previewMessage(state)==='No preview from Meta'?'No preview from Meta':state?.reason==='not_requested'||!state?.reason?'Preview not collected':'Preview loading';
 const title=creativeTitle({...row,title:'',nativeId:row.nativeId||'',adId:row.adId||''}),Copy=heading?'h3':'span',date=ukDate(row.deliveryStartAt);
 return <span role="group" aria-label={message} className={`ui-ad-preview ${compact?'ui-ad-preview-compact':''}`} title={`${reason} ${waiting}`}>
  {!compact&&<><BrandName name={row.brandName} size={20}>{row.brandName}</BrandName><span className="ui-ad-preview-platform">{sourceProviders(row.platform).map(provider=><img key={provider} src={`/providers/${provider}.svg`} alt=""/>)}{row.platform}{date&&` · since ${date}`}</span><Copy className="ui-ad-preview-copy">{title}</Copy></>}
  <span className="ui-ad-preview-reason"><strong>{message}</strong>{!compact&&<><small>{reason}</small><small>{waiting}</small>{interactive&&row.sourceUrl&&<a href={row.sourceUrl} target="_blank" rel="noreferrer">Open in Ad Library</a>}</>}</span>
 </span>;
}
