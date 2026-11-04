import { createContext, useContext, type ReactNode } from "react";
export const PageHeaderContext=createContext<{eyebrow?:ReactNode;demo?:boolean;utility?:ReactNode}>({});
import "./PageHeader.css";
export function PageHeader({title,subtitle,actions,filters,eyebrow}:{title:string;subtitle?:ReactNode;actions?:ReactNode;filters?:ReactNode;eyebrow?:ReactNode}) {
  const context=useContext(PageHeaderContext);eyebrow=eyebrow??context.eyebrow;
  return <header className="ui-page-header"><div className="ui-page-header-row"><div>{eyebrow&&<div className="ui-page-eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{(actions||context.demo||context.utility)&&<div className="ui-page-actions">{context.demo&&<span className="reference-sample">Sample data</span>}{actions}{context.utility}</div>}</div>{filters}</header>;
}
