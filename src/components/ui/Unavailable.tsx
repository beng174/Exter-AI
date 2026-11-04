import "./Unavailable.css";
export interface UnavailableProps { reason?:string; unlock?:string; href?:string; linkLabel?:string }
export function Unavailable({reason="This value has not been recorded.",unlock="It will appear when source data is available.",href,linkLabel="Data sources"}:UnavailableProps) {
  return <div className="ui-unavailable"><strong>Unavailable</strong><p>{reason}</p><p>{unlock}</p>{href&&<a href={href}>{linkLabel}</a>}</div>;
}
