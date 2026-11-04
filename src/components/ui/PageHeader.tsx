import type { ReactNode } from "react";
import "./PageHeader.css";
export function PageHeader({title,subtitle,actions,filters,eyebrow}:{title:string;subtitle?:string;actions?:ReactNode;filters?:ReactNode;eyebrow?:ReactNode}) {
  return <header className="ui-page-header"><div className="ui-page-header-row"><div>{eyebrow&&<div className="ui-page-eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{actions&&<div className="ui-page-actions">{actions}</div>}</div>{filters}</header>;
}
