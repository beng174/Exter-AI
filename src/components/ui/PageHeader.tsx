import { BrandText } from "./BrandIdentity";
import { createContext, useContext, type ReactNode } from "react";
export const PageHeaderContext=createContext<{eyebrow?:ReactNode;demo?:boolean;utility?:ReactNode}>({});
import "./PageHeader.css";
export function PageHeader({title,subtitle,actions,filters,eyebrow,titleBadges,sampleWithTitle=false}:{title:string;titleBadges?:ReactNode;sampleWithTitle?:boolean;subtitle?:ReactNode;actions?:ReactNode;filters?:ReactNode;eyebrow?:ReactNode}) {
  const context=useContext(PageHeaderContext);eyebrow=eyebrow??context.eyebrow;
  return <header className="ui-page-header"><div className="ui-page-header-row"><div>{eyebrow&&<div className="ui-page-eyebrow"><BrandText size={32}>{eyebrow}</BrandText></div>}{titleBadges||sampleWithTitle?<div className="ui-page-title-line"><h1><BrandText size={32}>{title}</BrandText></h1>{titleBadges}{sampleWithTitle&&context.demo&&<span className="reference-sample">Sample data</span>}</div>:<h1><BrandText size={32}>{title}</BrandText></h1>}{subtitle&&<p><BrandText size={16}>{subtitle}</BrandText></p>}</div>{(actions||context.demo||context.utility)&&<div className="ui-page-actions">{context.demo&&!sampleWithTitle&&<span className="reference-sample">Sample data</span>}{actions}{context.utility}</div>}</div>{filters}</header>;
}
