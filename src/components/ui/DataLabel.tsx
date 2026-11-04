import type { DataBasis } from "./value";
import "./DataLabel.css";
export function DataLabel({basis}:{basis?:DataBasis|null}) {basis=basis||"Unavailable";return <span className={`ui-data-label ui-data-label-${basis.toLowerCase()}`}>{basis}</span>;}
