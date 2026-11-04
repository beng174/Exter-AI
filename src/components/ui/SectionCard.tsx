import type { ReactNode } from "react";
import { MetaLine, type MetaLineProps } from "./MetaLine";
import "./SectionCard.css";
export function SectionCard({title,help,children,meta,actions}:{title:string;help?:string;children:ReactNode;meta?:MetaLineProps;actions?:ReactNode}) {
  return <section className="ui-section-card" aria-label={title}><header><div><h2>{title}</h2>{help&&<p>{help}</p>}</div>{actions}</header><div>{children}</div><footer><MetaLine {...meta}/></footer></section>;
}
