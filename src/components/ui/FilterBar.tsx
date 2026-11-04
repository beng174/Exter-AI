import type { ReactNode } from "react";
import "./FilterBar.css";
export function FilterBar({children,label="Workspace filters"}:{children:ReactNode;label?:string}) {return <div className="ui-filter-bar" role="group" aria-label={label}>{children}</div>;}
