import { useId, useState } from "react";
import { copyExcerpt } from "../../../shared/creative-presentation";
import { Unavailable } from "./Unavailable";
import "./ExpandableCopy.css";
export function ExpandableCopy({text,truncated=false,sourceUrl}:{text:string;truncated?:boolean;sourceUrl?:string|null}) {
  const [expanded,setExpanded]=useState(false),id=useId(),excerpt=copyExcerpt(text);
  if(!text.trim())return <Unavailable compact reason="Ad copy was not retained. View the original ad for its copy."/>;
  return <div className="ui-expandable-copy"><p id={id}>{expanded?text:excerpt.preview}{!expanded&&excerpt.hasMore?"…":""}</p>{excerpt.hasMore&&<button type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}>{expanded?"Show less":"Show more"}</button>}{truncated&&<p className="ui-copy-source-note">The saved source excerpt is incomplete.{sourceUrl&&<> <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Read full copy in original ad</a></>}</p>}</div>;
}
