import "./Unavailable.css";
export interface UnavailableProps {
  reason?:string; unlock?:string; href?:string; linkLabel?:string;
  compact?:boolean; focusable?:boolean; label?:"Unavailable"|"Not synced"|"";
  action?:{label:string;onClick:()=>void};
}
/** Explain gaps once at section level; repeated values use a tooltip label. */
export function Unavailable({reason="This value has not been recorded.",unlock,href,linkLabel="Data sources",compact=false,focusable=true,label="Unavailable",action}:UnavailableProps) {
  const description=[reason,unlock].filter(Boolean).join(" ");
  if(compact)return <span className="ui-unavailable-label" title={description} aria-label={`${label}: ${description}`} tabIndex={focusable?0:undefined}>{label}</span>;
  return <div className="ui-unavailable"><p>{label&&<strong>{label}. </strong>}{reason}</p>{href?<a href={href}>{linkLabel}</a>:action?<button type="button" onClick={action.onClick}>{action.label}</button>:null}</div>;
}
