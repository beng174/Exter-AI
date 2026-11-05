import {Children,Fragment,cloneElement,createContext,isValidElement,useContext,useEffect,useState,type CSSProperties,type ReactNode} from "react";
import {brandColour,brandInitials,brandInk,logoAlt,type BrandIdentity as Identity} from "../../../shared/brand-identity";
import {api} from "../../lib/api";
import "./BrandIdentity.css";
const Context=createContext<{brands:Identity[];current?:Identity;version:number;changed:()=>void}>({brands:[],version:0,changed:()=>{}});
export function BrandIdentityProvider({brands,brandId,children}:{brands:Identity[];brandId:string;children:ReactNode}) {
  const [loaded,setLoaded]=useState<Identity[]>([]),[version,setVersion]=useState(0);
  useEffect(()=>{let active=true;setLoaded([]);api<Identity[]>(`/api/brand-identities?${new URLSearchParams({brandId})}`).then(items=>{if(active)setLoaded(items);}).catch(()=>{});return()=>{active=false;};},[brandId,version]);
  useEffect(()=>{const changed=()=>setVersion(v=>v+1);window.addEventListener("exter:brand-identities",changed);return()=>window.removeEventListener("exter:brand-identities",changed);},[]);
  const all=[...loaded,...brands.filter(b=>!loaded.some(item=>item.id===b.id))];
  return <Context.Provider value={{brands:all,current:all.find(b=>b.id===brandId),version,changed:()=>setVersion(v=>v+1)}}>{children}</Context.Provider>;
}
export function useBrandIdentity(name:string){const context=useContext(Context);const alias=/^(?:You|Yours|Your brand)$/i.test(name.trim());const known=alias?context.current:context.brands.find(b=>b.id===name||b.name.toLowerCase()===name.toLowerCase());return {brand:known||{id:"",name,domain:"",color:brandColour(name),initials:brandInitials(name),mode:"imported" as const},...context};}
export function BrandMark({name,size=20,nameBeside=false}:{name:string;size?:16|20|32;nameBeside?:boolean}){
 const {brand,version,current}=useBrandIdentity(name),[loaded,setLoaded]=useState(false);
 const src=brand.id&&brand.mode!=="demo"?`/api/brand-logos/${encodeURIComponent(brand.id)}?v=${version}&workspaceId=${encodeURIComponent(current?.id||"")}`:null;
 useEffect(()=>setLoaded(false),[src]);
 return <span className="brand-mark" data-size={size} style={{"--brand-size":`${size}px`,"--brand-colour":brand.color,"--brand-ink":brandInk(brand.color)} as CSSProperties} role={!nameBeside&&!loaded?"img":undefined} aria-label={!nameBeside&&!loaded?brand.name:undefined} aria-hidden={nameBeside?true:undefined}><span className="brand-monogram" aria-hidden="true">{brandInitials(brand.name)}</span>{src&&<img key={src} src={src} alt={logoAlt(brand.name,nameBeside)} style={{opacity:loaded?1:0}} onLoad={()=>setLoaded(true)} onError={()=>setLoaded(false)}/>}</span>;
}
export function BrandName({name,size=20,children}:{name:string;size?:16|20|32;children?:ReactNode}){return <span className="brand-name"><BrandMark name={name} size={size} nameBeside/><span>{children||name}</span></span>;}
/** Decorates known brand mentions in shared content without touching controls or attributes. */
export function BrandText({children,size=20}:{children:ReactNode;size?:16|20|32}){
 const {brands,current}=useContext(Context);
 const names=[...brands].sort((a,b)=>b.name.length-a.name.length).map(b=>b.name);
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 const pattern=names.length?new RegExp(`(${names.map(escape).join("|")})`,"gi"):null;
 const text=(value:string):ReactNode=>{
  if(current&&/^(?:You|Yours)(?: ·|$)/.test(value)){const alias=value.split(" ·")[0];return <><BrandName name={current.name} size={size}>{alias}</BrandName>{value.slice(alias.length)}</>;}
  if(!pattern)return value;
  const parts=value.split(pattern);if(parts.length===1)return value;
  return parts.map((part,i)=>names.some(n=>n.toLowerCase()===part.toLowerCase())?<BrandName key={i} name={part} size={size}/>:part);
 };
 const walk=(node:ReactNode):ReactNode=>{
  if(typeof node==="string")return text(node);
  if(Array.isArray(node))return Children.map(node,walk);
  if(!isValidElement<{children?:ReactNode;className?:string}>(node))return node;
  if(typeof node.type!=="string"&&node.type!==Fragment)return node;
  if(["svg","input","textarea","select","option","code","pre"].includes(String(node.type)))return node;
  return node.props.children?cloneElement(node,{},walk(node.props.children)):node;
 };
 return <>{walk(children)}</>;
}
export function BrandLogoSettings({names}:{names:string[]}){
 const [editing,setEditing]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const {brands,current,changed}=useContext(Context),sample=current?.mode==="demo";
 async function save(name:string,file?:File){const brand=brands.find(b=>b.name===name);if(!brand)return;setBusy(true);setError("");try{
  if(file&&(!["image/png","image/jpeg","image/webp","image/x-icon","image/vnd.microsoft.icon"].includes(file.type)||file.size>=200_000))throw new Error("Choose a PNG, JPEG, WebP or ICO image smaller than 200 KB.");
  let body:unknown={reset:true};if(file){const bytes=new Uint8Array(await file.arrayBuffer());body={type:file.type,data:btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(""))};}
  await api(`/api/brand-logos/${encodeURIComponent(brand.id)}`,body);changed();setEditing(null);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="brand-logo-settings"><h3>Brand logos</h3>{names.map(name=><div className="brand-logo-setting" key={name}><BrandName name={name}/><button className="button secondary" disabled={sample||busy} title={sample?"Sample brands use fixed monograms.":undefined} onClick={()=>{setEditing(editing===name?null:name);setError("");}}>Change logo<span className="sr-only"> for {name}</span></button>{editing===name&&<div className="brand-logo-editor"><label>Upload logo<input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void save(name,file);}}/></label><button className="button secondary" disabled={busy} onClick={()=>void save(name)}>Reset to automatic</button><small>PNG, JPEG, WebP or ICO, smaller than 200 KB.</small></div>}</div>)}{error&&<p role="alert">{error}</p>}</div>;
}
