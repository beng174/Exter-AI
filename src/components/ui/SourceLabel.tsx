import {Database,Globe2,MessageSquareText} from "lucide-react";
import type {ReactNode} from "react";
import "./SourceLabel.css";
export function sourceProviders(name:string){
  const key=name.toLowerCase();
  return (["meta","tiktok","google","instagram","youtube"] as const).filter(provider=>key.includes(provider));
}
export function SourceDetail({detail,checked,records}:{detail:string;checked?:string|null;records?:ReactNode}){
  const hasRecords=records!==null&&records!==undefined&&records!==false&&records!=="";
  return <span className="ui-source-detail"><span>{detail}</span>{(checked||hasRecords)&&<small>{checked&&<span>Last successful check: {checked}</span>}{hasRecords&&<span>{records}</span>}</small>}</span>;
}
/** Bundled provider identifiers, never a third-party logo request. Names carry the accessible label. */
export function SourceLabel({name,detail}:{name:string;detail:string}){
  const providers=sourceProviders(name);
  return <span className="ui-source-label"><span className="ui-source-marks" aria-hidden="true">{providers.length?providers.map(provider=><span className="ui-source-mark" key={provider}><img src={`/providers/${provider}.svg`} alt=""/></span>):<span className="ui-source-mark">{name.toLowerCase().includes("review")?<MessageSquareText size={16}/>:name.toLowerCase().includes("database")?<Database size={16}/>:<Globe2 size={16}/>}</span>}</span><span><strong>{name}</strong><small className="source-gives">{detail}</small></span></span>;
}
