import type { ReactNode } from "react";
import { MetaLine, hasCompleteMeta, type MetaLineProps } from "./MetaLine";
import { Unavailable, type UnavailableProps } from "./Unavailable";
import "./SectionCard.css";
export function SectionCard({title,help,children,meta,actions,empty}:{title:string;help?:string;children?:ReactNode;meta?:MetaLineProps;actions?:ReactNode;empty?:UnavailableProps|false}) {
  if(empty)return <section className="ui-section-card ui-section-empty" aria-label={title}><header><div><h2>{title}</h2>{help&&<p>{help}</p>}</div>{actions}</header><Unavailable label="" {...empty}/></section>;
  return <section className="ui-section-card" aria-label={title}><header><div><h2>{title}</h2>{help&&<p>{help}</p>}</div>{actions}</header><div>{children}</div>{hasCompleteMeta(meta)&&<footer><MetaLine {...meta}/></footer>}</section>;
}
