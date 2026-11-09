import { BrandText } from "./BrandIdentity";
import {AdPreview} from "./AdPreview";
import { useState } from "react";
import type { BrowserCreative } from "../../../shared/creative-browser";
import { creativeTitle,creativeSecondary } from "../../../shared/creative-presentation";
import "./CreativeRow.css";
export function CreativeRow({row,showId=false}:{row:BrowserCreative;showId?:boolean}) {
  const [broken,setBroken]=useState(false);
  return <span className="reference-creative-row"><span className="reference-thumb">{row.thumbnailUrl&&!broken?<img src={row.thumbnailUrl} alt="" onError={()=>setBroken(true)}/>:<AdPreview row={row} compact interactive={false}/>}</span><span><strong title={creativeTitle(row)}>{creativeTitle(row)}</strong><small><BrandText size={16}>{[row.brandName,creativeSecondary(row)||(showId&&row.nativeId?`Ad ${row.nativeId}`:null)].filter(Boolean).join(" · ")}</BrandText></small></span></span>;
}
