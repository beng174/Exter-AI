import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
/** Keep methodology with the shared disclosure rather than repeated on each section. */
export function Caveat({children}:{children:ReactNode}) {const [target,setTarget]=useState<HTMLElement|null>(null);useEffect(()=>{setTarget(document.getElementById("screen-caveats"));},[]);return target?createPortal(<div className="screen-caveat">{children}</div>,target):null;}
