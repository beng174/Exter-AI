import type {BrowserCreative} from "../../../shared/creative-browser";
import {previewMessage} from "../../../shared/ad-media";
import {ukDate} from "../../../shared/creative-presentation";
import {BrandName,BrandMark} from "./BrandIdentity";
import {sourceProviders} from "./SourceLabel";
import "./AdPreview.css";
const reasons:Record<string,string>={not_returned:"Meta did not return a preview.",expired:"The temporary file expired.",unsupported:"The file type is unsupported.",wrong_page:"The Page did not match.",disk:"Storage is full.",provider:"The media request failed."};
export function AdPreview({row,compact=false,interactive=true}:{row:Pick<BrowserCreative,"brandName"|"platform"|"copy"|"sourceUrl"|"deliveryStartAt"|"previewState">;compact?:boolean;interactive?:boolean}){
 const message=previewMessage(row.previewState),reason=row.previewState?.reason?reasons[row.previewState.reason]||"The preview could not be saved.":"Media is collected automatically, within your budget.";
 return <span role="group" aria-label="Ad copy preview" className={`ui-ad-preview ${compact?"ui-ad-preview-compact":""}`} title={`${message}. ${reason}`}>
  {compact?<BrandMark name={row.brandName} size={16} nameBeside/>:<BrandName name={row.brandName} size={20}/>}
  {!compact&&<span className="ui-ad-preview-platform">{sourceProviders(row.platform).map(provider=><img key={provider} src={`/providers/${provider}.svg`} alt=""/>)}{row.platform}</span>}
  <span className="ui-ad-preview-copy">{row.copy.trim()||"Ad copy not provided."}</span>
  {!compact&&<><small>{row.deliveryStartAt?`Started ${ukDate(row.deliveryStartAt)}`:message}</small>{row.previewState?.failedDays&&row.previewState.failedDays>=7&&row.previewState.reason?<small>{message}</small>:null}
  {interactive&&row.sourceUrl&&<a href={row.sourceUrl} target="_blank" rel="noreferrer">Open in Ad Library</a>}</>}
 </span>;
}
