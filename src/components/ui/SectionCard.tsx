import { BrandText } from "./BrandIdentity";
import type { ReactNode } from "react";
import { MetaLine, hasCompleteMeta, type MetaLineProps } from "./MetaLine";
import { Unavailable, type UnavailableProps } from "./Unavailable";
import "./SectionCard.css";
export function SectionCard({title,help,children,meta,actions,empty}:{title:string;help?:string;children?:ReactNode;meta?:MetaLineProps;actions?:ReactNode;empty?:UnavailableProps|false}) {
  if(empty)return <section className="ui-section-card ui-section-empty" aria-label={title}><header><div><h2><BrandText size={32}>{title}</BrandText></h2></div>{actions}</header><Unavailable label="" {...empty}/></section>;
  return <section className="ui-section-card" aria-label={title}><header><div><h2><BrandText size={32}>{title}</BrandText></h2>{help&&<p><BrandText>{help}</BrandText></p>}</div>{actions}</header><div><BrandText>{children}</BrandText></div>{hasCompleteMeta(meta)&&<footer><MetaLine {...meta}/></footer>}</section>;
}
