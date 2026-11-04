import { ImageIcon } from "lucide-react";
import { useState } from "react";
import type { BrowserCreative } from "../../../shared/creative-browser";
import { creativeTitle,creativeSecondary } from "../../../shared/creative-presentation";
import "./CreativeRow.css";
export function CreativeRow({row,showId=false}:{row:BrowserCreative;showId?:boolean}) {
  const [broken,setBroken]=useState(false);
  return <span className="reference-creative-row"><span className="reference-thumb">{row.thumbnailUrl&&!broken?<img src={row.thumbnailUrl} alt="" onError={()=>setBroken(true)}/>:<ImageIcon size={18} aria-label="Thumbnail unavailable"/>}</span><span><strong title={creativeTitle(row)}>{creativeTitle(row)}</strong><small>{[row.brandName,creativeSecondary(row)||(showId&&row.nativeId?`Ad ${row.nativeId}`:null)].filter(Boolean).join(" · ")}</small></span></span>;
}
